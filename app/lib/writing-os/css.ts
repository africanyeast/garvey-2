import type { CSSProperties } from "react";

/**
 * Tagged template that turns a CSS declaration string (the same shape used
 * throughout the Writing OS design source, e.g. "display:flex;gap:8px;")
 * into a React CSSProperties object. Lets style blocks be transcribed
 * near-verbatim from the design for full visual fidelity.
 */
export function css(
  strings: TemplateStringsArray,
  ...values: Array<string | number | undefined | false>
): CSSProperties {
  const raw = strings.reduce(
    (acc, s, i) => acc + s + (values[i] ?? ""),
    ""
  );
  const style: Record<string, string> = {};
  raw.split(";").forEach((rule) => {
    const idx = rule.indexOf(":");
    if (idx === -1) return;
    const prop = rule.slice(0, idx).trim();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[camel] = val;
  });
  return style as CSSProperties;
}
