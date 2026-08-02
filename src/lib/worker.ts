import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/gmail";
import { renderTemplate, formatBodyToHtml } from "@/lib/template";
import { LeadData } from "@/types";

// Delay between sends to avoid hitting Gmail rate limits
const DELAY_BETWEEN_SENDS_MS = 1500; // 1.5 seconds

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the start of today (midnight) in UTC.
 */
function getStartOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Process all active campaigns:
 * - For each campaign, send up to (dailyLimit - sentToday) emails
 * - Each send is individually logged
 * - No lead is sent more than once
 */
export async function processCampaigns(targetCampaignId?: string): Promise<{
  campaignsProcessed: number;
  totalSent: number;
  totalFailed: number;
  details: Array<{
    campaignId: string;
    campaignName: string;
    sent: number;
    failed: number;
    skipped: number;
  }>;
}> {
  const startTime = Date.now();
  console.log(`[Worker] Starting campaign processing at ${new Date().toISOString()}${targetCampaignId ? ` for campaign ${targetCampaignId}` : ''}`);

  let totalSent = 0;
  let totalFailed = 0;
  const details: Array<{
    campaignId: string;
    campaignName: string;
    sent: number;
    failed: number;
    skipped: number;
  }> = [];

  // Get active campaigns matching targetCampaignId if provided
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      ...(targetCampaignId ? { id: targetCampaignId } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          gmailConnected: true,
        },
      },
    },
  });

  console.log(`[Worker] Found ${activeCampaigns.length} active campaign(s)`);

  for (const campaign of activeCampaigns) {
    let campaignSent = 0;
    let campaignFailed = 0;
    let campaignSkipped = 0;

    // Check if user has Gmail connected
    if (!campaign.user.gmailConnected) {
      console.log(`[Worker] Campaign "${campaign.name}" skipped — user Gmail not connected`);
      campaignSkipped++;
      details.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        sent: 0,
        failed: 0,
        skipped: 1,
      });
      continue;
    }

    // Count how many unique leads were sent today for this campaign
    const todayStart = getStartOfToday();
    const sentToday = await prisma.lead.count({
      where: {
        campaignId: campaign.id,
        status: "SENT",
        lastSentAt: { gte: todayStart },
      },
    });

    const remaining = campaign.dailyLimit - sentToday;
    if (remaining <= 0) {
      console.log(
        `[Worker] Campaign "${campaign.name}" — daily limit reached (${sentToday}/${campaign.dailyLimit})`
      );
      details.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
      continue;
    }

    // Select pending leads (up to the remaining daily limit)
    const pendingLeads = await prisma.lead.findMany({
      where: {
        campaignId: campaign.id,
        status: "PENDING",
      },
      take: remaining,
      orderBy: { createdAt: "asc" }, // FIFO order
    });

    if (pendingLeads.length === 0) {
      console.log(`[Worker] Campaign "${campaign.name}" — no pending leads`);

      // Check if all leads are sent — auto-complete the campaign
      const totalPending = await prisma.lead.count({
        where: { campaignId: campaign.id, status: "PENDING" },
      });
      if (totalPending === 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "COMPLETED" },
        });
        console.log(`[Worker] Campaign "${campaign.name}" — auto-completed (all leads processed)`);
      }

      details.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
      continue;
    }

    console.log(
      `[Worker] Campaign "${campaign.name}" — sending to ${pendingLeads.length} leads (${sentToday}/${campaign.dailyLimit} sent today)`
    );

    // Send emails to each lead
    for (const lead of pendingLeads) {
      // Atomic optimistic lock: pre-commit lead as SENT before calling Gmail API.
      // If another concurrent worker already claimed this lead, count will be 0 — skip.
      const claimResult = await prisma.lead.updateMany({
        where: { id: lead.id, status: "PENDING" },
        data: { status: "SENT", lastSentAt: new Date() },
      });

      if (claimResult.count === 0) {
        // Another worker already claimed this lead — skip it.
        console.log(`[Worker] Lead ${lead.email} already claimed by another worker, skipping.`);
        continue;
      }

      const leadData: LeadData = {
        email: lead.email,
        firstName: lead.firstName || "",
        lastName: lead.lastName || "",
        company: lead.company || "",
        website: lead.website || "",
      };

      const renderedSubject = renderTemplate(campaign.subjectTemplate, leadData);
      const plainRenderedBody = renderTemplate(campaign.bodyTemplate, leadData);
      const htmlFormattedBody = formatBodyToHtml(plainRenderedBody);

      try {
        // Send the actual email via Gmail API
        await sendEmail(
          campaign.userId,
          lead.email,
          renderedSubject,
          htmlFormattedBody
        );

        await prisma.emailLog.create({
          data: {
            campaignId: campaign.id,
            leadId: lead.id,
            subject: renderedSubject,
            body: htmlFormattedBody,
            status: "SENT",
            sentAt: new Date(),
          },
        });

        campaignSent++;
        totalSent++;
        console.log(`[Worker] ✅ Sent to ${lead.email}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Worker] ❌ Failed to send to ${lead.email}: ${errorMessage}`);

        // Log failure
        try {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "FAILED" },
          });

          await prisma.emailLog.create({
            data: {
              campaignId: campaign.id,
              leadId: lead.id,
              subject: renderedSubject,
              body: htmlFormattedBody,
              status: "FAILED",
              errorMessage,
              sentAt: new Date(),
            },
          });
        } catch (logErr) {
          console.error("[Worker] Failed to write error log:", logErr);
        }

        campaignFailed++;
        totalFailed++;
      }

      // Delay between sends to respect Gmail rate limits
      if (pendingLeads.indexOf(lead) < pendingLeads.length - 1) {
        await sleep(DELAY_BETWEEN_SENDS_MS);
      }
    }

    details.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      sent: campaignSent,
      failed: campaignFailed,
      skipped: campaignSkipped,
    });
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Worker] Completed in ${elapsed}ms — ${totalSent} sent, ${totalFailed} failed across ${activeCampaigns.length} campaign(s)`
  );

  return {
    campaignsProcessed: activeCampaigns.length,
    totalSent,
    totalFailed,
    details,
  };
}
