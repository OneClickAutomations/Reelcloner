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
create policy profiles_select_own on profiles
  for select using (id = (select auth.uid()));

-- Credits are moved by trusted server code (service role), never by the client.
create policy profiles_update_own on profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- projects
create policy projects_select_own on projects
  for select using (user_id = (select auth.uid()));

create policy projects_insert_own on projects
  for insert with check (user_id = (select auth.uid()));

create policy projects_update_own on projects
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

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
create policy reference_videos_select_own on reference_videos
  for select using (owns_project(project_id));

create policy reference_videos_insert_own on reference_videos
  for insert with check (owns_project(project_id));

create policy reference_videos_update_own on reference_videos
  for update using (owns_project(project_id))
  with check (owns_project(project_id));

create policy reference_videos_delete_own on reference_videos
  for delete using (owns_project(project_id));

-- ---------------------------------------------------------------- analyses
-- Analyses are written by the analyzer (service role); the client only reads.
create policy analyses_select_own on analyses
  for select using (
    exists (
      select 1 from reference_videos rv
      where rv.id = analyses.reference_video_id
        and owns_project(rv.project_id)
    )
  );

-- ---------------------------------------------------------------- characters
create policy characters_select_own on characters
  for select using (owns_project(project_id));

create policy characters_insert_own on characters
  for insert with check (owns_project(project_id));

create policy characters_update_own on characters
  for update using (owns_project(project_id))
  with check (owns_project(project_id));

create policy characters_delete_own on characters
  for delete using (owns_project(project_id));

-- ---------------------------------------------------------------- generation_jobs
-- Jobs are created and advanced by /api routes and Inngest (service role).
-- The client polls them read-only.
create policy generation_jobs_select_own on generation_jobs
  for select using (owns_project(project_id));

-- ---------------------------------------------------------------- creatives
create policy creatives_select_own on creatives
  for select using (owns_project(project_id));

-- ---------------------------------------------------------------- credits_ledger
-- Append-only from the server's point of view; read-only from the client's.
create policy credits_ledger_select_own on credits_ledger
  for select using (user_id = (select auth.uid()));
