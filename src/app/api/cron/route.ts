import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { processCampaigns } from "@/lib/worker";

/**
 * POST /api/cron
 * Trigger the campaign processing worker.
 *
 * Can be called by:
 * - Logged-in dashboard users (via session)
 * - External cron services (via Authorization: Bearer CRON_SECRET)
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorizedCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isLoggedInUser = Boolean(session?.user?.id);

  if (!isAuthorizedCron && !isLoggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let campaignId: string | undefined;
    try {
      const body = await request.json();
      if (body?.campaignId && typeof body.campaignId === "string") {
        campaignId = body.campaignId;
      }
    } catch {
      // JSON body is optional
    }

    const result = await processCampaigns(campaignId);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron] Worker error:", err);
    const message = err instanceof Error ? err.message : "Worker failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also support GET for Vercel Cron Jobs / external pings
export async function GET(request: NextRequest) {
  return POST(request);
}
