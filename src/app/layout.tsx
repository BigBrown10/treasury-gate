import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreasuryGate",
  description: "B2B treasury agent with Plaid liquidity checks and Auth0-gated Stripe payments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-orange-100/20 bg-[#130a12]/95">
          <nav className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-8">
            <Link href="/" className="brand-logo text-xl">
              TreasuryGate
            </Link>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-white/70">
              <Link href="/items" className="brand-nav-btn">
                Create New
              </Link>
              <Link href="/tasks" className="brand-nav-btn">
                Tasks
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
