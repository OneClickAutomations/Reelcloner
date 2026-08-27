-- Reelcloner core schema.
-- Every table is owned by a user, directly (profiles) or through projects.user_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type reference_video_status as enum ('pending', 'ready', 'failed');
create type generation_job_type as enum ('analysis', 'recreation');
create type generation_job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type creative_kind as enum ('keyframe', 'video');

-- ---------------------------------------------------------------- profiles
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 100 check (credits >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create index projects_user_id_created_at_idx on projects (user_id, created_at desc);

-- ---------------------------------------------------------------- reference_videos
create table reference_videos (
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

create index reference_videos_project_id_idx on reference_videos (project_id, created_at desc);

-- ---------------------------------------------------------------- analyses
create table analyses (
  id uuid primary key default gen_random_uuid(),
  reference_video_id uuid not null references reference_videos (id) on delete cascade,
  json jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index analyses_reference_video_id_idx on analyses (reference_video_id, created_at desc);

-- ---------------------------------------------------------------- characters
create table characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  ref_image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index characters_project_id_idx on characters (project_id, created_at desc);

-- ---------------------------------------------------------------- generation_jobs
create table generation_jobs (
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

create index generation_jobs_project_id_idx on generation_jobs (project_id, created_at desc);
create index generation_jobs_status_idx on generation_jobs (status) where status in ('queued', 'running');

-- ---------------------------------------------------------------- creatives
create table creatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  generation_job_id uuid references generation_jobs (id) on delete set null,
  storage_path text not null,
  kind creative_kind not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index creatives_project_id_idx on creatives (project_id, created_at desc);
create index creatives_generation_job_id_idx on creatives (generation_job_id);

-- ---------------------------------------------------------------- credits_ledger
-- Append-only audit of every credit movement. A charge is a negative delta,
-- a refund on a failed job is the matching positive one.
create table credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index credits_ledger_user_id_idx on credits_ledger (user_id, created_at desc);

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
