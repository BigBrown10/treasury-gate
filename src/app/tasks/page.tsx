import { AutopayQueue } from "@/components/autopay-queue";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,_rgba(34,211,238,.22),_transparent_35%),radial-gradient(circle_at_82%_10%,_rgba(251,191,36,.18),_transparent_34%),linear-gradient(160deg,#041220_0%,#0B1F2E_52%,#0E2030_100%)]" />

      <div className="relative mx-auto w-full max-w-[1400px] space-y-4">
        <header className="rounded-3xl border border-white/20 bg-white/10 p-5 shadow-xl backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">View Tasks</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Scheduled, Live, and Completed Task Monitor</h1>
          <p className="mt-2 text-sm text-white/75">
            Set a date and time for each task, then monitor live execution logs and completed payment evidence in one operations workspace.
          </p>
        </header>

        <AutopayQueue />
      </div>
    </main>
  );
}
