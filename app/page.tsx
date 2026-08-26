export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Reelcloner</h1>
      <p className="text-sm text-neutral-400">
        Stage 1 scaffold. Next.js App Router, Supabase clients, and Inngest are wired up; the
        pipeline stages are not built yet.
      </p>
      <ul className="space-y-1 text-sm text-neutral-500">
        <li>
          Inngest endpoint: <code className="text-neutral-300">/api/inngest</code>
        </li>
        <li>
          Model registry: <code className="text-neutral-300">config/models.ts</code>
        </li>
        <li>
          Provider adapters: <code className="text-neutral-300">lib/providers/</code>
        </li>
      </ul>
    </main>
  );
}
