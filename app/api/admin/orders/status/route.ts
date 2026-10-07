import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedStatuses = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "shipped",
  "completed",
  "cancelled",
]);

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
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: reply(
        { error: "Please sign in." },
        401
      ),
    };
  }

  const token =
    authorization.slice(7).trim();

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

  const authClient = createClient(
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
    data: userData,
    error: authError,
  } = await authClient.auth.getUser(token);

  if (
    authError ||
    !userData.user
  ) {
    return {
      ok: false as const,
      response: reply(
        {
          error:
            "Session expired. Sign in again.",
        },
        401
      ),
    };
  }

  const db = adminDatabase();

  const {
    data: admin,
    error: adminError,
  } = await db
    .from("admin_users")
    .select("user_id")
    .eq(
      "user_id",
      userData.user.id
    )
    .maybeSingle();

  if (adminError) {
    throw new Error(
      "Admin verification failed."
    );
  }

  if (!admin) {
    return {
      ok: false as const,
      response: reply(
        { error: "Access denied." },
        403
      ),
    };
  }

  return {
    ok: true as const,
    db,
  };
}

export async function PATCH(request: Request) {
  try {
    const admin =
      await requireAdmin(request);

    if (!admin.ok) {
      return admin.response;
    }

    const body =
      await request.json();

    const orderId =
      typeof body?.orderId === "string"
        ? body.orderId.trim()
        : "";

    const nextStatus =
      typeof body?.status === "string"
        ? body.status.trim()
        : "";

    if (!uuidPattern.test(orderId)) {
      return reply(
        { error: "Invalid order." },
        400
      );
    }

    if (
      !allowedStatuses.has(nextStatus)
    ) {
      return reply(
        {
          error:
            "Invalid order status.",
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
        "id,fulfillment,status,payment_status,id_review_status"
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
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return reply(
        {
          error:
            "Completed or cancelled orders cannot be reopened.",
        },
        400
      );
    }

    if (
      nextStatus === "ready_for_pickup" &&
      order.fulfillment !== "pickup"
    ) {
      return reply(
        {
          error:
            "Only pickup orders can be marked ready for pickup.",
        },
        400
      );
    }

    if (
      nextStatus === "out_for_delivery" &&
      order.fulfillment !== "delivery"
    ) {
      return reply(
        {
          error:
            "Only delivery orders can be marked out for delivery.",
        },
        400
      );
    }

    if (
      nextStatus === "shipped" &&
      order.fulfillment !== "shipping"
    ) {
      return reply(
        {
          error:
            "Only shipping orders can be marked shipped.",
        },
        400
      );
    }

    const fulfillmentStatuses = [
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "shipped",
      "completed",
    ];

    if (
      fulfillmentStatuses.includes(
        nextStatus
      ) &&
      order.payment_status !== "paid"
    ) {
      return reply(
        {
          error:
            "Payment must be marked paid before this order can move forward.",
        },
        400
      );
    }

    // NEW: ID must be approved before fulfillment.
    if (
      fulfillmentStatuses.includes(
        nextStatus
      ) &&
      order.id_review_status !== "approved"
    ) {
      return reply(
        {
          error:
            "ID must be approved before this order can move forward.",
        },
        400
      );
    }

    const {
      data: updated,
      error: updateError,
    } = await admin.db
      .from("orders")
      .update({
        status: nextStatus,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", order.status)
      .select(
        "id,status,fulfillment,payment_status,id_review_status,updated_at"
      )
      .maybeSingle();

    if (
      updateError ||
      !updated
    ) {
      return reply(
        {
          error:
            "The order changed before your update could be saved. Refresh and try again.",
        },
        409
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
      "ORDER STATUS ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return reply(
      {
        error:
          "Could not update the order status.",
      },
      503
    );
  }
}