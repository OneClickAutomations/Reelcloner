import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = /^video\//;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No video file was included." }, { status: 400 });
  }
  if (!ACCEPTED.test(file.type)) {
    return NextResponse.json(
      { error: `That file is ${file.type || "an unknown type"}. Upload a video.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That video is ${(file.size / 1e6).toFixed(0)}MB. The limit is 200MB.` },
      { status: 413 },
    );
  }

  // Held on local disk until Supabase Storage is reachable from this environment.
  const dir = join(tmpdir(), "reelcloner-uploads");
  await mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = join(dir, `${crypto.randomUUID()}-${safeName}`);
  await writeFile(path, Buffer.from(await file.arrayBuffer()));

  const job = await createJob("analysis", { filename: file.name, sizeBytes: file.size });
  await inngest.send({ name: "analysis.requested", data: { jobId: job.id, videoPath: path } });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

