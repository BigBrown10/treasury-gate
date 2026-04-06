import { NextResponse } from "next/server";

import { getTreasurySnapshot } from "@/lib/server/treasury";

export async function GET() {
  try {
    const snapshot = await getTreasurySnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown treasury API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
