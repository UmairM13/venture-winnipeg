import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServerFetch } from "./fetch";

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is missing.");
  }

  if (!secretKey.startsWith("sb_secret_")) {
    throw new Error(
      "SUPABASE_SECRET_KEY does not appear to contain a valid Supabase secret key.",
    );
  }

  return createClient(url, secretKey, {
    global: {
      fetch: supabaseServerFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
