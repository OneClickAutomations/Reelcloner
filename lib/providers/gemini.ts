/**
 * Gemini adapter — video+audio analysis.
 *
 * Uploads the reference video through the Files API (so size is not bounded by
 * the inline-data limit), waits for Google to finish processing it, then asks
 * the model for one Analysis JSON object. The response is validated against
 * AnalysisSchema; on failure the model gets exactly one repair turn.
 *
 * Nothing here interprets or fills in the analysis — an unusable response is an
 * error, not something to paper over.
 */
import { readFile } from "node:fs/promises";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MODELS } from "@/config/models";
import { requireEnv } from "@/lib/env";
import { ANALYZER_SYSTEM_PROMPT, buildAnalyzerUserPrompt } from "@/lib/prompts/analyzer";
import { AnalysisSchema, type Analysis } from "@/lib/schemas/analysis";
import { buildRepairPrompt, parseAndValidate } from "./jsonRepair";

export type { Analysis };

export const GEMINI_MODEL = MODELS.gemini;

export type VideoInput =
  | { kind: "url"; url: string }
  | { kind: "file"; path: string; mimeType?: string }
  | { kind: "bytes"; bytes: Uint8Array; mimeType: string };

/** How long to wait for Google to finish processing an uploaded video. */
const PROCESSING_TIMEOUT_MS = 5 * 60_000;
const PROCESSING_POLL_MS = 3_000;

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
}

/** The Analysis schema as JSON Schema, so the prompt and the validator can't drift. */
export function analysisJsonSchema(): string {
  return JSON.stringify(zodToJsonSchema(AnalysisSchema, { target: "openApi3" }), null, 2);
}

async function toBlob(video: VideoInput): Promise<{ blob: Blob; mimeType: string }> {
  if (video.kind === "bytes") {
    return { blob: new Blob([video.bytes as BlobPart], { type: video.mimeType }), mimeType: video.mimeType };
  }

  if (video.kind === "file") {
    const mimeType = video.mimeType ?? "video/mp4";
    const bytes = await readFile(video.path);
    return { blob: new Blob([bytes as unknown as BlobPart], { type: mimeType }), mimeType };
  }

  const response = await fetch(video.url);
  if (!response.ok) {
    throw new Error(`Could not download reference video (${response.status}): ${video.url}`);
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { blob: new Blob([bytes as BlobPart], { type: mimeType }), mimeType };
}

/**
 * Upload a video and wait until Gemini has processed it.
 * Returns the file URI and mime type to reference in generateContent.
 */
export async function uploadVideo(
  video: VideoInput,
  options: { signal?: AbortSignal } = {},
): Promise<{ uri: string; mimeType: string }> {
  const ai = client();
  const { blob, mimeType } = await toBlob(video);

  let file = await ai.files.upload({ file: blob, config: { mimeType } });
  const startedAt = Date.now();

  while (file.state === "PROCESSING") {
    if (options.signal?.aborted) throw new Error("uploadVideo aborted");
    if (Date.now() - startedAt > PROCESSING_TIMEOUT_MS) {
      throw new Error(`Gemini was still processing the video after ${PROCESSING_TIMEOUT_MS}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
    if (!file.name) throw new Error("Uploaded file has no name to poll");
    file = await ai.files.get({ name: file.name });
  }

  if (file.state === "FAILED") {
    throw new Error(`Gemini failed to process the video: ${file.error?.message ?? "unknown reason"}`);
  }
  if (!file.uri || !file.mimeType) {
    throw new Error("Gemini returned an uploaded file with no uri/mimeType");
  }

  return { uri: file.uri, mimeType: file.mimeType };
}

export type AnalyzeResult = {
  analysis: Analysis;
  /** True when the first response failed validation and the repair turn was used. */
  repaired: boolean;
  model: string;
  usage?: { promptTokens?: number; responseTokens?: number; totalTokens?: number };
};

/**
 * Watch a reference video and return grounded structured analysis.
 * Throws if the model cannot produce schema-valid JSON in two attempts.
 */
export async function analyzeVideoDetailed(video: VideoInput): Promise<AnalyzeResult> {
  const ai = client();
  const { uri, mimeType } = await uploadVideo(video);
  const schemaJson = analysisJsonSchema();

  const config = {
    systemInstruction: ANALYZER_SYSTEM_PROMPT,
    responseMimeType: "application/json",
    // The analyzer must not be creative; it is reporting what it saw.
    temperature: 0,
  };

  const first = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config,
    contents: createUserContent([
      createPartFromUri(uri, mimeType),
      buildAnalyzerUserPrompt(schemaJson),
    ]),
  });

  const firstText = first.text ?? "";
  const firstAttempt = parseAndValidate(firstText, AnalysisSchema);
  if (firstAttempt.ok) {
    return {
      analysis: firstAttempt.value,
      repaired: false,
      model: GEMINI_MODEL,
      usage: {
        promptTokens: first.usageMetadata?.promptTokenCount,
        responseTokens: first.usageMetadata?.candidatesTokenCount,
        totalTokens: first.usageMetadata?.totalTokenCount,
      },
    };
  }

  // One repair turn, with the video still attached so it can re-check the source.
  const second = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config,
    contents: [
      createUserContent([
        createPartFromUri(uri, mimeType),
        buildAnalyzerUserPrompt(schemaJson),
      ]),
      { role: "model", parts: [{ text: firstText }] },
      createUserContent([buildRepairPrompt(firstAttempt.problem)]),
    ],
  });

  const secondAttempt = parseAndValidate(second.text ?? "", AnalysisSchema);
  if (!secondAttempt.ok) {
    throw new Error(
      `Gemini could not produce a valid Analysis after one repair attempt.\n` +
        `First failure: ${firstAttempt.problem}\n` +
        `Second failure: ${secondAttempt.problem}`,
    );
  }

  return {
    analysis: secondAttempt.value,
    repaired: true,
    model: GEMINI_MODEL,
    usage: {
      promptTokens: second.usageMetadata?.promptTokenCount,
      responseTokens: second.usageMetadata?.candidatesTokenCount,
      totalTokens: second.usageMetadata?.totalTokenCount,
    },
  };
}

/** The adapter surface the rest of the app uses. */
export async function analyzeVideo(video: VideoInput): Promise<Analysis> {
  return (await analyzeVideoDetailed(video)).analysis;
}
