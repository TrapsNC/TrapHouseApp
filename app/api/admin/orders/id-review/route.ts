import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function requireAdmin(request: Request) {
  const authHeader =
    request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: reply(
        { error: "Unauthorized." },
        401
      ),
    };
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return {
      ok: false as const,
      response: reply(
        { error: "Unauthorized." },
        401
      ),
    };
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publicKey) {
    return {
      ok: false as const,
      response: reply(
        { error: "Authentication unavailable." },
        503
      ),
    };
  }

  const publicClient = createClient(
    url,
    publicKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } =
    await publicClient.auth.getUser(
      token
    );

  if (userError || !user) {
    return {
      ok: false as const,
      response: reply(
        { error: "Unauthorized." },
        401
      ),
    };
  }

  const db = adminDatabase();

  const {
    data: adminRow,
    error: adminError,
  } = await db
    .from("admin_users")
    .select("user_id")
    .eq(
      "user_id",
      user.id
    )
    .maybeSingle();

  if (adminError || !adminRow) {
    return {
      ok: false as const,
      response: reply(
        { error: "Forbidden." },
        403
      ),
    };
  }

  return {
    ok: true as const,
    db,
    userId: user.id,
  };
}

export async function PATCH(
  request: Request
) {
  const admin =
    await requireAdmin(request);

  if (!admin.ok) {
    return admin.response;
  }

  try {
    const body =
      await request.json();

    const orderId =
      typeof body?.orderId ===
      "string"
        ? body.orderId.trim()
        : "";

    const status =
      typeof body?.status ===
      "string"
        ? body.status.trim()
        : "";

    if (!uuidPattern.test(orderId)) {
      return reply(
        { error: "Invalid order." },
        400
      );
    }

    if (
      ![
        "approved",
        "rejected",
      ].includes(status)
    ) {
      return reply(
        {
          error:
            "Invalid ID review status.",
        },
        400
      );
    }

    const {
      data: order,
      error: orderError,
    } = await admin.db
      .from("orders")
      .select(
        `
        id,
        id_document_path,
        id_review_status,
        id_reviewed_at,
        id_reviewed_by
        `
      )
      .eq("id", orderId)
      .maybeSingle();

    if (
      orderError ||
      !order
    ) {
      return reply(
        { error: "Order not found." },
        404
      );
    }

    if (
      !order.id_document_path
    ) {
      return reply(
        {
          error:
            "This order does not have an ID image.",
        },
        400
      );
    }

    const reviewedAt =
      new Date().toISOString();

    const {
      data: updated,
      error: updateError,
    } = await admin.db
      .from("orders")
      .update({
        id_review_status:
          status,

        id_reviewed_at:
          reviewedAt,

        id_reviewed_by:
          admin.userId,

        updated_at:
          reviewedAt,
      })
      .eq("id", orderId)
      .select(
        `
        id,
        id_review_status,
        id_reviewed_at,
        id_reviewed_by
        `
      )
      .maybeSingle();

    if (
      updateError ||
      !updated
    ) {
      throw new Error(
        "ID review update failed."
      );
    }

    return reply(
      {
        success: true,
        order: updated,
      },
      200
    );
  } catch (error) {
    console.error(
      "ADMIN ID REVIEW ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return reply(
      {
        error:
          "Could not update ID review status.",
      },
      503
    );
  }
}