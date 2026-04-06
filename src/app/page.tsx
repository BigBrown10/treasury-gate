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
              TreasuryGate is an agentic FinSecOps command center for payable execution: create new payment requests, enforce approval gates, and close with proof your finance team can trust.
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
        <div className="marquee-track mx-auto flex w-full max-w-[1400px] gap-10 overflow-hidden text-sm tracking-[0.04em] text-[#f7a36f]/82">
          <span>TreasuryGate automates payment operations while your team keeps approval authority.</span>
          <span>Agentic FinSecOps means each task is scheduled, reviewed, approved, executed, and verified with evidence.</span>
          <span>Create recurring monthly payouts, monitor live risk, and close books with auditable Stripe proof.</span>
          <span>TreasuryGate automates payment operations while your team keeps approval authority.</span>
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

      <section className="border-y-2 border-[#f7a36f] bg-[#1a0b0f] px-4 py-14 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border-2 border-[#f7a36f] bg-[#2a1214] p-6 shadow-[6px_6px_0_0_#1b090b]">
            <p className="text-xs uppercase tracking-[0.16em] text-[#ffc8a8]">The Old Way</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Fragmented approvals. Delayed payouts.</h3>
            <ul className="mt-4 space-y-2 text-sm text-[#ffe4d1]">
              <li>Manual reminders, disconnected tools, zero timing control.</li>
              <li>No single place to see what is blocked, live, or done.</li>
              <li>Payments happen, but proof trails arrive too late.</li>
            </ul>
          </article>

          <article className="rounded-2xl border-2 border-[#f7a36f] bg-[#3a1714] p-6 shadow-[8px_8px_0_0_#1b090b]">
            <p className="text-xs uppercase tracking-[0.16em] text-[#ffc8a8]">The TreasuryGate Way</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Autonomous execution with human authority.</h3>
            <ul className="mt-4 space-y-2 text-sm text-[#ffe4d1]">
              <li>Create New with exact date/time and clear ownership.</li>
              <li>Auth0 approval gates every mutating payment action.</li>
              <li>Stripe proof and AI summaries close each loop cleanly.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="dot-pattern bg-[#2a0f0d] px-4 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-[1400px] space-y-7">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#ffc8a8]">Feature Grid</p>
            <h2 className="mt-2 text-4xl font-semibold text-white">Built for modern treasury execution</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Create New</p>
              <p className="mt-2 text-xl font-semibold text-white">Date-Time Scheduling</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">Queue exact execution windows, not vague due dates.</p>
            </article>
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Approval</p>
              <p className="mt-2 text-xl font-semibold text-white">Auth0 Async Gate</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">Move fast while preserving explicit human authorization.</p>
            </article>
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Execution</p>
              <p className="mt-2 text-xl font-semibold text-white">Real Stripe Invoice Pay</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">No mock rails. Real SDK calls in Stripe test mode.</p>
            </article>
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Liquidity</p>
              <p className="mt-2 text-xl font-semibold text-white">Plaid Cash Signal</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">Check available balance before attempting payout.</p>
            </article>
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Review</p>
              <p className="mt-2 text-xl font-semibold text-white">AI Task Summary</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">Gemini turns operational events into executive-ready insights.</p>
            </article>
            <article className="rounded-xl border-2 border-[#f7a36f] bg-[#211013] p-5 shadow-[4px_4px_0_0_#1b090b]">
              <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Proof</p>
              <p className="mt-2 text-xl font-semibold text-white">Evidence-Backed Close</p>
              <p className="mt-2 text-sm text-[#ffe4d1]">Stripe invoice links verify every completed payment.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#13070a] px-4 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="rounded-2xl border-2 border-[#f7a36f] bg-[#211013] p-7 shadow-[8px_8px_0_0_#1b090b] text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-[#ffc8a8]">Final CTA</p>
            <h2 className="mt-3 text-4xl font-semibold text-white">From request to verified payout, in one flow.</h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm text-[#ffe4d1] sm:text-base">
              TreasuryGate helps finance teams execute faster without losing control. Create new tasks, run approvals, and close with evidence.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/items" className="brand-push-btn px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em]">
                Create New
              </Link>
              <Link href="/tasks" className="brand-push-btn-ghost px-6 py-3 text-sm font-semibold uppercase tracking-[0.08em]">
                Open Tasks
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-[#f7a36f] bg-[#0f0609] px-4 py-10 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="brand-logo text-lg">TreasuryGate</p>
            <p className="mt-2 text-sm text-[#ffc8a8]">Agentic treasury execution with approval and proof.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Product</p>
            <p className="mt-2 text-sm text-[#ffe4d1]">Create New</p>
            <p className="text-sm text-[#ffe4d1]">Tasks</p>
            <p className="text-sm text-[#ffe4d1]">AI Reviews</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Security</p>
            <p className="mt-2 text-sm text-[#ffe4d1]">Auth0 Authorization</p>
            <p className="text-sm text-[#ffe4d1]">Plaid Balance Signals</p>
            <p className="text-sm text-[#ffe4d1]">Stripe Evidence Links</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#ffc8a8]">Status</p>
            <p className="mt-2 text-sm text-[#ffe4d1]">Live Mode: Demo</p>
            <p className="text-sm text-[#ffe4d1]">SDK Calls: Real</p>
            <p className="text-sm text-[#ffe4d1]">Environment: Test Rails</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
