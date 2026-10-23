"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { FileText, X } from "lucide-react";
import { BriefLabel } from "@/app/components/brief/ProjectBrief";
import { AutoTextarea } from "@/app/components/shared/AutoTextarea";
import { AUTOSAVE_DELAY } from "@/app/components/shared/FormFields";
import { DropdownMenu } from "@/app/components/shared/DropdownMenu";
import { MenuRow } from "@/app/components/shared/MenuRow";
import { useClickOutside } from "@/app/hooks/useClickOutside";
import { useWritingOS } from "@/app/lib/writing-os/context";
import { useFileDrop } from "@/app/components/shared/useFileDrop";
import { IMAGE_ACCEPT, pastedFiles, rejectionNotice } from "@/app/lib/writing-os/fileDrop";
import { guessChannel, xPost } from "@/app/lib/writing-os/replySource";
import { REPLY_CHANNELS, projectDisplayTitle, replyChannelLabel, type Project, type ReplyChannel } from "@/app/lib/writing-os/types";

export type ReplyBriefPatch = Partial<Pick<Project, "channel" | "replyingTo" | "replyingToUrl" | "intent" | "aboutProjectId">>;

/** What "Replying to" is doing with a paste it is still reading, or how
 * that ended when it could not. */
type PasteState =
  | { status: "idle" }
  | { status: "reading"; what: "post" | "image" }
  | { status: "failed-post" }
  | { status: "failed-image"; files: File[] }
  | { status: "skipped"; notice: string };

/** The one project a reply is about, picked from the live projects. Its
 * brief and its own notes then reach the writing assist. */
function AboutProject({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { projectsList } = useWritingOS();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(open, [ref], () => setOpen(false));
  const current = projectsList.find((p) => p.id === value);
  const pick = (id: string) => {
    setOpen(false);
    if (id !== value) onChange(id);
  };

  return (
    <div ref={ref} className="relative inline-flex items-center gap-[4px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-[6px] text-[15px] bg-transparent border-none cursor-pointer py-[5px] px-[0] ${
          current ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        {current && <FileText size={14} strokeWidth={1.7} className="text-[var(--text-secondary)]" />}
        {current ? projectDisplayTitle(current) : "Link a project…"}
      </button>
      {current && (
        <button
          type="button"
          onClick={() => pick("")}
          title="Unlink"
          aria-label="Unlink the project"
          className="bg-transparent border-none text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-[4px] rounded-[4px] flex"
        >
          <X size={13} strokeWidth={1.8} />
        </button>
      )}
      {open && (
        <DropdownMenu className="left-[0] right-auto w-[260px] max-h-[300px] overflow-y-auto">
          {projectsList.length === 0 && <div className="text-xs font-medium text-[var(--text-muted)] py-[7px] px-[10px]">No projects yet.</div>}
          {projectsList.map((p) => (
            <MenuRow key={p.id} icon={FileText} label={projectDisplayTitle(p)} active={p.id === value} onClick={() => pick(p.id)} />
          ))}
        </DropdownMenu>
      )}
    </div>
  );
}

/** A text that saves `AUTOSAVE_DELAY` after the last keystroke, on leaving
 * the field, and on closing the brief while it still has focus. */
function useAutosaved(initial: string, onCommit: (text: string) => void) {
  const [text, setText] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCommitted = useRef(initial);
  const flush = (value = text) => {
    clearTimeout(timer.current);
    if (value === lastCommitted.current) return;
    lastCommitted.current = value;
    onCommit(value);
  };
  const latest = useRef(flush);
  const current = useRef(text);
  useEffect(() => {
    latest.current = flush;
    current.current = text;
  });
  useEffect(() => () => latest.current(), []);
  const change = (value: string) => {
    setText(value);
    current.current = value;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(value), AUTOSAVE_DELAY);
  };
  /** Sets the text as already saved, for a caller that saves it itself
   * (with other fields in the same patch). */
  const replace = (value: string) => {
    clearTimeout(timer.current);
    setText(value);
    current.current = value;
    lastCommitted.current = value;
  };
  return { text, change, flush: () => flush(), replace, current: () => current.current };
}

/**
 * A reply's brief (artifacts/REPLY_SPEC.md): the message being replied to,
 * exactly as pasted, and one optional line of what the writer wants to
 * say, with the channel as a small changeable label. Shown in the same
 * panel as a project's brief.
 */
export function ReplyBrief({
  channel,
  replyingTo,
  intent,
  aboutProjectId,
  onChange,
}: {
  channel: ReplyChannel;
  replyingTo: string;
  intent: string;
  aboutProjectId: string;
  onChange: (patch: ReplyBriefPatch) => void;
}) {
  // An emptied message forgets the link it was pasted as.
  // Paste reads finish after later renders: they act through the latest
  // props, never the ones from when the paste began.
  const props = useRef({ onChange, channel });
  useEffect(() => {
    props.current = { onChange, channel };
  });
  const save = (patch: ReplyBriefPatch) => props.current.onChange(patch);
  // An emptied message forgets the link it was pasted as.
  const message = useAutosaved(replyingTo, (text) => save(text.trim() ? { replyingTo: text } : { replyingTo: text, replyingToUrl: "" }));
  const want = useAutosaved(intent, (text) => onChange({ intent: text }));
  const [paste, setPaste] = useState<PasteState>({ status: "idle" });
  // A channel the writer picked is never overridden by a later guess.
  const channelByHand = useRef(false);
  /** The channel to switch to for this text, as a patch ({} for none). */
  const guess = (text: string, url?: string): ReplyBriefPatch => {
    const c = guessChannel(text, url);
    return c && c !== props.current.channel && !channelByHand.current ? { channel: c } : {};
  };

  /** The text in place of `from` (or added after what is there, or the
   * message as it is with no `text`), saved in one patch with `extra`:
   * two patches at once could each overwrite the other's field. */
  const put = (text: string | null, from: string | null, extra: ReplyBriefPatch = {}) => {
    const now = message.current();
    const next = text === null ? now : from && now.includes(from) ? now.replace(from, text) : now.trim() ? `${now.trimEnd()}\n\n${text}` : text;
    message.replace(next);
    save({ replyingTo: next, ...extra });
  };

  // An X post link lands as pasted, then is swapped for the post once it
  // is read; if it can't be, the link stays. Either way it is kept as the
  // reply's source link.
  const readPost = async (url: string) => {
    setPaste({ status: "reading", what: "post" });
    try {
      const res = await fetch("/api/replies/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const post = res.ok ? ((await res.json()) as { text: string | null }) : { text: null };
      put(post.text, url, { replyingToUrl: url, ...guess(url, url) });
      setPaste(post.text ? { status: "idle" } : { status: "failed-post" });
    } catch {
      put(null, null, { replyingToUrl: url, ...guess(url, url) });
      setPaste({ status: "failed-post" });
    }
  };

  // A pasted or dropped image (a screenshot of a chat) is read by the OCR
  // plugin and its text added. Several are read in order, as a thread's
  // screenshots run; if one fails, it and the rest are held for another try.
  const readImages = async (files: File[]) => {
    for (const [i, file] of files.entries()) {
      setPaste({ status: "reading", what: "image" });
      try {
        const form = new FormData();
        form.append("image", file);
        const res = await fetch("/api/replies/source", { method: "POST", body: form });
        if (!res.ok) throw new Error();
        const { text } = (await res.json()) as { text: string };
        if (!text.trim()) throw new Error();
        put(text.trim(), null, guess(text));
      } catch {
        setPaste({ status: "failed-image", files: files.slice(i) });
        return;
      }
    }
    setPaste({ status: "idle" });
  };

  // Screenshots dropped anywhere on the screen. Pastes are handled in
  // `onPaste`, so a paste with text always pastes as text.
  const drop = useFileDrop({
    onDrop: (accepted, rejected) => {
      const notice = rejectionNotice(rejected, "only an image can be read here");
      if (accepted.length > 0) void readImages(accepted);
      else if (notice) setPaste({ status: "skipped", notice });
    },
    accept: IMAGE_ACCEPT,
    fullScreen: true,
    label: "Drop a screenshot to read it",
    rejectLabel: "Only an image can be read here",
  });

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    const images = pastedFiles(e.clipboardData).filter((f) => f.type.startsWith("image/"));
    if (images.length > 0) {
      e.preventDefault();
      void readImages(images);
      return;
    }
    // Everything else pastes as it is. A post link's channel is saved with
    // the post once it is read; any other paste's straight away, with the
    // pasted text, so the two go out as one patch.
    const url = text.trim();
    if (xPost(url)) return void readPost(url);
    const channelPatch = guess(text);
    if (channelPatch.channel) {
      const el = e.currentTarget;
      requestAnimationFrame(() => {
        message.change(el.value);
        put(null, null, channelPatch);
      });
    }
  };

  return (
    <div className="max-w-[760px] w-full mx-auto pt-[64px] px-[52px] pb-[120px]">
      <section>
        {drop.overlay}
        <div className="flex items-start justify-between gap-[16px]">
          <BriefLabel hint="Paste or drop the message, post, email or screenshot, exactly as it is.">Replying to</BriefLabel>
          <div role="radiogroup" aria-label="Channel" className="flex items-center gap-[2px] shrink-0">
            {REPLY_CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === channel}
                onClick={() => {
                  channelByHand.current = true;
                  if (c !== channel) onChange({ channel: c });
                }}
                className={`text-[11px] font-semibold rounded-sm py-[3px] px-[7px] cursor-pointer border ${
                  c === channel
                    ? "border-[var(--border-default)] text-[var(--text-primary)] bg-[var(--surface-chip)]"
                    : "border-transparent bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {replyChannelLabel[c]}
              </button>
            ))}
          </div>
        </div>
        <AutoTextarea
          value={message.text}
          onChange={message.change}
          onBlur={message.flush}
          onPaste={onPaste}
          autoFocus
          minRows={6}
          placeholder="Paste what you're replying to: text, a link to an X post, or a screenshot…"
          className="text-[15px] leading-[1.6] py-[5px]"
        />
        {paste.status !== "idle" && (
          <p role="status" className="mt-[6px] mb-[0] text-xs font-medium text-[var(--text-muted)]">
            {paste.status === "reading" && (paste.what === "post" ? "Reading the post…" : "Reading the image…")}
            {paste.status === "failed-post" && "Couldn't read the post, so the link is kept as pasted."}
            {paste.status === "skipped" && paste.notice}
            {paste.status === "failed-image" && (
              <>
                Couldn&apos;t read the image.{" "}
                <button
                  type="button"
                  onClick={() => readImages(paste.files)}
                  className="bg-transparent border-none p-[0] cursor-pointer text-xs font-semibold text-[var(--text-link)]"
                >
                  Try again
                </button>
              </>
            )}
          </p>
        )}
      </section>

      <section className="mt-[40px] pt-[32px] border-t border-t-[var(--border-default)]">
        <BriefLabel hint="Optional. The gist of your reply, in a line.">What I want to say</BriefLabel>
        <input
          value={want.text}
          onChange={(e) => want.change(e.target.value)}
          onBlur={want.flush}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="e.g. decline politely, offer next month"
          className="w-full border-none outline-none bg-transparent py-[5px] text-[15px] leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </section>

      <section className="mt-[40px] pt-[32px] border-t border-t-[var(--border-default)]">
        <BriefLabel hint="Optional. Its brief and notes then inform the writing assist.">About a project</BriefLabel>
        <AboutProject value={aboutProjectId} onChange={(id) => onChange({ aboutProjectId: id })} />
      </section>
    </div>
  );
}
