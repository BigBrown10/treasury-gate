import type { TreasurySnapshot } from "@/lib/server/treasury";

type TreasuryOverviewProps = {
  snapshot: TreasurySnapshot;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function TreasuryOverview({ snapshot }: TreasuryOverviewProps) {
  const totalOpen = snapshot.pendingInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(45,212,191,.25),_transparent_55%)]" />
      <div className="relative space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Treasury Overview</p>
          <h2 className="text-2xl font-semibold text-white">Live Liquidity and Payables</h2>
          <p className="text-sm text-white/70">
            Last refreshed: {new Date(snapshot.computedAt).toLocaleString()}
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-white/20 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-white/60">Available Cash</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {money.format(snapshot.bankBalance.available)}
            </p>
            <p className="mt-1 text-xs text-white/70">Account: {snapshot.bankBalance.accountName}</p>
          </article>

          <article className="rounded-3xl border border-white/20 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-white/60">Open Invoice Total</p>
            <p className="mt-2 text-3xl font-semibold text-white">{money.format(totalOpen / 100)}</p>
            <p className="mt-1 text-xs text-white/70">{snapshot.pendingInvoices.length} invoices currently open</p>
          </article>
        </div>

        <div className="rounded-3xl border border-white/20 bg-black/20 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-white/60">Pending Stripe Invoices</p>
          <ul className="space-y-3">
            {snapshot.pendingInvoices.length === 0 && (
              <li className="text-sm text-white/70">No open invoices in Stripe test mode.</li>
            )}
            {snapshot.pendingInvoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {invoice.customerName ?? "Unassigned customer"}
                  </p>
                  <p className="text-xs text-white/65">
                    {invoice.description ?? "No invoice description"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{invoice.amountDueDisplay}</p>
                  <p className="text-[11px] text-white/60">{invoice.id}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
