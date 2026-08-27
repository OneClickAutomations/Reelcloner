-- Reelcloner schema — paste this whole file into the Supabase SQL Editor and Run.
--
-- Generated from supabase/migrations/*.sql. Safe to run more than once:
-- every statement is guarded, so re-running it changes nothing.
--
-- Supabase already provides the auth and storage schemas this depends on, so
-- there is nothing to install first.

begin;

-- ============================================================
-- 20260826000100_init_schema.sql
-- ============================================================
-- Reelcloner core schema.
-- Every table is owned by a user, directly (profiles) or through projects.user_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type reference_video_status as enum ('pending', 'ready', 'failed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type generation_job_type as enum ('analysis', 'recreation');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type generation_job_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type creative_kind as enum ('keyframe', 'video');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 100 check (credits >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_created_at_idx on projects (user_id, created_at desc);

-- ---------------------------------------------------------------- reference_videos
create table if not exists reference_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  storage_path text,
  source_url text,
  duration_seconds numeric(10, 3) check (duration_seconds > 0),
  status reference_video_status not null default 'pending',
  created_at timestamptz not null default now(),
  -- A reference is either an upload or a scraped URL; it must be at least one.
  constraint reference_videos_has_source check (storage_path is not null or source_url is not null)
);

create index if not exists reference_videos_project_id_idx on reference_videos (project_id, created_at desc);

-- ---------------------------------------------------------------- analyses
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  reference_video_id uuid not null references reference_videos (id) on delete cascade,
  json jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_reference_video_id_idx on analyses (reference_video_id, created_at desc);

-- ---------------------------------------------------------------- characters
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  ref_image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists characters_project_id_idx on characters (project_id, created_at desc);

-- ---------------------------------------------------------------- generation_jobs
create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  type generation_job_type not null,
  status generation_job_status not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  credits_charged integer not null default 0 check (credits_charged >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_project_id_idx on generation_jobs (project_id, created_at desc);
create index if not exists generation_jobs_status_idx on generation_jobs (status) where status in ('queued', 'running');

-- ---------------------------------------------------------------- creatives
create table if not exists creatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  generation_job_id uuid references generation_jobs (id) on delete set null,
  storage_path text not null,
  kind creative_kind not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creatives_project_id_idx on creatives (project_id, created_at desc);
create index if not exists creatives_generation_job_id_idx on creatives (generation_job_id);

-- ---------------------------------------------------------------- credits_ledger
-- Append-only audit of every credit movement. A charge is a negative delta,
-- a refund on a failed job is the matching positive one.
create table if not exists credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists credits_ledger_user_id_idx on credits_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------- triggers
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists generation_jobs_set_updated_at on generation_jobs;
create trigger generation_jobs_set_updated_at
  before update on generation_jobs
  for each row execute function set_updated_at();

-- Give every new auth user a profile with the default credit balance.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 20260826000200_rls.sql
-- ============================================================
-- Row-level security: a user reaches only their own rows, via auth.uid().
-- Ownership is direct on profiles/credits_ledger and flows through
-- projects.user_id everywhere else. The service-role key bypasses RLS, so
-- Inngest functions are unaffected by these policies.

alter table profiles         enable row level security;
alter table projects         enable row level security;
alter table reference_videos enable row level security;
alter table analyses         enable row level security;
alter table characters       enable row level security;
alter table generation_jobs  enable row level security;
alter table creatives        enable row level security;
alter table credits_ledger   enable row level security;

-- ---------------------------------------------------------------- profiles
-- No insert policy: profiles are created by the on_auth_user_created trigger.
-- No delete policy: profiles die with the auth user.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = (select auth.uid()));

-- Credits are moved by trusted server code (service role), never by the client.
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- projects
drop policy if exists projects_select_own on projects;
create policy projects_select_own on projects
  for select using (user_id = (select auth.uid()));

drop policy if exists projects_insert_own on projects;
create policy projects_insert_own on projects
  for insert with check (user_id = (select auth.uid()));

drop policy if exists projects_update_own on projects;
create policy projects_update_own on projects
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists projects_delete_own on projects;
create policy projects_delete_own on projects
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- helper
-- Does the current user own this project? Referenced by the child policies
-- below. Not SECURITY DEFINER: it reads projects under the caller's own RLS,
-- which already restricts them to their rows.
create or replace function owns_project(target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from projects p
    where p.id = target_project_id
      and p.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------- reference_videos
drop policy if exists reference_videos_select_own on reference_videos;
create policy reference_videos_select_own on reference_videos
  for select using (owns_project(project_id));

drop policy if exists reference_videos_insert_own on reference_videos;
create policy reference_videos_insert_own on reference_videos
  for insert with check (owns_project(project_id));

drop policy if exists reference_videos_update_own on reference_videos;
create policy reference_videos_update_own on reference_videos
  for update using (owns_project(project_id))
  with check (owns_project(project_id));

drop policy if exists reference_videos_delete_own on reference_videos;
create policy reference_videos_delete_own on reference_videos
  for delete using (owns_project(project_id));

-- ---------------------------------------------------------------- analyses
-- Analyses are written by the analyzer (service role); the client only reads.
drop policy if exists analyses_select_own on analyses;
create policy analyses_select_own on analyses
  for select using (
    exists (
      select 1 from reference_videos rv
      where rv.id = analyses.reference_video_id
        and owns_project(rv.project_id)
    )
  );

-- ---------------------------------------------------------------- characters
drop policy if exists characters_select_own on characters;
create policy characters_select_own on characters
  for select using (owns_project(project_id));

drop policy if exists characters_insert_own on characters;
create policy characters_insert_own on characters
  for insert with check (owns_project(project_id));

drop policy if exists characters_update_own on characters;
create policy characters_update_own on characters
  for update using (owns_project(project_id))
  with check (owns_project(project_id));

drop policy if exists characters_delete_own on characters;
create policy characters_delete_own on characters
  for delete using (owns_project(project_id));

-- ---------------------------------------------------------------- generation_jobs
-- Jobs are created and advanced by /api routes and Inngest (service role).
-- The client polls them read-only.
drop policy if exists generation_jobs_select_own on generation_jobs;
create policy generation_jobs_select_own on generation_jobs
  for select using (owns_project(project_id));

-- ---------------------------------------------------------------- creatives
drop policy if exists creatives_select_own on creatives;
create policy creatives_select_own on creatives
  for select using (owns_project(project_id));

-- ---------------------------------------------------------------- credits_ledger
-- Append-only from the server's point of view; read-only from the client's.
drop policy if exists credits_ledger_select_own on credits_ledger;
create policy credits_ledger_select_own on credits_ledger
  for select using (user_id = (select auth.uid()));

-- ============================================================
-- 20260826000300_storage.sql
-- ============================================================
-- Storage buckets and their policies.
--
-- Path convention for both buckets: <user_id>/<project_id>/<filename>
-- The leading folder is the owner's auth.uid(), which is what the policies
-- below check. lib/db.ts builds these paths so the convention stays in one place.

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false), ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- uploads
-- Reference videos and character reference images. The user writes these.
drop policy if exists uploads_select_own on storage.objects;
create policy uploads_select_own on storage.objects
  for select using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists uploads_insert_own on storage.objects;
create policy uploads_insert_own on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists uploads_update_own on storage.objects;
create policy uploads_update_own on storage.objects
  for update using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists uploads_delete_own on storage.objects;
create policy uploads_delete_own on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------- outputs
-- Generated keyframes and videos. Written only by Inngest (service role),
-- so the client gets read access and nothing else.
drop policy if exists outputs_select_own on storage.objects;
create policy outputs_select_own on storage.objects
  for select using (
    bucket_id = 'outputs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;

-- Confirm it worked: this should list all eight tables.
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
