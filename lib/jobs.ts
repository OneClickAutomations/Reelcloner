/**
 * Job store, backed by Supabase `generation_jobs`.
 *
 * Falls back to JSON files on local disk when Supabase is not configured, so
 * the app still runs for someone who has cloned the repo and not set up a
 * project yet. `pnpm db:check` reports which mode you are in.
 *
 * Writes go through the service-role client on purpose: RLS makes
 * generation_jobs read-only to the client (Stage 2), precisely so a browser
 * cannot invent a job row or its credit charge.
 *
 * TODO (auth): generation_jobs.project_id is a real foreign key, so a job needs
 * an owning project and that project needs an owning auth user. Until sign-in
 * exists, rows are attached to one bootstrapped development project. Replace
 * `ownerProject()` with the signed-in user's project when auth lands.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types/database";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type JobType = "analysis" | "recreation";

export type Job = {
  id: string;
  type: JobType;
  status: JobStatus;
  input: Json;
  output: Json | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------- supabase

function serviceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const DEV_PROJECT_NAME = "Development";
const DEV_USER_EMAIL = "dev@reelcloner.local";
let cachedProjectId: string | null = null;

/**
 * The project new jobs belong to. Creates a development user and project the
 * first time, because the schema requires an owner. Replaced by the signed-in
 * user's project once auth exists.
 */
async function ownerProject(db: SupabaseClient<Database>): Promise<string> {
  if (cachedProjectId) return cachedProjectId;

  const existing = await db.from("projects").select("id").eq("name", DEV_PROJECT_NAME).limit(1);
  if (existing.data?.[0]) {
    cachedProjectId = existing.data[0].id;
    return cachedProjectId;
  }

  // The project needs a user; make one through the auth admin API.
  const admin = await db.auth.admin.createUser({
    email: DEV_USER_EMAIL,
    email_confirm: true,
  });
  let userId = admin.data.user?.id;
  if (!userId) {
    const listed = await db.auth.admin.listUsers();
    userId = listed.data.users.find((u) => u.email === DEV_USER_EMAIL)?.id;
  }
  if (!userId) {
    throw new Error(`Could not create or find the development user: ${admin.error?.message}`);
  }

  const created = await db
    .from("projects")
    .insert({ user_id: userId, name: DEV_PROJECT_NAME })
    .select("id")
    .single();
  if (created.error) throw new Error(`Could not create the development project: ${created.error.message}`);

  cachedProjectId = created.data.id;
  return cachedProjectId;
}

function fromRow(row: {
  id: string;
  type: string;
  status: string;
  input: Json;
  output: Json | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    input: row.input,
    output: row.output,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ------------------------------------------------------------------- files

const DIR = join(tmpdir(), "reelcloner-jobs");
const filePath = (id: string) => join(DIR, `${id}.json`);

function fileWrite(job: Job): Job {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(filePath(job.id), JSON.stringify(job));
  return job;
}

function fileRead(id: string): Job | undefined {
  try {
    return JSON.parse(readFileSync(filePath(id), "utf8")) as Job;
  } catch {
    return undefined;
  }
}

// -------------------------------------------------------------------- api

export async function createJob(type: JobType, input: Json): Promise<Job> {
  const db = serviceClient();
  if (db) {
    const projectId = await ownerProject(db);
    const inserted = await db
      .from("generation_jobs")
      .insert({ project_id: projectId, type, input })
      .select("*")
      .single();
    if (inserted.error) throw new Error(`createJob: ${inserted.error.message}`);
    return fromRow(inserted.data);
  }

  const now = new Date().toISOString();
  return fileWrite({
    id: crypto.randomUUID(),
    type,
    status: "queued",
    input,
    output: null,
    error: null,
    created_at: now,
    updated_at: now,
  });
}

export async function getJob(id: string): Promise<Job | undefined> {
  const db = serviceClient();
  if (db) {
    const found = await db.from("generation_jobs").select("*").eq("id", id).maybeSingle();
    if (found.error) throw new Error(`getJob: ${found.error.message}`);
    return found.data ? fromRow(found.data) : undefined;
  }
  return fileRead(id);
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "output" | "error">>,
): Promise<Job | undefined> {
  const db = serviceClient();
  if (db) {
    const updated = await db
      .from("generation_jobs")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (updated.error) throw new Error(`updateJob: ${updated.error.message}`);
    return updated.data ? fromRow(updated.data) : undefined;
  }

  const job = fileRead(id);
  if (!job) return undefined;
  return fileWrite({ ...job, ...patch, updated_at: new Date().toISOString() });
}

export async function listJobs(limit = 20): Promise<Job[]> {
  const db = serviceClient();
  if (db) {
    const rows = await db
      .from("generation_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (rows.error) throw new Error(`listJobs: ${rows.error.message}`);
    return rows.data.map(fromRow);
  }
  try {
    return readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Job)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  } catch {
    return [];
  }
}
