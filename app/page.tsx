import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProject } from "@/lib/vault/project";

export default async function Home() {
  const lastPath = (await cookies()).get("lastPath")?.value;

  // Only ever defaults back to a project or the Inbox — Style and Trash are
  // occasional utility screens, not somewhere a returning visitor should
  // land by default, so either of those (or anything else unrecognized)
  // falls back to the Inbox same as having no cookie at all.
  if (lastPath && lastPath !== "/inbox" && (await isProjectPath(lastPath))) {
    redirect(lastPath);
  }
  redirect("/inbox");
}

/** `LastPathTracker` writes whatever pathname was open, verbatim — a `/<slug>`
 * project route needs a live check, since the project it names may have
 * since been deleted or trashed, and landing on a 404 would be worse than
 * just falling back to the Inbox. */
async function isProjectPath(path: string): Promise<boolean> {
  const slug = path.slice(1);
  if (!slug || slug.includes("/")) return false;
  return !!(await getProject(slug));
}
