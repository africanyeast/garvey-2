"use client";

/**
 * The "will land here" line for any plain-React reorderable list (not a
 * BlockNote document, which already gets ProseMirror's own drop cursor for
 * free). Color is BlockNote's own `DropCursorExtension` default
 * (`extensions-*.js`: `color: t.dropCursor?.color ?? "#ddeeff"`) — a pale
 * blue that has nothing to do with this app's orange `--text-link`/brand
 * color, so it's hardcoded here rather than borrowed from a token, on
 * purpose: the goal is to match the editor's own native drag feedback
 * exactly, not the app's accent color.
 */
export function DropIndicatorLine() {
  return <div className="h-[3px] rounded-full bg-[#ddeeff] my-[3px]" />;
}
