import { enforceRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminDatabase } from "@/lib/admin-db";
import { notifyCustomerOfOrder } from "@/lib/customer-order-email";
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


export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "adminWrite");
  if (limited) return limited;
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    // Fixed configured store inbox; callers cannot choose a recipient or content.
    const recipient = process.env.ORDER_ALERT_TO_EMAIL?.trim();
    if (!recipient) return reply({ error: "Store inbox is not configured." }, 503);
    const result = await notifyCustomerOfOrder({ id: "test-only", order_number: "TH-EMAIL-TEST", fulfillment: "delivery", total: 14.99, tracking_token: "SAMPLE-NOT-A-REAL-TOKEN" }, recipient, true);
    if (result !== "accepted") return reply({ error: "The email provider did not accept the test." }, 503);
    return reply({ success: true, message: "Customer confirmation test accepted. Check your store inbox and Spam. No order was created." }, 200);
  } catch {
    return reply({ error: "Could not send the test email." }, 503);
  }
}
