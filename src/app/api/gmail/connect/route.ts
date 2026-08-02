import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGmailAuthUrl } from "@/lib/gmail";

/**
 * GET /api/gmail/connect
 * Redirects the user to Google's OAuth consent screen
 * to authorize Gmail sending access.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "You must be logged in to connect Gmail" },
      { status: 401 }
    );
  }

  // Pass the user ID as state so we can associate tokens on callback
  const authUrl = getGmailAuthUrl(session.user.id);

  return NextResponse.redirect(authUrl);
}
