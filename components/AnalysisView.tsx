"use client";

import type { Analysis, Subject } from "@/lib/schemas/analysis";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-32 shrink-0 text-[var(--color-muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value || <em className="text-[var(--color-muted)]">not recorded</em>}</span>
    </div>
  );
}

export function AnalysisView({
  analysis,
  selectedId,
  onSelect,
}: {
  analysis: Analysis;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const total = analysis.duration_seconds;

  return (
    <div className="grid gap-4">
      <Card title="Recording format">
        <Row label="Duration" value={`${total}s`} />
        <Row label="Aspect ratio" value={analysis.aspect_ratio} />
        <Row label="Take" value={analysis.recording_format.take.replace("_", " ")} />
        <Row label="Camera" value={analysis.recording_format.camera} />
        <Row label="Framing" value={analysis.recording_format.framing} />
        <Row label="Movement" value={analysis.recording_format.camera_movement} />
        <Row
          label="Cuts"
          value={
            analysis.cuts.length
              ? analysis.cuts.map((c) => `${c.at_seconds}s ${c.type}`).join(", ")
              : "none — single continuous take"
          }
        />
      </Card>

      <Card title="Scene">
        <Row label="Location" value={analysis.scene.location_type} />
        <Row label="Setting" value={analysis.scene.setting} />
        <Row label="Lighting" value={analysis.scene.lighting} />
        <Row label="Background" value={analysis.scene.background} />
      </Card>

      <Card title={`Beats — ${analysis.beats.length}`}>
        <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-raised)]">
          {analysis.beats.map((b, i) => (
            <div
              key={i}
              title={b.label}
              style={{ width: `${Math.max(2, ((b.end_seconds - b.start_seconds) / total) * 100)}%` }}
              className={i % 2 === 0 ? "bg-[var(--color-accent)]" : "bg-[var(--color-accent)]/55"}
            />
          ))}
        </div>
        <ol className="grid gap-3">
          {analysis.beats.map((b, i) => (
            <li key={i} className="border-l-2 border-[var(--color-line)] pl-3">
              <div className="text-sm font-medium">
                <span className="text-[var(--color-muted)] tabular-nums">
                  {b.start_seconds}–{b.end_seconds}s
                </span>{" "}
                {b.label}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-muted)]">{b.evidence}</div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Who or what do you want to replace?">
        <div className="grid gap-2">
          {analysis.subjects.map((s: Subject) => {
            const selectable = s.is_candidate_replace_target;
            const selected = selectedId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!selectable}
                onClick={() => onSelect(s.id)}
                className={[
                  "rounded-lg border p-3 text-left transition",
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "border-[var(--color-line)] bg-[var(--color-raised)]",
                  selectable
                    ? "cursor-pointer hover:border-[var(--color-accent)]/60"
                    : "cursor-not-allowed opacity-45",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.id}</span>
                  <span className="rounded bg-[var(--color-line)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    {s.type}
                  </span>
                  <span className="ml-auto text-xs text-[var(--color-muted)] tabular-nums">
                    {s.approx_screen_time_pct}% on screen
                  </span>
                </div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{s.role}</div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">{s.observed_description}</div>
                {!selectable && (
                  <div className="mt-1.5 text-xs text-amber-500/80">
                    Not cleanly separable from the scene — can&apos;t be swapped
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Audio">
        <Row label="Speech" value={analysis.audio.has_speech ? "yes" : "no"} />
        <Row label="Tone" value={analysis.audio.speaker_tone} />
        <Row label="Music" value={analysis.audio.music} />
        <Row label="Sound effects" value={analysis.audio.sfx.join(", ")} />
        {analysis.audio.transcript && (
          <p className="mt-3 rounded-lg bg-[var(--color-raised)] p-3 text-sm leading-relaxed">
            {analysis.audio.transcript}
          </p>
        )}
      </Card>

      {analysis.on_screen_text.length > 0 && (
        <Card title="On-screen text">
          {analysis.on_screen_text.map((t, i) => (
            <Row key={i} label={`${t.at_seconds}s`} value={`“${t.text}”`} />
          ))}
        </Card>
      )}

      {analysis.notes_uncertain.length > 0 && (
        <Card title="What the analyzer wasn't sure about">
          <ul className="grid gap-1.5 text-sm text-[var(--color-muted)]">
            {analysis.notes_uncertain.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-500/70">•</span>
                {n}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
