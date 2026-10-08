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
  } =
    await authClient.auth.getUser(token);

  if (
    authError ||
    !userData.user
  ) {
    return {
      ok: false as const,
      response: reply(
        { error: "Session expired. Sign in again." },
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
    .eq("user_id", userData.user.id)
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
    userId: userData.user.id,
  };
}

export async function PATCH(request: Request) {
  const limited =
    await enforceRateLimit(
      request,
      "adminWrite"
    );

  if (limited) return limited;

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

    if (!uuidPattern.test(orderId)) {
      return reply(
        { error: "Invalid order." },
        400
      );
    }

    if (body?.confirmed !== true) {
      return reply(
        {
          error:
            "Confirm that the refund was sent.",
        },
        400
      );
    }

    if (
      !Number.isInteger(body?.amountCents) ||
      body.amountCents < 0
    ) {
      return reply(
        { error: "Invalid refund amount." },
        400
      );
    }

    const {
      data: order,
      error: orderError,
    } = await admin.db
      .from("orders")
      .select(
        "id,status,payment_status,payment_method,payment_received_amount,refund_status,refund_amount,refunded_at"
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

    if (order.status !== "cancelled") {
      return reply(
        {
          error:
            "Only cancelled orders can be refunded.",
        },
        400
      );
    }

    if (order.payment_status !== "paid") {
      return reply(
        {
          error:
            "This order was not marked paid.",
        },
        400
      );
    }

    if (
      !["cashapp", "zelle", "cash"].includes(
        order.payment_method
      )
    ) {
      return reply(
        {
          error:
            "Unsupported payment method.",
        },
        400
      );
    }

    const expectedAmount =
      Number(order.payment_received_amount);

    if (
      !Number.isFinite(expectedAmount) ||
      expectedAmount < 0
    ) {
      return reply(
        {
          error:
            "The recorded payment amount is invalid.",
        },
        400
      );
    }

    const expectedCents =
      Math.round(expectedAmount * 100);

    if (
      body.amountCents !== expectedCents
    ) {
      return reply(
        {
          error:
            "Refund amount must match the payment received.",
        },
        400
      );
    }

    if (
      order.refund_status === "refunded"
    ) {
      const recorded =
        Number(order.refund_amount);

      if (
        Number.isFinite(recorded) &&
        Math.round(recorded * 100) ===
          expectedCents
      ) {
        return reply(
          {
            success: true,
            alreadyRefunded: true,
            order,
          },
          200
        );
      }

      return reply(
        {
          error:
            "This order already has a different refund record.",
        },
        409
      );
    }

    if (
      order.refund_status !== "required"
    ) {
      return reply(
        {
          error:
            "This order does not require a refund.",
        },
        409
      );
    }

    const now =
      new Date().toISOString();

    const {
      data: updated,
      error: updateError,
    } = await admin.db
      .from("orders")
      .update({
        refund_status: "refunded",
        refund_amount: expectedAmount,
        refunded_at: now,
        refunded_by: admin.userId,
        updated_at: now,
      })
      .eq("id", order.id)
      .eq("status", "cancelled")
      .eq("payment_status", "paid")
      .eq("refund_status", "required")
      .eq(
        "payment_received_amount",
        order.payment_received_amount
      )
      .select(
        "id,status,payment_status,payment_method,payment_received_amount,refund_status,refund_amount,refunded_at,updated_at"
      )
      .maybeSingle();

    if (
      updateError ||
      !updated
    ) {
      return reply(
        {
          error:
            "The order changed before the refund could be recorded. Refresh and try again.",
        },
        409
      );
    }

    return reply(
      {
        success: true,
        alreadyRefunded: false,
        order: updated,
      },
      200
    );
  } catch (error) {
    console.error(
      "ORDER REFUND ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return reply(
      {
        error:
          "Could not record the refund.",
      },
      503
    );
  }
}