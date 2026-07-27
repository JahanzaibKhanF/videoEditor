import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

let cached: NeonQueryFunction<false, false> | null = null;

// Lazily construct the Neon client on first real query instead of at
// module-import time. `next build` imports every route module to collect
// page data, so an eager `neon(...)` call here would throw during build
// whenever DATABASE_URL is missing/placeholder (e.g. in this sandbox,
// or before the env var is configured on Netlify).
function getRawClient(): NeonQueryFunction<false, false> {
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

// ── Auto-migration ──────────────────────────────────────────────────────
// Checked once per server process (dev server run, or serverless function
// cold start): if the core `users` table doesn't exist yet, run
// db/schema.sql automatically instead of requiring a manual paste into
// Neon's SQL Editor. `CREATE TABLE IF NOT EXISTS` throughout schema.sql
// makes this safe to run against a database that already has SOME but not
// all tables too, not just a completely empty one.
let schemaEnsured = false;
let schemaEnsuring: Promise<void> | null = null;

async function ensureSchemaOnce(client: NeonQueryFunction<false, false>): Promise<void> {
  if (schemaEnsured) return;
  if (schemaEnsuring) return schemaEnsuring;

  schemaEnsuring = (async () => {
    const rows = await client("SELECT to_regclass('public.users') AS tbl");
    const alreadyExists = (rows as Array<{ tbl: string | null }>)[0]?.tbl;
    if (alreadyExists) {
      schemaEnsured = true;
      return;
    }

    console.log("[db] Core tables not found — running db/schema.sql automatically...");
    const schemaPath = path.join(process.cwd(), "db", "schema.sql");
    const raw = fs.readFileSync(schemaPath, "utf-8");
    // Not a general-purpose SQL parser — schema.sql is plain DDL
    // (CREATE TABLE/INDEX) with no semicolons inside string literals or
    // function bodies, so stripping line comments and splitting on `;`
    // is safe here specifically.
    const statements = raw.replace(/--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      await client(statement);
    }
    console.log(`[db] Auto-migration complete — ran ${statements.length} schema statements.`);
    schemaEnsured = true;
  })();

  try {
    await schemaEnsuring;
  } finally {
    schemaEnsuring = null;
  }
}

// Proxy so existing call sites can keep using `sql\`...\`` unchanged — the
// underlying tagged-template function is only resolved (and DATABASE_URL
// only validated, and schema only auto-created) the moment a query
// actually runs.
export const sql = (async (...args: Parameters<NeonQueryFunction<false, false>>) => {
  const client = getRawClient();
  await ensureSchemaOnce(client);
  return (client as (...a: typeof args) => unknown)(...args);
}) as NeonQueryFunction<false, false>;

