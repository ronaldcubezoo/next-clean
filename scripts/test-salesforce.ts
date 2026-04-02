/**
 * Loads .env.local and verifies Salesforce OAuth, SOQL pagination, and full profile refresh.
 * Run: npx tsx scripts/test-salesforce.ts
 *
 * Requires Redis (see REDIS_URL) for token + dataset caching, same as the app.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function countAllIds(
  queryAll: (soql: string) => Promise<Record<string, unknown>[]>,
  objectName: string
): Promise<{ count: number; firstId?: string }> {
  const rows = await queryAll(`SELECT Id FROM ${objectName}`);
  const first = rows[0];
  const firstId = typeof first?.Id === "string" ? first.Id : undefined;
  return { count: rows.length, firstId };
}

async function main() {
  console.log("=== Salesforce connection test ===\n");

  if (!process.env.SF_LOGIN_URL?.trim()) {
    throw new Error("SF_LOGIN_URL is missing in .env.local");
  }
  if (!process.env.SF_CONSUMER_KEY?.trim()) {
    throw new Error("SF_CONSUMER_KEY is missing in .env.local");
  }
  if (!(process.env.SF_CUSTOMER_SECRET ?? process.env.SF_CLIENT_SECRET)?.trim()) {
    throw new Error("SF_CUSTOMER_SECRET (or SF_CLIENT_SECRET) is missing in .env.local");
  }

  console.log("Env: SF_OAUTH_GRANT =", process.env.SF_OAUTH_GRANT ?? "client_credentials");
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  console.log("Env: REDIS_URL =", redisUrl);
  console.log("");

  const Redis = (await import("ioredis")).default;
  const probe = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  try {
    await probe.connect();
    await probe.ping();
    console.log("Redis: PING OK\n");
  } catch {
    console.error(`Redis not reachable at ${redisUrl}.`);
    console.error("Start Redis (e.g. docker compose up -d).\n");
    process.exit(1);
  } finally {
    await probe.quit();
  }

  const { getSalesforceService } = await import("../lib/salesforce-service");
  const { getProfileDataService } = await import("../lib/profile-data-service");

  const sf = getSalesforceService();
  const data = getProfileDataService();

  console.log("1) Clearing cached OAuth token (forces new token)…");
  await sf.clearTokenCache();

  console.log("2) Requesting access token…");
  const ctx = await sf.getAccessContext();
  console.log("   OK — instance:", ctx.instanceUrl);
  console.log("");

  const profileObject = process.env.SF_PROFILE_OBJECT?.trim() || "Profile__c";
  const sectionObject = process.env.SF_SECTION_OBJECT?.trim() || "Profile_Section__c";
  const itemObject = process.env.SF_ITEM_OBJECT?.trim() || "Section_Item__c";

  console.log("3) Pulling ALL Ids per object (uses query + pagination until done=true)…");
  for (const label of [profileObject, sectionObject, itemObject] as const) {
    try {
      const { count, firstId } = await countAllIds(
        (q) => sf.queryAll(q),
        label
      );
      console.log(`   ${label}: ${count} row(s)${firstId ? ` (e.g. ${firstId})` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`   ${label}: FAILED — ${msg}`);
      throw e;
    }
  }
  console.log("");

  console.log("4) Full refresh (same SOQL as app: all fields + ORDER BY Name)…");
  await data.invalidateProfilesCache();
  const first = await data.refreshFromSalesforce();
  console.log(`   First run: ${first.profiles.length} profile(s), cachedAt=${new Date(first.cachedAt).toISOString()}`);

  await data.invalidateProfilesCache();
  const second = await data.refreshFromSalesforce();
  console.log(`   Second run (after cache bust): ${second.profiles.length} profile(s)`);

  if (first.profiles.length !== second.profiles.length) {
    console.warn(
      "\n   Note: row counts differ between runs — data may have changed in Salesforce, or a query is non-deterministic."
    );
  } else {
    console.log("   Same profile count on two full pulls — repeatable full fetch OK.");
  }

  const withSections = second.profiles.filter((p) => p.sections.length > 0);
  const itemTotal = second.profiles.reduce(
    (n, p) => n + p.sections.reduce((m, s) => m + s.items.length, 0),
    0
  );
  console.log("");
  console.log("5) Assembly check:");
  console.log(`   Profiles with ≥1 section: ${withSections.length}`);
  console.log(`   Total section items attached: ${itemTotal}`);
  console.log("");
  console.log("=== All checks completed ===");
}

main().catch((e) => {
  console.error("\n=== FAILED ===");
  console.error(e instanceof Error ? e.message : e);
  if (
    typeof e === "object" &&
    e &&
    "message" in e &&
    String((e as Error).message).toLowerCase().includes("connect")
  ) {
    console.error(
      "\nHint: Start Redis (e.g. `docker compose up -d`) so token + cache clients can connect."
    );
  }
  process.exit(1);
});
