import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServerFetch } from "@/lib/supabase/fetch";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase environment variables are missing.",
        diagnostics: {
          hasUrl: Boolean(url),
          hasPublishableKey: Boolean(publishableKey),
        },
      },
      { status: 500 },
    );
  }

  try {
    const supabase = createClient(url, publishableKey, {
      global: {
        fetch: supabaseServerFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { count, error } = await supabase.from("places").select("id", {
      count: "exact",
      head: true,
    });

    if (error) {
      console.error("Supabase health-check error:", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message || "Supabase returned an unknown error.",
          code: error.code || null,
          details: error.details || null,
          hint: error.hint || null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Venture is connected to Supabase.",
      placesCount: count ?? 0,
    });
  } catch (error) {
    console.error("Supabase health-check exception:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown connection error.",
      },
      { status: 500 },
    );
  }
}
