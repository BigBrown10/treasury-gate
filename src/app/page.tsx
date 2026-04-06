import { ChatPanel } from "@/components/chat-panel";
import { TreasuryOverview } from "@/components/treasury-overview";
import { getTreasurySnapshot } from "@/lib/server/treasury";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getTreasurySnapshot();

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(56,189,248,.25),_transparent_36%),radial-gradient(circle_at_84%_10%,_rgba(251,146,60,.20),_transparent_34%),linear-gradient(160deg,#051321_0%,#0A2230_48%,#0D1B2B_100%)]" />

      <div className="relative mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[1.15fr,1fr]">
        <TreasuryOverview snapshot={snapshot} />
        <ChatPanel />
      </div>
    </main>
  );
}
