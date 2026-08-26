/**
 * Anthropic adapter — master-prompt authoring.
 * Typed surface only until Stage 4; the schema types are real as of Stage 3.
 */
import { MODELS } from "@/config/models";
import type { MasterPrompt } from "@/lib/prompts/author";
import type { Analysis } from "@/lib/schemas/analysis";

export type { MasterPrompt };

export const CLAUDE_AUTHOR_MODEL = MODELS.claudeAuthor;

export async function authorMasterPrompt(
  _analysis: Analysis,
  _replaceTargetId: string,
  _characterDescription: string,
): Promise<MasterPrompt> {
  throw new Error("Not implemented until Stage 4: claude.authorMasterPrompt");
}
