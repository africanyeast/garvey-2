import type { Metadata } from "next";
import { TrashScreen } from "@/app/components/trash/TrashScreen";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return <TrashScreen />;
}
