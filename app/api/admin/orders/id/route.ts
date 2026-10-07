import { enforceRateLimit } from "@/lib/rate-limit";
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

  const token = authHeader.slice(7);

  const publicClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  } = await publicClient.auth.getUser(token);

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
    .eq("user_id", user.id)
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
  };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "adminId");
  if (limited) return limited;
  const admin = await requireAdmin(request);

  if (!admin.ok) {
    return admin.response;
  }

  try {
    const body = await request.json();

    const orderId =
      typeof body?.orderId === "string"
        ? body.orderId.trim()
        : "";

    if (!uuidPattern.test(orderId)) {
      return reply(
        { error: "Invalid order." },
        400
      );
    }

    const {
      data: order,
      error: orderError,
    } = await admin.db
      .from("orders")
      .select(
        "id,id_document_path,id_review_status"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return reply(
        { error: "Order not found." },
        404
      );
    }

    if (!order.id_document_path) {
      return reply(
        {
          error:
            "No ID image is attached to this order.",
        },
        404
      );
    }

    const {
      data: signed,
      error: signedError,
    } = await admin.db.storage
      .from("age-verification-ids")
      .createSignedUrl(
        order.id_document_path,
        60
      );

    if (
      signedError ||
      !signed?.signedUrl
    ) {
      throw new Error(
        "Could not create secure ID link."
      );
    }

    return reply(
      {
        success: true,
        signedUrl: signed.signedUrl,
        expiresInSeconds: 60,
        reviewStatus:
          order.id_review_status,
      },
      200
    );
  } catch (error) {
    console.error(
      "ADMIN ID VIEW ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return reply(
      {
        error:
          "Could not load the ID image.",
      },
      503
    );
  }
}