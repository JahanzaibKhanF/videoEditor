import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/getCurrentUser";

// GET /api/projects/[id] — load one project (must belong to the
// signed-in user) for the editor to resume from.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const rows = await sql`
      SELECT id, name, aspect_ratio, thumbnail_url, project_json, updated_at, created_at
      FROM projects
      WHERE id = ${params.id} AND user_id = ${user.id}
    `;
    const project = rows[0];
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    await sql`
      INSERT INTO project_history (user_id, project_id, event)
      VALUES (${user.id}, ${project.id}, 'opened')
    `;

    return NextResponse.json({ project });
  } catch (err) {
    console.error("[api/projects/[id] GET]", err);
    return NextResponse.json({ error: "Could not load project." }, { status: 500 });
  }
}

// PUT /api/projects/[id] — save/autosave the project's current state.
// Body: { name?, aspectRatio?, thumbnailUrl?, projectJson }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = await req.json();

    // Confirm ownership before writing.
    const existing = await sql`SELECT id FROM projects WHERE id = ${params.id} AND user_id = ${user.id}`;
    if (existing.length === 0) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    const name = body.name !== undefined ? String(body.name).slice(0, 200) : undefined;
    const aspectRatio = body.aspectRatio !== undefined ? String(body.aspectRatio) : undefined;
    const thumbnailUrl = body.thumbnailUrl !== undefined ? String(body.thumbnailUrl) : undefined;
    const projectJson = body.projectJson !== undefined ? JSON.stringify(body.projectJson) : undefined;

    const [project] = await sql`
      UPDATE projects SET
        name          = COALESCE(${name}, name),
        aspect_ratio  = COALESCE(${aspectRatio}, aspect_ratio),
        thumbnail_url = COALESCE(${thumbnailUrl}, thumbnail_url),
        project_json  = COALESCE(${projectJson}::jsonb, project_json),
        updated_at    = now()
      WHERE id = ${params.id} AND user_id = ${user.id}
      RETURNING id, name, aspect_ratio, thumbnail_url, updated_at, created_at
    `;

    return NextResponse.json({ project });
  } catch (err) {
    console.error("[api/projects/[id] PUT]", err);
    return NextResponse.json({ error: "Could not save project." }, { status: 500 });
  }
}

// DELETE /api/projects/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const result = await sql`
      DELETE FROM projects WHERE id = ${params.id} AND user_id = ${user.id} RETURNING id
    `;
    if (result.length === 0) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/projects/[id] DELETE]", err);
    return NextResponse.json({ error: "Could not delete project." }, { status: 500 });
  }
}
