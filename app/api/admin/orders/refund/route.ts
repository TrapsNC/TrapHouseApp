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

    const {
      data: recorded,
      error: refundError,
    } = await admin.db.rpc(
      "mark_order_refunded",
      {
        p_order_id: orderId,
        p_refunded_by: admin.userId,
      }
    );

    if (refundError) {
      const message = refundError.message;

      if (message.includes("Order not found.")) {
        return reply({ error: "Order not found." }, 404);
      }

      if (message.includes("Access denied.")) {
        return reply({ error: "Access denied." }, 403);
      }

      const badRequestMessages = [
        "Invalid refund request.",
        "Only cancelled orders can be refunded.",
        "This order was not marked paid.",
        "Unsupported payment method.",
        "The recorded payment amount is invalid.",
      ];

      if (
        badRequestMessages.some((candidate) =>
          message.includes(candidate)
        )
      ) {
        return reply({ error: message }, 400);
      }

      const conflictMessages = [
        "This order does not require a refund.",
        "This order already has a different refund record.",
        "Recorded refunds are immutable.",
      ];

      if (
        conflictMessages.some((candidate) =>
          message.includes(candidate)
        )
      ) {
        return reply({ error: message }, 409);
      }

      throw new Error("Atomic refund recording failed.");
    }

    if (
      !recorded ||
      typeof recorded !== "object" ||
      Array.isArray(recorded)
    ) {
      throw new Error("Invalid refund receipt.");
    }

    const {
      already_refunded: alreadyRefunded,
      ...order
    } = recorded as Record<string, unknown>;

    return reply(
      {
        success: true,
        alreadyRefunded:
          alreadyRefunded === true,
        order,
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
