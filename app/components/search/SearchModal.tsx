"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Inbox } from "lucide-react";
import type { SearchResult } from "@/lib/search";

const KIND_ICON: Record<SearchResult["kind"], typeof FileText> = {
  project: FileText,
  note: Inbox,
};

/** Splits `text` on case-insensitive occurrences of `query`, wrapping each
 * match in a <mark> — Notion-style highlighted search results. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const re = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) && part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="bg-[var(--fill-highlight)] text-[var(--text-primary)] rounded-[2px]">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResult[] = res.ok ? await res.json() : [];
      setResults(data);
      setActiveIndex(0);
      setLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (result: SearchResult) => {
    router.push(result.href);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = results[activeIndex];
      if (active) go(active);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] bg-[rgba(0,0,0,0.35)]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[90vw] max-h-[60vh] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-[10px] px-[16px] py-[14px] border-b border-[var(--border-default)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search across projects and notes."
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-[6px]">
          {query.trim() && !loading && results.length === 0 && (
            <div className="px-[16px] py-[24px] text-xs font-medium text-[var(--text-muted)] text-center">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result, i) => {
            const Icon = KIND_ICON[result.kind];
            return (
              <button
                key={`${result.kind}-${result.projectSlug}-${result.noteId ?? ""}-${i}`}
                onClick={() => go(result)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-start gap-[10px] px-[16px] py-[10px] text-left cursor-pointer border-none ${
                  i === activeIndex ? "bg-[rgba(0,0,0,0.05)]" : "bg-transparent"
                }`}
              >
                <Icon size={15} className="text-[var(--text-muted)] shrink-0 mt-[2px]" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    <Highlighted text={result.title} query={query} />
                  </div>
                  <div className="text-[11px] font-medium text-[var(--text-muted)] mt-[2px] line-clamp-2">
                    <Highlighted text={result.snippet} query={query} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
