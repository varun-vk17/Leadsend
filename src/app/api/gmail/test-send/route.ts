import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";
import { renderTemplate, formatBodyToHtml } from "@/lib/template";

/**
 * POST /api/gmail/test-send
 * Sends a test email from the user's connected Gmail account.
 * Body: { to: string, subject?: string, body?: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reqJson = await request.json();
    const { to, subject, body: customBody } = reqJson;

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { error: "Missing 'to' email address" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: "Invalid email address format" },
        { status: 400 }
      );
    }

    let emailSubject = subject || "Test Email from Email Automation Agent";
    let emailHtmlBody = "";

    if (customBody) {
      const mockLead = {
        email: to,
        firstName: "TestUser",
        lastName: "",
        company: "Test Company",
        website: "example.com",
      };
      const renderedSubject = renderTemplate(emailSubject, mockLead);
      const renderedBody = renderTemplate(customBody, mockLead);
      emailSubject = renderedSubject;
      emailHtmlBody = formatBodyToHtml(renderedBody);
    } else {
      emailHtmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6366f1;">✅ Gmail Connection Successful!</h2>
          <p>This is a test email sent from your Email Automation Agent.</p>
          <p>Your Gmail account is properly connected and ready to send campaign emails.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            Sent via Email Automation Agent at ${new Date().toISOString()}
          </p>
        </div>
      `;
    }

    const messageId = await sendEmail(
      session.user.id,
      to,
      emailSubject,
      emailHtmlBody
    );

    return NextResponse.json({
      success: true,
      messageId,
      message: `Test email sent successfully to ${to}`,
    });
  } catch (err) {
    console.error("Test send error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to send test email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
