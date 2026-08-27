"use client";

import { useState } from "react";
import type { MasterPrompt } from "@/lib/prompts/author";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded border border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-muted)] transition hover:border-[var(--color-accent)]/60 hover:text-[var(--color-ink)]"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

export function MasterPromptView({ prompt }: { prompt: MasterPrompt }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400/80">
            Kept from the reference
          </h3>
          <ul className="grid gap-2 text-sm">
            {prompt.preserve.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-400/60">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            Changed
          </h3>
          <ul className="grid gap-2 text-sm">
            {prompt.change.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--color-accent)]">→</span>
                {c}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          Keyframe prompts — {prompt.keyframe_prompts.length}
        </h3>
        <div className="grid gap-3">
          {prompt.keyframe_prompts.map((k) => (
            <div key={k.shot_id} className="rounded-lg bg-[var(--color-raised)] p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-medium">{k.shot_id}</span>
                <span className="text-xs text-[var(--color-muted)] tabular-nums">@ {k.at_seconds}s</span>
                <span className="ml-auto">
                  <Copy text={k.image_prompt} />
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{k.image_prompt}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div className="mb-3 flex items-center">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
            Motion prompt
          </h3>
          <span className="ml-auto">
            <Copy text={prompt.motion_prompt} />
          </span>
        </div>
        <p className="text-sm leading-relaxed">{prompt.motion_prompt}</p>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          Output settings
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(prompt.settings).map(([k, v]) => (
            <span key={k} className="rounded bg-[var(--color-raised)] px-2.5 py-1">
              <span className="text-[var(--color-muted)]">{k.replace(/_/g, " ")}: </span>
              {String(v)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
