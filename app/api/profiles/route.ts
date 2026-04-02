import { NextResponse } from "next/server";
import { getProfileDataService } from "@/lib/profile-data-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const range = searchParams.get("range");
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "12", 10);
  const refresh = searchParams.get("refresh") === "1";

  try {
    const svc = getProfileDataService();
    const dataset = await svc.getDataset(refresh);
    const filtered = svc.filterProfiles(dataset.profiles, { q, range });
    const { slice, total } = svc.paginate(filtered, page, pageSize);

    return NextResponse.json({
      profiles: slice,
      total,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 12,
      hasMore: page * pageSize < total,
      cachedAt: dataset.cachedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
