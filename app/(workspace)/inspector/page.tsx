import { redirect } from "next/navigation";

// The inspector is now each plugin's own page; old links (?run=<id>) land
// on tab completion's.
export default async function InspectorRedirect({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  redirect(`/plugins/tab-completion${run ? `?run=${encodeURIComponent(run)}` : ""}`);
}
