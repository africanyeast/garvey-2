const SHORTCUT_GROUPS = [
  {
    label: "Formatting",
    items: [
      { label: "Bold", keys: "⌘B" },
      { label: "Italic", keys: "⌘I" },
      { label: "Underline", keys: "⌘U" },
      { label: "Strikethrough", keys: "⌘⇧S" },
    ],
  },
  {
    label: "Blocks",
    items: [
      { label: "Heading 1", keys: "⌘⌥1" },
      { label: "Heading 2", keys: "⌘⌥2" },
      { label: "Heading 3", keys: "⌘⌥3" },
      { label: "Paragraph", keys: "⌘⌥0" },
      { label: "Numbered list", keys: "⌘⇧7" },
      { label: "Bullet list", keys: "⌘⇧8" },
      { label: "Check list", keys: "⌘⇧9" },
    ],
  },
  {
    label: "Document",
    items: [
      { label: "Preview / Edit", keys: "⌃P" },
      { label: "Copy", keys: "⌃C" },
      { label: "Duplicate", keys: "⌃D" },
    ],
  },
];

export function ShortcutsPanel() {
  return (
    <div className="max-w-[900px] w-full mx-auto py-[32px] px-[28px]">
      <h1 className="font-serif text-3xl font-semibold text-[var(--text-primary)] mt-[0] mx-[0] mb-[6px]">Shortcuts</h1>
      <p className="text-sm font-normal text-[var(--text-secondary)] mt-[0] mx-[0] mb-[40px]">
        Every keyboard shortcut available while writing.
      </p>

      <div className="flex flex-col gap-[36px]">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="text-sm font-bold text-[var(--text-primary)] mb-[10px]">{group.label}</div>
            <div className="flex flex-col gap-[8px]">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-[10px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md py-[13px] px-[14px]"
                >
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">{item.label}</span>
                  <span className="text-xs font-semibold text-[var(--text-secondary)] bg-neutral-100 rounded-full py-[3px] px-[10px]">
                    {item.keys}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
