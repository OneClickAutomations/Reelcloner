/**
 * The Analysis schema — the spine of the pipeline.
 *
 * Everything downstream (the Claude author, the keyframe prompts, the motion
 * prompt) may use ONLY what the analyzer recorded here. So the schema is
 * deliberately closed and total:
 *
 *  - Every field is REQUIRED. "Unknown" is expressed as null / "" / [], never
 *    by omitting the key, so a missing key is a bug rather than a silent gap.
 *  - `.strict()` rejects unknown keys, so a model that invents a field fails
 *    validation instead of smuggling ungrounded data downstream.
 *  - Refinements encode only the rules the analyzer prompt already states
 *    (ordered spans, sane percentages, evidence-bearing beats). They are not
 *    extra editorial judgement.
 */
import { z } from "zod";

export const TakeSchema = z.enum(["single_continuous", "multi_cut"]);
export const LocationTypeSchema = z.enum(["indoor", "outdoor", "unknown"]);
export const SubjectTypeSchema = z.enum(["person", "product", "animal", "object"]);

/** A point in the reference video, in seconds from its start. */
const timestamp = z.number().min(0);

export const RecordingFormatSchema = z
  .object({
    take: TakeSchema,
    camera: z.string(),
    framing: z.string(),
    camera_movement: z.string(),
  })
  .strict();

export const CutSchema = z
  .object({
    at_seconds: timestamp,
    type: z.string(),
  })
  .strict();

export const SceneSchema = z
  .object({
    location_type: LocationTypeSchema,
    setting: z.string(),
    lighting: z.string(),
    background: z.string(),
  })
  .strict();

export const SubjectSchema = z
  .object({
    id: z.string().min(1),
    type: SubjectTypeSchema,
    observed_description: z.string(),
    role: z.string(),
    approx_screen_time_pct: z.number().min(0).max(100),
    is_candidate_replace_target: z.boolean(),
  })
  .strict();

/** A span of the video. Spans may not run backwards. */
const spanFields = {
  start_seconds: timestamp,
  end_seconds: timestamp,
};

const orderedSpan = <T extends { start_seconds: number; end_seconds: number }>(span: T) =>
  span.end_seconds >= span.start_seconds;
const orderedSpanIssue = {
  message: "end_seconds must be greater than or equal to start_seconds",
  path: ["end_seconds"],
};

export const MotionSegmentSchema = z
  .object({
    ...spanFields,
    subject_id: z.string(),
    action: z.string(),
    camera: z.string(),
  })
  .strict()
  .refine(orderedSpan, orderedSpanIssue);

export const AudioSchema = z
  .object({
    has_speech: z.boolean(),
    transcript: z.string(),
    speaker_tone: z.string(),
    approx_words_per_second: z.number().min(0).nullable(),
    music: z.string(),
    sfx: z.array(z.string()),
  })
  .strict();

export const BeatSchema = z
  .object({
    ...spanFields,
    label: z.string().min(1),
    // Hard rule from the analyzer prompt: no evidence, no beat.
    evidence: z.string().min(1, "every beat must cite concrete evidence"),
  })
  .strict()
  .refine(orderedSpan, orderedSpanIssue);

export const OnScreenTextSchema = z
  .object({
    at_seconds: timestamp,
    text: z.string(),
  })
  .strict();

export const AnalysisSchema = z
  .object({
    duration_seconds: z.number().positive(),
    aspect_ratio: z.string(),
    recording_format: RecordingFormatSchema,
    cuts: z.array(CutSchema),
    scene: SceneSchema,
    subjects: z.array(SubjectSchema),
    motion_timeline: z.array(MotionSegmentSchema),
    audio: AudioSchema,
    beats: z.array(BeatSchema),
    on_screen_text: z.array(OnScreenTextSchema),
    notes_uncertain: z.array(z.string()),
  })
  .strict()
  .superRefine((analysis, ctx) => {
    // Timestamps must be absolute seconds inside the video. Models sometimes
    // emit normalised fractions (0-1) for one section while using real seconds
    // in another; that silently corrupts every downstream keyframe time, so it
    // must fail validation rather than pass through.
    const limit = analysis.duration_seconds + 0.5; // tolerance for rounding
    const checkTime = (value: number, path: (string | number)[]) => {
      if (value > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `${value} is past the end of a ${analysis.duration_seconds}s video. ` +
            `Timestamps must be absolute seconds, not fractions or percentages.`,
          path,
        });
      }
    };

    analysis.cuts.forEach((cut, i) => checkTime(cut.at_seconds, ["cuts", i, "at_seconds"]));
    analysis.on_screen_text.forEach((t, i) =>
      checkTime(t.at_seconds, ["on_screen_text", i, "at_seconds"]),
    );
    analysis.motion_timeline.forEach((m, i) =>
      checkTime(m.end_seconds, ["motion_timeline", i, "end_seconds"]),
    );
    analysis.beats.forEach((b, i) => checkTime(b.end_seconds, ["beats", i, "end_seconds"]));

    // Beats should describe the whole video, not a sliver of it. A beat list
    // that stops in the first few percent is the fraction bug in disguise.
    if (analysis.beats.length > 0) {
      const covered = Math.max(...analysis.beats.map((b) => b.end_seconds));
      if (covered < analysis.duration_seconds * 0.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `beats stop at ${covered}s but the video is ${analysis.duration_seconds}s long. ` +
            `Beats must cover the video in absolute seconds.`,
          path: ["beats"],
        });
      }
    }

    // Every motion segment must point at a subject the analyzer actually listed.
    const subjectIds = new Set(analysis.subjects.map((s) => s.id));
    analysis.motion_timeline.forEach((segment, i) => {
      if (segment.subject_id !== "" && !subjectIds.has(segment.subject_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `motion_timeline[${i}].subject_id "${segment.subject_id}" is not a listed subject`,
          path: ["motion_timeline", i, "subject_id"],
        });
      }
    });

    // Subject ids must be unique — the replace-target is selected by id.
    if (subjectIds.size !== analysis.subjects.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subject ids must be unique",
        path: ["subjects"],
      });
    }
  });

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type MotionSegment = z.infer<typeof MotionSegmentSchema>;

/** Subjects the analyzer judged cleanly separable enough to swap. */
export function replaceTargetCandidates(analysis: Analysis): Subject[] {
  return analysis.subjects.filter((s) => s.is_candidate_replace_target);
}

export function findSubject(analysis: Analysis, subjectId: string): Subject | undefined {
  return analysis.subjects.find((s) => s.id === subjectId);
}
