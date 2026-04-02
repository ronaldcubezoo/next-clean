import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import type { Metadata } from "next";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-marque-display",
  weight: ["400", "500", "600", "700"],
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-marque-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Profiles",
  description: "Profiles directory",
};

export default function ProfilesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${display.variable} ${sans.variable} min-h-full bg-white text-neutral-900 [--marque-muted:#5c5c5c] [--marque-line:#e8e8e8]`}
      style={{ fontFamily: "var(--font-marque-sans), system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
