/**
 * Job store.
 *
 * The architecture keeps every job in Supabase `generation_jobs` (Stage 2).
 * Until this environment can reach Supabase, jobs are persisted as JSON files
 * on local disk. That is deliberately boring: an in-memory Map does not work,
 * because Next.js route handlers and Inngest functions can load this module in
 * separate instances and would each get their own empty Map.
 *
 * Same interface either way. Swap the four functions below for Supabase calls
 * (lib/db.ts already has typed helpers) once the host is reachable.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Json } from "@/lib/types/database";

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

const DIR = join(tmpdir(), "reelcloner-jobs");

function path(id: string): string {
  return join(DIR, `${id}.json`);
}

function write(job: Job): Job {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path(job.id), JSON.stringify(job));
  return job;
}

export function createJob(type: JobType, input: Json): Job {
  const now = new Date().toISOString();
  return write({
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

export function getJob(id: string): Job | undefined {
  try {
    return JSON.parse(readFileSync(path(id), "utf8")) as Job;
  } catch {
    return undefined;
  }
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "output" | "error">>,
): Job | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  return write({ ...job, ...patch, updated_at: new Date().toISOString() });
}

/** Most recent jobs first. Used by the queue indicator. */
export function listJobs(limit = 20): Job[] {
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
