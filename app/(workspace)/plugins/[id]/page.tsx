import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getPlugin } from "@/lib/plugins/registry";
import { PluginPage } from "@/app/components/plugins/PluginPage";
import { LEGACY_SKILLS, WRITING_ASSIST } from "@/lib/plugins/writing-assist/switches";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getPlugin(id)?.manifest.name };
}

export default async function PluginRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const { id } = await params;
  // A plugin that is now a skill: its page is the writing assist's.
  if (id in LEGACY_SKILLS) {
    const { run } = await searchParams;
    redirect(`/plugins/${WRITING_ASSIST}${run ? `?run=${encodeURIComponent(run)}` : ""}`);
  }
  const name = getPlugin(id)?.manifest.name;
  if (!name) notFound();
  return (
    // useSearchParams (?run=<id>) needs a Suspense boundary.
    <Suspense>
      <PluginPage id={id} name={name} />
    </Suspense>
  );
}
