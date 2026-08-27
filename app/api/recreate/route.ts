import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/lib/inngest/client";
import { AnalysisSchema, findSubject } from "@/lib/schemas/analysis";

export const runtime = "nodejs";

const RecreateInput = z.object({
  analysis: AnalysisSchema,
  replaceTargetId: z.string().min(1),
  characterDescription: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RecreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.slice(0, 10) },
      { status: 400 },
    );
  }

  const { analysis, replaceTargetId, characterDescription } = parsed.data;
  if (!findSubject(analysis, replaceTargetId)) {
    return NextResponse.json(
      { error: `"${replaceTargetId}" is not a subject in this analysis.` },
      { status: 400 },
    );
  }

  const job = createJob("recreation", { replaceTargetId, characterDescription });
  await inngest.send({
    name: "recreation.requested",
    data: { jobId: job.id, analysis, replaceTargetId, characterDescription },
  });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
