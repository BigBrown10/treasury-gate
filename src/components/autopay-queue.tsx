"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type AgentLog = {
  at: string;
  step: string;
  detail: string;
};

type QueueStatus =
  | "queued"
  | "waiting_invoice"
  | "awaiting_approval"
  | "completed"
  | "insufficient_funds"
  | "denied"
  | "timed_out"
  | "payment_unverified"
  | "error";

type QueueItem = {
  id: string;
  vendor: string;
  amountCents: number;
  createdAt: string;
  threadId?: string;
  invoiceId?: string;
  invoiceUrl?: string;
  status: QueueStatus;
  nextAttemptAt?: string;
  retryAfterSeconds?: number;
  timeline: string[];
  agentLogs: AgentLog[];
  payment?: {
    status?: string;
    verifiedPaid?: boolean;
    amountPaid?: number;
    currency?: string;
    receiptUrl?: string;
    stripeInvoiceUrl?: string;
  };
};

type AttemptResponse = {
  itemId: string;
  threadId: string;
  status: QueueStatus;
  retryAfterSeconds?: number;
  timeline?: string[];
  agentLogs?: AgentLog[];
  payment?: QueueItem["payment"];
  error?: string;
};

const STORAGE_KEY = "treasurygate.autopay.queue.v1";

const statusTone: Record<QueueStatus, string> = {
  queued: "border-white/25 bg-white/10",
  waiting_invoice: "border-slate-300/30 bg-slate-300/10",
  awaiting_approval: "border-amber-300/35 bg-amber-300/10",
  completed: "border-emerald-300/35 bg-emerald-300/10",
  insufficient_funds: "border-rose-300/35 bg-rose-300/10",
  denied: "border-rose-300/35 bg-rose-300/10",
  timed_out: "border-orange-300/35 bg-orange-300/10",
  payment_unverified: "border-fuchsia-300/35 bg-fuchsia-300/10",
  error: "border-red-300/40 bg-red-300/10",
};

function nowIso(): string {
  return new Date().toISOString();
}

function canAutoProcess(item: QueueItem): boolean {
  return ["queued", "waiting_invoice", "awaiting_approval", "payment_unverified"].includes(item.status);
}

export function AutopayQueue() {
  const [vendor, setVendor] = useState("Vercel");
  const [amount, setAmount] = useState("50");
  const [autoCreateInvoice, setAutoCreateInvoice] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as QueueItem[];
      setItems(parsed);
    } catch {
      // Ignore corrupted local state and start fresh.
      setItems([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  async function onAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }

    setIsAdding(true);
    const amountCents = Math.round(parsedAmount * 100);
    const id = crypto.randomUUID();

    const baseItem: QueueItem = {
      id,
      vendor: vendor.trim(),
      amountCents,
      createdAt: nowIso(),
      status: "queued",
      timeline: ["Payable item created."],
      agentLogs: [
        {
          at: nowIso(),
          step: "item_created",
          detail: `vendor=${vendor.trim()}, amountCents=${amountCents}`,
        },
      ],
    };

    try {
      let invoiceId: string | undefined;
      let invoiceUrl: string | undefined;

      if (autoCreateInvoice) {
        const response = await fetch("/api/payments/create-invoice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vendor: vendor.trim(),
            amountCents,
            description: `${vendor.trim()} autopay item created at ${new Date().toLocaleString()}`,
          }),
        });

        const payload = (await response.json()) as
          | { invoice: { id: string; hostedInvoiceUrl: string | null } }
          | { error: string };

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "Failed to auto-create invoice");
        }

        invoiceId = payload.invoice.id;
        invoiceUrl = payload.invoice.hostedInvoiceUrl ?? undefined;
      }

      setItems((current) => [
        {
          ...baseItem,
          invoiceId,
          invoiceUrl,
          timeline: [
            ...baseItem.timeline,
            autoCreateInvoice
              ? `Stripe invoice auto-created: ${invoiceId}`
              : "Waiting for an existing matching Stripe open invoice.",
          ],
          agentLogs: [
            ...baseItem.agentLogs,
            {
              at: nowIso(),
              step: autoCreateInvoice ? "invoice_auto_created" : "invoice_manual_mode",
              detail: autoCreateInvoice
                ? `invoiceId=${invoiceId}`
                : "Matching will use vendor+amount from existing open invoices.",
            },
          ],
        },
        ...current,
      ]);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add payable item");
    } finally {
      setIsAdding(false);
    }
  }

  async function processItem(item: QueueItem): Promise<void> {
    const now = Date.now();
    if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const response = await fetch("/api/payments/attempt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          vendor: item.vendor,
          amountCents: item.amountCents,
          invoiceId: item.invoiceId,
          threadId: item.threadId,
        }),
      });

      const payload = (await response.json()) as AttemptResponse | { error: string };
      if (!response.ok && "error" in payload) {
        throw new Error(payload.error);
      }

      const result = payload as AttemptResponse;
      const retryAfterSeconds = result.retryAfterSeconds ?? 6;
      const nextAttemptAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();

      setItems((current) =>
        current.map((entry) => {
          if (entry.id !== item.id) {
            return entry;
          }

          const shouldRetry = ["awaiting_approval", "waiting_invoice", "payment_unverified"].includes(
            result.status,
          );

          return {
            ...entry,
            threadId: result.threadId,
            status: result.status,
            retryAfterSeconds,
            nextAttemptAt: shouldRetry ? nextAttemptAt : undefined,
            payment: result.payment ?? entry.payment,
            timeline: result.timeline ? [...entry.timeline, ...result.timeline] : entry.timeline,
            agentLogs: result.agentLogs ? [...entry.agentLogs, ...result.agentLogs] : entry.agentLogs,
          };
        }),
      );
    } catch (runError) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: "error",
                timeline: [
                  ...entry.timeline,
                  runError instanceof Error ? runError.message : "Unknown queue execution failure",
                ],
              }
            : entry,
        ),
      );
    } finally {
      isProcessingRef.current = false;
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isProcessingRef.current) {
        return;
      }

      const next = items.find((item) => canAutoProcess(item));
      if (!next) {
        return;
      }

      void processItem(next);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [items]);

  const pendingCount = useMemo(
    () => items.filter((item) => ["queued", "waiting_invoice", "awaiting_approval", "payment_unverified"].includes(item.status)).length,
    [items],
  );

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,_rgba(99,102,241,.28),_transparent_40%)]" />
      <div className="relative space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Autonomous Payables Queue</p>
          <h2 className="text-2xl font-semibold text-white">TreasuryGate Autopay</h2>
          <p className="text-sm text-white/70">
            Add payable items and the agent continuously checks liquidity, requests Auth0 approval, and executes payment.
          </p>
          <p className="text-xs text-cyan-100">Pending items: {pendingCount}</p>
        </header>

        <form onSubmit={onAddItem} className="grid gap-3 rounded-2xl border border-white/20 bg-black/20 p-4 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] text-white/65">
            Vendor
            <input
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/60"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-white/65">
            Amount (USD)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/60"
            />
          </label>

          <label className="col-span-full flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={autoCreateInvoice}
              onChange={(event) => setAutoCreateInvoice(event.target.checked)}
            />
            Auto-create Stripe test invoice for this queue item
          </label>

          <button
            type="submit"
            disabled={isAdding}
            className="col-span-full inline-flex w-fit items-center justify-center rounded-xl border border-cyan-200/60 bg-cyan-200/20 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-200/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAdding ? "Adding item..." : "Add payable item"}
          </button>
          {error && <p className="col-span-full rounded-xl border border-rose-300/40 bg-rose-300/10 p-2 text-sm text-rose-100">{error}</p>}
        </form>

        <div className="space-y-3">
          {items.length === 0 && <p className="text-sm text-white/70">No queue items yet. Add one to start autonomous processing.</p>}

          {items.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border p-4 text-sm text-white/90 ${statusTone[item.status]}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.vendor} - ${(item.amountCents / 100).toFixed(2)}</p>
                <p className="text-xs uppercase tracking-[0.12em]">{item.status}</p>
              </div>

              <p className="mt-1 text-xs text-white/70">Created: {new Date(item.createdAt).toLocaleString()}</p>
              {item.nextAttemptAt && (
                <p className="text-xs text-amber-100">Next auto-attempt: {new Date(item.nextAttemptAt).toLocaleTimeString()}</p>
              )}

              {item.invoiceId && (
                <p className="mt-2 text-xs text-white/75">Invoice: {item.invoiceId}</p>
              )}

              {item.payment?.stripeInvoiceUrl && (
                <a
                  href={item.payment.stripeInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs underline decoration-dotted underline-offset-4"
                >
                  Open Stripe invoice proof
                </a>
              )}

              <details className="mt-3 rounded-xl border border-white/20 bg-black/25 p-3">
                <summary className="cursor-pointer">Timeline ({item.timeline.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-white/80">
                  {item.timeline.slice(-8).map((line, index) => (
                    <li key={`${item.id}-timeline-${index}`}>- {line}</li>
                  ))}
                </ul>
              </details>

              <details className="mt-2 rounded-xl border border-white/20 bg-black/25 p-3">
                <summary className="cursor-pointer">Agent logs ({item.agentLogs.length})</summary>
                <ul className="mt-2 space-y-2 text-xs text-white/80">
                  {item.agentLogs.slice(-8).map((entry, index) => (
                    <li key={`${item.id}-log-${index}`} className="rounded-md bg-white/5 p-2">
                      <p className="font-medium">{entry.step}</p>
                      <p className="text-white/60">{new Date(entry.at).toLocaleTimeString()}</p>
                      <p>{entry.detail}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
