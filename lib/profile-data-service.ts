import { getRedis } from "@/lib/redis-client";
import type { ProfileRecord, ProfileSection, ProfileSectionItem, SalesforceFieldBag } from "@/lib/profile-types";
import { getSalesforceService, type SalesforceService } from "@/lib/salesforce-service";

const CACHE_KEY = "profiles:dataset:v2";

type CachedPayload = {
  profiles: ProfileRecord[];
  cachedAt: number;
};

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return (v && v.trim()) || fallback;
}

function splitFields(spec: string): string[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstStringField(
  record: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function buildSelectClause(baseFields: string[], objectName: string): string {
  const unique = [...new Set(baseFields.map((f) => f.trim()).filter(Boolean))];
  if (!unique.includes("Id")) unique.unshift("Id");
  return `SELECT ${unique.join(", ")} FROM ${objectName}`;
}

function wantsAllQueryableFields(spec: string): boolean {
  const s = spec.trim().toLowerCase();
  return s === "*" || s === "all";
}

function rowToFieldBag(row: Record<string, unknown>): SalesforceFieldBag {
  return { ...row };
}

async function resolveSelectableFields(
  sf: SalesforceService,
  objectApiName: string,
  spec: string,
  required: string[]
): Promise<string[]> {
  const requiredTrimmed = required.map((f) => f.trim()).filter(Boolean);
  let names: string[];
  if (wantsAllQueryableFields(spec)) {
    names = await sf.describeQueryableFieldNames(objectApiName);
  } else {
    names = splitFields(spec);
  }
  const set = new Set(names.map((f) => f.trim()).filter(Boolean));
  for (const f of requiredTrimmed) set.add(f);
  const list = [...set];
  if (!list.includes("Id")) list.unshift("Id");
  return list;
}

function letterBucket(ch: string): string | null {
  const c = ch.toUpperCase();
  if (c >= "A" && c <= "C") return "A-C";
  if (c >= "D" && c <= "F") return "D-F";
  if (c >= "G" && c <= "I") return "G-I";
  if (c >= "J" && c <= "L") return "J-L";
  if (c >= "M" && c <= "O") return "M-O";
  if (c >= "P" && c <= "R") return "P-R";
  if (c >= "S" && c <= "U") return "S-U";
  if (c >= "V" && c <= "X") return "V-X";
  if (c >= "Y" && c <= "Z") return "Y-Z";
  return null;
}

export class ProfileDataService {
  private cacheTtlSec(): number {
    const raw = process.env.PROFILES_CACHE_TTL_SEC ?? "300";
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 300;
  }

  private mapTitle(record: Record<string, unknown>): string {
    const keys = splitFields(
      env(
        "SF_MAP_TITLE_FIELDS",
        "Title__c,Headline__c,Role__c,Job_Title__c,Position__c"
      )
    );
    return firstStringField(record, keys);
  }

  private mapCompany(record: Record<string, unknown>): string {
    const keys = splitFields(
      env("SF_MAP_COMPANY_FIELDS", "Company__c,Organization__c,Employer__c")
    );
    return firstStringField(record, keys);
  }

  private mapLocation(record: Record<string, unknown>): string {
    const keys = splitFields(
      env("SF_MAP_LOCATION_FIELDS", "Location__c,City__c,Country__c,Region__c")
    );
    const parts = keys.map((k) => (typeof record[k] === "string" ? (record[k] as string).trim() : "")).filter(Boolean);
    if (parts.length) return parts.join(", ");
    return "";
  }

  private mapImage(record: Record<string, unknown>): string | null {
    const keys = splitFields(
      env("SF_MAP_IMAGE_FIELDS", "Photo_URL__c,Image_URL__c,Picture_URL__c,Thumbnail_URL__c")
    );
    const v = firstStringField(record, keys);
    return v || null;
  }

  private profileName(record: Record<string, unknown>): string {
    const name = record.Name;
    return typeof name === "string" && name.trim() ? name.trim() : "Unnamed profile";
  }

  private async readCache(): Promise<CachedPayload | null> {
    const redis = getRedis();
    const raw = await redis.get(CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedPayload;
    } catch {
      return null;
    }
  }

  private async writeCache(payload: CachedPayload): Promise<void> {
    const redis = getRedis();
    await redis.set(CACHE_KEY, JSON.stringify(payload), "EX", this.cacheTtlSec());
  }

  async invalidateProfilesCache(): Promise<void> {
    const redis = getRedis();
    await redis.del(CACHE_KEY);
  }

  async refreshFromSalesforce(): Promise<CachedPayload> {
    const sf = getSalesforceService();
    const profileObject = env("SF_PROFILE_OBJECT", "Profile__c");
    const sectionObject = env("SF_SECTION_OBJECT", "Profile_Section__c");
    const itemObject = env("SF_ITEM_OBJECT", "Section_Item__c");

    const sectionLookupOnProfile = env("SF_SECTION_LOOKUP_ON_PROFILE", "Profile__c");
    const itemLookup = env(
      "SF_ITEM_LOOKUP_ON_SECTION",
      env("SF_FIELD_ITEM_PARENT", "Section_c__c")
    );

    const profileFields = await resolveSelectableFields(
      sf,
      profileObject,
      env("SF_PROFILE_FIELDS", "*"),
      []
    );
    const sectionFields = await resolveSelectableFields(
      sf,
      sectionObject,
      env("SF_SECTION_FIELDS", "*"),
      [sectionLookupOnProfile]
    );
    const itemFields = await resolveSelectableFields(sf, itemObject, env("SF_ITEM_FIELDS", "*"), [
      itemLookup,
    ]);

    const profileSoql = `${buildSelectClause(profileFields, profileObject)} ORDER BY Name`;
    const sectionSoql = `${buildSelectClause(sectionFields, sectionObject)} ORDER BY Name`;
    const itemSoql = `${buildSelectClause(itemFields, itemObject)} ORDER BY Name`;

    const [profileRows, sectionRows, itemRows] = await Promise.all([
      sf.queryAll<Record<string, unknown>>(profileSoql),
      sf.queryAll<Record<string, unknown>>(sectionSoql),
      sf.queryAll<Record<string, unknown>>(itemSoql),
    ]);

    const itemsBySection = new Map<string, ProfileSectionItem[]>();
    for (const row of itemRows) {
      const sid = row[itemLookup];
      if (typeof sid !== "string" || !sid) continue;
      const list = itemsBySection.get(sid) ?? [];
      const id = typeof row.Id === "string" ? row.Id : "";
      const name =
        typeof row.Name === "string" && row.Name.trim() ? row.Name.trim() : "Item";
      list.push({ id, name, fields: rowToFieldBag(row) });
      itemsBySection.set(sid, list);
    }

    const sectionsByProfile = new Map<string, ProfileSection[]>();
    for (const row of sectionRows) {
      const pid = row[sectionLookupOnProfile];
      if (typeof pid !== "string" || !pid) continue;
      const id = typeof row.Id === "string" ? row.Id : "";
      const name =
        typeof row.Name === "string" && row.Name.trim() ? row.Name.trim() : "Section";
      const items = itemsBySection.get(id) ?? [];
      const sec: ProfileSection = { id, name, items, fields: rowToFieldBag(row) };
      const list = sectionsByProfile.get(pid) ?? [];
      list.push(sec);
      sectionsByProfile.set(pid, list);
    }

    const profiles: ProfileRecord[] = profileRows.map((row) => {
      const id = typeof row.Id === "string" ? row.Id : "";
      return {
        id,
        name: this.profileName(row),
        title: this.mapTitle(row),
        company: this.mapCompany(row),
        location: this.mapLocation(row),
        imageUrl: this.mapImage(row),
        sections: sectionsByProfile.get(id) ?? [],
        fields: rowToFieldBag(row),
      };
    });

    const payload: CachedPayload = { profiles, cachedAt: Date.now() };
    await this.writeCache(payload);
    return payload;
  }

  async getDataset(forceRefresh = false): Promise<CachedPayload> {
    if (!forceRefresh) {
      const hit = await this.readCache();
      if (hit?.profiles) return hit;
    }
    return this.refreshFromSalesforce();
  }

  filterProfiles(
    profiles: ProfileRecord[],
    opts: { q?: string | null; range?: string | null }
  ): ProfileRecord[] {
    let list = profiles;
    const q = (opts.q ?? "").trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [p.name, p.title, p.company, p.location].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    const range = (opts.range ?? "").trim();
    if (range && range !== "all") {
      list = list.filter((p) => {
        const bucket = letterBucket(p.name.trim().charAt(0) || "");
        return bucket === range;
      });
    }

    return list;
  }

  paginate<T>(items: T[], page: number, pageSize: number): { slice: T[]; total: number } {
    const total = items.length;
    const safeSize = Math.min(Math.max(pageSize, 1), 100);
    const safePage = Math.max(page, 1);
    const start = (safePage - 1) * safeSize;
    const slice = items.slice(start, start + safeSize);
    return { slice, total };
  }
}

let dataSingleton: ProfileDataService | undefined;

export function getProfileDataService(): ProfileDataService {
  if (!dataSingleton) dataSingleton = new ProfileDataService();
  return dataSingleton;
}
