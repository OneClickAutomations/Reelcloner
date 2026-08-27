"use client";

import { useCallback, useRef, useState } from "react";
import { AnalysisView } from "@/components/AnalysisView";
import { MasterPromptView } from "@/components/MasterPromptView";
import type { Analysis } from "@/lib/schemas/analysis";
import type { MasterPrompt } from "@/lib/prompts/author";

type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  output: Record<string, unknown> | null;
  error: string | null;
};

/** Poll a job until it finishes. Jobs run in Inngest, not in the request. */
async function waitForJob(jobId: string, onTick: (status: string) => void): Promise<Job> {
  const startedAt = Date.now();
  for (;;) {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) throw new Error("Lost track of that job.");
    const job: Job = await response.json();
    onTick(job.status);
    if (job.status === "succeeded" || job.status === "failed") return job;
    if (Date.now() - startedAt > 6 * 60_000) throw new Error("Timed out waiting for the job.");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const STEPS = ["Reference", "Analysis", "Swap", "Prompts"] as const;

export default function Home() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [videoName, setVideoName] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [character, setCharacter] = useState("");
  const [masterPrompt, setMasterPrompt] = useState<MasterPrompt | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setError(null);
    setVideoName(file.name);
    setVideoUrl(URL.createObjectURL(file));
    setBusy("Uploading…");

    try {
      const body = new FormData();
      body.append("video", file);
      const response = await fetch("/api/analyze", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");

      setBusy("Watching the video…");
      const job = await waitForJob(data.jobId, (s) =>
        setBusy(s === "running" ? "Watching the video…" : "Queued…"),
      );
      if (job.status === "failed") throw new Error(job.error ?? "Analysis failed.");

      setAnalysis((job.output as { analysis: Analysis }).analysis);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const generate = useCallback(async () => {
    if (!analysis || !targetId) return;
    setError(null);
    setBusy("Writing the generation prompts…");
    try {
      const response = await fetch("/api/recreate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis,
          replaceTargetId: targetId,
          characterDescription: character.trim() || "the new subject supplied as reference images",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");

      const job = await waitForJob(data.jobId, () => {});
      if (job.status === "failed") throw new Error(job.error ?? "Authoring failed.");

      setMasterPrompt((job.output as { masterPrompt: MasterPrompt }).masterPrompt);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [analysis, targetId, character]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reelcloner</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Recreate a reference video with a swapped character or product.
        </p>
      </header>

      <nav className="mb-8 flex items-center gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={[
                "w-full rounded-md px-2 py-1.5 text-xs font-medium transition",
                i === step
                  ? "bg-[var(--color-accent)] text-black"
                  : i < step
                    ? "bg-[var(--color-raised)] text-[var(--color-ink)] hover:bg-[var(--color-line)]"
                    : "bg-[var(--color-surface)] text-[var(--color-muted)]",
              ].join(" ")}
            >
              {i + 1}. {label}
            </button>
          </div>
        ))}
      </nav>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <div className="font-medium text-red-300">Something went wrong</div>
          <div className="mt-1 text-red-200/80">{error}</div>
        </div>
      )}

      {busy && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
          {busy}
        </div>
      )}

      {step === 0 && (
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!!busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-16 transition hover:border-[var(--color-accent)]/60 disabled:opacity-50"
          >
            <span className="text-base font-medium">Choose a reference video</span>
            <span className="text-sm text-[var(--color-muted)]">
              MP4 or MOV, up to 200MB. Takes about 20 seconds to analyze.
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </div>
      )}

      {step >= 1 && analysis && (
        <div className="grid gap-6">
          {videoUrl && step === 1 && (
            <video
              src={videoUrl}
              controls
              className="mx-auto max-h-80 rounded-xl border border-[var(--color-line)]"
            />
          )}

          {step === 1 && (
            <>
              <AnalysisView analysis={analysis} selectedId={targetId} onSelect={setTargetId} />
              <button
                type="button"
                disabled={!targetId}
                onClick={() => setStep(2)}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {targetId ? `Replace ${targetId}` : "Pick something to replace"}
              </button>
            </>
          )}

          {step === 2 && (
            <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                Replacing {targetId}
              </h3>
              <label className="mt-4 block text-sm">
                What replaces it?
                <textarea
                  value={character}
                  onChange={(e) => setCharacter(e.target.value)}
                  rows={3}
                  placeholder="e.g. a golden retriever in a chef's apron"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3 text-sm outline-none focus:border-[var(--color-accent)]/60"
                />
              </label>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Describe its role, not its looks — appearance comes from the reference images you&apos;ll
                supply to the image generator.
              </p>
              <button
                type="button"
                disabled={!!busy}
                onClick={generate}
                className="mt-4 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-40"
              >
                Write the generation prompts
              </button>
            </section>
          )}

          {step === 3 && masterPrompt && (
            <>
              <MasterPromptView prompt={masterPrompt} />
              <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
                Image and video generation are not wired up yet — that needs the OpenAI and Higgsfield
                hosts, which this environment currently blocks. These prompts are ready to paste into
                either in the meantime.
              </p>
            </>
          )}
        </div>
      )}

      <footer className="mt-12 text-xs text-[var(--color-muted)]">
        {videoName ? `Reference: ${videoName}` : "No reference loaded"}
      </footer>
    </main>
  );
}
