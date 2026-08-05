import { Suspense } from "react";
import ClipFlowApp from "@/components/ClipFlowApp";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ClipFlowApp />
    </Suspense>
  );
}
