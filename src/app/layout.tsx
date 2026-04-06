import type { Metadata } from "next";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
