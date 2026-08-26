/**
 * Server-only secret access. Never import this from a client component.
 * Secrets come from env only — never from the database, never hardcoded.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
