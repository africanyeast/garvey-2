import { avoidWords, registerTags, toneTags, transitions } from "@/lib/data";
import { X } from "lucide-react";

export function StylePanel() {
  return (
    <div className="max-w-[820px] my-[0] mx-[auto] pt-[36px] px-[48px] pb-[90px]">
      <div className="flex items-center justify-between mb-[8px]">
        <h1 className={`font-serif text-2xl font-semibold text-[var(--text-primary)] m-[0]`}>Style</h1>
        <span className={`text-xs font-medium text-[var(--text-muted)] bg-neutral-100 rounded-full py-[4px] px-[12px]`}>
          Single active profile
        </span>
      </div>
      <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[40px]`}>Defines how AI suggestions reflect your voice.</p>

      <div className="mb-[44px]">
        <div className="flex items-baseline gap-[10px] mb-[4px]">
          <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-brand)]`}>Primary</span>
          <span className={`text-base font-bold text-[var(--text-primary)]`}>Writing Samples</span>
        </div>
        <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[18px] max-w-[520px]`}>
          The main way the AI learns your voice — sentence rhythm, habitual phrasing, structural tics. This matters more than the tags below.
        </p>

        <div className="flex flex-col gap-[12px]">
          <div className="wos-row bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-md py-[18px] px-[20px]">
            <div className="flex justify-between mb-[10px]">
              <span className={`text-xs font-medium text-[var(--text-muted)]`}>Sample 1 · 340 words</span>
              <button className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[0]">
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
            <p className={`font-serif text-sm font-normal text-[var(--text-primary)] m-[0]`}>
              The mistake most tools make is treating structure as an afterthought — something you impose once the thinking is already done. But structure is the thinking. If the shape isn&apos;t right, no amount of polish on the sentences will save it.
            </p>
          </div>
          <div className="wos-row bg-[var(--surface-raised)] border border-[var(--border-strong)] rounded-md py-[18px] px-[20px]">
            <div className="flex justify-between mb-[10px]">
              <span className={`text-xs font-medium text-[var(--text-muted)]`}>Sample 2 · 210 words</span>
              <button className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[0]">
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
            <p className={`font-serif text-sm font-normal text-[var(--text-primary)] m-[0]`}>
              I keep coming back to the same test: could someone else have written this sentence? If yes, cut it. The whole point of a personal style is that it couldn&apos;t have come from anyone else.
            </p>
          </div>
          <button className={`text-xs font-medium self-start text-[var(--text-secondary)] bg-transparent border border-dashed border-[var(--border-strong)] rounded-md py-[12px] px-[20px] cursor-pointer`}>
            + Add another sample
          </button>
        </div>
      </div>

      <div className="bg-[var(--surface-sunken)] rounded-lg py-[22px] px-[24px]">
        <span className={`text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]`}>
          Secondary — Override Tags
        </span>
        <p className={`text-xs font-medium text-[var(--text-muted)] mt-[6px] mx-[0] mb-[20px] max-w-[480px]`}>
          Hard constraints the samples above might not reliably convey.
        </p>

        <div className="grid grid-cols-2 gap-[22px]">
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Tone</div>
            <div className="flex flex-wrap gap-[6px]">
              {toneTags.map((t) => (
                <span key={t} className={`wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]`}>
                  {t}
                  <span className="wos-reveal cursor-pointer text-[var(--text-muted)]">×</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Sentence Length</div>
            <div className={`text-sm font-normal text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[12px]`}>
              Medium (12–20 words)
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Words to Avoid</div>
            <div className="flex flex-wrap gap-[6px]">
              {avoidWords.map((w) => (
                <span key={w} className={`wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]`}>
                  {w}
                  <span className="wos-reveal cursor-pointer text-[var(--text-muted)]">×</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Preferred Transitions</div>
            <div className="flex flex-wrap gap-[6px]">
              {transitions.map((tr) => (
                <span key={tr} className={`wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]`}>
                  {tr}
                  <span className="wos-reveal cursor-pointer text-[var(--text-muted)]">×</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Structural Habits</div>
            <div className={`text-sm font-normal text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[9px] px-[12px] leading-[1.5]`}>
              Short paragraphs. Clear section headings. Lists for complex ideas. End with a takeaway.
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium text-[var(--text-primary)] mb-[8px]`}>Register</div>
            <div className="flex flex-wrap gap-[6px]">
              {registerTags.map((r) => (
                <span key={r} className={`wos-row text-xs font-medium inline-flex items-center gap-[6px] text-[var(--text-primary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-full py-[5px] px-[10px]`}>
                  {r}
                  <span className="wos-reveal cursor-pointer text-[var(--text-muted)]">×</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
