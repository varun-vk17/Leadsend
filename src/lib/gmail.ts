import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

/**
 * Create a configured OAuth2 client for Google APIs.
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXTAUTH_URL}/api/gmail/callback`
  );
}

/**
 * Generate the Gmail authorization URL for a user to grant
 * send-only access to their Gmail account.
 */
export function getGmailAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // Get refresh token
    scope: GMAIL_SCOPES,
    prompt: "consent", // Always show consent to ensure refresh token
    state, // Pass user ID for the callback
  });
}

/**
 * Exchange an authorization code for tokens, encrypt them,
 * and store them in the database.
 */
export async function handleGmailCallback(
  code: string,
  userId: string
): Promise<void> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("No access token received from Google");
  }

  // Encrypt tokens before storing
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      gmailAccessToken: encryptedAccess,
      gmailRefreshToken: encryptedRefresh,
      gmailTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      gmailConnected: true,
    },
  });
}

/**
 * Get an authenticated OAuth2 client for a user.
 * Automatically refreshes the token if expired.
 */
export async function getAuthenticatedClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gmailAccessToken: true,
      gmailRefreshToken: true,
      gmailTokenExpiry: true,
      gmailConnected: true,
    },
  });

  if (!user || !user.gmailConnected || !user.gmailAccessToken) {
    throw new Error("Gmail is not connected for this user");
  }

  const oauth2Client = createOAuth2Client();

  // Decrypt tokens
  const accessToken = decrypt(user.gmailAccessToken);
  const refreshToken = user.gmailRefreshToken
    ? decrypt(user.gmailRefreshToken)
    : null;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: user.gmailTokenExpiry?.getTime(),
  });

  // Check if token is expired or about to expire (within 5 minutes)
  const now = Date.now();
  const expiry = user.gmailTokenExpiry?.getTime() || 0;
  const FIVE_MINUTES = 5 * 60 * 1000;

  if (expiry - now < FIVE_MINUTES && refreshToken) {
    // Token is expired or expiring soon — refresh it
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (credentials.access_token) {
      // Store the refreshed token (encrypted)
      await prisma.user.update({
        where: { id: userId },
        data: {
          gmailAccessToken: encrypt(credentials.access_token),
          gmailTokenExpiry: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : null,
        },
      });
    }
  }

  return oauth2Client;
}

/**
 * Send an email via Gmail API.
 *
 * @param userId - The user whose Gmail account to send from
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param htmlBody - HTML email body
 * @returns Gmail API message ID
 */
export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<string> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build the email in RFC 2822 format
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    htmlBody,
  ];

  const rawEmail = emailLines.join("\r\n");

  // Base64url encode the email
  const encodedEmail = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedEmail,
    },
  });

  if (!response.data.id) {
    throw new Error("Gmail API did not return a message ID");
  }

  return response.data.id;
}
