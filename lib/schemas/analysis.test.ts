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

  it("rejects normalised (fractional) beat timestamps — the real Gemini failure", () => {
    // Observed on a live 12s video: motion_timeline used real seconds while
    // beats came back as fractions of the duration.
    const input = fixture();
    input.beats = [
      { start_seconds: 0, end_seconds: 0.02, label: "hook", evidence: "opens mid-sentence" },
      { start_seconds: 0.02, end_seconds: 0.12, label: "pitch", evidence: "lists benefits" },
    ];
    expect(() => AnalysisSchema.parse(input)).toThrow(/absolute seconds/);
  });

  it("rejects a timestamp past the end of the video", () => {
    const input = fixture();
    (input.cuts as Record<string, unknown>[])[0].at_seconds = 999;
    expect(() => AnalysisSchema.parse(input)).toThrow(/past the end/);
  });

  it("allows a beat ending a hair past duration, for rounding", () => {
    const input = fixture();
    const beats = input.beats as Record<string, unknown>[];
    beats[beats.length - 1].end_seconds = 21.6; // duration is 21.4
    expect(() => AnalysisSchema.parse(input)).not.toThrow();
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

describe("audio consistency", () => {
  it("rejects has_speech=true when the transcript is only a non-speech marker", () => {
    // Observed live: a laughter-only clip came back has_speech=true with
    // transcript "[Laughter]" and wps null. That would push the pipeline into
    // generating dialogue for a video with none.
    const input = fixture();
    input.audio = {
      has_speech: true,
      transcript: "[Laughter]",
      speaker_tone: "joyful",
      approx_words_per_second: null,
      music: "",
      sfx: ["laughter"],
    };
    expect(() => AnalysisSchema.parse(input)).toThrow(/no spoken words/);
  });

  it("accepts has_speech=true when real words sit alongside markers", () => {
    const input = fixture();
    (input.audio as Record<string, unknown>).transcript =
      "I've used this for [inaudible] weeks and it works.";
    expect(() => AnalysisSchema.parse(input)).not.toThrow();
  });

  it("accepts a laughter-only clip when honestly marked", () => {
    const input = fixture();
    input.audio = {
      has_speech: false,
      transcript: "",
      speaker_tone: "",
      approx_words_per_second: null,
      music: "",
      sfx: ["laughter", "clinking glasses"],
    };
    expect(() => AnalysisSchema.parse(input)).not.toThrow();
  });
});
