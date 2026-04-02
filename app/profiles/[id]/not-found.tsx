import Link from "next/link";
import { MarqueFooter, MarqueHeader } from "../MarqueChrome";

export default function ProfileNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarqueHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 py-24 text-center">
        <h1
          className="text-3xl font-medium text-neutral-950"
          style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
        >
          Profile not found
        </h1>
        <p className="mt-4 max-w-md text-sm text-[var(--marque-muted)]">
          This profile is not in the current directory cache. Try refreshing data from Salesforce or return to the list.
        </p>
        <Link
          href="/profiles"
          className="mt-10 border border-neutral-900 px-8 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
        >
          Back to profiles
        </Link>
      </main>
      <MarqueFooter />
    </div>
  );
}
