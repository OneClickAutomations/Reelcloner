/**
 * Gemini adapter — video+audio analysis.
 * Stage 1: typed surface only. Implemented in Stage 4.
 */
import { MODELS } from "@/config/models";

export type VideoInput =
  | { kind: "url"; url: string }
  | { kind: "storagePath"; bucket: string; path: string };

/** Replaced by the Zod-inferred `Analysis` type in Stage 3. */
export type Analysis = unknown;

export const GEMINI_MODEL = MODELS.gemini;

export async function analyzeVideo(_video: VideoInput): Promise<Analysis> {
  throw new Error("Not implemented until Stage 4: gemini.analyzeVideo");
}
