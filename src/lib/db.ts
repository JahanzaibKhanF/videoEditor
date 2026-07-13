import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

// Lazily construct the Neon client on first real query instead of at
// module-import time. `next build` imports every route module to collect
// page data, so an eager `neon(...)` call here would throw during build
// whenever DATABASE_URL is missing/placeholder (e.g. in this sandbox,
// or before the env var is configured on Netlify).
function getClient(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (dev) or your Netlify environment variables (prod)."
    );
  }
  cached = neon(connectionString);
  return cached;
}

// Proxy so existing call sites can keep using `sql\`...\`` unchanged —
// the underlying tagged-template function is only resolved (and
// DATABASE_URL only validated) the moment a query actually runs.
export const sql = ((...args: Parameters<NeonQueryFunction<false, false>>) =>
  getClient()(...args)) as NeonQueryFunction<false, false>;

