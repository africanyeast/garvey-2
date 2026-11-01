import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSkill, type Skill } from "./skill";
import { OUTPUTS } from "./outputs";

/** Where the built-in skills are: in the repo, read from disk on the
 * server (the app runs from the repo, as `next start`). */
const BUILT_IN_DIR = path.join(process.cwd(), "lib/plugins/writing-assist/skills");

export interface SkillProblem {
  file: string;
  error: string;
}

/** Each `.md` in `dir` as a skill, and each that can't be one with why. A
 * skill whose output needs named parts it lacks is refused here too. */
export function readSkillDir(dir: string): { skills: Skill[]; problems: SkillProblem[] } {
  const skills: Skill[] = [];
  const problems: SkillProblem[] = [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { skills, problems };
  }
  for (const file of files) {
    const parsed = parseSkill(readFileSync(path.join(dir, file), "utf-8"));
    if ("error" in parsed) {
      problems.push({ file, error: parsed.error });
      continue;
    }
    const missing = (OUTPUTS[parsed.skill.output].parts ?? []).filter((p) => !parsed.skill.parts[p]);
    if (missing.length) {
      problems.push({ file, error: `a ${parsed.skill.output} skill needs these parts: ${missing.map((p) => `<!-- with: ${p} -->`).join(", ")}` });
      continue;
    }
    if (skills.some((s) => s.id === parsed.skill.id)) {
      problems.push({ file, error: `another skill already has the id "${parsed.skill.id}"` });
      continue;
    }
    skills.push(parsed.skill);
  }
  return { skills, problems };
}

let builtIns: Skill[] | undefined;

/** The skills that ship with the app. A broken one is a bug in the app, so
 * it throws rather than quietly going missing. */
export function builtInSkills(): Skill[] {
  if (builtIns) return builtIns;
  const { skills, problems } = readSkillDir(BUILT_IN_DIR);
  if (problems.length) throw new Error(`Broken built-in skills: ${problems.map((p) => `${p.file}: ${p.error}`).join("; ")}`);
  builtIns = skills;
  return skills;
}

export function getSkill(id: string): Skill | undefined {
  return builtInSkills().find((s) => s.id === id);
}
