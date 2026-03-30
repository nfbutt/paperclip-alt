// ---------------------------------------------------------------------------
// HTML dashboard payload formatter
// Produces a self-contained HTML report sent to the backend dashboard webhook.
// ---------------------------------------------------------------------------

import type { MlsListing } from "./mls.js";

export interface OutreachResult {
  listing: MlsListing;
  skippedDuplicate: boolean;
  emailSent: boolean;
  emailError?: string;
  messageId?: string;
}

export interface DashboardPayload {
  html: string;
  runId: string;
  runAt: string;
  summary: {
    total: number;
    newListings: number;
    duplicates: number;
    emailsSent: number;
    errors: number;
  };
}

export function buildDashboardPayload(
  runId: string,
  instruction: string,
  results: OutreachResult[],
): DashboardPayload {
  const runAt = new Date().toISOString();
  const newListings = results.filter((r) => !r.skippedDuplicate).length;
  const duplicates = results.filter((r) => r.skippedDuplicate).length;
  const emailsSent = results.filter((r) => r.emailSent).length;
  const errors = results.filter((r) => r.emailError != null).length;

  const rows = results
    .map((r) => {
      const statusBadge = r.skippedDuplicate
        ? `<span style="background:#f0ad4e;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">DUPLICATE</span>`
        : r.emailSent
          ? `<span style="background:#5cb85c;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">SENT</span>`
          : `<span style="background:#d9534f;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">ERROR</span>`;

      const formattedPrice = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(r.listing.price);

      const address = escapeHtml(
        `${r.listing.address}, ${r.listing.city}, ${r.listing.state} ${r.listing.zip}`,
      );

      return `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:10px 8px">${escapeHtml(r.listing.mlsId)}</td>
        <td style="padding:10px 8px">${address}</td>
        <td style="padding:10px 8px">${formattedPrice}</td>
        <td style="padding:10px 8px">${escapeHtml(r.listing.listingAgent.name)}</td>
        <td style="padding:10px 8px">${escapeHtml(r.listing.listingAgent.email)}</td>
        <td style="padding:10px 8px">${statusBadge}${r.emailError ? `<br><small style="color:#d9534f">${escapeHtml(r.emailError)}</small>` : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lead Gen Run — ${escapeHtml(runId)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat { background: #f5f5f5; border-radius: 6px; padding: 12px 20px; min-width: 100px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f0f0f0; text-align: left; padding: 10px 8px; font-size: 12px; text-transform: uppercase; color: #555; }
    tr:hover { background: #fafafa; }
  </style>
</head>
<body>
  <h1>Lead Gen Run</h1>
  <div class="meta">Run ID: ${escapeHtml(runId)} &mdash; ${escapeHtml(runAt)}</div>
  <div class="meta"><strong>Instruction:</strong> ${escapeHtml(instruction)}</div>

  <div class="stats">
    <div class="stat"><div class="stat-value">${results.length}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-value">${newListings}</div><div class="stat-label">New</div></div>
    <div class="stat"><div class="stat-value">${duplicates}</div><div class="stat-label">Duplicates</div></div>
    <div class="stat"><div class="stat-value">${emailsSent}</div><div class="stat-label">Emails Sent</div></div>
    <div class="stat"><div class="stat-value">${errors}</div><div class="stat-label">Errors</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>MLS ID</th>
        <th>Address</th>
        <th>Price</th>
        <th>Agent</th>
        <th>Agent Email</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  return {
    html,
    runId,
    runAt,
    summary: { total: results.length, newListings, duplicates, emailsSent, errors },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
