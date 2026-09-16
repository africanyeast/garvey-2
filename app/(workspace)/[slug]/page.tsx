import { notFound } from "next/navigation";
import { getProject } from "@/lib/vault/project";
import { getDraft } from "@/lib/vault/draft";
import { DraftScreen } from "@/app/components/draft/DraftScreen";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string; section?: string; block?: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const initialDocument = await getDraft(slug);
  const { new: isNew, section, block } = await searchParams;

  return (
    <DraftScreen
      project={project}
      initialDocument={initialDocument}
      openBriefByDefault={isNew === "1"}
      openSectionId={section}
      openBlockId={block}
    />
  );
}
