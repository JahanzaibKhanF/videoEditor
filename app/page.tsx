import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "ClipFlow — Free Browser-Based Video Editor with Templates & Chroma Key",
  description:
    "Edit video entirely in your browser — ready-made templates, real keyframe animation, manual chroma key, shapes, and instant export. No uploads, no installs, free to start.",
};

export default function Home() {
  return <LandingPage />;
}
