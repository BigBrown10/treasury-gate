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
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#04101a]/80 backdrop-blur-xl">
          <nav className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-8">
            <p className="text-sm font-semibold tracking-[0.08em] text-cyan-100">TreasuryGate</p>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-white/70">
              <Link href="/main" className="rounded-lg border border-white/15 px-3 py-1.5 transition hover:bg-white/10">
                Get Started
              </Link>
              <Link href="/items" className="rounded-lg border border-orange-100/30 bg-orange-200/10 px-3 py-1.5 text-orange-100 transition hover:bg-orange-200/20">
                Items
              </Link>
              <Link href="/tasks" className="rounded-lg border border-orange-100/30 bg-orange-200/10 px-3 py-1.5 text-orange-100 transition hover:bg-orange-200/20">
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
