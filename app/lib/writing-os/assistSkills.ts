"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PLUGINS_CHANGED } from "./writingAssist";

/** Which writing-assist skills are on for a writing, by id (GET
 * /api/plugins/writing-assist/skills). */
type SkillsOn = Record<string, boolean>;

// One answer per writing, shared by every menu that asks, fetched again
// when a plugin switch changes or the window regains focus (a switch may
// have changed on the plugins page meanwhile).
const answers = new Map<string, SkillsOn>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

function load(projectId: string) {
  if (inFlight.has(projectId)) return;
  inFlight.add(projectId);
  fetch(`/api/plugins/writing-assist/skills?project=${encodeURIComponent(projectId)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { on: SkillsOn } | null) => {
      if (!data) return;
      answers.set(projectId, data.on);
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => inFlight.delete(projectId));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether to offer a skill in a writing's menus: on, or not known yet (the
 * server still refuses a skill that is off). */
export function useSkillOffered(projectId: string | null | undefined): (skill: string) => boolean {
  const on = useSyncExternalStore(
    subscribe,
    () => (projectId ? answers.get(projectId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (!projectId) return;
    load(projectId);
    const again = () => load(projectId);
    window.addEventListener(PLUGINS_CHANGED, again);
    window.addEventListener("focus", again);
    return () => {
      window.removeEventListener(PLUGINS_CHANGED, again);
      window.removeEventListener("focus", again);
    };
  }, [projectId]);
  return (skill) => on?.[skill] ?? true;
}
