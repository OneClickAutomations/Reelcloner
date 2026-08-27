/**
 * Anthropic adapter — master-prompt authoring.
 *
 * The author never sees the video. It receives the Analysis JSON, the id of the
 * subject to replace, and a note about the character reference images, and
 * returns one MasterPrompt. Validated against MasterPromptSchema with a single
 * repair turn, same contract as the analyzer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MODELS } from "@/config/models";
import { requireEnv } from "@/lib/env";
import {
  AUTHOR_SYSTEM_PROMPT,
  MasterPromptSchema,
  buildAuthorUserPrompt,
  type MasterPrompt,
} from "@/lib/prompts/author";
import { findSubject, type Analysis } from "@/lib/schemas/analysis";
import { buildRepairPrompt, parseAndValidate } from "./jsonRepair";

export type { MasterPrompt };

export const CLAUDE_AUTHOR_MODEL = MODELS.claudeAuthor;

/**
 * Claude Code reserves ANTHROPIC_API_KEY for its own auth, so a value set there
 * does not reach the session. ANTHROPIC_AUTHOR_KEY is our own name for the key
 * this adapter uses; ANTHROPIC_API_KEY still works anywhere it does get through.
 */
function authorApiKey(): string {
  return process.env.ANTHROPIC_AUTHOR_KEY || requireEnv("ANTHROPIC_API_KEY");
}

function client(): Anthropic {
  return new Anthropic({ apiKey: authorApiKey() });
}

export function masterPromptJsonSchema(): string {
  return JSON.stringify(zodToJsonSchema(MasterPromptSchema, { target: "openApi3" }), null, 2);
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export type AuthorResult = {
  masterPrompt: MasterPrompt;
  repaired: boolean;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export async function authorMasterPromptDetailed(
  analysis: Analysis,
  replaceTargetId: string,
  characterDescription: string,
): Promise<AuthorResult> {
  // Fail fast on a target the analysis never recorded — the author would
  // otherwise have to invent the subject it is replacing.
  if (!findSubject(analysis, replaceTargetId)) {
    const known = analysis.subjects.map((s) => s.id).join(", ") || "(none)";
    throw new Error(
      `replaceTargetId "${replaceTargetId}" is not a subject in this analysis. Known subjects: ${known}`,
    );
  }

  const anthropic = client();
  const userPrompt = buildAuthorUserPrompt({
    analysisJson: JSON.stringify(analysis, null, 2),
    replaceTargetId,
    characterDescription,
    schemaJson: masterPromptJsonSchema(),
  });

  const request = {
    model: CLAUDE_AUTHOR_MODEL,
    max_tokens: 16000,
    system: AUTHOR_SYSTEM_PROMPT,
    thinking: { type: "adaptive" as const },
  };

  const first = await anthropic.messages.create({
    ...request,
    messages: [{ role: "user", content: userPrompt }],
  });

  const firstText = textOf(first);
  const firstAttempt = parseAndValidate(firstText, MasterPromptSchema);
  if (firstAttempt.ok) {
    return {
      masterPrompt: firstAttempt.value,
      repaired: false,
      model: CLAUDE_AUTHOR_MODEL,
      usage: { inputTokens: first.usage.input_tokens, outputTokens: first.usage.output_tokens },
    };
  }

  const second = await anthropic.messages.create({
    ...request,
    messages: [
      { role: "user", content: userPrompt },
      { role: "assistant", content: first.content },
      { role: "user", content: buildRepairPrompt(firstAttempt.problem) },
    ],
  });

  const secondAttempt = parseAndValidate(textOf(second), MasterPromptSchema);
  if (!secondAttempt.ok) {
    throw new Error(
      `Claude could not produce a valid MasterPrompt after one repair attempt.\n` +
        `First failure: ${firstAttempt.problem}\n` +
        `Second failure: ${secondAttempt.problem}`,
    );
  }

  return {
    masterPrompt: secondAttempt.value,
    repaired: true,
    model: CLAUDE_AUTHOR_MODEL,
    usage: { inputTokens: second.usage.input_tokens, outputTokens: second.usage.output_tokens },
  };
}

export async function authorMasterPrompt(
  analysis: Analysis,
  replaceTargetId: string,
  characterDescription: string,
): Promise<MasterPrompt> {
  return (await authorMasterPromptDetailed(analysis, replaceTargetId, characterDescription)).masterPrompt;
}
