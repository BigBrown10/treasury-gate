import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { hasGeminiKey } from "@/lib/server/env";

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!hasGeminiKey()) {
      return NextResponse.json({ error: "GOOGLE_GENERATIVE_AI_API_KEY is not configured" }, { status: 500 });
    }

    const { object } = await generateObject({
      model: google("gemini-2.5-pro"),
      schema: z.object({
        vendor: z.string(),
        amountCents: z.number().int().positive(),
        category: z.enum(["salary", "supplies", "logistics", "other"]),
        recurrence: z.enum(["one_time", "monthly"]),
        autoCreateInvoice: z.boolean(),
        offsetDays: z.number().int().describe("Number of days from today this is due. 0 for today."),
      }),
      prompt: `Parse this natural language task into a payment task: "${prompt}". Assume amounts are in dollars if not specified, convert to cents. If they mention creating an invoice, set autoCreateInvoice to true.`,
    });

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + object.offsetDays);

    const newTask = {
      id: crypto.randomUUID(),
      vendor: object.vendor,
      amountCents: object.amountCents,
      category: object.category,
      recurrence: object.recurrence,
      autoCreateInvoice: object.autoCreateInvoice,
      createdAt: new Date().toISOString(),
      dueAt: dueAt.toISOString(),
      status: "queued",
      timeline: ["Task created via Agentic NLP Parser."],
      agentLogs: [{
        at: new Date().toISOString(),
        step: "parse_intent",
        detail: `Agent parsed vendor=${object.vendor}, amountCents=${object.amountCents}, dueAt=${dueAt.toISOString()}`
      }]
    };

    return NextResponse.json({ task: newTask });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to parse" }, { status: 500 });
  }
}