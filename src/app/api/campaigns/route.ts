import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/campaigns
 * List all campaigns for the authenticated user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { leads: true, emailLogs: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Enrich with stats
  const enriched = await Promise.all(
    campaigns.map(async (campaign) => {
      const totalLeads = campaign._count.leads;

      const sentCount = await prisma.lead.count({
        where: { campaignId: campaign.id, status: "SENT" },
      });

      const failedCount = await prisma.lead.count({
        where: { campaignId: campaign.id, status: "FAILED" },
      });

      // Count emails sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sentToday = await prisma.lead.count({
        where: {
          campaignId: campaign.id,
          status: "SENT",
          lastSentAt: { gte: today },
        },
      });

      return {
        id: campaign.id,
        name: campaign.name,
        subjectTemplate: campaign.subjectTemplate,
        bodyTemplate: campaign.bodyTemplate,
        dailyLimit: campaign.dailyLimit,
        status: campaign.status,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        stats: {
          totalLeads,
          totalSent: sentCount,
          totalFailed: failedCount,
          sentToday,
          remaining: totalLeads - sentCount - failedCount,
        },
      };
    })
  );

  return NextResponse.json({ success: true, data: enriched });
}

/**
 * POST /api/campaigns
 * Create a new campaign.
 * Body: { name, subjectTemplate, bodyTemplate, dailyLimit? }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, subjectTemplate, bodyTemplate, dailyLimit } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }
    if (
      !subjectTemplate ||
      typeof subjectTemplate !== "string" ||
      subjectTemplate.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Subject template is required" },
        { status: 400 }
      );
    }
    if (
      !bodyTemplate ||
      typeof bodyTemplate !== "string" ||
      bodyTemplate.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Body template is required" },
        { status: 400 }
      );
    }

    const limit =
      dailyLimit && typeof dailyLimit === "number" && dailyLimit > 0
        ? Math.min(dailyLimit, 500) // Cap at Gmail's daily limit
        : 30;

    const campaign = await prisma.campaign.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        subjectTemplate: subjectTemplate.trim(),
        bodyTemplate: bodyTemplate.trim(),
        dailyLimit: limit,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (err) {
    console.error("Campaign creation error:", err);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
