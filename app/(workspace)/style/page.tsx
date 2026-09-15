import { getStyle } from "@/lib/vault/style";
import { StylePanel } from "@/app/components/style/StylePanel";

export default async function StylePage() {
  const style = await getStyle();
  return <StylePanel style={style} />;
}
