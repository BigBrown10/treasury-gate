import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasGeminiKey } from "@/lib/server/env";

const schema = z.object({
  vendor: z.string().min(1),
  amountCents: z.number().int().positive(),
  status: z.string().min(1),
  dueAt: z.string().min(1),
  paymentStatus: z.string().optional(),
  paymentAmountPaid: z.number().optional(),
  agentLogs: z.array(
    z.object({
      at: z.string(),
      step: z.string(),
      detail: z.string(),
    }),
  ),
});

function fallbackSummary(input: z.infer<typeof schema>) {
  const lastLog = input.agentLogs.at(-1);
  const paid = (input.paymentAmountPaid ?? 0) > 0;

  return {
    title: paid ? "Payment completed" : "Payment still in progress",
    summary: paid
      ? `${input.vendor} appears paid with ${(input.paymentAmountPaid ?? 0) / 100} settled.`
      : `${input.vendor} is currently ${input.status}. Last checkpoint: ${lastLog?.step ?? "unknown"}.`,
    riskLevel: paid ? "low" : "medium",
    nextAction: paid ? "Archive in Finished tasks." : "Keep task live and re-check approval/payment status.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    if (!hasGeminiKey()) {
      return NextResponse.json({ review: fallbackSummary(input), source: "fallback" });
    }

    const recentLogs = input.agentLogs.slice(-10).map((entry) => `${entry.at} | ${entry.step} | ${entry.detail}`).join("\n");

    const response = await generateObject({
      model: google("gemini-2.5-pro"),
      schema: z.object({
        title: z.string().min(1).max(80),
        summary: z.string().min(1).max(360),
        riskLevel: z.enum(["low", "medium", "high"]),
        nextAction: z.string().min(1).max(160),
      }),
      prompt: `You are a finance operations reviewer.\nCreate a concise executive review.\nVendor: ${input.vendor}\nAmount: ${(input.amountCents / 100).toFixed(2)}\nStatus: ${input.status}\nDue: ${input.dueAt}\nPayment status: ${input.paymentStatus ?? "unknown"}\nPayment amount paid: ${(input.paymentAmountPaid ?? 0) / 100}\nRecent logs:\n${recentLogs}`,
    });

    return NextResponse.json({ review: response.object, source: "gemini" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build AI review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
