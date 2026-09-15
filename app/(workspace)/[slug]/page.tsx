import { notFound } from "next/navigation";
import { projectList } from "@/lib/data";
import { DraftScreen } from "@/app/components/draft/DraftScreen";

export function generateStaticParams() {
  return projectList.map((p) => ({ slug: p.slug }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = projectList.find((p) => p.slug === slug);
  if (!project) notFound();

  return <DraftScreen title={project.title} />;
}
