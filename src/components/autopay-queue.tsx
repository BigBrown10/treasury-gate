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
  category: "salary" | "supplies" | "logistics" | "other";
  vendor: string;
  amountCents: number;
  createdAt: string;
  dueAt: string;
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

const statusLabel: Record<QueueStatus, string> = {
  queued: "Queued",
  waiting_invoice: "Waiting Invoice",
  awaiting_approval: "Awaiting Approval",
  completed: "Completed",
  insufficient_funds: "Insufficient Funds",
  denied: "Denied",
  timed_out: "Timed Out",
  payment_unverified: "Unverified Payment",
  error: "Error",
};

function nowIso(): string {
  return new Date().toISOString();
}

function canAutoProcess(item: QueueItem): boolean {
  return ["queued", "waiting_invoice", "awaiting_approval", "payment_unverified"].includes(item.status);
}

function isDueToday(item: QueueItem): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return item.dueAt.slice(0, 10) <= today;
}

function cap<T>(entries: T[], max: number): T[] {
  return entries.slice(-max);
}

function mergeTimeline(existing: string[], incoming?: string[]): string[] {
  if (!incoming || incoming.length === 0) {
    return existing;
  }

  const merged = [...existing];
  for (const line of incoming) {
    if (merged[merged.length - 1] !== line) {
      merged.push(line);
    }
  }

  return cap(merged, 60);
}

function mergeLogs(existing: AgentLog[], incoming?: AgentLog[]): AgentLog[] {
  if (!incoming || incoming.length === 0) {
    return existing;
  }

  const merged = [...existing];
  for (const entry of incoming) {
    const last = merged[merged.length - 1];
    const isDuplicate = last && last.step === entry.step && last.detail === entry.detail;
    if (!isDuplicate) {
      merged.push(entry);
    }
  }

  return cap(merged, 120);
}

export function AutopayQueue() {
  const [category, setCategory] = useState<QueueItem["category"]>("supplies");
  const [vendor, setVendor] = useState("Vercel");
  const [amount, setAmount] = useState("50");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
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
      category,
      vendor: vendor.trim(),
      amountCents,
      createdAt: nowIso(),
      dueAt: new Date(`${dueDate}T09:00:00`).toISOString(),
      status: "queued",
      timeline: ["Payable item created."],
      agentLogs: [
        {
          at: nowIso(),
          step: "item_created",
          detail: `category=${category}, vendor=${vendor.trim()}, amountCents=${amountCents}, dueAt=${dueDate}`,
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

  async function processItem(item: QueueItem, forcedThreadId?: string): Promise<void> {
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
          threadId: forcedThreadId ?? item.threadId,
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
            timeline: mergeTimeline(entry.timeline, result.timeline),
            agentLogs: mergeLogs(entry.agentLogs, result.agentLogs),
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

      const salaryDue = items.filter(
        (item) => item.category === "salary" && isDueToday(item) && canAutoProcess(item),
      );

      if (salaryDue.length > 0) {
        const sharedThreadId =
          salaryDue.find((item) => item.threadId)?.threadId ??
          `salary-batch-${new Date().toISOString().slice(0, 10)}`;
        void processItem(salaryDue[0], sharedThreadId);
        return;
      }

      const next = items.find((item) => canAutoProcess(item));
      if (!next) {
        return;
      }

      void processItem(next);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [items]);

  const pendingCount = useMemo(
    () => items.filter((item) => ["queued", "waiting_invoice", "awaiting_approval", "payment_unverified"].includes(item.status)).length,
    [items],
  );

  const salaryDueToday = useMemo(
    () => items.filter((item) => item.category === "salary" && isDueToday(item)),
    [items],
  );
  const salaryBatchTotal = useMemo(
    () => salaryDueToday.reduce((sum, item) => sum + item.amountCents, 0),
    [salaryDueToday],
  );

  const paidTodayAmount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items
      .filter((item) => item.status === "completed" && item.createdAt.slice(0, 10) === today)
      .reduce((sum, item) => sum + (item.payment?.amountPaid ?? 0), 0);
  }, [items]);

  const approvalWaitingCount = useMemo(
    () => items.filter((item) => item.status === "awaiting_approval").length,
    [items],
  );

  const dueTodayCount = useMemo(() => items.filter((item) => isDueToday(item)).length, [items]);

  const laneGroups = useMemo(() => {
    return {
      queue: items.filter((item) => ["queued", "waiting_invoice", "payment_unverified"].includes(item.status)),
      approval: items.filter((item) => item.status === "awaiting_approval"),
      paid: items.filter((item) => item.status === "completed"),
      blocked: items.filter((item) => ["insufficient_funds", "denied", "timed_out", "error"].includes(item.status)),
    };
  }, [items]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,_rgba(99,102,241,.28),_transparent_40%)]" />
      <div className="relative space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Autonomous Payables Queue</p>
          <h2 className="text-3xl font-semibold text-white">TreasuryGate Finance Orchestrator</h2>
          <p className="text-sm text-white/70">
            Add payable items and the agent continuously checks liquidity, requests Auth0 approval, and executes payment.
          </p>
          <p className="text-xs text-cyan-100">Pending items: {pendingCount}</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Due Today</p>
            <p className="mt-1 text-2xl font-semibold text-white">{dueTodayCount}</p>
          </article>
          <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Awaiting Approval</p>
            <p className="mt-1 text-2xl font-semibold text-amber-100">{approvalWaitingCount}</p>
          </article>
          <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Paid Today</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-100">${(paidTodayAmount / 100).toFixed(2)}</p>
          </article>
          <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/65">Salary Batch (Today)</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100">${(salaryBatchTotal / 100).toFixed(2)}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/20 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-white/65">Salary Batch Review</p>
          <p className="mt-1 text-sm text-white/85">
            {salaryDueToday.length} salary item(s) due today. Batch total: ${(salaryBatchTotal / 100).toFixed(2)}.
          </p>
          <p className="mt-1 text-xs text-white/65">
            TreasuryGate attempts salary items with a shared thread approval context so approval can cover batch execution.
          </p>
          <p className="mt-2 text-xs text-cyan-100">
            Approval UX note: CIBA approval is typically out-of-band (Auth0 Guardian/device prompt), not an in-page browser modal.
          </p>
        </section>

        <section className="grid gap-3 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/20 bg-black/20 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-white/60">Queue</p>
            <p className="mt-1 text-lg font-semibold text-white">{laneGroups.queue.length}</p>
            <ul className="mt-3 space-y-2 text-xs text-white/80">
              {laneGroups.queue.slice(0, 4).map((item) => (
                <li key={`${item.id}-queue`} className="rounded-lg bg-white/5 p-2">
                  {item.vendor} ${(item.amountCents / 100).toFixed(2)}
                </li>
              ))}
              {laneGroups.queue.length === 0 && <li className="text-white/50">No items</li>}
            </ul>
          </article>

          <article className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-amber-100">Approval</p>
            <p className="mt-1 text-lg font-semibold text-amber-50">{laneGroups.approval.length}</p>
            <ul className="mt-3 space-y-2 text-xs text-amber-100">
              {laneGroups.approval.slice(0, 4).map((item) => (
                <li key={`${item.id}-approval`} className="rounded-lg bg-black/20 p-2">
                  {item.vendor} ${(item.amountCents / 100).toFixed(2)}
                </li>
              ))}
              {laneGroups.approval.length === 0 && <li className="text-amber-100/60">No items</li>}
            </ul>
          </article>

          <article className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-emerald-100">Paid</p>
            <p className="mt-1 text-lg font-semibold text-emerald-50">{laneGroups.paid.length}</p>
            <ul className="mt-3 space-y-2 text-xs text-emerald-100">
              {laneGroups.paid.slice(0, 4).map((item) => (
                <li key={`${item.id}-paid`} className="rounded-lg bg-black/20 p-2">
                  {item.vendor} ${(item.amountCents / 100).toFixed(2)}
                </li>
              ))}
              {laneGroups.paid.length === 0 && <li className="text-emerald-100/60">No items</li>}
            </ul>
          </article>

          <article className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-rose-100">Blocked</p>
            <p className="mt-1 text-lg font-semibold text-rose-50">{laneGroups.blocked.length}</p>
            <ul className="mt-3 space-y-2 text-xs text-rose-100">
              {laneGroups.blocked.slice(0, 4).map((item) => (
                <li key={`${item.id}-blocked`} className="rounded-lg bg-black/20 p-2">
                  {item.vendor} {(item.amountCents / 100).toFixed(2)} ({statusLabel[item.status]})
                </li>
              ))}
              {laneGroups.blocked.length === 0 && <li className="text-rose-100/60">No items</li>}
            </ul>
          </article>
        </section>

        <form onSubmit={onAddItem} className="grid gap-3 rounded-2xl border border-white/20 bg-black/20 p-4 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] text-white/65">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as QueueItem["category"])}
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/60"
            >
              <option value="salary">Salary</option>
              <option value="supplies">New Supplies</option>
              <option value="logistics">Logistics</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-white/65">
            Vendor
            <input
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/60"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-white/65">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
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
                <p className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
                  {statusLabel[item.status]}
                </p>
              </div>

              <p className="mt-1 text-xs text-white/70">Created: {new Date(item.createdAt).toLocaleString()}</p>
              <p className="text-xs text-white/70">Category: {item.category}</p>
              <p className="text-xs text-white/70">Due: {new Date(item.dueAt).toLocaleDateString()}</p>
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
