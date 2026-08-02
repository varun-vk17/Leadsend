import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/campaigns/[id]/logs
 * Get email logs for a specific campaign.
 * Query params: status (SENT/FAILED), search (email), page, limit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;

  // Verify campaign ownership
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Parse query params
  const status = searchParams.get("status") as "SENT" | "FAILED" | null;
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = { campaignId: id };
  if (status) {
    where.status = status;
  }
  if (search) {
    where.lead = {
      email: { contains: search, mode: "insensitive" },
    };
  }

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      include: {
        lead: {
          select: { email: true, firstName: true, lastName: true, company: true },
        },
      },
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.emailLog.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}
