import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,121,56,.45),transparent_35%),radial-gradient(circle_at_72%_32%,rgba(255,84,47,.28),transparent_42%),radial-gradient(circle_at_50%_80%,rgba(255,157,98,.22),transparent_42%),linear-gradient(140deg,#1b0807_0%,#12060e_44%,#090812_100%)]" />

      <div className="hero-pulse pointer-events-none absolute -left-20 top-32 h-72 w-72 rounded-full bg-[#ff6a3f]/35 blur-3xl" />
      <div className="hero-pulse-delay pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full bg-[#ff9b63]/25 blur-3xl" />

      <section className="relative mx-auto grid w-full max-w-[1400px] items-center gap-10 lg:grid-cols-[1fr,0.9fr]">
        <div className="space-y-7">
          <p className="hero-reveal text-xs uppercase tracking-[0.22em] text-orange-100/85">Autonomous Treasury Control</p>

          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
            <span className="hero-reveal block">Finance Ops That</span>
            <span className="hero-reveal-delay-1 block text-orange-200">Move On Time.</span>
            <span className="hero-reveal-delay-2 block">With Approval Built In.</span>
          </h1>

          <p className="hero-reveal-delay-2 max-w-2xl text-lg leading-relaxed text-orange-50/85 sm:text-xl">
            TreasuryGate schedules payables, checks liquidity, requests secure approval, and executes real Stripe payments with proof. You stay in control while the workflow keeps moving.
          </p>

          <div className="hero-reveal-delay-3 flex flex-wrap items-center gap-3">
            <Link
              href="/main"
              className="rounded-xl border border-orange-200/60 bg-gradient-to-r from-[#ff6b3f] via-[#ff7f4d] to-[#ff9a61] px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-[0_0_45px_rgba(255,122,80,.38)] transition hover:scale-[1.02] hover:shadow-[0_0_55px_rgba(255,133,84,.5)]"
            >
              Get Started
            </Link>
            <Link
              href="/tasks"
              className="rounded-xl border border-orange-100/35 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-orange-100 transition hover:bg-white/12"
            >
              View Tasks
            </Link>
          </div>

          <div className="hero-reveal-delay-3 grid max-w-2xl gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.13em] text-orange-100/75">Schedule</p>
              <p className="mt-1 text-sm text-white/90">Set exact date and time for each payment task.</p>
            </article>
            <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.13em] text-orange-100/75">Authorize</p>
              <p className="mt-1 text-sm text-white/90">Auth0 approval gates every payment action.</p>
            </article>
            <article className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.13em] text-orange-100/75">Verify</p>
              <p className="mt-1 text-sm text-white/90">Stripe evidence and logs track completed outcomes.</p>
            </article>
          </div>
        </div>

        <div className="hero-reveal-delay-2 relative min-h-[420px] rounded-[2.25rem] border border-orange-200/25 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 backdrop-blur-2xl sm:min-h-[500px]">
          <div className="absolute left-6 top-6 h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_18px_rgba(255,174,112,1)]" />
          <div className="absolute right-10 top-14 h-32 w-32 rotate-12 rounded-[1.8rem] border border-orange-200/35 bg-gradient-to-b from-[#ffb581] via-[#ff7d47] to-[#74201e] opacity-80 shadow-[0_0_70px_rgba(255,109,66,.45)]" />
          <div className="absolute bottom-16 right-6 h-52 w-28 -rotate-6 rounded-[1.6rem] border border-orange-100/30 bg-gradient-to-b from-[#ffd0a3] via-[#ff8a52] to-[#8f2a24] shadow-[0_0_90px_rgba(255,98,58,.35)]" />
          <div className="absolute bottom-8 left-6 right-6 rounded-2xl border border-orange-100/20 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-orange-100/70">Live Operations</p>
            <p className="mt-1 text-xl font-semibold text-white">From Scheduled to Paid</p>
            <p className="mt-2 text-sm text-orange-50/80">
              Queue tasks by date, watch approvals in progress, and close execution with auditable payment proof.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
