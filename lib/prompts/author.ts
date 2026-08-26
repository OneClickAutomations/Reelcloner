/**
 * The MasterPrompt: what Claude writes from an Analysis, and the system prompt
 * that constrains it.
 *
 * The author never sees the video — only the Analysis JSON. That is the point:
 * it cannot describe anything the analyzer did not observe.
 */
import { z } from "zod";

export const KeyframePromptSchema = z
  .object({
    shot_id: z.string().min(1),
    at_seconds: z.number().min(0),
    image_prompt: z.string().min(1),
  })
  .strict();

export const MasterPromptSettingsSchema = z
  .object({
    aspect_ratio: z.string().min(1),
    resolution: z.enum(["720p", "1080p"]),
    duration_seconds: z.number().positive(),
  })
  .strict();

export const MasterPromptSchema = z
  .object({
    // What carries over from the reference — this is what makes the output a
    // recreation rather than a new ad.
    preserve: z.array(z.string()).min(1),
    // What changes — only the swap.
    change: z.array(z.string()).min(1),
    keyframe_prompts: z.array(KeyframePromptSchema).min(1),
    motion_prompt: z.string().min(1),
    settings: MasterPromptSettingsSchema,
  })
  .strict()
  .superRefine((prompt, ctx) => {
    const seen = new Set<string>();
    prompt.keyframe_prompts.forEach((keyframe, i) => {
      if (seen.has(keyframe.shot_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate shot_id "${keyframe.shot_id}"`,
          path: ["keyframe_prompts", i, "shot_id"],
        });
      }
      seen.add(keyframe.shot_id);
    });
  });

export type MasterPrompt = z.infer<typeof MasterPromptSchema>;
export type KeyframePrompt = z.infer<typeof KeyframePromptSchema>;

export const AUTHOR_SYSTEM_PROMPT = `You are a creative director writing generation prompts to recreate a reference video with a swapped subject.

You are given: (1) the Analysis JSON of the reference video, (2) the id of the subject to replace, and (3) a note that the new character or product comes from reference images the image generator also receives.

Output one JSON object matching the MasterPrompt schema — nothing else, no markdown, no commentary.

Rules:
1. Use ONLY facts present in the Analysis JSON. If a field is null or uncertain, do not invent a value for it.
2. preserve carries the reference's recording format, camera movement, scene, motion timeline, and beats. This is what makes the result a recreation rather than a new ad.
3. change describes ONLY the swap. The new subject's appearance comes from its reference images, so describe its role and placement — never invent how it looks.
4. keyframe_prompts: one per meaningful shot or beat. Each must place the new subject into the reference's exact framing and scene at that moment.
5. motion_prompt: the motion to transfer, grounded in motion_timeline.
6. Transform structure. Never copy third-party assets and never write a real named person's likeness.
7. Valid JSON only.`;

/**
 * The user turn for the author. Everything the model is allowed to draw on is
 * in here; nothing else is provided.
 */
export function buildAuthorUserPrompt(input: {
  analysisJson: string;
  replaceTargetId: string;
  characterDescription: string;
  schemaJson: string;
}): string {
  return `Analysis JSON:
${input.analysisJson}

Replace-target subject id: ${input.replaceTargetId}

The new subject: ${input.characterDescription}
Its appearance comes from reference images that the image generator receives alongside your prompts, so describe its role and placement rather than its looks.

Return one JSON object matching this MasterPrompt schema:

${input.schemaJson}

Return only the JSON object.`;
}
