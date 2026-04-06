import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#15090c] text-[#fff4ea]">
      <section className="dot-pattern border-b-2 border-[#f7a36f] bg-[#2a0f0d] px-4 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid w-full max-w-[1400px] gap-10 lg:grid-cols-[1fr,0.95fr]">
          <div className="space-y-7">
            <p className="text-xs uppercase tracking-[0.2em] text-[#ffc8a8]">Autonomous Treasury Control</p>
            <h1 className="text-5xl font-semibold leading-[0.98] text-white sm:text-7xl">
              Schedule Spend.
              <br />
              <span className="text-[#ffb081]">Approve Fast.</span>
              <br />
              Verify Every Dollar.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[#ffd8c0] sm:text-xl">
              TreasuryGate is your command center for payable execution: create new payment requests, enforce approval gates, and close with proof your finance team can trust.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/items" className="brand-push-btn px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em]">
                Get Started
              </Link>
              <Link href="/tasks" className="brand-push-btn-ghost px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em]">
                Tasks
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#f7a36f] bg-[#211013] p-4 shadow-[8px_8px_0_0_#1b090b] sm:p-6">
            <div className="rounded-xl border-2 border-[#f7a36f] bg-[#180c0f] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[#ffc8a8]">Live Operations Snapshot</p>
              <p className="mt-2 text-2xl font-semibold text-white">From Create New to Cleared Payment</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <article className="rounded-lg border-2 border-[#f7a36f] bg-[#2a1214] p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#ffc8a8]">Schedule</p>
                  <p className="mt-1 text-sm text-[#ffe4d1]">Exact due date and time</p>
                </article>
                <article className="rounded-lg border-2 border-[#f7a36f] bg-[#2a1214] p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#ffc8a8]">Approve</p>
                  <p className="mt-1 text-sm text-[#ffe4d1]">Auth0 guarded execution</p>
                </article>
                <article className="rounded-lg border-2 border-[#f7a36f] bg-[#2a1214] p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#ffc8a8]">Verify</p>
                  <p className="mt-1 text-sm text-[#ffe4d1]">Stripe evidence links</p>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-[#f7a36f] bg-[#13070a] px-4 py-8 sm:px-8">
        <div className="marquee-track mx-auto flex w-full max-w-[1400px] gap-10 overflow-hidden text-sm uppercase tracking-[0.16em] text-[#f7a36f]/70">
          <span>Create New</span>
          <span>Liquidity Check</span>
          <span>Auth0 Approval</span>
          <span>Stripe Execution</span>
          <span>AI Task Review</span>
          <span>Evidence-Backed Close</span>
          <span>Create New</span>
          <span>Liquidity Check</span>
          <span>Auth0 Approval</span>
          <span>Stripe Execution</span>
        </div>
      </section>

      <section className="bg-[#15090c] px-4 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-[1400px] space-y-7">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#ffc8a8]">How It Flows</p>
            <h2 className="mt-2 text-4xl font-semibold text-white">Schedule. Approve. Verify.</h2>
          </div>

          <div className="space-y-6">
            <article className="story-card sticky top-24 rounded-2xl border-2 border-[#f7a36f] bg-[#1f0f11] p-6 shadow-[6px_6px_0_0_#1b090b] sm:p-8">
              <p className="text-xs uppercase tracking-[0.16em] text-[#ffc8a8]">01 - Schedule</p>
              <h3 className="mt-2 text-3xl font-semibold text-white">Define when money should move.</h3>
              <p className="mt-2 text-base text-[#ffe4d1]">Create new payment tasks with exact amounts, categories, and date-time precision.</p>
            </article>

            <article className="story-card sticky top-28 rounded-2xl border-2 border-[#f7a36f] bg-[#1f0f11] p-6 shadow-[6px_6px_0_0_#1b090b] sm:p-8">
              <p className="text-xs uppercase tracking-[0.16em] text-[#ffc8a8]">02 - Approve</p>
              <h3 className="mt-2 text-3xl font-semibold text-white">Move quickly, stay controlled.</h3>
              <p className="mt-2 text-base text-[#ffe4d1]">Auth0 async approval keeps humans in charge before any payment mutates state.</p>
            </article>

            <article className="story-card sticky top-32 rounded-2xl border-2 border-[#f7a36f] bg-[#1f0f11] p-6 shadow-[6px_6px_0_0_#1b090b] sm:p-8">
              <p className="text-xs uppercase tracking-[0.16em] text-[#ffc8a8]">03 - Verify</p>
              <h3 className="mt-2 text-3xl font-semibold text-white">Close with evidence, not guesswork.</h3>
              <p className="mt-2 text-base text-[#ffe4d1]">Stripe invoice proof and AI-generated task reviews explain exactly what happened and what to do next.</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
