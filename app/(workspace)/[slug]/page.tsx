import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/vault/project";
import { getDraft } from "@/lib/vault/draft";
import { getOSConfig } from "@/lib/vault/config";
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
  const [initialDocument, config] = await Promise.all([getDraft(slug), getOSConfig()]);
  // `?section=` is read on the client: it picks which page of the writing
  // shows, and changes without a server round trip.
  const { block } = await searchParams;

  return (
    <DraftScreen
      project={project}
      initialDocument={initialDocument}
      enabledPlugins={config.plugins}
      skillsOff={config.skills_off ?? []}
      openBlockId={block}
    />
  );
}
