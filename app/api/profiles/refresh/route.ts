import { NextResponse } from "next/server";
import { getProfileDataService } from "@/lib/profile-data-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.PROFILES_REFRESH_SECRET;
  if (secret) {
    const header = request.headers.get("x-profiles-refresh-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const svc = getProfileDataService();
    await svc.invalidateProfilesCache();
    const dataset = await svc.refreshFromSalesforce();
    return NextResponse.json({
      ok: true,
      count: dataset.profiles.length,
      cachedAt: dataset.cachedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
