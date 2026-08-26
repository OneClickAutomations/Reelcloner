# BUILD BRIEF — UGC Recreation App

You (Claude Code) are building this app. Read this whole file, then build it **stage by stage**, stopping after each stage for me to verify before continuing. Do not scaffold the whole thing at once.

## Objective
A web app that recreates a reference UGC video with a swapped character or product. A vision model watches the reference (video + audio) and outputs grounded structured analysis; Claude turns that analysis into generation prompts; image + video models produce the recreation. Nothing is invented that the analysis didn't observe.

## Pipeline
```
reference video (upload or Apify URL)
  → Gemini watches video+audio → Analysis JSON (strict schema, grounded)
  → user selects replace-target + uploads 3 character images
  → Claude Opus → MasterPrompt (keyframe prompts + motion prompt)
  → OpenAI GPT Image / Higgsfield Nano Banana → swapped keyframe(s)
  → Higgsfield motion-control (or image-to-video) → animated clip
  → output creative + variations
```

## Stack (locked)
- Next.js App Router, TypeScript, Tailwind
- Supabase: Postgres, Auth, Storage
- Inngest: every long-running / multi-step job (never run generation in a request handler — Vercel times out)
- Provider SDKs behind adapters in `lib/providers/`. No SDK calls in routes or UI.
- Deploy: Vercel + Inngest.

## Env vars (create `.env.example`)
`ANTHROPIC_API_KEY GEMINI_API_KEY OPENAI_API_KEY HIGGSFIELD_API_KEY APIFY_TOKEN NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY INNGEST_EVENT_KEY INNGEST_SIGNING_KEY`

## `config/models.ts` (single source of truth; add TODO to verify each ID against current provider docs)
```ts
export const MODELS = {
  gemini: "gemini-2.5-flash",          // video+audio analysis
  claudeAuthor: "claude-opus-4-8",     // master-prompt authoring
  claudeOrchestrator: "claude-sonnet-5",
  openaiImage: "gpt-image-1",
  higgsfieldImage: "nano_banana_pro",
  higgsfieldMotion: "motion_control",
  higgsfieldVideo: "seedance_2_5",
};
```

## Hard rules
- Gemini analyzer outputs ONLY the fixed Analysis schema; reports only what's observable; never invents brand/product/claim. Unknown → null + note.
- Claude author uses ONLY facts in the Analysis JSON; may not add anything it didn't record.
- All model IDs in `config/models.ts` only.
- Every generation job = a `generation_jobs` row with status queued→running→succeeded|failed; refund credits on failed.
- Secrets from env only. Moderation check on outputs before display. Block real, identifiable-person likeness swaps without consent.

---

## STAGE 1 — Scaffold
Next.js App Router + TS + Tailwind. Supabase clients (browser+server). Inngest at `/api/inngest` with a hello-world function. `config/models.ts` above. Empty typed adapters: `lib/providers/{gemini,claude,openaiImage,higgsfield,apify}.ts`. `.env.example`. Confirm `pnpm dev` runs and Inngest dev server connects. **Stop.**

## STAGE 2 — Data model
Supabase migrations + typed helpers (`lib/db.ts`) + RLS (user sees only own rows via `auth.uid()`):
- `profiles(id→auth.users, credits int default 100)`
- `projects(id, user_id, name, created_at)`
- `reference_videos(id, project_id, storage_path, source_url, duration_seconds, status, created_at)`
- `analyses(id, reference_video_id, json jsonb, model, created_at)`
- `characters(id, project_id, name, ref_image_paths text[], created_at)`
- `generation_jobs(id, project_id, type, status, input jsonb, output jsonb, error, credits_charged int, created_at, updated_at)`
- `creatives(id, project_id, generation_job_id, storage_path, kind, meta jsonb, created_at)`
- `credits_ledger(id, user_id, delta int, reason, ref_id, created_at)`
Storage buckets `uploads`, `outputs` with matching policies. **Stop.**

## STAGE 3 — Schemas + the two AI prompts (files only)

`lib/schemas/analysis.ts` — Zod `AnalysisSchema` (all fields required; null when unknown, never omit):
```ts
{
  duration_seconds: number,
  aspect_ratio: string,
  recording_format: { take: "single_continuous"|"multi_cut", camera: string, framing: string, camera_movement: string },
  cuts: { at_seconds: number, type: string }[],
  scene: { location_type: "indoor"|"outdoor"|"unknown", setting: string, lighting: string, background: string },
  subjects: { id: string, type: "person"|"product"|"animal"|"object", observed_description: string, role: string, approx_screen_time_pct: number, is_candidate_replace_target: boolean }[],
  motion_timeline: { start_seconds: number, end_seconds: number, subject_id: string, action: string, camera: string }[],
  audio: { has_speech: boolean, transcript: string, speaker_tone: string, approx_words_per_second: number|null, music: string, sfx: string[] },
  beats: { start_seconds: number, end_seconds: number, label: string, evidence: string }[],
  on_screen_text: { at_seconds: number, text: string }[],
  notes_uncertain: string[]
}
```

`lib/prompts/analyzer.ts` — export `ANALYZER_SYSTEM_PROMPT`:
> You are a video analysis engine. You are given a reference video with audio. Watch all of it and listen to all of it, then output a single JSON object matching the provided schema — nothing else, no markdown, no commentary.
> Rules: (1) Report ONLY what is observable in the video or audio; never infer a brand, product, price, or claim not shown or clearly spoken. (2) Transcribe speech verbatim into `audio.transcript`; mark unclear words `[inaudible]`; never paraphrase. (3) If a field isn't determinable, use null/""/[] and add a short note to `notes_uncertain`; never guess. (4) Each beat must cite concrete `evidence`; no evidence, no beat. (5) Timestamps in seconds aligned to the video. (6) Identify every distinct person/product/object as a subject; set `is_candidate_replace_target: true` only for cleanly separable subjects. (7) Output valid JSON parseable against the schema, no trailing text.

`lib/prompts/author.ts` — export `AUTHOR_SYSTEM_PROMPT` + `MasterPromptSchema` (Zod) + type:
```ts
{
  preserve: string[],
  change: string[],
  keyframe_prompts: { shot_id: string, at_seconds: number, image_prompt: string }[],
  motion_prompt: string,
  settings: { aspect_ratio: string, resolution: "720p"|"1080p", duration_seconds: number }
}
```
> `AUTHOR_SYSTEM_PROMPT`: You are a creative director writing generation prompts to recreate a reference video with a swapped subject. Inputs: (1) the Analysis JSON, (2) the replace-target subject id, (3) a note that the new character/product comes from reference images the generator also receives. Output one JSON object matching MasterPrompt. Rules: (1) Use ONLY facts in the Analysis JSON; if a field is null/uncertain, don't invent it. (2) `preserve` carries the reference's recording format, camera movement, scene, motion timeline, and beats — this makes it a recreation, not a new ad. (3) `change` describes ONLY the swap; the new subject's appearance comes from its reference images, so describe role/placement, not invented looks. (4) `keyframe_prompts`: one per meaningful shot/beat, each placing the new subject into the reference's exact framing/scene at that moment. (5) `motion_prompt`: the motion to transfer, grounded in `motion_timeline`. (6) Transform structure, never copy third-party assets or write a real named person's likeness. (7) Valid JSON only.

**Stop.**

## STAGE 4 — Analysis + author adapters
`gemini.ts::analyzeVideo(video) → Analysis` (attach video to Gemini multimodal, system=ANALYZER_SYSTEM_PROMPT, JSON out, parse with AnalysisSchema, one repair retry).
`claude.ts::authorMasterPrompt(analysis, replaceTargetId, characterDescription) → MasterPrompt` (MODELS.claudeAuthor, AUTHOR_SYSTEM_PROMPT, JSON out, validate, one repair retry).
**Test on one real video → clean JSON before continuing. Stop.**

## STAGE 5 — Generation adapters
`openaiImage.ts::generateKeyframe(imagePrompt, charRefImageUrls[]) → storedUrl`.
`higgsfield.ts` (verify endpoints in Higgsfield API docs): `generateStill(prompt, refImages[])`; `motionControl(characterImageUrl, referenceVideoUrl, {resolution, sceneControl:"video"}) → poll → videoUrl`; `imageToVideo(imageUrl, motionPrompt, {aspect_ratio, duration, resolution})` as fallback. All polling runs inside Inngest functions.
`apify.ts::scrapeReference(url) → downloadableVideoUrl` (TikTok/IG/Meta Ad Library actor; actor id in config).
**Stop.**

## STAGE 6 — Orchestration (Inngest)
- `analysis.requested`: resolve/download reference → `analyzeVideo` → save `analyses` → emit `analysis.completed`.
- `recreation.requested` {analysisId, replaceTargetId, characterId, settings}: load analysis+character → `authorMasterPrompt` → per keyframe: `generateKeyframe`/`generateStill` → `motionControl(bestKeyframe, referenceVideoUrl, settings)` → save `creatives` → emit `recreation.completed`.
- Failures: job status=failed, write error, refund `credits_charged`.
- Routes: `POST /api/recreate` (validate + check credits + send event), `GET /api/jobs/:id` (status poll).
**Stop.**

## STAGE 7 — UI (Tailwind, mobile-first, dark default; use frontend-design skill)
Auth + Projects list. Project stepper: (1) Add reference (upload or paste URL→Apify), (2) Review analysis (cards: format, beats timeline, subjects with "replace this one" selector, transcript), (3) Character (upload 3 images + name), (4) Generate (resolution/duration, show credit cost, confirm), (5) Result gallery + global generation-queue indicator polling `/api/jobs/:id`. UI hits only our `/api` routes.
**Stop.**

## STAGE 8 — Harden
Rate-limit `/api/recreate`; zod-validate all route inputs; ensure no secrets in client bundle; moderation check on outputs before display; block real-person likeness swaps; error boundaries + retry UI on the poller.

---

## Verify first
The make-or-break milestone is STAGE 4: a real video in → clean, grounded Analysis JSON out. Prove that on 2–3 videos before building UI. That JSON is the spine; everything after it is plumbing.
