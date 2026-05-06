import { VoyageJournal } from "./VoyageJournal";

// Today's Horizon — Dawnlight 2 attendance section.
// Width matches the placeholder card from step 3-A (`max-w-2xl`) so all
// dawnlight2 widgets share a consistent column. Section label uses the
// serif KR variable wired in step 3-A.
export function TodaysHorizon() {
  return (
    <section
      aria-labelledby="dl2-todays-horizon"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12"
    >
      <div className="mb-6 flex items-center justify-center gap-3 sm:mb-8">
        <span className="h-px w-10 bg-mist-lavender/40" aria-hidden />
        <h2
          id="dl2-todays-horizon"
          className="font-serif-kr text-[11px] font-light uppercase tracking-[0.42em] text-muted-lavender sm:text-xs"
        >
          Today&apos;s Horizon
        </h2>
        <span className="h-px w-10 bg-mist-lavender/40" aria-hidden />
      </div>

      <VoyageJournal />
    </section>
  );
}
