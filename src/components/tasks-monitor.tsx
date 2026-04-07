"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AttemptResponse,
  QueueItem,
  canAutoProcess,
  isDueNow,
  isDueToday,
  isLiveStatus,
  loadQueueItems,
  mergeLogs,
  mergeTimeline,
  saveQueueItems,
  statusLabel,
  statusTone,
} from "@/lib/client/queue-store";

type TaskPanel = "scheduled" | "live" | "finished" | null;

type AiReview = {
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  nextAction: string;
};

function localReview(item: QueueItem): AiReview {
  const latest = item.agentLogs.at(-1);
  const settled = item.payment?.verifiedPaid;

  if (settled) {
    return {
      title: "Settlement confirmed",
      summary: `${item.vendor} appears settled with Stripe evidence available for review.`,
      riskLevel: "low",
      nextAction: "Move this task to closeout and reconcile in your ledger workflow.",
    };
  }

  return {
    title: "Execution in progress",
    summary: `${item.vendor} is currently ${item.status}. Latest system event: ${latest?.step ?? "unknown"}.`,
    riskLevel: item.status === "awaiting_approval" ? "medium" : "high",
    nextAction: "Review approval badge and Stripe evidence link, then re-check this task shortly.",
  };
}

function nextMonthIso(currentDueAt: string): string {
  const date = new Date(currentDueAt);
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + 1);
  return copy.toISOString();
}

function getApprovalState(item: QueueItem): {
  label: string;
  tone: string;
} {
  const authorizationGranted = item.agentLogs.some((entry) => entry.step === "authorization_granted");

  if (item.status === "awaiting_approval") {
    return { label: "Approval Pending", tone: "border-amber-300/45 bg-amber-300/10 text-amber-100" };
  }

  if (authorizationGranted && item.status === "payment_unverified") {
    return { label: "Approved, Settlement Pending", tone: "border-orange-300/45 bg-orange-300/10 text-orange-100" };
  }

  if (authorizationGranted) {
    return { label: "Approved", tone: "border-emerald-300/45 bg-emerald-300/10 text-emerald-100" };
  }

  if (["denied", "timed_out"].includes(item.status)) {
    return { label: "Approval Blocked", tone: "border-rose-300/45 bg-rose-300/10 text-rose-100" };
  }

  return { label: "Not Requested Yet", tone: "border-white/25 bg-white/5 text-white/80" };
}

function isReadyForAttempt(item: QueueItem): boolean {
  if (!item.nextAttemptAt) {
    return true;
  }

  return new Date(item.nextAttemptAt).getTime() <= Date.now();
}

export function TasksMonitor() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [activePanel, setActivePanel] = useState<TaskPanel>(null);
  const [reviewsByItemId, setReviewsByItemId] = useState<Record<string, AiReview>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});
  const [executingItems, setExecutingItems] = useState<Record<string, boolean>>({});
  const isProcessingRef = useRef(false);

  useEffect(() => {
    setItems(loadQueueItems());
  }, []);

  useEffect(() => {
    saveQueueItems(items);
  }, [items]);

  async function processItem(item: QueueItem, forcedThreadId?: string): Promise<void> {
    const now = Date.now();
    if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now) {
      return;
    }

    isProcessingRef.current = true;
    setExecutingItems((current) => ({ ...current, [item.id]: true }));

    try {
      let invoiceId = item.invoiceId;

      if (!invoiceId && item.autoCreateInvoice) {
        const invoiceResponse = await fetch("/api/payments/create-invoice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vendor: item.vendor,
            recipientName: item.recipientName,
            recipientEmail: item.recipientEmail,
            amountCents: item.amountCents,
            description: `${item.vendor} recurring task generated at ${new Date().toLocaleString()}`,
          }),
        });

        const invoicePayload = (await invoiceResponse.json()) as
          | { invoice: { id: string; hostedInvoiceUrl: string | null } }
          | { error: string };

        if (!invoiceResponse.ok || "error" in invoicePayload) {
          throw new Error("error" in invoicePayload ? invoicePayload.error : "Failed to auto-create invoice");
        }

        invoiceId = invoicePayload.invoice.id;

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  invoiceId,
                  invoiceUrl: invoicePayload.invoice.hostedInvoiceUrl ?? undefined,
                  timeline: [...entry.timeline, `Auto-created invoice ${invoiceId}`],
                }
              : entry,
          ),
        );
      }

      const response = await fetch("/api/payments/attempt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          vendor: item.vendor,
          amountCents: item.amountCents,
          invoiceId,
          requireInvoiceId: item.autoCreateInvoice,
          threadId: forcedThreadId ?? item.threadId,
        }),
      });

      const payload = (await response.json()) as AttemptResponse | { error: string };
      if (!response.ok && "error" in payload) {
        throw new Error(payload.error);
      }

      const result = payload as AttemptResponse;
      const retryAfterSeconds = result.retryAfterSeconds ?? 8;
      const nextAttemptAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();

      setItems((current) =>
        {
          let recurringSpawn: QueueItem | null = null;

          const updated = current.map((entry) => {
            if (entry.id !== item.id) {
              return entry;
            }

            const shouldRetry = ["awaiting_approval", "waiting_invoice", "payment_unverified"].includes(
              result.status,
            );

            const nextEntry: QueueItem = {
              ...entry,
              threadId: result.threadId,
              status: result.status,
              invoiceId: entry.invoiceId ?? result.matchedInvoice?.id,
              invoiceUrl:
                entry.invoiceUrl ??
                result.matchedInvoice?.hostedInvoiceUrl ??
                entry.payment?.receiptUrl ??
                result.payment?.receiptUrl ??
                undefined,
              retryAfterSeconds,
              nextAttemptAt: shouldRetry ? nextAttemptAt : undefined,
              payment: result.payment ?? entry.payment,
              timeline: mergeTimeline(entry.timeline, result.timeline),
              agentLogs: mergeLogs(entry.agentLogs, result.agentLogs),
            };

            const transitionedToCompleted = entry.status !== "completed" && result.status === "completed";
            if (transitionedToCompleted && entry.recurrence === "monthly") {
              recurringSpawn = {
                ...entry,
                id: crypto.randomUUID(),
                status: "queued",
                threadId: undefined,
                invoiceId: undefined,
                invoiceUrl: undefined,
                payment: undefined,
                retryAfterSeconds: undefined,
                nextAttemptAt: undefined,
                createdAt: new Date().toISOString(),
                dueAt: nextMonthIso(entry.dueAt),
                timeline: [
                  "Monthly recurring task spawned.",
                  `Next run scheduled for ${new Date(nextMonthIso(entry.dueAt)).toLocaleString()}.`,
                ],
                agentLogs: [
                  {
                    at: new Date().toISOString(),
                    step: "recurrence_spawned",
                    detail: `sourceItem=${entry.id}, recurrence=monthly`,
                  },
                ],
              };
            }

            return nextEntry;
          });

          if (recurringSpawn) {
            return [recurringSpawn, ...updated];
          }

          return updated;
        },
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
      setExecutingItems((current) => ({ ...current, [item.id]: false }));
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isProcessingRef.current) {
        return;
      }

      const salaryDue = items.filter(
        (item) =>
          item.category === "salary" &&
          isDueToday(item) &&
          isDueNow(item) &&
          canAutoProcess(item) &&
          isReadyForAttempt(item),
      );

      if (salaryDue.length > 0) {
        const sharedThreadId =
          salaryDue.find((item) => item.threadId)?.threadId ??
          `salary-batch-${new Date().toISOString().slice(0, 10)}`;
        void processItem(salaryDue[0], sharedThreadId);
        return;
      }

      const next = items.find((item) => canAutoProcess(item) && isDueNow(item) && isReadyForAttempt(item));
      if (!next) {
        return;
      }

      void processItem(next);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [items]);

  const scheduledTasks = useMemo(
    () => items.filter((item) => item.status !== "completed" && !isDueNow(item)),
    [items],
  );

  const liveTasks = useMemo(
    () => items.filter((item) => isLiveStatus(item) && isDueNow(item)),
    [items],
  );

  const completedTasks = useMemo(
    () => items.filter((item) => item.status === "completed"),
    [items],
  );

  const modalItems =
    activePanel === "scheduled"
      ? scheduledTasks
      : activePanel === "live"
        ? liveTasks
        : activePanel === "finished"
          ? completedTasks
          : [];

  useEffect(() => {
    if (activePanel !== "live") {
      return;
    }

    const targets = liveTasks.filter((item) => !reviewsByItemId[item.id] && !reviewLoading[item.id]);
    if (targets.length === 0) {
      return;
    }

    for (const item of targets.slice(0, 3)) {
      setReviewLoading((current) => ({ ...current, [item.id]: true }));

      void fetch("/api/tasks/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendor: item.vendor,
          amountCents: item.amountCents,
          status: item.status,
          dueAt: item.dueAt,
          paymentStatus: item.payment?.status,
          paymentAmountPaid: item.payment?.amountPaid,
          agentLogs: item.agentLogs,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch AI review");
          }

          const payload = (await response.json()) as { review: AiReview };
          setReviewsByItemId((current) => ({ ...current, [item.id]: payload.review }));
        })
        .catch(() => {
          setReviewsByItemId((current) => ({
            ...current,
            [item.id]: localReview(item),
          }));
        })
        .finally(() => {
          setReviewLoading((current) => ({ ...current, [item.id]: false }));
        });
    }
  }, [activePanel, liveTasks, reviewsByItemId, reviewLoading]);

  useEffect(() => {
    if (!activePanel) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [activePanel]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-orange-100/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_8%,_rgba(251,146,60,.28),_transparent_40%)]" />
      <div className="relative space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-100/85">Tasks</p>
          <h2 className="text-3xl font-semibold text-white">Task Modal Console</h2>
          <p className="text-sm text-white/75">Open each panel as a popup modal: Scheduled, Live, and Finished.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setActivePanel("scheduled")}
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 01</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Scheduled</h3>
            <p className="mt-1 text-sm text-white/75">Tasks waiting for date/time trigger.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{scheduledTasks.length}</p>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("live")}
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 02</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Live</h3>
            <p className="mt-1 text-sm text-white/75">Tasks currently running with AI reviews.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{liveTasks.length}</p>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("finished")}
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:-translate-y-0.5 hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 03</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Finished</h3>
            <p className="mt-1 text-sm text-white/75">Completed tasks with payment proof.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{completedTasks.length}</p>
          </button>
        </section>

        {activePanel && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/72 px-4 py-8 backdrop-blur-md" onClick={() => setActivePanel(null)}>
            <article
              className="modal-pop modal-scroll relative my-4 max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-auto rounded-3xl border border-orange-100/30 bg-gradient-to-b from-[#261215] to-[#160d15] p-6 shadow-[0_20px_80px_rgba(255,110,70,.24)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Task Window</p>
                  <h3 className="mt-1 text-3xl font-semibold text-white">
                    {activePanel === "scheduled" ? "Scheduled" : activePanel === "live" ? "Live" : "Finished"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePanel(null)}
                  className="brand-push-btn-ghost px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {modalItems.length === 0 && <p className="text-sm text-white/65">No tasks in this modal.</p>}
                {modalItems.map((item) => (
                  <div key={`${item.id}-${activePanel}`} className={`rounded-2xl border p-4 text-sm ${statusTone[item.status]}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words font-semibold text-white">{item.vendor} - ${(item.amountCents / 100).toFixed(2)}</p>
                      <p className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/85">
                        {statusLabel[item.status]}
                      </p>
                    </div>
                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${getApprovalState(item).tone}`}>
                      {getApprovalState(item).label}
                    </div>
                    <p className="mt-1 text-xs text-white/75">Due: {new Date(item.dueAt).toLocaleString()}</p>
                    {item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > Date.now() && (
                      <p className="text-xs text-white/75">Next retry: {new Date(item.nextAttemptAt).toLocaleString()}</p>
                    )}
                    <p className="text-xs text-white/75">Recurrence: {item.recurrence === "monthly" ? "Monthly" : "One-time"}</p>
                    {item.recipientName && <p className="break-words text-xs text-white/75">Recipient: {item.recipientName}</p>}
                    {item.recipientEmail && <p className="break-words text-xs text-white/75">Recipient Email: {item.recipientEmail}</p>}
                    {item.invoiceId && <p className="break-all text-xs text-white/75">Invoice ID: {item.invoiceId}</p>}

                    {activePanel !== "finished" && canAutoProcess(item) && (
                      <button
                        type="button"
                        onClick={() => void processItem(item)}
                        disabled={executingItems[item.id]}
                        className="mt-2 inline-flex rounded-full border border-orange-100/35 bg-orange-200/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-orange-100 transition hover:bg-orange-200/25 disabled:opacity-50"
                      >
                        {executingItems[item.id] ? "Running..." : "Run Now"}
                      </button>
                    )}

                    {activePanel === "finished" && (
                      <p className="text-xs text-white/75">Paid: ${((item.payment?.amountPaid ?? item.amountCents) / 100).toFixed(2)}</p>
                    )}

                    {item.payment?.stripeInvoiceUrl && (
                      <a
                        href={item.payment.stripeInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-orange-100 underline decoration-dotted underline-offset-4"
                      >
                        Open Stripe invoice proof
                      </a>
                    )}

                    {!item.payment?.stripeInvoiceUrl && item.invoiceUrl && (
                      <a
                        href={item.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-orange-100 underline decoration-dotted underline-offset-4"
                      >
                        Open Stripe hosted invoice
                      </a>
                    )}

                    {!item.payment?.stripeInvoiceUrl && !item.invoiceUrl && item.invoiceId && (
                      <a
                        href={`https://dashboard.stripe.com/invoices/${item.invoiceId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-orange-100 underline decoration-dotted underline-offset-4"
                      >
                        Open Stripe invoice
                      </a>
                    )}

                    {activePanel === "live" && (
                      <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-orange-100/80">AI Review Summary</p>
                        {reviewLoading[item.id] && <p className="mt-2 text-xs text-white/75">Generating summary...</p>}
                        {!reviewLoading[item.id] && reviewsByItemId[item.id] && (
                          <div className="mt-2 rounded-lg bg-white/5 p-3 text-xs text-white/85">
                            <p className="font-semibold text-white">{reviewsByItemId[item.id].title}</p>
                            <p className="mt-1 break-words">{reviewsByItemId[item.id].summary}</p>
                            <p className="mt-2 uppercase tracking-[0.1em] text-orange-100/80">
                              Risk: {reviewsByItemId[item.id].riskLevel}
                            </p>
                            <p className="mt-1 break-words text-white/75">Next: {reviewsByItemId[item.id].nextAction}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
