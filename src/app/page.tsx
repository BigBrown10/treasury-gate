import { ChatPanel } from "@/components/chat-panel";
import { TreasuryOverview } from "@/components/treasury-overview";
import { getTreasurySnapshot } from "@/lib/server/treasury";

export const dynamic = "force-dynamic";

export default async function Home() {
  const treasuryResult = await getTreasurySnapshot()
    .then((snapshot) => ({ snapshot, errorMessage: null }))
    .catch((error: unknown) => ({
      snapshot: null,
      errorMessage: error instanceof Error ? error.message : "Unknown configuration error",
    }));

  if (treasuryResult.snapshot) {
    return (
      <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(56,189,248,.25),_transparent_36%),radial-gradient(circle_at_84%_10%,_rgba(251,146,60,.20),_transparent_34%),linear-gradient(160deg,#051321_0%,#0A2230_48%,#0D1B2B_100%)]" />

        <div className="relative mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[1.15fr,1fr]">
          <TreasuryOverview snapshot={treasuryResult.snapshot} />
          <ChatPanel />
        </div>
      </main>
    );
  }

  const message = treasuryResult.errorMessage ?? "Unknown configuration error";
  const isEnvError = message.includes("Invalid environment variables:");

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(56,189,248,.25),_transparent_36%),radial-gradient(circle_at_84%_10%,_rgba(251,146,60,.20),_transparent_34%),linear-gradient(160deg,#051321_0%,#0A2230_48%,#0D1B2B_100%)]" />

      <section className="relative mx-auto w-full max-w-4xl rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-white/70">TreasuryGate Setup</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Add API Credentials To Start</h1>
        <p className="mt-3 text-sm text-white/75">
          Treasury data is blocked until required keys are present in <code>.env.local</code>.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4 text-amber-100">
          <p className="text-sm font-medium">Current error</p>
          <p className="mt-2 text-sm break-words">{message}</p>
        </div>

        {isEnvError && (
          <div className="mt-6 rounded-2xl border border-white/20 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Required keys</p>
            <pre className="mt-2 overflow-auto text-sm text-cyan-100">
AUTH0_CLIENT_ID\nAUTH0_SECRET\nAUTH0_DOMAIN\nSTRIPE_SECRET_KEY\nPLAID_CLIENT_ID\nPLAID_SECRET
            </pre>
            <p className="mt-3 text-sm text-white/70">After updating <code>.env.local</code>, restart the dev server.</p>
          </div>
        )}
      </section>
    </main>
  );
}
