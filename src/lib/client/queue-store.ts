export type AgentLog = {
  at: string;
  step: string;
  detail: string;
};

export type QueueStatus =
  | "queued"
  | "waiting_invoice"
  | "awaiting_approval"
  | "completed"
  | "insufficient_funds"
  | "denied"
  | "timed_out"
  | "payment_unverified"
  | "error";

export type QueueItem = {
  id: string;
  category: "salary" | "supplies" | "logistics" | "other";
  recurrence: "one_time" | "monthly";
  autoCreateInvoice: boolean;
  vendor: string;
  recipientName?: string;
  recipientEmail?: string;
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

export type AttemptResponse = {
  itemId: string;
  threadId: string;
  status: QueueStatus;
  retryAfterSeconds?: number;
  matchedInvoice?: {
    id: string;
    hostedInvoiceUrl?: string | null;
  };
  timeline?: string[];
  agentLogs?: AgentLog[];
  payment?: QueueItem["payment"];
  error?: string;
};

export const STORAGE_KEY = "treasurygate.autopay.queue.v1";

export const statusTone: Record<QueueStatus, string> = {
  queued: "border-orange-100/30 bg-orange-100/10",
  waiting_invoice: "border-orange-200/30 bg-orange-200/10",
  awaiting_approval: "border-amber-300/35 bg-amber-300/10",
  completed: "border-emerald-300/35 bg-emerald-300/10",
  insufficient_funds: "border-rose-300/35 bg-rose-300/10",
  denied: "border-rose-300/35 bg-rose-300/10",
  timed_out: "border-orange-300/35 bg-orange-300/10",
  payment_unverified: "border-orange-300/35 bg-orange-300/10",
  error: "border-red-300/40 bg-red-300/10",
};

export const statusLabel: Record<QueueStatus, string> = {
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function canAutoProcess(item: QueueItem): boolean {
  return [
    "queued",
    "waiting_invoice",
    "awaiting_approval",
    "payment_unverified",
    "error",
    "timed_out",
    "insufficient_funds",
    "denied"
  ].includes(item.status);
}

export function isDueNow(item: QueueItem): boolean {
  return new Date(item.dueAt).getTime() <= Date.now();
}

export function isDueToday(item: QueueItem): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return item.dueAt.slice(0, 10) <= today;
}

export function isLiveStatus(item: QueueItem): boolean {
  return [
    "queued",
    "waiting_invoice",
    "awaiting_approval",
    "payment_unverified",
    "error",
    "timed_out",
    "insufficient_funds",
    "denied"
  ].includes(item.status);
}

function cap<T>(entries: T[], max: number): T[] {
  return entries.slice(-max);
}

export function mergeTimeline(existing: string[], incoming?: string[]): string[] {
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

export function mergeLogs(existing: AgentLog[], incoming?: AgentLog[]): AgentLog[] {
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

export function loadQueueItems(): QueueItem[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

export function saveQueueItems(items: QueueItem[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
