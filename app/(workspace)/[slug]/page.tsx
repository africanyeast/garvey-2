import { notFound } from "next/navigation";
import { getProject } from "@/lib/vault/project";
import { getDraft } from "@/lib/vault/draft";
import { DraftScreen } from "@/app/components/draft/DraftScreen";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const initialDocument = await getDraft(slug);

  return <DraftScreen project={project} initialDocument={initialDocument} />;
}
