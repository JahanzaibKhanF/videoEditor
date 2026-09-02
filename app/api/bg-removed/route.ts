import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { signUpload, cloudinaryDelete } from "@/lib/cloudinary";
import { serverErrorResponse } from "@/lib/apiError";

// The transparent WebM clips from AI background removal are a few MB each —
// too big for a serverless request body on most hosts. So this route never
// touches the file: POST hands back a signed upload ticket and the browser
// uploads straight to Cloudinary; DELETE cleans assets up by public_id.
export const runtime = "nodejs";

// POST /api/bg-removed — returns a signed ticket for a direct browser →
// Cloudinary upload, scoped to this user's own folder.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const signed = signUpload(`clipflow/bg-removed/${user.id}`);
  if (!signed) {
    // Background removal still works — it just won't sync across devices.
    return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 503 });
  }
  return NextResponse.json(signed);
}

// DELETE /api/bg-removed — body { publicIds: string[] }. Best-effort cleanup
// of assets whose clip/project was removed.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const publicIds: string[] = Array.isArray(body.publicIds)
      ? body.publicIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    // Only ever touch this user's own folder.
    const owned = publicIds.filter((id) => id.startsWith(`clipflow/bg-removed/${user.id}/`));
    await cloudinaryDelete(owned, "video");
    return NextResponse.json({ ok: true, deleted: owned.length });
  } catch (err) {
    console.error("[api/bg-removed DELETE]", err);
    return serverErrorResponse("Could not clean up synced clips.", err);
  }
}
