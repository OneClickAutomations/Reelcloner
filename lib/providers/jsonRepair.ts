/**
 * Shared JSON handling for the two model adapters.
 *
 * Both the analyzer and the author are told to return one JSON object and
 * nothing else. Models occasionally wrap it in a markdown fence or add a
 * sentence anyway, so we strip that before parsing — but we never "fix" the
 * content itself. If it does not validate against the schema, we ask the model
 * to correct it once (the repair retry) rather than patching it ourselves.
 */
import type { ZodType } from "zod";

/** Pull the JSON object out of a response that may be fenced or padded. */
export function extractJsonObject(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (fence) {
    text = fence[1].trim();
  }

  // Fall back to the outermost braces if there is still stray prose around it.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  return text;
}

export type ParseAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; problem: string };

/** Parse and validate in one step, reporting a message fit to send back to the model. */
export function parseAndValidate<T>(raw: string, schema: ZodType<T>): ParseAttempt<T> {
  const text = extractJsonObject(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problem: `The response was not valid JSON: ${(error as Error).message}`,
    };
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const issues = result.error.issues
    .slice(0, 25)
    .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  return {
    ok: false,
    problem: `The JSON did not match the schema. Problems:\n${issues}`,
  };
}

/** The follow-up turn sent on the single repair retry. */
export function buildRepairPrompt(problem: string): string {
  return `Your previous response could not be used.

${problem}

Return the corrected JSON object only — no markdown, no commentary. Do not invent new information to fill gaps: if something is genuinely unknown, use null, "", or [] as the schema allows, and note it where the schema provides for notes.`;
}
