import { describe, expect, it } from "vitest";
import valid from "./__fixtures__/analysis.valid.json";
import { AnalysisSchema, findSubject, replaceTargetCandidates } from "./analysis";

/** A deep clone of the valid fixture, so each test can corrupt one thing. */
function fixture(): Record<string, unknown> {
  return structuredClone(valid) as Record<string, unknown>;
}

describe("AnalysisSchema", () => {
  it("accepts a realistic, fully-populated analysis", () => {
    const parsed = AnalysisSchema.parse(fixture());
    expect(parsed.duration_seconds).toBe(21.4);
    expect(parsed.subjects).toHaveLength(2);
    expect(parsed.audio.transcript).toContain("[inaudible]");
  });

  it("keeps null as a real value rather than dropping the key", () => {
    const input = fixture();
    (input.audio as Record<string, unknown>).approx_words_per_second = null;
    const parsed = AnalysisSchema.parse(input);
    expect(parsed.audio).toHaveProperty("approx_words_per_second");
    expect(parsed.audio.approx_words_per_second).toBeNull();
  });

  it("rejects an omitted field instead of treating it as unknown", () => {
    const input = fixture();
    delete (input.audio as Record<string, unknown>).approx_words_per_second;
    expect(() => AnalysisSchema.parse(input)).toThrow();
  });

  it.each([
    "duration_seconds",
    "aspect_ratio",
    "recording_format",
    "cuts",
    "scene",
    "subjects",
    "motion_timeline",
    "audio",
    "beats",
    "on_screen_text",
    "notes_uncertain",
  ])("requires top-level field %s", (field) => {
    const input = fixture();
    delete input[field];
    expect(() => AnalysisSchema.parse(input)).toThrow();
  });

  it("rejects invented fields the schema does not define", () => {
    const input = fixture();
    input.brand_name = "Acme Serum";
    expect(() => AnalysisSchema.parse(input)).toThrow(/unrecognized/i);
  });

  it("rejects an invented field nested inside an object", () => {
    const input = fixture();
    (input.scene as Record<string, unknown>).price_shown = "$29";
    expect(() => AnalysisSchema.parse(input)).toThrow(/unrecognized/i);
  });

  it("rejects a beat with no evidence", () => {
    const input = fixture();
    (input.beats as Record<string, unknown>[])[0].evidence = "";
    expect(() => AnalysisSchema.parse(input)).toThrow(/evidence/i);
  });

  it("rejects a span that runs backwards", () => {
    const input = fixture();
    const beat = (input.beats as Record<string, unknown>[])[0];
    beat.start_seconds = 9;
    beat.end_seconds = 4;
    expect(() => AnalysisSchema.parse(input)).toThrow(/end_seconds/);
  });

  it("rejects motion aimed at a subject that was never listed", () => {
    const input = fixture();
    (input.motion_timeline as Record<string, unknown>[])[0].subject_id = "subject_99";
    expect(() => AnalysisSchema.parse(input)).toThrow(/not a listed subject/);
  });

  it("rejects duplicate subject ids, since the replace-target is chosen by id", () => {
    const input = fixture();
    const subjects = input.subjects as Record<string, unknown>[];
    subjects[1].id = subjects[0].id;
    expect(() => AnalysisSchema.parse(input)).toThrow(/unique/);
  });

  it.each([
    ["negative timestamp", "cuts", { at_seconds: -1, type: "hard cut" }],
    ["screen time over 100%", "subjects", null],
  ])("rejects %s", (_label, key, replacement) => {
    const input = fixture();
    if (replacement) {
      (input[key] as unknown[])[0] = replacement;
    } else {
      (input.subjects as Record<string, unknown>[])[0].approx_screen_time_pct = 140;
    }
    expect(() => AnalysisSchema.parse(input)).toThrow();
  });

  it("rejects a non-positive duration", () => {
    const input = fixture();
    input.duration_seconds = 0;
    expect(() => AnalysisSchema.parse(input)).toThrow();
  });

  it("accepts a sparse but honest analysis: unknowns as null/empty, noted", () => {
    const sparse = {
      duration_seconds: 8,
      aspect_ratio: "unknown",
      recording_format: { take: "single_continuous", camera: "", framing: "", camera_movement: "" },
      cuts: [],
      scene: { location_type: "unknown", setting: "", lighting: "", background: "" },
      subjects: [],
      motion_timeline: [],
      audio: {
        has_speech: false,
        transcript: "",
        speaker_tone: "",
        approx_words_per_second: null,
        music: "",
        sfx: [],
      },
      beats: [],
      on_screen_text: [],
      notes_uncertain: ["Video is too dark to identify any subject or setting."],
    };
    expect(() => AnalysisSchema.parse(sparse)).not.toThrow();
  });
});

describe("analysis helpers", () => {
  it("lists only the subjects marked as swappable", () => {
    const analysis = AnalysisSchema.parse(fixture());
    expect(replaceTargetCandidates(analysis).map((s) => s.id)).toEqual(["subject_1", "subject_2"]);

    analysis.subjects[1].is_candidate_replace_target = false;
    expect(replaceTargetCandidates(analysis).map((s) => s.id)).toEqual(["subject_1"]);
  });

  it("finds a subject by id and returns undefined for an unknown one", () => {
    const analysis = AnalysisSchema.parse(fixture());
    expect(findSubject(analysis, "subject_2")?.type).toBe("product");
    expect(findSubject(analysis, "nope")).toBeUndefined();
  });
});
