import { enforceRateLimit } from "@/lib/rate-limit";

import { NextResponse } from "next/server";
import { adminDatabase } from "@/lib/admin-db";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orderNumberPattern = /^TH-[A-F0-9]{12}$/;

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "tracking");
  if (limited) return limited;
  try {
    const body = await request.json();

    const orderNumber =
      typeof body?.orderNumber === "string"
        ? body.orderNumber.trim().toUpperCase()
        : "";

    const trackingToken =
      typeof body?.trackingToken === "string"
        ? body.trackingToken.trim()
        : "";

    if (
      !orderNumberPattern.test(orderNumber) ||
      !uuidPattern.test(trackingToken)
    ) {
      return NextResponse.json(
        { error: "Invalid tracking information." },
        { status: 400 }
      );
    }

    const db = adminDatabase();

    const { data, error } = await db
      .from("orders")
      .select(
        "order_number,status,fulfillment,created_at,updated_at"
      )
      .eq("order_number", orderNumber)
      .eq("tracking_token", trackingToken)
      .maybeSingle();

    if (error) {
      console.error(
        "SUPABASE ERROR CODE:",
        String(error.code),
        "| MESSAGE:",
        String(error.message),
        "| DETAILS:",
        String(error.details)
      );

      throw new Error("Tracking lookup failed.");
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Order not found. Check your tracking details.",
        },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        order: {
          orderNumber: data.order_number,
          status: data.status,
          fulfillment: data.fulfillment,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "TRACKING API ERROR:",
      error instanceof Error ? error.message : String(error)
    );

    return NextResponse.json(
      { error: "Tracking is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
