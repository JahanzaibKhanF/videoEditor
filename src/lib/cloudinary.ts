import crypto from "crypto";

/**
 * Minimal Cloudinary signed upload/delete helpers.
 *
 * Signed scheme: take every param that goes into the request EXCEPT `file`,
 * `cloud_name`, `api_key` and `resource_type`, sort them alphabetically,
 * join as `key=value&key=value`, append the API secret, SHA-1 it.
 */

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function sign(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export interface CloudinarySignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/**
 * Params for a signed, direct-from-browser upload. The file never passes
 * through our server (serverless request-body limits would reject a
 * multi-MB clip) — the browser POSTs it straight to Cloudinary with this
 * signature. `folder` is fixed server-side (includes the user id) so a
 * client can't upload outside its own namespace.
 */
export function signUpload(folder: string): CloudinarySignedUpload | null {
  const cfg = getCloudinaryConfig();
  if (!cfg) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ folder, timestamp }, cfg.apiSecret);
  return { cloudName: cfg.cloudName, apiKey: cfg.apiKey, timestamp, folder, signature };
}

/**
 * Best-effort delete of uploaded assets. Cloudinary's destroy endpoint
 * takes one public_id at a time; failures are logged but never thrown —
 * an orphaned asset is a tidiness problem, not a correctness one.
 */
export async function cloudinaryDelete(
  publicIds: string[],
  resourceType: "image" | "video",
): Promise<void> {
  const cfg = getCloudinaryConfig();
  if (!cfg || publicIds.length === 0) return;

  await Promise.all(
    publicIds.map(async (publicId) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = sign({ public_id: publicId, timestamp }, cfg.apiSecret);
        const form = new FormData();
        form.append("public_id", publicId);
        form.append("api_key", cfg.apiKey);
        form.append("timestamp", String(timestamp));
        form.append("signature", signature);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/destroy`,
          { method: "POST", body: form },
        );
        if (!res.ok) {
          console.warn("[cloudinary] destroy failed for", publicId, await res.text().catch(() => ""));
        }
      } catch (err) {
        console.warn("[cloudinary] destroy error for", publicId, err);
      }
    }),
  );
}
