import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPlugin } from "@/lib/plugins/registry";
import { PluginPage } from "@/app/components/plugins/PluginPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getPlugin(id)?.manifest.name };
}

export default async function PluginRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plugin = getPlugin(id);
  if (!plugin) notFound();
  return (
    // useSearchParams (?run=<id>) needs a Suspense boundary.
    <Suspense>
      <PluginPage id={id} name={plugin.manifest.name} />
    </Suspense>
  );
}
