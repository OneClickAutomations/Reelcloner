"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Anon key only — safe to ship to the client bundle. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
