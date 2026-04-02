"use client";

import Link from "next/link";
import type { ProfileRecord, SalesforceFieldBag } from "@/lib/profile-types";
import { MarqueFooter, MarqueHeader } from "../MarqueChrome";

const FIELD_ORDER = ["Id", "Name", "CreatedDate", "LastModifiedDate", "CreatedById", "LastModifiedById"];

function sortFieldKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const k of FIELD_ORDER) {
    if (keys.includes(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of [...keys].sort()) {
    if (!seen.has(k)) ordered.push(k);
  }
  return ordered;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function FieldTable({ title, fields }: { title: string; fields: SalesforceFieldBag }) {
  const keys = sortFieldKeys(Object.keys(fields));
  if (keys.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{title}</h3>
      <dl className="mt-4 grid gap-x-6 gap-y-3 border border-[var(--marque-line)] bg-neutral-50/50 p-4 text-sm md:grid-cols-[minmax(0,220px)_1fr]">
        {keys.map((key) => (
          <div key={key} className="contents">
            <dt className="break-words font-medium text-neutral-600">{key}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-neutral-900">{formatFieldValue(fields[key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ProfileDetailClient({
  profile,
  cachedAt,
}: {
  profile: ProfileRecord;
  cachedAt: number | null;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarqueHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 md:py-14">
        <nav className="text-sm text-neutral-500">
          <Link href="/profiles" className="transition-colors hover:text-neutral-900">
            ← Profiles
          </Link>
        </nav>

        <div className="mt-8 flex flex-col gap-10 border-b border-[var(--marque-line)] pb-12 md:flex-row md:gap-14">
          <div className="mx-auto h-48 w-40 shrink-0 overflow-hidden bg-neutral-100 md:mx-0 md:h-56 md:w-44">
            {profile.imageUrl ?
              // eslint-disable-next-line @next/next/no-img-element -- dynamic external profile URLs
              <img
                src={profile.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="eager"
              />
            : <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                Photo
              </div>
            }
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-4xl font-medium tracking-tight text-neutral-950 md:text-5xl"
              style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
            >
              {profile.name}
            </h1>
            {profile.title ?
              <p className="mt-4 text-xl font-semibold text-neutral-900 md:text-2xl">{profile.title}</p>
            : null}
            {profile.company ?
              <p className="mt-2 text-lg font-semibold text-neutral-800 md:text-xl">at {profile.company}</p>
            : null}
            {profile.location ?
              <p className="mt-4 text-base text-[var(--marque-muted)] md:text-lg">{profile.location}</p>
            : null}
            {cachedAt ?
              <p className="mt-6 text-xs text-neutral-400">
                Directory data from {new Date(cachedAt).toLocaleString()}
              </p>
            : null}
          </div>
        </div>

        <section className="mt-12">
          <h2
            className="text-2xl font-medium tracking-tight text-neutral-950 md:text-3xl"
            style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
          >
            Profile record
          </h2>
          <FieldTable title="All Salesforce fields" fields={profile.fields} />
        </section>

        {profile.sections.length > 0 ?
          <section className="mt-16">
            <h2
              className="text-2xl font-medium tracking-tight text-neutral-950 md:text-3xl"
              style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
            >
              Sections
            </h2>
            <ul className="mt-8 space-y-14">
              {profile.sections.map((section) => (
                <li key={section.id}>
                  <h3 className="text-xl font-semibold text-neutral-900 md:text-2xl">{section.name}</h3>
                  <FieldTable title="Section fields" fields={section.fields} />
                  {section.items.length > 0 ?
                    <ul className="mt-8 space-y-10 border-l-2 border-[var(--marque-line)] pl-6">
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <p className="text-lg font-medium text-neutral-900">{item.name}</p>
                          <FieldTable title="Item fields" fields={item.fields} />
                        </li>
                      ))}
                    </ul>
                  : null}
                </li>
              ))}
            </ul>
          </section>
        : null}
      </main>

      <MarqueFooter />
    </div>
  );
}
