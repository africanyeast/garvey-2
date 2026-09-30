import { Suspense } from "react";
import { InspectorScreen } from "@/app/components/inspector/InspectorScreen";

export default function InspectorPage() {
  // useSearchParams (?run=<id>) needs a Suspense boundary.
  return (
    <Suspense>
      <InspectorScreen />
    </Suspense>
  );
}
