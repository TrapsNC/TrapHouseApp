
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";

function reply(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function requireAdmin(request: Request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !url || !key) {
    return null;
  }

  const authClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return null;
  }

  const db = adminDatabase();

  const { data: admin, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !admin) {
    return null;
  }

  return db;
}

async function cleanupExpiredIds() {
  try {
    const db = adminDatabase();

    const cutoff = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    // Process a limited batch per run.
    const { data: uploads, error: lookupError } =
      await db
        .from("pending_id_uploads")
        .select("request_id,storage_path,created_at")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(50);

    if (lookupError) {
      throw new Error("Expired ID lookup failed.");
    }

    let deletedFiles = 0;
    let deletedRows = 0;
    let failed = 0;

    for (const upload of uploads ?? []) {
      try {
        if (!upload.storage_path) {
          failed++;
          continue;
        }

        // Do not remove an image if an order
        // already references that exact image.
        const { data: linkedOrder, error: linkedError } =
          await db
            .from("orders")
            .select("id")
            .eq("id_document_path", upload.storage_path)
            .limit(1)
            .maybeSingle();

        if (linkedError) {
          failed++;
          continue;
        }

        if (linkedOrder) {
          // Leave linked images untouched.
          failed++;
          continue;
        }

        const { error: storageError } =
          await db.storage
            .from("age-verification-ids")
            .remove([upload.storage_path]);

        if (storageError) {
          failed++;
          continue;
        }

        deletedFiles++;

        // Match the original row and path so
        // a newer replacement is not deleted.
        const { data: removed, error: rowError } =
          await db
            .from("pending_id_uploads")
            .delete()
            .eq("request_id", upload.request_id)
            .eq("storage_path", upload.storage_path)
            .eq("created_at", upload.created_at)
            .select("request_id");

        if (rowError) {
          failed++;
          continue;
        }

        deletedRows += removed?.length ?? 0;
      } catch {
        failed++;
      }
    }

    return reply(
      {
        success: failed === 0,
        checked: uploads?.length ?? 0,
        deletedFiles,
        deletedRows,
        failed,
      },
      failed > 0 ? 503 : 200
    );
  } catch (error) {
    console.error(
      "ID CLEANUP ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return reply(
      { error: "ID cleanup failed." },
      503
    );
  }
}

// Manual cleanup: authorized admin only.
export async function POST(request: Request) {
  const db = await requireAdmin(request);

  if (!db) {
    return reply({ error: "Unauthorized." }, 401);
  }

  return cleanupExpiredIds();
}

// Automatic Vercel Cron cleanup.
// Vercel sends Authorization: Bearer CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    request.headers.get("authorization") !==
      `Bearer ${secret}`
  ) {
    return reply({ error: "Unauthorized." }, 401);
  }

  return cleanupExpiredIds();
}
