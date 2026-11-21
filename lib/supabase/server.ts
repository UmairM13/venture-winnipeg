import "server-only";

import { createServerClient } from "@supabase/ssr";

import { cookies } from "next/headers";
import { supabaseServerFetch } from "./fetch";

export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    global: {
      fetch: supabaseServerFetch,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* Proxy refreshes cookies for Server Component requests. */
        }
      },
    },
  });
}
