/**
 * Typed data-access helpers.
 *
 * Every function takes an explicit Supabase client so the caller decides the
 * trust level: a request-scoped client (RLS applies, the user reaches only
 * their own rows) or the service-role client (RLS bypassed — Inngest only).
 * Helpers that must run with service-role are named *AsService.
 *
 * Errors are thrown, not returned, so callers can't ignore them by accident.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Character,
  Creative,
  Database,
  GenerationJob,
  GenerationJobStatus,
  GenerationJobType,
  Insert,
  Json,
  Profile,
  Project,
  ReferenceVideo,
  ReferenceVideoStatus,
} from "@/lib/types/database";

export type Db = SupabaseClient<Database>;

export const BUCKETS = { uploads: "uploads", outputs: "outputs" } as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

function unwrap<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (result.error) {
    throw new Error(`${what}: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what}: no row returned`);
  }
  return result.data;
}

/**
 * Storage path for an object. Both buckets are laid out as
 * `<user_id>/<project_id>/<filename>` — the leading folder is what the
 * storage RLS policies check, so every write must go through here.
 */
export function storagePath(userId: string, projectId: string, filename: string): string {
  return `${userId}/${projectId}/${filename}`;
}

// ------------------------------------------------------------------ profiles

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  return unwrap(
    await db.from("profiles").select("*").eq("id", userId).single(),
    "getProfile",
  );
}

export async function getCredits(db: Db, userId: string): Promise<number> {
  return (await getProfile(db, userId)).credits;
}

// ------------------------------------------------------------------ projects

export async function listProjects(db: Db): Promise<Project[]> {
  return unwrap(
    await db.from("projects").select("*").order("created_at", { ascending: false }),
    "listProjects",
  );
}

export async function getProject(db: Db, projectId: string): Promise<Project> {
  return unwrap(await db.from("projects").select("*").eq("id", projectId).single(), "getProject");
}

export async function createProject(db: Db, userId: string, name: string): Promise<Project> {
  return unwrap(
    await db.from("projects").insert({ user_id: userId, name }).select().single(),
    "createProject",
  );
}

// ----------------------------------------------------------- reference videos

export async function createReferenceVideo(
  db: Db,
  input: Insert<"reference_videos">,
): Promise<ReferenceVideo> {
  if (!input.storage_path && !input.source_url) {
    throw new Error("createReferenceVideo: needs a storage_path or a source_url");
  }
  return unwrap(
    await db.from("reference_videos").insert(input).select().single(),
    "createReferenceVideo",
  );
}

export async function getReferenceVideo(db: Db, id: string): Promise<ReferenceVideo> {
  return unwrap(
    await db.from("reference_videos").select("*").eq("id", id).single(),
    "getReferenceVideo",
  );
}

export async function listReferenceVideos(db: Db, projectId: string): Promise<ReferenceVideo[]> {
  return unwrap(
    await db
      .from("reference_videos")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    "listReferenceVideos",
  );
}

export async function updateReferenceVideoAsService(
  db: Db,
  id: string,
  patch: { status?: ReferenceVideoStatus; storage_path?: string; duration_seconds?: number },
): Promise<ReferenceVideo> {
  return unwrap(
    await db.from("reference_videos").update(patch).eq("id", id).select().single(),
    "updateReferenceVideo",
  );
}

// ------------------------------------------------------------------ analyses

/** Written by the analyzer job; the client has read-only access via RLS. */
export async function saveAnalysisAsService(
  db: Db,
  referenceVideoId: string,
  json: Json,
  model: string,
): Promise<{ id: string }> {
  return unwrap(
    await db
      .from("analyses")
      .insert({ reference_video_id: referenceVideoId, json, model })
      .select("id")
      .single(),
    "saveAnalysis",
  );
}

export async function getAnalysis(db: Db, id: string) {
  return unwrap(await db.from("analyses").select("*").eq("id", id).single(), "getAnalysis");
}

export async function getLatestAnalysis(db: Db, referenceVideoId: string) {
  const rows = unwrap(
    await db
      .from("analyses")
      .select("*")
      .eq("reference_video_id", referenceVideoId)
      .order("created_at", { ascending: false })
      .limit(1),
    "getLatestAnalysis",
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- characters

export async function createCharacter(
  db: Db,
  projectId: string,
  name: string,
  refImagePaths: string[],
): Promise<Character> {
  return unwrap(
    await db
      .from("characters")
      .insert({ project_id: projectId, name, ref_image_paths: refImagePaths })
      .select()
      .single(),
    "createCharacter",
  );
}

export async function getCharacter(db: Db, id: string): Promise<Character> {
  return unwrap(await db.from("characters").select("*").eq("id", id).single(), "getCharacter");
}

export async function listCharacters(db: Db, projectId: string): Promise<Character[]> {
  return unwrap(
    await db
      .from("characters")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    "listCharacters",
  );
}

// ----------------------------------------------------------- generation jobs

/** Jobs are created server-side only; RLS gives the client select and nothing else. */
export async function createJobAsService(
  db: Db,
  input: {
    projectId: string;
    type: GenerationJobType;
    input: Json;
    creditsCharged: number;
  },
): Promise<GenerationJob> {
  return unwrap(
    await db
      .from("generation_jobs")
      .insert({
        project_id: input.projectId,
        type: input.type,
        input: input.input,
        credits_charged: input.creditsCharged,
      })
      .select()
      .single(),
    "createJob",
  );
}

export async function getJob(db: Db, id: string): Promise<GenerationJob> {
  return unwrap(await db.from("generation_jobs").select("*").eq("id", id).single(), "getJob");
}

export async function setJobStatusAsService(
  db: Db,
  id: string,
  status: GenerationJobStatus,
  patch: { output?: Json; error?: string } = {},
): Promise<GenerationJob> {
  return unwrap(
    await db.from("generation_jobs").update({ status, ...patch }).eq("id", id).select().single(),
    "setJobStatus",
  );
}

// ----------------------------------------------------------------- creatives

export async function createCreativeAsService(
  db: Db,
  input: Insert<"creatives">,
): Promise<Creative> {
  return unwrap(await db.from("creatives").insert(input).select().single(), "createCreative");
}

export async function listCreatives(db: Db, projectId: string): Promise<Creative[]> {
  return unwrap(
    await db
      .from("creatives")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    "listCreatives",
  );
}

// ------------------------------------------------------------------- credits

/**
 * Move a user's credit balance and record the movement in one place.
 *
 * `delta` is negative to charge and positive to refund. Service-role only:
 * RLS does not let the client write the ledger.
 *
 * TODO (Stage 6): move this into a Postgres function so the balance update and
 * the ledger insert share a transaction. Two round trips can leave the ledger
 * and the balance out of step if the process dies between them.
 */
export async function adjustCreditsAsService(
  db: Db,
  input: { userId: string; delta: number; reason: string; refId?: string },
): Promise<number> {
  const { userId, delta, reason, refId } = input;
  if (delta === 0) {
    throw new Error("adjustCredits: delta must be non-zero");
  }

  const profile = await getProfile(db, userId);
  const next = profile.credits + delta;
  if (next < 0) {
    throw new Error(`adjustCredits: insufficient credits (have ${profile.credits}, need ${-delta})`);
  }

  const updated = unwrap(
    await db.from("profiles").update({ credits: next }).eq("id", userId).select("credits").single(),
    "adjustCredits/update",
  );

  const ledger = await db
    .from("credits_ledger")
    .insert({ user_id: userId, delta, reason, ref_id: refId ?? null });
  if (ledger.error) {
    throw new Error(`adjustCredits/ledger: ${ledger.error.message}`);
  }

  return updated.credits;
}

/** Refund a failed job's charge. No-op when the job was never charged. */
export async function refundJobAsService(
  db: Db,
  job: Pick<GenerationJob, "id" | "credits_charged">,
  userId: string,
): Promise<void> {
  if (job.credits_charged <= 0) return;
  await adjustCreditsAsService(db, {
    userId,
    delta: job.credits_charged,
    reason: "refund:failed_job",
    refId: job.id,
  });
}
