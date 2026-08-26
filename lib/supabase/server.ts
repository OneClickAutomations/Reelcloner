import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/env";

/** Server Supabase client bound to the request's cookies. Respects RLS as the signed-in user. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client: bypasses RLS. Only for trusted server contexts
 * (Inngest functions, webhooks). Never expose to a request the user controls
 * without checking authorization first.
 */
export function createServiceRoleClient() {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op: service-role client is stateless
        },
      },
    },
  );
}
