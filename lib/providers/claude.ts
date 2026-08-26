/**
 * Anthropic adapter — master-prompt authoring.
 * Stage 1: typed surface only. Implemented in Stage 4.
 */
import { MODELS } from "@/config/models";
import type { Analysis } from "./gemini";

/** Replaced by the Zod-inferred `MasterPrompt` type in Stage 3. */
export type MasterPrompt = unknown;

export const CLAUDE_AUTHOR_MODEL = MODELS.claudeAuthor;

export async function authorMasterPrompt(
  _analysis: Analysis,
  _replaceTargetId: string,
  _characterDescription: string,
): Promise<MasterPrompt> {
  throw new Error("Not implemented until Stage 4: claude.authorMasterPrompt");
}
