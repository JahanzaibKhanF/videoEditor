import ClipFlowApp from "@/components/app/ClipFlowApp";

// This page reads `?project=<id>` via useSearchParams() and depends on a
// live session (auth cookie) — it's inherently per-request, not something
// that should ever be statically pre-built. Statically prerendering it was
// producing a "BAILOUT_TO_CLIENT_SIDE_RENDERING" placeholder in the served
// HTML (visible directly in the response body) that the client then failed
// to reconcile cleanly on hydrate — the actual cause of the React #418 /
// #423 / #329 errors on load. Forcing dynamic rendering means the server
// always renders the real tree per-request instead of shipping that
// placeholder.
export const dynamic = "force-dynamic";

export default function Home() {
  return <ClipFlowApp />;
}
