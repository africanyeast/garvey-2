import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/vault/project";
import { getDraft } from "@/lib/vault/draft";
import { DraftScreen } from "@/app/components/draft/DraftScreen";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await getProject(slug))?.title || "Untitled" };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string; block?: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const initialDocument = await getDraft(slug);
  const { section, block } = await searchParams;

  return (
    <DraftScreen
      project={project}
      initialDocument={initialDocument}
      openBlockId={block}
      scrollToSectionId={section}
    />
  );
}
