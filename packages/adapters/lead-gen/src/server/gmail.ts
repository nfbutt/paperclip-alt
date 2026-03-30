// ---------------------------------------------------------------------------
// Gmail outreach via Google OAuth2 + Gmail REST API
// ---------------------------------------------------------------------------

interface GmailClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

async function refreshAccessToken(opts: GmailClientOptions): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token refresh returned no access_token");
  return data.access_token;
}

function buildRfc2822Message(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.html,
  ];
  return lines.join("\r\n");
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(
  payload: EmailPayload,
  opts: GmailClientOptions,
): Promise<{ messageId: string }> {
  const accessToken = await refreshAccessToken(opts);

  const raw = buildRfc2822Message({
    from: opts.senderEmail,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(raw) }),
  });

  if (!res.ok) {
    throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id?: string };
  return { messageId: data.id ?? "" };
}

// ---------------------------------------------------------------------------
// Email template — personalised per listing agent + property
// ---------------------------------------------------------------------------

export interface OutreachTemplateData {
  agentName: string;
  propertyAddress: string;
  propertyCity: string;
  propertyPrice: number;
  senderName: string;
  senderEmail: string;
}

export function buildOutreachEmail(data: OutreachTemplateData): { subject: string; html: string } {
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(data.propertyPrice);

  const subject = `Qualified Borrower Lead — ${data.propertyAddress}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <p>Hi ${escapeHtml(data.agentName)},</p>

  <p>
    I came across your listing at <strong>${escapeHtml(data.propertyAddress)}</strong> in
    ${escapeHtml(data.propertyCity)} (listed at ${formattedPrice}) and wanted to reach out.
  </p>

  <p>
    I work with a pool of pre-qualified borrowers who are actively searching in this area and
    price range. I believe one of my clients could be a strong match for this property and would
    love to connect to discuss.
  </p>

  <p>
    Would you be open to a brief call this week? I can work around your schedule.
  </p>

  <p>
    Best regards,<br>
    <strong>${escapeHtml(data.senderName)}</strong><br>
    <a href="mailto:${escapeHtml(data.senderEmail)}">${escapeHtml(data.senderEmail)}</a>
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:11px;color:#999">
    You are receiving this because your listing is publicly available on the MLS.
    Reply to this email to unsubscribe from future outreach.
  </p>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
