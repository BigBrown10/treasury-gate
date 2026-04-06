"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatResponse = {
  threadId: string;
  status: "awaiting_approval" | "approved_executing" | "denied" | "timed_out" | "completed";
  timeline: string[];
  retryAfterSeconds?: number;
  payment?: {
    receiptUrl: string;
  };
};

type ChatPanelProps = {
  initialPrompt?: string;
};

const statusStyles: Record<ChatResponse["status"], string> = {
  awaiting_approval: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  approved_executing: "border-sky-300/40 bg-sky-300/10 text-sky-100",
  denied: "border-rose-300/40 bg-rose-300/10 text-rose-100",
  timed_out: "border-orange-300/40 bg-orange-300/10 text-orange-100",
  completed: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
};

export function ChatPanel({ initialPrompt }: ChatPanelProps) {
  const [message, setMessage] = useState(
    initialPrompt ?? "Check if we have enough cash, and if so, pay the $500 Vercel invoice.",
  );
  const [activeMessage, setActiveMessage] = useState(
    initialPrompt ?? "Check if we have enough cash, and if so, pay the $500 Vercel invoice.",
  );
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  const helperText = useMemo(() => {
    if (!response) {
      return "Authorize high-risk payment actions with Auth0 CIBA before Stripe execution.";
    }

    if (response.status === "awaiting_approval") {
      return "Approval pending in Guardian. TreasuryGate will automatically poll for completion.";
    }

    return "Payment flow complete. You can run another command now.";
  }, [response]);

  const submitRequest = useCallback(async (messageToSend: string, manual: boolean) => {
    if (manual) {
      setError(null);
      setIsSubmitting(true);
      setActiveMessage(messageToSend);
    }

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageToSend,
          threadId,
        }),
      });

      const payload = (await result.json()) as ChatResponse | { error: string };
      if (!result.ok && "error" in payload) {
        throw new Error(payload.error);
      }

      const typed = payload as ChatResponse;
      setThreadId(typed.threadId);
      setResponse(typed);

      if (typed.status !== "awaiting_approval") {
        setIsPolling(false);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown chat error");
      setIsPolling(false);
    } finally {
      if (manual) {
        setIsSubmitting(false);
      }
    }
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (response?.status !== "awaiting_approval") {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      return;
    }

    const retryAfterMs = Math.max(2, response.retryAfterSeconds ?? 5) * 1000;
    setIsPolling(true);

    pollTimeoutRef.current = window.setTimeout(() => {
      void submitRequest(activeMessage, false);
    }, retryAfterMs);

    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [response?.status, response?.retryAfterSeconds, activeMessage, submitRequest]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitRequest(message, true);
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,_rgba(251,191,36,.22),_transparent_42%)]" />
      <div className="relative space-y-4">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Agent Console</p>
          <h2 className="text-2xl font-semibold text-white">TreasuryGate Chat</h2>
          <p className="text-sm text-white/70">{helperText}</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-3">
          <label htmlFor="treasury-command" className="text-xs uppercase tracking-[0.14em] text-white/65">
            Treasury command
          </label>
          <textarea
            id="treasury-command"
            rows={4}
            className="w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan-200/60"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            disabled={isSubmitting}
            type="submit"
            className="inline-flex items-center justify-center rounded-xl border border-cyan-200/60 bg-cyan-200/20 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-200/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Running flow..." : "Run treasury action"}
          </button>
          {isPolling && <p className="text-xs text-amber-100">Approval pending. Auto-checking authorization status...</p>}
        </form>

        {error && <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>}

        {response && (
          <div className={`space-y-3 rounded-2xl border p-4 ${statusStyles[response.status]}`}>
            <p className="text-xs uppercase tracking-[0.14em]">Status: {response.status}</p>
            <ul className="space-y-1 text-sm">
              {response.timeline.map((entry) => (
                <li key={entry}>- {entry}</li>
              ))}
            </ul>
            {response.payment?.receiptUrl && (
              <a
                href={response.payment.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm underline decoration-dotted underline-offset-4"
              >
                Open Stripe receipt/invoice URL
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
