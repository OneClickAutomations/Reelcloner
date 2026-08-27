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

  /**
   * Only PGRST205 means "no such table". Anything else - a 401 from brief clock
   * skew, a 5xx, a dropped connection - is a transport problem, and reporting it
   * as a missing table sends people back to the SQL editor for no reason. So
   * those get one retry, and are labelled as errors rather than absences.
   */
  async function probe(table: string, attempt = 1): Promise<{
    table: string;
    state: "present" | "missing" | "error";
    detail?: string;
  }> {
    try {
      const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
      if (response.ok) return { table, state: "present" };

      const body = await response.json().catch(() => ({}));
      if (body?.code === "PGRST205") return { table, state: "missing" };

      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 1000));
        return probe(table, 2);
      }
      return {
        table,
        state: "error",
        detail: `${response.status} ${body?.message ?? body?.detail ?? ""}`.trim(),
      };
    } catch (error) {
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 1000));
        return probe(table, 2);
      }
      return { table, state: "error", detail: (error as Error).message };
    }
  }

  const results = await Promise.all(TABLES.map((t) => probe(t)));

  for (const r of results) {
    const mark = r.state === "present" ? "ok     " : r.state === "missing" ? "MISSING" : "ERROR  ";
    console.log(`  ${mark} ${r.table}${r.detail ? `  — ${r.detail}` : ""}`);
  }

  const missing = results.filter((r) => r.state === "missing");
  const errored = results.filter((r) => r.state === "error");

  if (errored.length > 0) {
    console.log(
      `\n${errored.length} table(s) could not be checked - that is a connection or auth ` +
        `problem, not a missing table. Try again in a moment.`,
    );
    process.exitCode = 2;
    return;
  }

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
