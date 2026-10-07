import { enforceRateLimit } from "@/lib/rate-limit";
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


function isDryRun() {
  return process.env.ID_CLEANUP_DRY_RUN === "true";
}
function getRetentionDays() {
  const raw = Number(process.env.ID_RETENTION_DAYS || "30");

  if (!Number.isFinite(raw)) {
    return 30;
  }

  return Math.min(
    365,
    Math.max(1, Math.floor(raw))
  );
}

async function cleanupExpiredIds() {
  try {
    const db = adminDatabase();
    const dryRun = isDryRun();

    /*
     * PART 1
     * Delete abandoned uploads older than 1 hour
     * only when no order references the image.
     */
    const abandonedCutoff = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { data: uploads, error: lookupError } =
      await db
        .from("pending_id_uploads")
        .select(
          "request_id,storage_path,created_at"
        )
        .lt("created_at", abandonedCutoff)
        .order("created_at", {
          ascending: true,
        })
        .limit(50);

    if (lookupError) {
      throw new Error(
        "Expired pending ID lookup failed."
      );
    }

    const abandonedChecked = uploads?.length ?? 0;
    let abandonedDeletedFiles = 0;
    let abandonedDeletedRows = 0;
    let abandonedSkippedLinked = 0;
    let abandonedFailed = 0;

    for (const upload of uploads ?? []) {
      try {
        if (!upload.storage_path) {
          abandonedFailed++;
          continue;
        }

        const {
          data: linkedOrder,
          error: linkedError,
        } = await db
          .from("orders")
          .select("id")
          .eq(
            "id_document_path",
            upload.storage_path
          )
          .limit(1)
          .maybeSingle();

        if (linkedError) {
          abandonedFailed++;
          continue;
        }

        if (linkedOrder) {
          abandonedSkippedLinked++;
          continue;
        }

        if (!dryRun) {
          const { error: storageError } =
            await db.storage
              .from("age-verification-ids")
              .remove([upload.storage_path]);

          if (storageError) {
            abandonedFailed++;
            continue;
          }

          abandonedDeletedFiles++;
        }

        if (!dryRun) {
          const {
            data: removed,
            error: rowError,
          } = await db
            .from("pending_id_uploads")
            .delete()
            .eq(
              "request_id",
              upload.request_id
            )
            .eq(
              "storage_path",
              upload.storage_path
            )
            .eq(
              "created_at",
              upload.created_at
            )
            .select("request_id");

          if (rowError) {
            abandonedFailed++;
            continue;
          }

          abandonedDeletedRows +=
            removed?.length ?? 0;
        }
      } catch {
        abandonedFailed++;
      }
    }

    /*
     * PART 2
     * Delete IDs attached to orders after the
     * ID has already been reviewed and the
     * retention period has expired.
     *
     * Review status is preserved.
     * Only the private image is removed.
     */
    const retentionDays = getRetentionDays();

    const reviewedCutoff = new Date(
      Date.now() -
        retentionDays *
          24 *
          60 *
          60 *
          1000
    ).toISOString();

    const {
      data: reviewedOrders,
      error: reviewedLookupError,
    } = await db
      .from("orders")
      .select(
        "id,id_document_path,id_review_status,id_reviewed_at"
      )
      .in(
        "id_review_status",
        ["approved", "rejected"]
      )
      .not(
        "id_document_path",
        "is",
        null
      )
      .not(
        "id_reviewed_at",
        "is",
        null
      )
      .lt(
        "id_reviewed_at",
        reviewedCutoff
      )
      .order("id_reviewed_at", {
        ascending: true,
      })
      .limit(50);

    if (reviewedLookupError) {
      throw new Error(
        "Reviewed ID lookup failed."
      );
    }

    const reviewedChecked =
      reviewedOrders?.length ?? 0;

    let reviewedDeletedFiles = 0;
    let reviewedClearedOrders = 0;
    let reviewedDeletedPendingRows = 0;
    let reviewedFailed = 0;

    for (const order of reviewedOrders ?? []) {
      try {
        if (
          !order.id ||
          !order.id_document_path
        ) {
          reviewedFailed++;
          continue;
        }

        const storagePath =
          order.id_document_path;

        /*
         * Remove private image first.
         */
        if (!dryRun) {
          const { error: storageError } =
            await db.storage
              .from("age-verification-ids")
              .remove([storagePath]);

          if (storageError) {
            reviewedFailed++;
            continue;
          }

          reviewedDeletedFiles++;
        }

        /*
         * Clear only if the order still points
         * at the same image. This prevents
         * clearing a newer replacement upload.
         */
        if (!dryRun) {
          const {
            data: cleared,
            error: clearError,
          } = await db
            .from("orders")
            .update({
              id_document_path: null,
            })
            .eq("id", order.id)
            .eq(
              "id_document_path",
              storagePath
            )
            .select("id");

          if (clearError) {
            reviewedFailed++;
            continue;
          }

          reviewedClearedOrders +=
            cleared?.length ?? 0;
        }

        /*
         * Remove any leftover pending record
         * for the same private image.
         */
        if (!dryRun) {
          const {
            data: pendingRemoved,
            error: pendingDeleteError,
          } = await db
            .from("pending_id_uploads")
            .delete()
            .eq(
              "storage_path",
              storagePath
            )
            .select("request_id");

          if (pendingDeleteError) {
            reviewedFailed++;
            continue;
          }

          reviewedDeletedPendingRows +=
            pendingRemoved?.length ?? 0;
        }
      } catch {
        reviewedFailed++;
      }
    }

    const failed =
      abandonedFailed + reviewedFailed;

    return reply(
      {
        success: failed === 0,
        dryRun,

        abandoned: {
          cutoff: abandonedCutoff,
          checked: abandonedChecked,
          deletedFiles:
            abandonedDeletedFiles,
          deletedRows:
            abandonedDeletedRows,
          skippedLinked:
            abandonedSkippedLinked,
          failed: abandonedFailed,
        },

        reviewed: {
          retentionDays,
          cutoff: reviewedCutoff,
          checked: reviewedChecked,
          deletedFiles:
            reviewedDeletedFiles,
          clearedOrders:
            reviewedClearedOrders,
          deletedPendingRows:
            reviewedDeletedPendingRows,
          failed: reviewedFailed,
        },

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
      {
        error: "ID cleanup failed.",
      },
      503
    );
  }
}

/*
 * Manual cleanup:
 * authorized admin only.
 */
export async function POST(
  request: Request
) {
  const limited = await enforceRateLimit(request, "adminCleanup");
  if (limited) return limited;
  const db = await requireAdmin(request);

  if (!db) {
    return reply(
      { error: "Unauthorized." },
      401
    );
  }

  return cleanupExpiredIds();
}

/*
 * Automatic Vercel Cron cleanup.
 * Vercel sends:
 * Authorization: Bearer CRON_SECRET
 */
export async function GET(
  request: Request
) {
  const authorization =
    request.headers.get("authorization");

  const secrets = [
    process.env.CRON_SECRET,
    process.env.ID_CLEANUP_CRON_SECRET,
  ].filter(
    (value): value is string =>
      Boolean(value)
  );

  const authorized = secrets.some(
    (secret) =>
      authorization === `Bearer ${secret}`
  );

  if (!authorized) {
    if (process.env.NODE_ENV === "development") {
      const sentToken =
        authorization?.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";

      return reply(
        {
          error: "Unauthorized.",
          debug: {
            sentLength: sentToken.length,
            cronSecretLoaded: Boolean(
              process.env.CRON_SECRET
            ),
            cronSecretLength:
              process.env.CRON_SECRET?.length ?? 0,
            cleanupSecretLoaded: Boolean(
              process.env.ID_CLEANUP_CRON_SECRET
            ),
            cleanupSecretLength:
              process.env.ID_CLEANUP_CRON_SECRET?.length ?? 0,
          },
        },
        401
      );
    }

    return reply(
      { error: "Unauthorized." },
      401
    );
  }

  return cleanupExpiredIds();
}