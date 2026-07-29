import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isValidAdminSession } from "@/lib/adminAuth";
import { serverErrorResponse } from "@/lib/apiError";

export async function POST(req: NextRequest) {
  try {
    if (!isValidAdminSession(req)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({
        error: "Cloudinary isn't configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      }, { status: 500 });
    }

    const incoming = await req.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please choose an image file." }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "clipflow/templates";

    // Cloudinary's signed-upload scheme: sort every param (except file,
    // api_key, and signature itself) alphabetically, join as
    // "key=value&key=value", append the API secret, then SHA-1 it.
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(paramsToSign).digest("hex");

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("api_key", apiKey);
    uploadForm.append("timestamp", String(timestamp));
    uploadForm.append("folder", folder);
    uploadForm.append("signature", signature);

    const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: uploadForm,
    });
    const data = await cloudRes.json();

    if (!cloudRes.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Cloudinary upload failed." }, { status: 502 });
    }
    if (!data.secure_url) {
      return NextResponse.json({ error: "Cloudinary didn't return an image URL." }, { status: 502 });
    }

    return NextResponse.json({ url: data.secure_url as string });
  } catch (err) {
    console.error("[api/admin/upload-image]", err);
    return serverErrorResponse("Image upload failed.", err);
  }
}
