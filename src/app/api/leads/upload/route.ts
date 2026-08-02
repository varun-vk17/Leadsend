import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";

/**
 * POST /api/leads/upload
 * Upload a CSV file and import leads into a campaign using bulk insertion.
 * Form data: file (CSV), campaignId, columnMapping (JSON)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const campaignId = formData.get("campaignId") as string | null;
    const mappingStr = formData.get("columnMapping") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
    }
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
    }

    // Verify campaign ownership
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Parse column mapping
    let mapping: Record<string, string> = {};
    if (mappingStr) {
      try {
        mapping = JSON.parse(mappingStr);
      } catch {
        return NextResponse.json({ error: "Invalid column mapping JSON" }, { status: 400 });
      }
    }

    // Read and parse CSV
    const csvText = await file.text();
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    const rows = parsed.data as Record<string, string>[];
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const validLeads: Array<{
      campaignId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      company: string | null;
      website: string | null;
      status: "PENDING";
    }> = [];

    const seenEmailsInFile = new Set<string>();
    let invalid = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Flexible column mapping fallback
      const email = (
        row[mapping.email] ||
        row["email"] ||
        row["Email"] ||
        row["EMAIL"] ||
        ""
      ).trim().toLowerCase();

      const firstName = (
        row[mapping.firstName] ||
        row["firstName"] ||
        row["First Name"] ||
        row["first_name"] ||
        row["First_Name"] ||
        ""
      ).trim();

      const lastName = (
        row[mapping.lastName] ||
        row["lastName"] ||
        row["Last Name"] ||
        row["last_name"] ||
        row["Last_Name"] ||
        ""
      ).trim();

      const company = (
        row[mapping.company] ||
        row["company"] ||
        row["Company"] ||
        row["COMPANY"] ||
        ""
      ).trim();

      const website = (
        row[mapping.website] ||
        row["website"] ||
        row["Website"] ||
        row["WEBSITE"] ||
        ""
      ).trim();

      if (!email || !emailRegex.test(email)) {
        invalid++;
        continue;
      }

      // De-duplicate within the uploaded CSV itself
      if (seenEmailsInFile.has(email)) {
        continue;
      }
      seenEmailsInFile.add(email);

      validLeads.push({
        campaignId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        company: company || null,
        website: website || null,
        status: "PENDING",
      });
    }

    // High performance bulk insertion with skipDuplicates
    const result = await prisma.lead.createMany({
      data: validLeads,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        totalRows: rows.length,
        imported: result.count,
        skipped: validLeads.length - result.count,
        invalid,
      },
    });
  } catch (err) {
    console.error("CSV upload error:", err);
    const message = err instanceof Error ? err.message : "Failed to process CSV file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
