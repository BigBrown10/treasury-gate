"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  QueueItem,
  loadQueueItems,
  nowIso,
  saveQueueItems,
  statusLabel,
  statusTone,
} from "@/lib/client/queue-store";

export function ItemsManager() {
  const [category, setCategory] = useState<QueueItem["category"]>("supplies");
  const [vendor, setVendor] = useState("Vercel");
  const [amount, setAmount] = useState("50");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState("09:00");
  const [autoCreateInvoice, setAutoCreateInvoice] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    setItems(loadQueueItems());
  }, []);

  useEffect(() => {
    saveQueueItems(items);
  }, [items]);

  async function onAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }

    const trimmedVendor = vendor.trim();
    if (!trimmedVendor) {
      setError("Vendor is required.");
      return;
    }

    setIsAdding(true);
    const amountCents = Math.round(parsedAmount * 100);
    const id = crypto.randomUUID();

    const baseItem: QueueItem = {
      id,
      category,
      vendor: trimmedVendor,
      amountCents,
      createdAt: nowIso(),
      dueAt: new Date(`${dueDate}T${dueTime}:00`).toISOString(),
      status: "queued",
      timeline: ["Payable item created."],
      agentLogs: [
        {
          at: nowIso(),
          step: "item_created",
          detail: `category=${category}, vendor=${trimmedVendor}, amountCents=${amountCents}, dueAt=${dueDate} ${dueTime}`,
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
            vendor: trimmedVendor,
            amountCents,
            description: `${trimmedVendor} autopay item created at ${new Date().toLocaleString()}`,
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

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-orange-100/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,_rgba(251,146,60,.28),_transparent_42%)]" />
      <div className="relative space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-100/85">Items</p>
          <h2 className="text-3xl font-semibold text-white">Create Payment Items</h2>
          <p className="text-sm text-white/75">
            Add items with specific date and time. Execution happens in the Tasks page.
          </p>
        </header>

        <form onSubmit={onAddItem} className="grid gap-3 rounded-2xl border border-orange-100/20 bg-black/25 p-4 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as QueueItem["category"])}
              className="mt-1 w-full rounded-xl border border-orange-100/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-200/60"
            >
              <option value="salary">Salary</option>
              <option value="supplies">Supplies</option>
              <option value="logistics">Logistics</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Vendor
            <input
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
              className="mt-1 w-full rounded-xl border border-orange-100/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-200/60"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Due Date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-orange-100/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-200/60"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Due Time
            <input
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              className="mt-1 w-full rounded-xl border border-orange-100/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-200/60"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Amount (USD)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-xl border border-orange-100/20 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-200/60"
            />
          </label>

          <label className="col-span-full flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={autoCreateInvoice}
              onChange={(event) => setAutoCreateInvoice(event.target.checked)}
            />
            Auto-create Stripe test invoice for this item
          </label>

          <button
            type="submit"
            disabled={isAdding}
            className="col-span-full inline-flex w-fit items-center justify-center rounded-xl border border-orange-200/60 bg-orange-300/20 px-4 py-2 text-sm font-medium text-orange-50 transition hover:bg-orange-300/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAdding ? "Adding item..." : "Add item"}
          </button>

          {error && (
            <p className="col-span-full rounded-xl border border-rose-300/40 bg-rose-300/10 p-2 text-sm text-rose-100">
              {error}
            </p>
          )}
        </form>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Recent Items</h3>
          {items.length === 0 && <p className="text-sm text-white/70">No items created yet.</p>}
          {items.slice(0, 8).map((item) => (
            <article key={item.id} className={`rounded-2xl border p-4 text-sm text-white/90 ${statusTone[item.status]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.vendor} - ${(item.amountCents / 100).toFixed(2)}</p>
                <p className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
                  {statusLabel[item.status]}
                </p>
              </div>
              <p className="mt-1 text-xs text-white/70">Due: {new Date(item.dueAt).toLocaleString()}</p>
              <p className="text-xs text-white/70">Category: {item.category}</p>
              {item.invoiceId && <p className="text-xs text-white/70">Invoice: {item.invoiceId}</p>}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
