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

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "adminRead");
  if (limited) return limited;
  try {
    const authorization =
      request.headers.get("authorization");

    if (
      !authorization?.startsWith("Bearer ")
    ) {
      return reply(
        { error: "Please sign in." },
        401
      );
    }

    const token =
      authorization.slice(7).trim();

    if (!token) {
      return reply(
        { error: "Invalid login session." },
        401
      );
    }

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const publicKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !publicKey) {
      return reply(
        { error: "Authentication unavailable." },
        503
      );
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
      await authClient.auth.getUser(
        token
      );

    if (
      authError ||
      !userData.user
    ) {
      return reply(
        {
          error:
            "Session expired. Sign in again.",
        },
        401
      );
    }

    const db =
      adminDatabase();

    // Confirm this user is an authorized administrator.
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
      return reply(
        { error: "Access denied." },
        403
      );
    }

    // Only verified administrators can reach this query.
    const {
      data: orders,
      error: ordersError,
    } = await db
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        fulfillment,
        delivery_address,
        subtotal,
        delivery_fee,
        total,
        status,
        payment_status,
        payment_method,
        payment_received_at,
        payment_received_amount,
        id_document_path,
        id_uploaded_at,
        id_review_status,
        created_at,
        updated_at,
        order_items(
          id,
          product_name,
          variant_name,
          quantity,
          unit_price
        )
        `
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(100);

    if (ordersError) {
      throw new Error(
        "Order lookup failed."
      );
    }

    return reply(
      {
        orders:
          orders ?? [],
      },
      200
    );
  } catch (error) {
    console.error(
      "ADMIN ORDERS ERROR:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return reply(
      {
        error:
          "Order management is temporarily unavailable.",
      },
      503
    );
  }
}