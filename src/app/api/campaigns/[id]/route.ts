import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/campaigns/[id]
 * Get a single campaign with its leads and stats.
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

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
    include: {
      leads: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Get stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentToday = await prisma.lead.count({
    where: {
      campaignId: id,
      status: "SENT",
      lastSentAt: { gte: today },
    },
  });

  const totalSent = await prisma.lead.count({
    where: { campaignId: id, status: "SENT" },
  });

  const totalFailed = await prisma.lead.count({
    where: { campaignId: id, status: "FAILED" },
  });

  return NextResponse.json({
    success: true,
    data: {
      ...campaign,
      stats: {
        totalLeads: campaign.leads.length,
        totalSent,
        totalFailed,
        sentToday,
        remaining: campaign.leads.length - totalSent - totalFailed,
      },
    },
  });
}

/**
 * PATCH /api/campaigns/[id]
 * Update a campaign (name, templates, dailyLimit, status).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const existing = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.subjectTemplate !== undefined)
      updateData.subjectTemplate = body.subjectTemplate.trim();
    if (body.bodyTemplate !== undefined)
      updateData.bodyTemplate = body.bodyTemplate.trim();
    if (body.dailyLimit !== undefined)
      updateData.dailyLimit = Math.min(Math.max(1, body.dailyLimit), 500);
    if (body.status !== undefined) {
      const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: campaign });
  } catch (err) {
    console.error("Campaign update error:", err);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign and all its leads and logs.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  await prisma.campaign.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
