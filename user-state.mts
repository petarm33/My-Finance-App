import type { Config } from "@netlify/functions";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userState } from "../../db/schema.js";

const ID_PATTERN = /^[a-f0-9]{64}$/;
const MAX_STATE_BYTES = 500_000;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "PUT") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const syncId = req.headers.get("x-sync-id")?.trim().toLowerCase();
  if (!syncId || !ID_PATTERN.test(syncId)) {
    return jsonResponse({ error: "A valid sync ID is required" }, 400);
  }

  try {
    if (req.method === "GET") {
      const [record] = await db
        .select({ state: userState.state, revision: userState.revision, updatedAt: userState.updatedAt })
        .from(userState)
        .where(eq(userState.id, syncId))
        .limit(1);

      if (!record) {
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      }

      return jsonResponse(record);
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_STATE_BYTES) {
      return jsonResponse({ error: "State payload is too large" }, 413);
    }

    let body: { state?: unknown; baseRevision?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return jsonResponse({ error: "A valid state object is required" }, 400);
    }

    if (body.baseRevision !== null && (!Number.isInteger(body.baseRevision) || Number(body.baseRevision) < 1)) {
      return jsonResponse({ error: "A valid base revision is required" }, 400);
    }

    const baseRevision = body.baseRevision === null ? null : Number(body.baseRevision);
    const updatedAt = new Date();

    const [record] = baseRevision === null
      ? await db
          .insert(userState)
          .values({ id: syncId, state: body.state, revision: 1, updatedAt })
          .onConflictDoNothing()
          .returning({ revision: userState.revision, updatedAt: userState.updatedAt })
      : await db
          .update(userState)
          .set({
            state: body.state,
            revision: sql`${userState.revision} + 1`,
            updatedAt,
          })
          .where(and(eq(userState.id, syncId), eq(userState.revision, baseRevision)))
          .returning({ revision: userState.revision, updatedAt: userState.updatedAt });

    if (!record) {
      const [currentRecord] = await db
        .select({ state: userState.state, revision: userState.revision, updatedAt: userState.updatedAt })
        .from(userState)
        .where(eq(userState.id, syncId))
        .limit(1);

      return jsonResponse({ error: "State changed on another device", ...currentRecord }, 409);
    }

    return jsonResponse(record);
  } catch {
    return jsonResponse({ error: "State synchronization is temporarily unavailable" }, 503);
  }
};

export const config: Config = {
  path: "/api/user-state",
};
