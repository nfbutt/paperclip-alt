import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { asString, asNumber, asBoolean } from "@paperclipai/adapter-utils/server-utils";
import { searchMlsListings } from "./mls.js";
import { createStore } from "./storage.js";
import { sendEmail, buildOutreachEmail } from "./gmail.js";
import { buildDashboardPayload, type OutreachResult } from "./html.js";
import { parseInstruction } from "./parse-instruction.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, config, context, onLog } = ctx;

  // -------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------
  const mlsApiUrl = asString(config.mlsApiUrl, "").trim();
  const mlsApiKey = asString(config.mlsApiKey, "").trim();
  const gmailClientId = asString(config.gmailClientId, "").trim();
  const gmailClientSecret = asString(config.gmailClientSecret, "").trim();
  const gmailRefreshToken = asString(config.gmailRefreshToken, "").trim();
  const gmailSenderEmail = asString(config.gmailSenderEmail, "").trim();
  const senderName = asString(config.senderName, gmailSenderEmail).trim();
  const dbUrl = asString(config.dbUrl, "").trim() || undefined;
  const dashboardWebhookUrl = asString(config.dashboardWebhookUrl, "").trim() || undefined;
  const maxResults = asNumber(config.maxResultsPerQuery, 50);
  const rateLimitDelayMs = asNumber(config.rateLimitDelayMs, 500);
  const dryRun = asBoolean(config.dryRun, false);

  if (!mlsApiUrl || !mlsApiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "lead_gen adapter requires mlsApiUrl and mlsApiKey in config",
      errorCode: "missing_config",
    };
  }
  if (!dryRun && (!gmailClientId || !gmailClientSecret || !gmailRefreshToken || !gmailSenderEmail)) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "lead_gen adapter requires Gmail OAuth2 credentials in config (or set dryRun: true)",
      errorCode: "missing_config",
    };
  }

  // -------------------------------------------------------------------
  // Natural language instruction → MLS query params
  // -------------------------------------------------------------------
  const rawInstruction =
    asString(context.instruction, "").trim() ||
    asString(context.prompt, "").trim() ||
    "Find new listings";

  await onLog("stdout", `[lead_gen] Instruction: "${rawInstruction}"\n`);

  const searchParams = parseInstruction(rawInstruction, maxResults);

  await onLog(
    "stdout",
    `[lead_gen] MLS query: location="${searchParams.location}" ` +
      `type=${searchParams.propertyType ?? "any"} ` +
      `price=${searchParams.minPrice ?? ""}–${searchParams.maxPrice ?? ""} ` +
      `age≤${searchParams.maxListingAgeDays ?? "any"}d\n`,
  );

  // -------------------------------------------------------------------
  // MLS search
  // -------------------------------------------------------------------
  let searchResult;
  try {
    searchResult = await searchMlsListings(searchParams, {
      apiUrl: mlsApiUrl,
      apiKey: mlsApiKey,
      rateLimitDelayMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onLog("stderr", `[lead_gen] MLS search error: ${message}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `MLS search failed: ${message}`,
      errorCode: "mls_error",
    };
  }

  await onLog(
    "stdout",
    `[lead_gen] Found ${searchResult.listings.length} listings (total available: ${searchResult.totalCount})\n`,
  );

  // -------------------------------------------------------------------
  // Storage + dedup + outreach
  // -------------------------------------------------------------------
  const store = createStore({ dbUrl });
  const results: OutreachResult[] = [];

  for (const listing of searchResult.listings) {
    const isDuplicate = await store.hasListing(listing.mlsId);

    if (isDuplicate) {
      await onLog("stdout", `[lead_gen] Skipping duplicate: ${listing.mlsId}\n`);
      results.push({ listing, skippedDuplicate: true, emailSent: false });
      continue;
    }

    await store.saveListing(listing);

    if (!listing.listingAgent.email) {
      await onLog(
        "stdout",
        `[lead_gen] No agent email for ${listing.mlsId} (${listing.address}), skipping outreach\n`,
      );
      results.push({ listing, skippedDuplicate: false, emailSent: false, emailError: "no agent email" });
      continue;
    }

    const { subject, html } = buildOutreachEmail({
      agentName: listing.listingAgent.name || "there",
      propertyAddress: listing.address,
      propertyCity: listing.city,
      propertyPrice: listing.price,
      senderName,
      senderEmail: gmailSenderEmail,
    });

    if (dryRun) {
      await onLog("stdout", `[lead_gen] [DRY RUN] Would send to ${listing.listingAgent.email}: "${subject}"\n`);
      results.push({ listing, skippedDuplicate: false, emailSent: false });
      continue;
    }

    try {
      const { messageId } = await sendEmail(
        { to: listing.listingAgent.email, subject, html },
        { clientId: gmailClientId, clientSecret: gmailClientSecret, refreshToken: gmailRefreshToken, senderEmail: gmailSenderEmail },
      );
      await store.markOutreachSent(listing.mlsId);
      await onLog("stdout", `[lead_gen] Email sent to ${listing.listingAgent.email} (msg: ${messageId})\n`);
      results.push({ listing, skippedDuplicate: false, emailSent: true, messageId });
    } catch (err) {
      const emailError = err instanceof Error ? err.message : String(err);
      await onLog("stderr", `[lead_gen] Email error for ${listing.mlsId}: ${emailError}\n`);
      results.push({ listing, skippedDuplicate: false, emailSent: false, emailError });
    }
  }

  // -------------------------------------------------------------------
  // HTML dashboard payload
  // -------------------------------------------------------------------
  const dashboard = buildDashboardPayload(runId, rawInstruction, results);

  if (dashboardWebhookUrl) {
    try {
      const webhookRes = await fetch(dashboardWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          runAt: dashboard.runAt,
          summary: dashboard.summary,
          html: dashboard.html,
        }),
      });
      if (!webhookRes.ok) {
        await onLog("stderr", `[lead_gen] Dashboard webhook error: ${webhookRes.status}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await onLog("stderr", `[lead_gen] Dashboard webhook failed: ${message}\n`);
    }
  }

  const { summary } = dashboard;
  const summaryText =
    `Run complete. Total: ${summary.total}, New: ${summary.newListings}, ` +
    `Duplicates: ${summary.duplicates}, Emails sent: ${summary.emailsSent}, Errors: ${summary.errors}`;

  await onLog("stdout", `[lead_gen] ${summaryText}\n`);

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: summaryText,
    resultJson: {
      summary: dashboard.summary,
      runAt: dashboard.runAt,
      instruction: rawInstruction,
      searchParams,
    },
  };
}
