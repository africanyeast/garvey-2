"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * One tag on a note/inbox item — rendered as plain inline text (no pill),
 * trailing the note's text like a hashtag at the end of a caption. An "@"
 * tag (cross-listed project) reads semibold; a "#" tag (section/block) reads
 * regular weight, matching the distinction the composer already draws when
 * picking one. `href`, when present, makes the tag itself a link to the
 * project/section/block it references. Hovering reveals a "×" to remove it;
 * omit `onRemove` (e.g. once a note is resolved) to render it as a plain,
 * non-removable label.
 */
export function NoteTag({
  tag,
  href,
  onRemove,
  size = "sm",
}: {
  tag: string;
  href?: string;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(false);
  const isAt = tag.startsWith("@");
  const text = size === "md" ? "text-[14px]" : "text-[13px]";
  const labelClassName = `${text} ${isAt ? "font-semibold" : "font-normal"} no-underline`;
  // Forced inline rather than relying on class specificity to beat the
  // global `a { color }` rule — a tag stays the same subtle, muted color
  // whether or not it's clickable; only a hover underline signals the link.
  const labelStyle = { color: "var(--text-secondary)" };

  return (
    <span onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {href ? (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className={`${labelClassName} hover:underline`}
          style={labelStyle}
        >
          {tag}
        </Link>
      ) : (
        <span className={labelClassName} style={labelStyle}>
          {tag}
        </span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove tag"
          className={`bg-transparent border-none cursor-pointer text-[var(--text-muted)] pl-[2px] transition-opacity ${
            hover ? "opacity-100" : "opacity-0"
          }`}
        >
          ×
        </button>
      )}
    </span>
  );
}
