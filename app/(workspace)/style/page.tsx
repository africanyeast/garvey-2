import type { Metadata } from "next";
import { getStyle } from "@/lib/vault/style";
import { StylePanel } from "@/app/components/style/StylePanel";

export const metadata: Metadata = { title: "Style" };

export default async function StylePage() {
  const style = await getStyle();
  return <StylePanel style={style} />;
}
