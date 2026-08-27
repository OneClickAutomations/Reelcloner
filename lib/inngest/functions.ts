/**
 * Long-running work lives here, never in a request handler — a Gemini
 * analysis takes 15-20s and a Vercel function would time out.
 */
import { analyzeVideoDetailed } from "@/lib/providers/gemini";
import { authorMasterPromptDetailed } from "@/lib/providers/claude";
import { updateJob } from "@/lib/jobs";
import type { Json } from "@/lib/types/database";
import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "app/hello.world" },
  async ({ event, step }) => {
    const greeting = await step.run("build-greeting", () => `Hello, ${event.data.message}!`);
    return { greeting };
  },
);

/** Watch the reference video and store the grounded analysis. */
export const runAnalysis = inngest.createFunction(
  { id: "run-analysis", retries: 1 },
  { event: "analysis.requested" },
  async ({ event, step }) => {
    const { jobId, videoPath } = event.data;
    await step.run("mark-running", () => updateJob(jobId, { status: "running" }));

    try {
      const result = await step.run("analyze", () =>
        analyzeVideoDetailed({ kind: "file", path: videoPath }),
      );
      await step.run("save", () =>
        updateJob(jobId, {
          status: "succeeded",
          output: { analysis: result.analysis, repaired: result.repaired } as unknown as Json,
        }),
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.run("mark-failed", () => updateJob(jobId, { status: "failed", error: message }));
      throw error;
    }
  },
);

/** Turn the analysis into keyframe + motion prompts. */
export const runRecreation = inngest.createFunction(
  { id: "run-recreation", retries: 1 },
  { event: "recreation.requested" },
  async ({ event, step }) => {
    const { jobId, analysis, replaceTargetId, characterDescription } = event.data;
    await step.run("mark-running", () => updateJob(jobId, { status: "running" }));

    try {
      const result = await step.run("author", () =>
        authorMasterPromptDetailed(analysis, replaceTargetId, characterDescription),
      );
      await step.run("save", () =>
        updateJob(jobId, {
          status: "succeeded",
          output: { masterPrompt: result.masterPrompt, repaired: result.repaired } as unknown as Json,
        }),
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await step.run("mark-failed", () => updateJob(jobId, { status: "failed", error: message }));
      throw error;
    }
  },
);

export const functions = [helloWorld, runAnalysis, runRecreation];
