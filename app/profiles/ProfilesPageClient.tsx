"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileRecord, ProfilesListResponse } from "@/lib/profile-types";
import { MarqueFooter, MarqueHeader } from "./MarqueChrome";

const RANGES = [
  "A-C",
  "D-F",
  "G-I",
  "J-L",
  "M-O",
  "P-R",
  "S-U",
  "V-X",
  "Y-Z",
] as const;

function ProfileCard({ profile }: { profile: ProfileRecord }) {
  return (
    <article className="border-b border-[var(--marque-line)] py-10 first:pt-6 md:py-12">
      <Link
        href={`/profiles/${encodeURIComponent(profile.id)}`}
        className="group flex gap-5 md:gap-8"
      >
        <div className="h-28 w-24 shrink-0 overflow-hidden bg-neutral-100 md:h-32 md:w-28">
          {profile.imageUrl ?
            // Salesforce image URLs use org-specific hosts; next/image would need per-domain config.
            // eslint-disable-next-line @next/next/no-img-element -- dynamic external profile URLs
            <img
              src={profile.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
              loading="lazy"
            />
          : <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
              Photo
            </div>
          }
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="text-xl font-medium tracking-tight text-neutral-900 underline-offset-4 decoration-transparent transition-colors group-hover:underline group-hover:decoration-neutral-400 md:text-2xl"
            style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
          >
            {profile.name}
          </h2>
          {profile.title ?
            <p className="mt-2 text-base font-semibold text-neutral-900 md:text-lg">{profile.title}</p>
          : null}
          {profile.company ?
            <h3 className="mt-1 text-base font-semibold text-neutral-800 md:text-lg">
              at {profile.company}
            </h3>
          : null}
          {profile.location ?
            <p className="mt-3 text-sm text-[var(--marque-muted)] md:text-base">{profile.location}</p>
          : null}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            View profile →
          </p>
        </div>
      </Link>
    </article>
  );
}

export default function ProfilesPageClient() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProfileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 12;

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (range) params.set("range", range);
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/profiles?${params.toString()}`);
      const json = (await res.json()) as ProfilesListResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to load profiles");
      }
      setTotal(json.total);
      setCachedAt(json.cachedAt ?? null);
      setRows((prev) => (append ? [...prev, ...json.profiles] : json.profiles));
    },
    [q, range, pageSize]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPage(1);
      try {
        await fetchPage(1, false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, range, fetchPage]);

  const hasMore = useMemo(() => rows.length < total, [rows.length, total]);

  async function onLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = page + 1;
      await fetchPage(next, true);
      setPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MarqueHeader />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-10 md:flex-row md:gap-16 md:py-14">
        <aside className="w-full shrink-0 md:max-w-[220px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-500">
            Filter by
          </p>
          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Search
          </label>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Please enter search term."
            className="mt-2 w-full border border-neutral-300 px-3 py-2.5 text-sm outline-none ring-neutral-900 focus:ring-2"
          />
          <div className="my-8 h-px bg-[var(--marque-line)]" />
          <ul className="space-y-1 text-sm text-neutral-700">
            {RANGES.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => setRange((prev) => (prev === r ? null : r))}
                  className={`w-full py-2 text-left transition-colors hover:text-neutral-950 ${
                    range === r ? "font-semibold text-neutral-950" : ""
                  }`}
                >
                  {r}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setRange(null)}
                className={`w-full py-2 text-left hover:text-neutral-950 ${
                  range === null ? "font-semibold text-neutral-950" : ""
                }`}
              >
                View All
              </button>
            </li>
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 border-b border-[var(--marque-line)] pb-6 md:flex-row md:items-end md:justify-between">
            <h1
              className="text-4xl font-medium tracking-tight text-neutral-950 md:text-5xl"
              style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
            >
              Profiles
            </h1>
            <p className="text-sm text-[var(--marque-muted)]">Filter profiles</p>
          </div>

          {cachedAt ?
            <p className="mt-4 text-xs text-neutral-400">
              Updated {new Date(cachedAt).toLocaleString()}
            </p>
          : null}

          {error ?
            <p className="mt-8 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          : null}

          {loading ?
            <p className="mt-16 text-center text-sm text-neutral-500">Loading…</p>
          : rows.length === 0 ?
            <p className="mt-16 text-center text-sm text-neutral-500">No profiles match.</p>
          : <div className="divide-y divide-[var(--marque-line)]">
              {rows.map((p) => (
                <ProfileCard key={p.id} profile={p} />
              ))}
            </div>
          }

          {!loading && hasMore ?
            <div className="mt-12 flex justify-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="border border-neutral-900 px-10 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          : null}
        </section>
      </div>

      <MarqueFooter />
    </div>
  );
}
