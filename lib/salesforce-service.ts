import { getRedis } from "@/lib/redis-client";

const REDIS_TOKEN_KEY = "sf:oauth:token";

type CachedToken = {
  access_token: string;
  instance_url: string;
  expires_at: number;
};

type SalesforceQueryResponse<T = Record<string, unknown>> = {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
};

type SObjectDescribeField = {
  name: string;
  queryable?: boolean;
};

type SObjectDescribeResponse = {
  name?: string;
  fields?: SObjectDescribeField[];
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function tokenEndpoint(loginUrl: string): string {
  return `${stripTrailingSlash(loginUrl)}/services/oauth2/token`;
}

function getClientSecret(): string {
  return (
    process.env.SF_CUSTOMER_SECRET ??
    process.env.SF_CLIENT_SECRET ??
    ""
  ).trim();
}

function getConsumerKey(): string {
  return (process.env.SF_CONSUMER_KEY ?? "").trim();
}

function getLoginUrl(): string {
  return (process.env.SF_LOGIN_URL ?? "").trim();
}

export class SalesforceService {
  private async readCachedToken(): Promise<CachedToken | null> {
    const redis = getRedis();
    const raw = await redis.get(REDIS_TOKEN_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CachedToken;
      if (!parsed.access_token || !parsed.instance_url || !parsed.expires_at) {
        return null;
      }
      if (Date.now() >= parsed.expires_at - 30_000) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCachedToken(
    access_token: string,
    instance_url: string,
    expiresInSec: number
  ): Promise<void> {
    const redis = getRedis();
    const safeTtl = Math.max(30, Math.floor(expiresInSec) - 120);
    const payload: CachedToken = {
      access_token,
      instance_url,
      expires_at: Date.now() + safeTtl * 1000,
    };
    await redis.set(REDIS_TOKEN_KEY, JSON.stringify(payload), "EX", safeTtl);
  }

  async clearTokenCache(): Promise<void> {
    const redis = getRedis();
    await redis.del(REDIS_TOKEN_KEY);
  }

  private async fetchNewToken(): Promise<CachedToken> {
    const loginUrl = getLoginUrl();
    const clientId = getConsumerKey();
    const clientSecret = getClientSecret();
    if (!loginUrl || !clientId || !clientSecret) {
      throw new Error(
        "Missing Salesforce env: SF_LOGIN_URL, SF_CONSUMER_KEY, and SF_CUSTOMER_SECRET (or SF_CLIENT_SECRET)"
      );
    }

    const grant = (process.env.SF_OAUTH_GRANT ?? "client_credentials").toLowerCase();
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);

    if (grant === "password") {
      const username = (process.env.SF_USERNAME ?? "").trim();
      const password = (process.env.SF_PASSWORD ?? "").trim();
      const token = (process.env.SF_SECURITY_TOKEN ?? "").trim();
      if (!username || !password) {
        throw new Error("SF_OAUTH_GRANT=password requires SF_USERNAME and SF_PASSWORD");
      }
      body.set("grant_type", "password");
      body.set("username", username);
      body.set("password", token ? `${password}${token}` : password);
    } else {
      body.set("grant_type", "client_credentials");
    }

    const res = await fetch(tokenEndpoint(loginUrl), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const json = (await res.json()) as {
      access_token?: string;
      instance_url?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !json.access_token || !json.instance_url) {
      const msg = json.error_description ?? json.error ?? res.statusText;
      throw new Error(`Salesforce token request failed: ${msg}`);
    }

    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
    await this.writeCachedToken(json.access_token, json.instance_url, expiresIn);

    return {
      access_token: json.access_token,
      instance_url: json.instance_url,
      expires_at: Date.now() + (expiresIn - 120) * 1000,
    };
  }

  async getAccessContext(): Promise<{ accessToken: string; instanceUrl: string }> {
    const cached = await this.readCachedToken();
    if (cached) {
      return { accessToken: cached.access_token, instanceUrl: cached.instance_url };
    }
    const fresh = await this.fetchNewToken();
    return { accessToken: fresh.access_token, instanceUrl: fresh.instance_url };
  }

  /**
   * Returns API names of fields that may appear in SOQL SELECT for this object.
   * Uses the REST describe resource (same API version as query).
   */
  async describeQueryableFieldNames(
    objectApiName: string,
    opts?: { bustToken?: boolean }
  ): Promise<string[]> {
    if (opts?.bustToken) {
      await this.clearTokenCache();
    }
    const { accessToken, instanceUrl } = await this.getAccessContext();
    const path = `/services/data/v59.0/sobjects/${encodeURIComponent(objectApiName)}/describe`;
    const url = `${stripTrailingSlash(instanceUrl)}${path}`;
    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 && !opts?.bustToken) {
      return this.describeQueryableFieldNames(objectApiName, { bustToken: true });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Salesforce describe failed (${res.status}) for ${objectApiName}: ${text}`);
    }

    const json = (await res.json()) as SObjectDescribeResponse;
    const fields = json.fields ?? [];
    const names = fields
      .filter((f) => f.name && (f.queryable ?? true))
      .map((f) => f.name);
    return [...new Set(names)].sort();
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    soql: string,
    opts?: { bustToken?: boolean }
  ): Promise<SalesforceQueryResponse<T>> {
    if (opts?.bustToken) {
      await this.clearTokenCache();
    }
    const { accessToken, instanceUrl } = await this.getAccessContext();
    const url = `${stripTrailingSlash(instanceUrl)}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (res.status === 401) {
      if (!opts?.bustToken) {
        return this.query(soql, { bustToken: true });
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Salesforce query failed (${res.status}): ${text}`);
    }

    return (await res.json()) as SalesforceQueryResponse<T>;
  }

  async queryAll<T extends Record<string, unknown> = Record<string, unknown>>(
    soql: string
  ): Promise<T[]> {
    const all: T[] = [];
    let ctx = await this.getAccessContext();
    let page = await this.query<T>(soql);
    ctx = await this.getAccessContext();

    const resolveNext = (next: string) =>
      next.startsWith("http") ? next : `${stripTrailingSlash(ctx.instanceUrl)}${next}`;

    all.push(...page.records);

    while (!page.done && page.nextRecordsUrl) {
      let res = await fetch(resolveNext(page.nextRecordsUrl), {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/json",
        },
      });

      if (res.status === 401) {
        await this.clearTokenCache();
        ctx = await this.getAccessContext();
        res = await fetch(resolveNext(page.nextRecordsUrl), {
          headers: {
            Authorization: `Bearer ${ctx.accessToken}`,
            Accept: "application/json",
          },
        });
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Salesforce query pagination failed (${res.status}): ${text}`);
      }

      page = (await res.json()) as SalesforceQueryResponse<T>;
      all.push(...page.records);
    }

    return all;
  }
}

let singleton: SalesforceService | undefined;

export function getSalesforceService(): SalesforceService {
  if (!singleton) singleton = new SalesforceService();
  return singleton;
}
