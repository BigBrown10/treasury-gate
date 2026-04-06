import "server-only";

import { getBankBalance } from "@/lib/server/plaid";
import { getPendingInvoices } from "@/lib/server/stripe";

export type TreasurySnapshot = {
  bankBalance: Awaited<ReturnType<typeof getBankBalance>>;
  pendingInvoices: Awaited<ReturnType<typeof getPendingInvoices>>;
  computedAt: string;
};

export async function getTreasurySnapshot(): Promise<TreasurySnapshot> {
  const [bankBalance, pendingInvoices] = await Promise.all([
    getBankBalance(),
    getPendingInvoices(),
  ]);

  return {
    bankBalance,
    pendingInvoices,
    computedAt: new Date().toISOString(),
  };
}
