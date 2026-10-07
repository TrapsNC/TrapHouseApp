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

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, "adminWrite");
  if (limited) return limited;
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    const body = await request.json();
    if (!uuidPattern.test(body?.orderId ?? "") || body.received !== true) return reply({error:"Confirm that payment was received."},400);
    const {data:order,error} = await admin.db.from("orders").select("id,status,payment_status,payment_method,total").eq("id",body.orderId).maybeSingle();
    if (error || !order) return reply({error:"Order not found."},404);
    if (["completed","cancelled"].includes(order.status) || order.payment_status === "paid") return reply({error:"This order cannot accept another payment confirmation."},409);
    if (!["cashapp","zelle","cash"].includes(order.payment_method)) return reply({error:"This order has no supported payment method."},400);
    const total = Number(order.total);
    if (!Number.isFinite(total) || total < 0) return reply({error:"Invalid order total."},400);
    const amount = order.payment_method === "cash" ? Math.round(total) : total;
    if (!Number.isInteger(body.amountCents) || body.amountCents !== Math.round(amount * 100)) return reply({error:"Received amount must match the amount due."},400);
    const now = new Date().toISOString();
    const {data:updated,error:updateError} = await admin.db.from("orders").update({payment_status:"paid",payment_received_amount:amount,payment_received_at:now,payment_received_by:admin.userId,updated_at:now}).eq("id",order.id).eq("status",order.status).eq("payment_status",order.payment_status).eq("payment_method",order.payment_method).eq("total",order.total).select("id,payment_status,payment_method,payment_received_amount,payment_received_at,updated_at").maybeSingle();
    if (updateError || !updated) return reply({error:"The order changed. Refresh before confirming payment."},409);
    return reply({success:true,order:updated},200);
  } catch { return reply({error:"Could not confirm payment."},503); }
}
