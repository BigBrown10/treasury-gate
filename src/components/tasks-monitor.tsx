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

export function TasksMonitor() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [activePanel, setActivePanel] = useState<TaskPanel>(null);
  const [reviewsByItemId, setReviewsByItemId] = useState<Record<string, AiReview>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});
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
      const retryAfterSeconds = result.retryAfterSeconds ?? 8;
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
        (item) => item.category === "salary" && isDueToday(item) && isDueNow(item) && canAutoProcess(item),
      );

      if (salaryDue.length > 0) {
        const sharedThreadId =
          salaryDue.find((item) => item.threadId)?.threadId ??
          `salary-batch-${new Date().toISOString().slice(0, 10)}`;
        void processItem(salaryDue[0], sharedThreadId);
        return;
      }

      const next = items.find((item) => canAutoProcess(item) && isDueNow(item));
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
            [item.id]: {
              title: "Review unavailable",
              summary: "AI review could not be generated right now.",
              riskLevel: "medium",
              nextAction: "Use task status and payment evidence link to continue review.",
            },
          }));
        })
        .finally(() => {
          setReviewLoading((current) => ({ ...current, [item.id]: false }));
        });
    }
  }, [activePanel, liveTasks, reviewsByItemId, reviewLoading]);

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
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:scale-[1.01] hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 01</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Scheduled</h3>
            <p className="mt-1 text-sm text-white/75">Tasks waiting for date/time trigger.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{scheduledTasks.length}</p>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("live")}
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:scale-[1.01] hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 02</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Live</h3>
            <p className="mt-1 text-sm text-white/75">Tasks currently running with AI reviews.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{liveTasks.length}</p>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("finished")}
            className="rounded-2xl border border-orange-100/25 bg-black/25 p-5 text-left transition hover:scale-[1.01] hover:border-orange-100/40"
          >
            <p className="text-xs uppercase tracking-[0.14em] text-orange-100/75">Modal 03</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Finished</h3>
            <p className="mt-1 text-sm text-white/75">Completed tasks with payment proof.</p>
            <p className="mt-4 text-3xl font-semibold text-orange-100">{completedTasks.length}</p>
          </button>
        </section>

        {activePanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-8 backdrop-blur-sm" onClick={() => setActivePanel(null)}>
            <article
              className="modal-pop relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-3xl border border-orange-100/30 bg-gradient-to-b from-[#211011] to-[#160d15] p-6 shadow-[0_0_80px_rgba(255,110,70,.25)]"
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
                  className="rounded-xl border border-orange-100/30 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-orange-100 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {modalItems.length === 0 && <p className="text-sm text-white/65">No tasks in this modal.</p>}
                {modalItems.map((item) => (
                  <div key={`${item.id}-${activePanel}`} className={`rounded-2xl border p-4 text-sm ${statusTone[item.status]}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-white">{item.vendor} - ${(item.amountCents / 100).toFixed(2)}</p>
                      <p className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/85">
                        {statusLabel[item.status]}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-white/75">Due: {new Date(item.dueAt).toLocaleString()}</p>

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

                    {activePanel === "live" && (
                      <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-orange-100/80">AI Review Summary</p>
                        {reviewLoading[item.id] && <p className="mt-2 text-xs text-white/75">Generating summary...</p>}
                        {!reviewLoading[item.id] && reviewsByItemId[item.id] && (
                          <div className="mt-2 rounded-lg bg-white/5 p-3 text-xs text-white/85">
                            <p className="font-semibold text-white">{reviewsByItemId[item.id].title}</p>
                            <p className="mt-1">{reviewsByItemId[item.id].summary}</p>
                            <p className="mt-2 uppercase tracking-[0.1em] text-orange-100/80">
                              Risk: {reviewsByItemId[item.id].riskLevel}
                            </p>
                            <p className="mt-1 text-white/75">Next: {reviewsByItemId[item.id].nextAction}</p>
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
