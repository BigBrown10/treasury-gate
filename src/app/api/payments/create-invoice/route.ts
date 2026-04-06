import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOpenInvoiceForVendor } from "@/lib/server/stripe";

const schema = z.object({
  vendor: z.string().min(1),
  amountCents: z.number().int().positive(),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const invoice = await createOpenInvoiceForVendor({
      vendor: input.vendor,
      amountCents: input.amountCents,
      description: input.description,
    });

    return NextResponse.json({ invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
