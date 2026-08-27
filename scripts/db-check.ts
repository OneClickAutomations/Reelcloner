/**
 * Report whether the schema is applied to the live Supabase project.
 *
 *   pnpm db:check
 *
 * Uses PostgREST with the service-role key, so it sees the schema regardless of
 * RLS. Read-only: it never writes and never changes the schema.
 */

const TABLES = [
  "profiles",
  "projects",
  "reference_videos",
  "analyses",
  "characters",
  "generation_jobs",
  "creatives",
  "credits_ledger",
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Add it to the environment and try again.`);
    process.exit(2);
  }
  return value;
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  console.log(`project: ${url}\n`);

  const results = await Promise.all(
    TABLES.map(async (table) => {
      try {
        const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
        if (response.ok) return { table, state: "present" as const };
        const body = await response.json().catch(() => ({}));
        const missing = body?.code === "PGRST205";
        return {
          table,
          state: missing ? ("missing" as const) : ("error" as const),
          detail: missing ? undefined : `${response.status} ${body?.message ?? ""}`.trim(),
        };
      } catch (error) {
        return { table, state: "error" as const, detail: (error as Error).message };
      }
    }),
  );

  for (const r of results) {
    const mark = r.state === "present" ? "ok     " : r.state === "missing" ? "MISSING" : "ERROR  ";
    console.log(`  ${mark} ${r.table}${r.detail ? `  — ${r.detail}` : ""}`);
  }

  const missing = results.filter((r) => r.state !== "present");
  if (missing.length === 0) {
    console.log(`\nAll ${TABLES.length} tables are present. The app can use Supabase.`);
    return;
  }

  console.log(
    `\n${missing.length} of ${TABLES.length} tables are not there yet.\n\n` +
      `To create them:\n` +
      `  1. Open your project at supabase.com and go to the SQL Editor\n` +
      `  2. Paste the whole of supabase/APPLY_TO_SUPABASE.sql\n` +
      `  3. Run it, then re-run \`pnpm db:check\`\n\n` +
      `Running it more than once is safe.`,
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
