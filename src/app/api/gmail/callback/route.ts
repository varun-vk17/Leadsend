import { NextRequest, NextResponse } from "next/server";
import { handleGmailCallback } from "@/lib/gmail";

/**
 * GET /api/gmail/callback
 * Handles the OAuth callback from Google after the user
 * grants Gmail sending access. Stores encrypted tokens.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // User ID
  const error = searchParams.get("error");

  if (error) {
    console.error("Gmail OAuth error:", error);
    return NextResponse.redirect(
      new URL("/dashboard?gmail=error&message=" + encodeURIComponent(error), request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?gmail=error&message=missing_params", request.url)
    );
  }

  try {
    await handleGmailCallback(code, state);

    return NextResponse.redirect(
      new URL("/dashboard?gmail=connected", request.url)
    );
  } catch (err) {
    console.error("Gmail callback error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to connect Gmail";
    return NextResponse.redirect(
      new URL(
        "/dashboard?gmail=error&message=" + encodeURIComponent(message),
        request.url
      )
    );
  }
}
