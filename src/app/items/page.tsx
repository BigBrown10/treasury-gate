import { ItemsManager } from "@/components/items-manager";

export const dynamic = "force-dynamic";

export default function ItemsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,_rgba(255,124,64,.35),_transparent_38%),radial-gradient(circle_at_82%_12%,_rgba(255,168,101,.22),_transparent_34%),linear-gradient(160deg,#1c0b0a_0%,#1a0d14_50%,#120c17_100%)]" />

      <div className="relative mx-auto w-full max-w-[1400px] space-y-4">
        <header className="rounded-3xl border border-orange-100/20 bg-white/10 p-5 shadow-xl backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.16em] text-orange-100/80">Create New</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Create and Schedule New Payments</h1>
          <p className="mt-2 text-sm text-white/75">
            This page is only for new payment creation and scheduling. Execution review is in Tasks.
          </p>
        </header>

        <ItemsManager />
      </div>
    </main>
  );
}
