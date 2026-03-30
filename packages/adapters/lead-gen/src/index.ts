export const type = "lead_gen";
export const label = "Borrower Lead Generation";

export const agentConfigurationDoc = `# lead_gen agent configuration

Adapter: lead_gen

Core fields:
- mlsApiUrl (string, required): Base URL for the MLS API provider
- mlsApiKey (string, required): API key for MLS provider authentication
- gmailClientId (string, required): Google OAuth2 client ID
- gmailClientSecret (string, required): Google OAuth2 client secret
- gmailRefreshToken (string, required): Google OAuth2 refresh token for Gmail access
- gmailSenderEmail (string, required): Email address to send outreach from
- dbUrl (string, optional): Database connection URL for duplicate detection (defaults to in-memory)
- dashboardWebhookUrl (string, optional): URL to POST HTML dashboard payloads to
- maxResultsPerQuery (number, optional): Max MLS listings to process per run (default: 50)
- rateLimitDelayMs (number, optional): Delay between MLS API requests in ms (default: 500)

Natural language instruction examples:
- "Target luxury condos in Miami under $2M listed in the last 30 days"
- "Find single-family homes in Austin TX between $400k and $800k"
- "Search for new listings in Chicago with price drop in last 7 days"
`;
