export function MarqueHeader() {
  return (
    <header className="border-b border-[var(--marque-line)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:py-10">
        <a
          href="/profiles"
          className="text-center text-3xl tracking-[0.08em] md:text-left md:text-4xl"
          style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
        >
          The Marque
        </a>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] font-medium uppercase tracking-[0.2em] text-neutral-800"
        >
          <span className="text-neutral-400">About Us</span>
          <a href="/profiles" className="border-b border-neutral-900 pb-0.5">
            Profiles
          </a>
          <span className="text-neutral-400">Insights</span>
          <span className="text-neutral-400">Contact</span>
        </nav>
      </div>
    </header>
  );
}

export function MarqueFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--marque-line)] bg-neutral-950 text-neutral-200">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 md:grid-cols-3">
        <div>
          <p
            className="text-2xl tracking-[0.08em] text-white"
            style={{ fontFamily: "var(--font-marque-display), Georgia, serif" }}
          >
            The Marque
          </p>
          <p className="mt-3 text-sm text-neutral-400">© The Marque Digital</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
            Company
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-neutral-300">
            <li>Profiles</li>
            <li>About Us</li>
            <li>Insights</li>
            <li>Contact Us</li>
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
            Legal
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-neutral-300">
            <li>Terms &amp; Conditions</li>
            <li>Privacy &amp; Cookies</li>
          </ul>
          <h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
            Follow The Marque
          </h3>
          <p className="mt-3 text-sm text-neutral-400">Instagram · LinkedIn</p>
        </div>
      </div>
    </footer>
  );
}
