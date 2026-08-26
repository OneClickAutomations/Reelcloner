/**
 * Gemini adapter — video+audio analysis.
 * Typed surface only until Stage 4; the schema types are real as of Stage 3.
 */
import { MODELS } from "@/config/models";
import type { Analysis } from "@/lib/schemas/analysis";

export type VideoInput =
  | { kind: "url"; url: string }
  | { kind: "storagePath"; bucket: string; path: string };

export type { Analysis };

export const GEMINI_MODEL = MODELS.gemini;

export async function analyzeVideo(_video: VideoInput): Promise<Analysis> {
  throw new Error("Not implemented until Stage 4: gemini.analyzeVideo");
}
