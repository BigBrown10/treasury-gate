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
  const [category, setCategory] = useState<QueueItem["category"] | "">("");
  const [recurrence, setRecurrence] = useState<QueueItem["recurrence"]>("one_time");
  const [vendor, setVendor] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
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

    if (!category) {
      setError("Please choose a category.");
      return;
    }

    if (!dueDate || !dueTime) {
      setError("Please provide due date and time.");
      return;
    }

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

    const trimmedRecipientEmail = recipientEmail.trim();
    if (trimmedRecipientEmail.length > 0 && !/^\S+@\S+\.\S+$/.test(trimmedRecipientEmail)) {
      setError("Recipient email format is invalid.");
      return;
    }

    setIsAdding(true);
    const amountCents = Math.round(parsedAmount * 100);
    const id = crypto.randomUUID();

    const baseItem: QueueItem = {
      id,
      category,
      recurrence,
      vendor: trimmedVendor,
      recipientName: recipientName.trim() || undefined,
      recipientEmail: trimmedRecipientEmail || undefined,
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
            recipientName: recipientName.trim() || undefined,
            recipientEmail: trimmedRecipientEmail || undefined,
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
          <p className="text-xs uppercase tracking-[0.18em] text-orange-100/85">Create New</p>
          <h2 className="text-3xl font-semibold text-white">Create New Payment</h2>
          <p className="text-sm text-white/75">
            Add a new payment with specific date and time. Execution happens in the Tasks page.
          </p>
        </header>

        <form onSubmit={onAddItem} className="grid gap-3 rounded-2xl border border-orange-100/20 bg-black/25 p-4 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as QueueItem["category"] | "")}
              className="apple-input mt-1 w-full"
            >
              <option value="" disabled>
                Select category
              </option>
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
              placeholder="Who receives this payment? e.g. Vercel"
              className="apple-input mt-1 w-full"
            />
            <p className="mt-1 text-[11px] normal-case tracking-normal text-white/65">
              Vendor is the payee organization label used for matching and reporting.
            </p>
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Recipient Name (optional)
            <input
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              placeholder="e.g. Mark Johnson"
              className="apple-input mt-1 w-full"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Recipient Email (optional)
            <input
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="e.g. mark@company.com"
              className="apple-input mt-1 w-full"
            />
            <p className="mt-1 text-[11px] normal-case tracking-normal text-white/65">
              If empty, TreasuryGate generates a safe test email for Stripe sandbox records.
            </p>
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Due Date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="apple-input mt-1 w-full"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Due Time
            <input
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              className="apple-input mt-1 w-full"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Amount (USD)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 500.00"
              className="apple-input mt-1 w-full"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.14em] text-orange-100/75">
            Recurrence
            <select
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value as QueueItem["recurrence"])}
              className="apple-input mt-1 w-full"
            >
              <option value="one_time">One-time</option>
              <option value="monthly">Monthly</option>
            </select>
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
            className="brand-push-btn col-span-full inline-flex w-fit items-center justify-center px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAdding ? "Creating..." : "Create New"}
          </button>

          {error && (
            <p className="col-span-full rounded-xl border border-rose-300/40 bg-rose-300/10 p-2 text-sm text-rose-100">
              {error}
            </p>
          )}
        </form>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Recent Created</h3>
          {items.length === 0 && <p className="text-sm text-white/70">No payment requests created yet.</p>}
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
              <p className="text-xs text-white/70">Recurrence: {item.recurrence === "monthly" ? "Monthly" : "One-time"}</p>
              {item.recipientName && <p className="text-xs text-white/70">Recipient: {item.recipientName}</p>}
              {item.recipientEmail && <p className="text-xs text-white/70">Recipient Email: {item.recipientEmail}</p>}
              {item.invoiceId && <p className="text-xs text-white/70">Invoice: {item.invoiceId}</p>}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
