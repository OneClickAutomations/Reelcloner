import { describe, expect, it } from "vitest";
import {
  AUTHOR_SYSTEM_PROMPT,
  MasterPromptSchema,
  buildAuthorUserPrompt,
} from "./author";
import { ANALYZER_SYSTEM_PROMPT } from "./analyzer";

function masterPrompt(): Record<string, unknown> {
  return {
    preserve: [
      "handheld phone framing, medium close-up, subject centered",
      "slow handheld drift with one push-in at 6.2s",
      "indoor kitchen counter, soft daylight from frame left",
      "two-beat structure: hook (0-6.2s), product reveal (6.2-14.8s)",
    ],
    change: ["Replace subject_1, the presenter, with the new character in the same position and role"],
    keyframe_prompts: [
      {
        shot_id: "shot_1",
        at_seconds: 0,
        image_prompt:
          "New character at the kitchen counter, medium close-up, centered, soft daylight from frame left, white tiled backsplash out of focus behind them, speaking toward camera",
      },
      {
        shot_id: "shot_2",
        at_seconds: 6.2,
        image_prompt:
          "New character lifting the matte white cylindrical bottle into frame, same counter and lighting, camera slightly closer",
      },
    ],
    motion_prompt:
      "Subject talks to camera with right-hand gestures for the first six seconds, then lifts the bottle into frame and rotates it once as the camera pushes in slowly",
    settings: { aspect_ratio: "9:16", resolution: "1080p", duration_seconds: 21.4 },
  };
}

describe("MasterPromptSchema", () => {
  it("accepts a well-formed master prompt", () => {
    const parsed = MasterPromptSchema.parse(masterPrompt());
    expect(parsed.keyframe_prompts).toHaveLength(2);
    expect(parsed.settings.resolution).toBe("1080p");
  });

  it.each(["preserve", "change", "keyframe_prompts", "motion_prompt", "settings"])(
    "requires field %s",
    (field) => {
      const input = masterPrompt();
      delete input[field];
      expect(() => MasterPromptSchema.parse(input)).toThrow();
    },
  );

  it("rejects an empty preserve list — a recreation must carry something over", () => {
    const input = masterPrompt();
    input.preserve = [];
    expect(() => MasterPromptSchema.parse(input)).toThrow();
  });

  it("rejects an empty change list — there must be a swap to describe", () => {
    const input = masterPrompt();
    input.change = [];
    expect(() => MasterPromptSchema.parse(input)).toThrow();
  });

  it("rejects zero keyframes", () => {
    const input = masterPrompt();
    input.keyframe_prompts = [];
    expect(() => MasterPromptSchema.parse(input)).toThrow();
  });

  it("rejects an empty motion prompt", () => {
    const input = masterPrompt();
    input.motion_prompt = "";
    expect(() => MasterPromptSchema.parse(input)).toThrow();
  });

  it("rejects duplicate shot ids", () => {
    const input = masterPrompt();
    const shots = input.keyframe_prompts as Record<string, unknown>[];
    shots[1].shot_id = shots[0].shot_id;
    expect(() => MasterPromptSchema.parse(input)).toThrow(/duplicate shot_id/);
  });

  it("rejects a resolution outside the supported set", () => {
    const input = masterPrompt();
    (input.settings as Record<string, unknown>).resolution = "4k";
    expect(() => MasterPromptSchema.parse(input)).toThrow();
  });

  it("rejects invented top-level fields", () => {
    const input = masterPrompt();
    input.negative_prompt = "blurry";
    expect(() => MasterPromptSchema.parse(input)).toThrow(/unrecognized/i);
  });
});

describe("prompt text", () => {
  it("tells the author it may use only the Analysis JSON", () => {
    expect(AUTHOR_SYSTEM_PROMPT).toMatch(/ONLY facts present in the Analysis JSON/);
  });

  it("carries the likeness and third-party-asset guardrail", () => {
    expect(AUTHOR_SYSTEM_PROMPT).toMatch(/never write a real named person's likeness/i);
    expect(AUTHOR_SYSTEM_PROMPT).toMatch(/never copy third-party assets/i);
  });

  it("tells the analyzer to report only what is observable and to transcribe verbatim", () => {
    expect(ANALYZER_SYSTEM_PROMPT).toMatch(/ONLY what is observable/);
    expect(ANALYZER_SYSTEM_PROMPT).toMatch(/verbatim/);
    expect(ANALYZER_SYSTEM_PROMPT).toMatch(/\[inaudible\]/);
  });

  it("tells the analyzer that unknown means null, not a missing key", () => {
    expect(ANALYZER_SYSTEM_PROMPT).toMatch(/never by leaving a field out/i);
  });

  it("puts every input the author is allowed to use into the user prompt", () => {
    const built = buildAuthorUserPrompt({
      analysisJson: '{"duration_seconds":21.4}',
      replaceTargetId: "subject_1",
      characterDescription: "a golden retriever named Pip",
      schemaJson: '{"type":"object"}',
    });
    expect(built).toContain('{"duration_seconds":21.4}');
    expect(built).toContain("subject_1");
    expect(built).toContain("a golden retriever named Pip");
    expect(built).toContain('{"type":"object"}');
    // The generator gets the images; the author must not describe looks.
    expect(built).toMatch(/rather than its looks/);
  });
});
