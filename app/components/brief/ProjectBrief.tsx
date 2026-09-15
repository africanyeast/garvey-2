import { argumentsList, titleCandidates } from "@/lib/data";
import { GripVertical, X } from "lucide-react";

export function ProjectBrief() {
  return (
    <div className="max-w-[900px] w-full mx-auto py-[32px] px-[28px]">
      <h1 className={`font-serif text-3xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]`}>Project Brief</h1>
      <p className={`text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[40px]`}>
        Define the intent, structure, and direction for your writing project.
      </p>

      <div className="grid grid-cols-2 gap-[28px] mb-[36px]">
        <div>
          <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Problem</div>
          <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>
            What problem are you trying to solve? What&apos;s the context?
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] min-h-[110px]">
            <p className={`font-serif text-sm font-normal text-[var(--text-primary)] m-[0]`}>
              Writers relying on cloud AI tools give up privacy and control over their own creative process — every draft, note, and idea lives on someone else&apos;s server.
            </p>
          </div>
        </div>
        <div>
          <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Agenda</div>
          <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>
            What do you need to cover? What are you looking to achieve?
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px] min-h-[110px]">
            <p className={`font-serif text-sm font-normal text-[var(--text-primary)] m-[0]`}>
              Make the case for local-first AI as a serious alternative — cover the privacy argument, the control argument, and current feasibility.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-[36px]">
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Arguments</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[14px]`}>Key points you want to make. Reorder as needed.</div>
        <div className="flex flex-col gap-[8px]">
          {argumentsList.map((arg) => (
            <div key={arg} className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]">
              <GripVertical size={14} className="cursor-grab shrink-0" />
              <span className={`text-[12px] font-semibold text-[var(--text-primary)] flex-1`}>{arg}</span>
              <button className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px]">
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <button className={`text-xs font-semibold self-start mt-[2px] text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[9px] px-[16px] cursor-pointer`}>
            + Add argument
          </button>
        </div>
      </div>

      <div className="mb-[36px]">
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Goal</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[10px]`}>What do you want to achieve with this writing?</div>
        <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[16px] px-[18px]">
          <p className={`font-serif text-sm font-normal text-[var(--text-primary)] m-[0]`}>
            Convince a technical reader that a local-first writing and research tool is not just viable, but preferable — and leave them wanting to try one.
          </p>
        </div>
      </div>

      <div>
        <div className={`text-sm font-bold text-[var(--text-primary)] mb-[3px]`}>Title Candidates</div>
        <div className={`text-xs font-medium text-[var(--text-muted)] mb-[14px]`}>Draft a few options. One is marked current.</div>
        <div className="flex flex-col gap-[8px]">
          {titleCandidates.map((tc) => (
            <div key={tc.text} className="wos-row flex items-center gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]">
              <GripVertical size={14} className="cursor-grab shrink-0" />
              <span className={`text-[12px] font-semibold text-[var(--text-primary)] flex-1`}>{tc.text}</span>
              {tc.current && (
                <span className={`text-xs font-semibold text-[var(--text-secondary)] bg-neutral-100 rounded-full py-[3px] px-[10px] shrink-0`}>
                  Current title
                </span>
              )}
              <button className="wos-reveal bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-[4px] shrink-0">
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <button className={`text-xs font-semibold self-start mt-[2px] text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded-md py-[9px] px-[16px] cursor-pointer`}>
            + Add title candidate
          </button>
        </div>
      </div>
    </div>
  );
}
