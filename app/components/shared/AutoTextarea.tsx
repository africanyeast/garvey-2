"use client";

import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

/**
 * The app's one multi-line input: grows with its text from `minRows`.
 * With `onSubmit`, Enter submits and Shift+Enter is a new line. `onKeyDown`
 * runs first and can claim a key with `preventDefault`.
 */
export function AutoTextarea({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onBlur,
  placeholder,
  minRows = 2,
  disabled,
  autoFocus,
  className = "",
  style,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (!onSubmit || e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return;
        e.preventDefault();
        onSubmit();
      }}
      className={`block w-full resize-none overflow-hidden border-none outline-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60 ${className}`}
      style={style}
    />
  );
}
