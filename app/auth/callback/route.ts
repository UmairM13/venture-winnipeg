import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/profile";
  }

  return value;
}

function signInErrorMessage(
  errorCode: string | null,
  description: string | null,
) {
  const combined = `${errorCode ?? ""} ${description ?? ""}`.toLowerCase();

  if (combined.includes("access_denied") || combined.includes("cancel")) {
    return "Google sign-in was cancelled. You can try again or continue with email.";
  }

  if (combined.includes("provider") && combined.includes("enabled")) {
    return "Google sign-in is not enabled yet. Finish the Google provider setup in Supabase, then try again.";
  }

  return "Google could not complete the sign-in. Please try again or continue with email.";
}

function getGoogleDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.given_name,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().slice(0, 80);
    }
  }

  return null;
}

function isGenericDisplayName(
  value: string | null | undefined,
  email: string | null | undefined,
) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  const emailName = email?.split("@")[0]?.trim().toLowerCase();

  return (
    normalized === "guest" ||
    normalized === "venture user" ||
    Boolean(emailName && normalized === emailName)
  );
}

export async function GET(request: NextRequest) {
  const appOrigin = new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin,
  ).origin;

  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const provider = request.nextUrl.searchParams.get("provider");
  const providerError = request.nextUrl.searchParams.get("error");
  const providerErrorDescription =
    request.nextUrl.searchParams.get("error_description");

  if (providerError || providerErrorDescription) {
    const errorUrl = new URL("/sign-in", appOrigin);

    errorUrl.searchParams.set(
      "error",
      provider === "google"
        ? signInErrorMessage(providerError, providerErrorDescription)
        : "The sign-in link is invalid or has expired. Please request a new one.",
    );

    errorUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const errorUrl = new URL("/sign-in", appOrigin);

    errorUrl.searchParams.set(
      "error",
      provider === "google"
        ? "Google did not return a complete sign-in response. Please try again."
        : "The sign-in link was incomplete. Please request a new one.",
    );

    errorUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(errorUrl);
  }

  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL("/sign-in", appOrigin);

    errorUrl.searchParams.set(
      "error",
      provider === "google"
        ? "Google sign-in expired before Venture could connect the account. Please try again."
        : "That sign-in link expired or was already used. Please request another.",
    );

    errorUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(errorUrl);
  }

  let resolvedNextPath = nextPath;
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;

  if (user) {
    const profileResult = await supabase
      .from("profiles")
      .select("display_name,onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (
      provider === "google" &&
      !profileResult.error &&
      isGenericDisplayName(profileResult.data?.display_name, user.email)
    ) {
      const googleName = getGoogleDisplayName(user);

      if (googleName) {
        await supabase
          .from("profiles")
          .update({
            display_name: googleName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    }

    if (
      nextPath === "/profile" &&
      !profileResult.error &&
      profileResult.data?.onboarding_completed !== true
    ) {
      resolvedNextPath = "/profile/onboarding";
    }
  }

  let destination = new URL(resolvedNextPath, appOrigin);

  if (destination.origin !== appOrigin) {
    destination = new URL("/profile", appOrigin);
  }

  destination.searchParams.set("account", "connected");

  if (provider === "google") {
    destination.searchParams.set("provider", "google");
  }

  return NextResponse.redirect(destination);
}
