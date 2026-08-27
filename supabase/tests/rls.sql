-- RLS proof: two users, each with a project and children, must see only their
-- own rows. Run against a throwaway Postgres seeded with _supabase_shim.sql
-- and the migrations. Every assertion raises an exception on failure.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- seed
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- The on_auth_user_created trigger should have made a profile for each.
do $$
begin
  if (select count(*) from profiles) <> 2 then
    raise exception 'expected 2 auto-created profiles, got %', (select count(*) from profiles);
  end if;
  if (select credits from profiles where id = '11111111-1111-1111-1111-111111111111') <> 100 then
    raise exception 'expected default 100 credits';
  end if;
end
$$;

insert into projects (id, user_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A project'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'B project');

insert into reference_videos (id, project_id, storage_path) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '111.../ref.mp4'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '222.../ref.mp4');

insert into analyses (reference_video_id, json, model) values
  ('a1a1a1a1-0000-0000-0000-000000000001', '{"duration_seconds":12}', 'gemini-test'),
  ('b1b1b1b1-0000-0000-0000-000000000001', '{"duration_seconds":34}', 'gemini-test');

insert into characters (project_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A char'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B char');

insert into generation_jobs (id, project_id, type, credits_charged) values
  ('a2a2a2a2-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'recreation', 10),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'recreation', 10);

insert into creatives (project_id, generation_job_id, storage_path, kind) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2a2a2a2-0000-0000-0000-000000000001', '111.../out.mp4', 'video'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2b2b2b2-0000-0000-0000-000000000001', '222.../out.mp4', 'video');

insert into credits_ledger (user_id, delta, reason) values
  ('11111111-1111-1111-1111-111111111111', -10, 'recreation'),
  ('22222222-2222-2222-2222-222222222222', -10, 'recreation');

insert into storage.objects (bucket_id, name) values
  ('uploads', '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ref.mp4'),
  ('uploads', '22222222-2222-2222-2222-222222222222/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/ref.mp4'),
  ('outputs', '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/out.mp4'),
  ('outputs', '22222222-2222-2222-2222-222222222222/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/out.mp4');

-- Supabase grants these by default; the shim does not, so do it here.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

-- ---------------------------------------------------------------- act as user A
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  tbl text;
  n bigint;
begin
  -- Each table must expose exactly A's single row.
  foreach tbl in array array[
    'profiles', 'projects', 'reference_videos', 'analyses',
    'characters', 'generation_jobs', 'creatives', 'credits_ledger'
  ]
  loop
    execute format('select count(*) from %I', tbl) into n;
    if n <> 1 then
      raise exception 'RLS leak: user A sees % rows in %, expected 1', n, tbl;
    end if;
  end loop;

  -- And it must be A's row, not B's.
  if (select user_id from projects) <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'RLS leak: user A sees another user''s project';
  end if;
  if (select json->>'duration_seconds' from analyses) <> '12' then
    raise exception 'RLS leak: user A sees another user''s analysis';
  end if;

  -- Storage: one object per bucket, both under A's folder.
  if (select count(*) from storage.objects) <> 2 then
    raise exception 'RLS leak: user A sees % storage objects, expected 2',
      (select count(*) from storage.objects);
  end if;
  if exists (
    select 1 from storage.objects
    where name not like '11111111-1111-1111-1111-111111111111/%'
  ) then
    raise exception 'RLS leak: user A sees another user''s storage object';
  end if;
end
$$;

-- Writing into another user's project must be refused.
do $$
begin
  begin
    insert into characters (project_id, name)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'smuggled');
    raise exception 'RLS hole: user A inserted a character into user B''s project';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  begin
    insert into projects (user_id, name)
    values ('22222222-2222-2222-2222-222222222222', 'smuggled');
    raise exception 'RLS hole: user A created a project owned by user B';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('outputs', '22222222-2222-2222-2222-222222222222/x/out.mp4');
    raise exception 'RLS hole: user A wrote into user B''s storage folder';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  -- outputs is written by the service role only; the client may not write it
  -- even under its own folder.
  begin
    insert into storage.objects (bucket_id, name)
    values ('outputs', '11111111-1111-1111-1111-111111111111/x/out.mp4');
    raise exception 'RLS hole: user A wrote to the outputs bucket directly';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  -- generation_jobs and analyses are server-written; the client is read-only.
  begin
    insert into generation_jobs (project_id, type)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'recreation');
    raise exception 'RLS hole: user A created a generation job directly';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  -- Deleting another user's row must be a no-op, not an error.
  delete from projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if not exists (select 1 from projects) then
    raise exception 'user A deleted their own project by accident';
  end if;
end
$$;

-- A user with no JWT sees nothing.
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  if (select count(*) from projects) <> 0 then
    raise exception 'RLS leak: anonymous request sees % projects',
      (select count(*) from projects);
  end if;
end
$$;

reset role;

-- ---------------------------------------------------------------- service role
set role service_role;
do $$
begin
  if (select count(*) from projects) <> 2 then
    raise exception 'service role should bypass RLS and see 2 projects, saw %',
      (select count(*) from projects);
  end if;
end
$$;
reset role;

-- ---------------------------------------------------------------- constraints
do $$
begin
  -- updated_at must move on update.
  update generation_jobs set status = 'running'
  where id = 'a2a2a2a2-0000-0000-0000-000000000001';
  if (select updated_at from generation_jobs where id = 'a2a2a2a2-0000-0000-0000-000000000001')
     <= (select created_at from generation_jobs where id = 'a2a2a2a2-0000-0000-0000-000000000001')
  then
    raise exception 'generation_jobs.updated_at did not advance on update';
  end if;

  -- A reference video needs an upload or a URL.
  begin
    insert into reference_videos (project_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'reference_videos accepted a row with neither source';
  exception
    when check_violation then null;  -- expected
  end;

  -- Credits may not go negative.
  begin
    update profiles set credits = -1 where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'profiles accepted negative credits';
  exception
    when check_violation then null;  -- expected
  end;

  -- A zero-delta ledger entry is meaningless.
  begin
    insert into credits_ledger (user_id, delta, reason)
    values ('11111111-1111-1111-1111-111111111111', 0, 'noop');
    raise exception 'credits_ledger accepted a zero delta';
  exception
    when check_violation then null;  -- expected
  end;

  -- Deleting a project must take its children with it.
  delete from projects where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if exists (select 1 from reference_videos where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
     or exists (select 1 from characters where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
     or exists (select 1 from generation_jobs where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
     or exists (select 1 from creatives where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  then
    raise exception 'deleting a project left orphaned children';
  end if;
end
$$;

select 'all RLS and constraint assertions passed' as result;
