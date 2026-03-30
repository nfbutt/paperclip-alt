// ---------------------------------------------------------------------------
// MLS API client — swap provider by changing MLS_PROVIDER env or config
// ---------------------------------------------------------------------------

export interface MlsSearchParams {
  location: string;
  minPrice?: number;
  maxPrice?: number;
  maxListingAgeDays?: number;
  propertyType?: string;
  maxResults: number;
}

export interface MlsListing {
  mlsId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  propertyType: string;
  listedAt: string;
  listingAgent: {
    name: string;
    email: string;
    phone?: string;
    licenseNumber?: string;
  };
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  description?: string;
}

export interface MlsSearchResult {
  listings: MlsListing[];
  totalCount: number;
  page: number;
}

interface MlsClientOptions {
  apiUrl: string;
  apiKey: string;
  rateLimitDelayMs: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoffMs = 1000,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? backoffMs / 1000);
        await sleep(retryAfter * 1000);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries - 1) await sleep(backoffMs * (attempt + 1));
    }
  }
  throw lastError ?? new Error("MLS fetch failed after retries");
}

export async function searchMlsListings(
  params: MlsSearchParams,
  opts: MlsClientOptions,
): Promise<MlsSearchResult> {
  // -------------------------------------------------------------------
  // Placeholder: replace query construction with your MLS provider's
  // schema (e.g. Spark API, Bridge Interactive, RESO Web API).
  // -------------------------------------------------------------------
  const query = new URLSearchParams({
    location: params.location,
    limit: String(params.maxResults),
    ...(params.minPrice != null ? { minPrice: String(params.minPrice) } : {}),
    ...(params.maxPrice != null ? { maxPrice: String(params.maxPrice) } : {}),
    ...(params.maxListingAgeDays != null
      ? { listedWithin: `${params.maxListingAgeDays}d` }
      : {}),
    ...(params.propertyType ? { propertyType: params.propertyType } : {}),
  });

  const res = await fetchWithRetry(
    `${opts.apiUrl}/listings/search?${query}`,
    {
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`MLS API error ${res.status}: ${await res.text()}`);
  }

  // -------------------------------------------------------------------
  // Placeholder: adapt this mapping to your provider's response shape.
  // -------------------------------------------------------------------
  const raw = (await res.json()) as {
    results?: unknown[];
    total?: number;
    page?: number;
  };

  const listings: MlsListing[] = (raw.results ?? []).map((item) => {
    const r = item as Record<string, unknown>;
    const agent = (r.listingAgent ?? r.agent ?? {}) as Record<string, unknown>;
    return {
      mlsId: String(r.mlsId ?? r.id ?? ""),
      address: String(r.address ?? r.streetAddress ?? ""),
      city: String(r.city ?? ""),
      state: String(r.state ?? ""),
      zip: String(r.zip ?? r.postalCode ?? ""),
      price: Number(r.listPrice ?? r.price ?? 0),
      propertyType: String(r.propertyType ?? r.type ?? ""),
      listedAt: String(r.listDate ?? r.listedAt ?? ""),
      listingAgent: {
        name: String(agent.name ?? agent.fullName ?? ""),
        email: String(agent.email ?? agent.emailAddress ?? ""),
        phone: agent.phone ? String(agent.phone) : undefined,
        licenseNumber: agent.licenseNumber ? String(agent.licenseNumber) : undefined,
      },
      bedrooms: r.bedrooms != null ? Number(r.bedrooms) : undefined,
      bathrooms: r.bathrooms != null ? Number(r.bathrooms) : undefined,
      sqft: r.sqft != null ? Number(r.sqft) : undefined,
      description: r.remarks ? String(r.remarks) : undefined,
    };
  });

  await sleep(opts.rateLimitDelayMs);

  return {
    listings,
    totalCount: Number(raw.total ?? listings.length),
    page: Number(raw.page ?? 1),
  };
}
