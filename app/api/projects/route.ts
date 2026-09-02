import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/getCurrentUser";

// Free-tier project cap. Raise (or make per-plan) once there's an actual
// paid tier — for now this is just a soft, clearly-explained limit rather
// than a real billing gate. Also surfaced to the UI via the GET below so the
// profile menu can show "2 / 3 projects".
const FREE_PROJECT_LIMIT = 3;

// GET /api/projects — list the current user's saved projects, most
// recently updated first. Used to populate a "Recent projects" list.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const rows = await sql`
      SELECT id, name, aspect_ratio, thumbnail_url, updated_at, created_at
      FROM projects
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
      LIMIT 50
    `;
    return NextResponse.json({ projects: rows, limit: FREE_PROJECT_LIMIT });
  } catch (err) {
    console.error("[api/projects GET]", err);
    return NextResponse.json({ error: "Could not load projects." }, { status: 500 });
  }
}

// POST /api/projects — create a new project row and return its id.
// The editor calls this once, then PUTs to /api/projects/[id] for
// every subsequent save (autosave, manual save, etc).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM projects WHERE user_id = ${user.id}`;
    if ((count as number) >= FREE_PROJECT_LIMIT) {
      return NextResponse.json({
        error: `You've reached the ${FREE_PROJECT_LIMIT}-project limit for now — delete an old project to make room. (Higher limits are coming for Pro accounts.)`,
      }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name ?? "Untitled project").slice(0, 200);
    const aspectRatio = String(body.aspectRatio ?? "16:9");
    const projectJson = body.projectJson ?? {};

    const [project] = await sql`
      INSERT INTO projects (user_id, name, aspect_ratio, project_json)
      VALUES (${user.id}, ${name}, ${aspectRatio}, ${JSON.stringify(projectJson)}::jsonb)
      RETURNING id, name, aspect_ratio, thumbnail_url, updated_at, created_at
    `;

    await sql`
      INSERT INTO project_history (user_id, project_id, event)
      VALUES (${user.id}, ${project.id}, 'created')
    `;

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("[api/projects POST]", err);
    return NextResponse.json({ error: "Could not create project." }, { status: 500 });
  }
}
