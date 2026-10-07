import { shippingIsApproved } from "@/lib/shipping-policy";
import { enforceRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { adminDatabase } from "@/lib/admin-db";
import {
  CartInputError,
  freshQuote,
  parseCart,
} from "@/lib/server-cart";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderRequest = {
  requestId?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;

  dateOfBirth?: unknown;
  ageConfirmed?: unknown;

  fulfillment?: unknown;
  deliveryAddress?: unknown;
  deliveryState?: unknown;
  deliveryZip?: unknown;

  expectedSubtotalCents?: unknown;
  items?: unknown;
};

function cleanString(
  value: unknown,
  max: number
) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, max);
}

function fail(
  message: string,
  status = 400
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function isAtLeast21(
  dateOfBirth: string
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      dateOfBirth
    );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const birthDate = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !==
      month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return false;
  }

  const now = new Date();

  let age =
    now.getUTCFullYear() -
    birthDate.getUTCFullYear();

  const birthdayPassed =
    now.getUTCMonth() >
      birthDate.getUTCMonth() ||
    (now.getUTCMonth() ===
      birthDate.getUTCMonth() &&
      now.getUTCDate() >=
        birthDate.getUTCDate());

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 21;
}

function envList(name: string) {
  return (
    process.env[name] ?? ""
  )
    .split(",")
    .map((value) =>
      value.trim().toUpperCase()
    )
    .filter(Boolean);
}

export async function POST(
  request: Request
) {
  if (
    process.env.ENABLE_ORDER_REQUESTS !==
    "true"
  ) {
    return fail(
      "Online order requests are not available yet.",
      503
    );
  }

  const limited = await enforceRateLimit(request, "orders");
  if (limited) return limited;

  try {
    let body: OrderRequest;

    try {
      body = await request.json();
    } catch {
      return fail(
        "Invalid order request."
      );
    }

    if (
      !body ||
      typeof body !== "object"
    ) {
      return fail(
        "Invalid order information."
      );
    }

    const requestId = cleanString(
      body.requestId,
      100
    );

    const customerName = cleanString(
      body.customerName,
      120
    );

    const customerEmail = cleanString(
      body.customerEmail,
      254
    );

    const customerPhone = cleanString(
      body.customerPhone,
      30
    );

    const dateOfBirth = cleanString(
      body.dateOfBirth,
      10
    );

    const deliveryAddress = cleanString(
      body.deliveryAddress,
      500
    );

    const deliveryState = cleanString(
      body.deliveryState,
      2
    ).toUpperCase();

    const deliveryZip = cleanString(
      body.deliveryZip,
      5
    );

    const fulfillment = cleanString(
      body.fulfillment,
      20
    );

    if (!uuidPattern.test(requestId)) {
      return fail(
        "Invalid request ID."
      );
    }

    if (customerName.length < 2) {
      return fail(
        "Enter your full name."
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        customerEmail
      )
    ) {
      return fail(
        "Enter a valid email address."
      );
    }

    if (
      customerPhone.replace(
        /\D/g,
        ""
      ).length < 10
    ) {
      return fail(
        "Enter a valid phone number."
      );
    }

    if (
      !isAtLeast21(dateOfBirth)
    ) {
      return fail(
        "You must be at least 21 years old to continue."
      );
    }

    if (
      body.ageConfirmed !== true
    ) {
      return fail(
        "You must confirm that you are 21 or older."
      );
    }

    if (
      ![
        "pickup",
        "delivery",
        "shipping",
      ].includes(fulfillment)
    ) {
      return fail(
        "Choose a fulfillment method."
      );
    }

    if (fulfillment === "shipping") {
      return fail("Shipping is unavailable. Choose local meetup or local delivery.", 403);
    }

    if (
      fulfillment !== "pickup"
    ) {
      if (
        deliveryAddress.length < 10 ||
        !/^[A-Z]{2}$/.test(
          deliveryState
        ) ||
        !/^\d{5}$/.test(
          deliveryZip
        )
      ) {
        return fail(
          "Enter a complete delivery or shipping address."
        );
      }
    }

    if (
      fulfillment === "delivery"
    ) {
      const allowedDeliveryZips =
        envList(
          "ALLOWED_DELIVERY_ZIPS"
        );

      if (
        allowedDeliveryZips.length === 0
      ) {
        return fail(
          "Local delivery is not available yet.",
          503
        );
      }

      if (
        !allowedDeliveryZips.includes(
          deliveryZip
        )
      ) {
        return fail(
          "Local delivery is not available to this ZIP code."
        );
      }
    }

    if (
      fulfillment === "shipping"
    ) {
      const allowedShippingStates =
        envList(
          "ALLOWED_SHIPPING_STATES"
        );

      if (
        allowedShippingStates.length ===
        0
      ) {
        return fail(
          "Shipping is not available yet.",
          503
        );
      }

      if (
        !allowedShippingStates.includes(
          deliveryState
        )
      ) {
        return fail(
          "Shipping is not available to this state."
        );
      }
    }

    if (
      !Number.isInteger(
        body.expectedSubtotalCents
      ) ||
      Number(
        body.expectedSubtotalCents
      ) < 0
    ) {
      return fail(
        "Invalid expected subtotal."
      );
    }

    const items =
      parseCart(body.items);

    if (
      items.some(
        (item) =>
          item.fulfillment !==
          fulfillment
      )
    ) {
      return fail(
        "Choose one fulfillment method for this order."
      );
    }

    if (fulfillment === "shipping" && !shippingIsApproved(
      items, deliveryState, deliveryZip, process.env.SHIPPING_CARRIER ?? ""
    )) {
      return fail("One or more items are not approved for shipping to this destination.", 403);
    }
    const db =
      adminDatabase();

    /*
      Make sure a private ID upload exists
      for THIS request ID before creating
      the order.
    */
    const {
      data: pendingId,
      error: pendingIdError,
    } = await db
      .from("pending_id_uploads")
      .select(
        "request_id, storage_path, created_at"
      )
      .eq(
        "request_id",
        requestId
      )
      .maybeSingle();

    if (pendingIdError) {
      throw new Error(
        "ID verification lookup failed."
      );
    }

    if (!pendingId) {
      return fail(
        "Please securely upload your government-issued ID before submitting the order."
      );
    }

    const uploadedAt =
      new Date(
        pendingId.created_at
      ).getTime();

    const oneHourAgo =
      Date.now() -
      60 * 60 * 1000;

    if (
      !Number.isFinite(
        uploadedAt
      ) ||
      uploadedAt < oneHourAgo
    ) {
      return fail(
        "Your ID upload expired. Please upload it again."
      );
    }

    /*
      Re-check current inventory and
      pricing on the server.
    */
    const quote =
      await freshQuote(items);

    if (!quote.canCheckout) {
      return NextResponse.json(
        {
          error:
            "Inventory changed. Please review your cart.",
          quote,
        },
        {
          status: 409,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    if (
      Math.round(
        quote.subtotal * 100
      ) !==
        Number(
          body.expectedSubtotalCents
        ) ||
      quote.items.some(
        (item) =>
          item.priceChanged
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Prices changed. Review the updated total.",
          quote,
        },
        {
          status: 409,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
      Create the order + items.
    */
    const {
      error: createError,
    } = await db.rpc(
      "create_customer_order",
      {
        p_request_id: requestId,
        p_customer_name:
          customerName,
        p_customer_email:
          customerEmail,
        p_customer_phone:
          customerPhone || null,
        p_fulfillment:
          fulfillment,
        p_delivery_address:
          fulfillment === "pickup"
            ? null
            : deliveryAddress,
        p_items: items.map(
          (item) => ({
            productId:
              item.productId,
            variantId:
              item.variantId,
            quantity:
              item.quantity,
          })
        ),
        p_expected_subtotal:
          quote.subtotal,
      }
    );

    if (createError) {
      console.error(
        "CREATE ORDER ERROR:",
        String(createError.code),
        String(createError.message)
      );

      if (
        String(
          createError.message
        ).includes(
          "already been submitted"
        )
      ) {
        return fail(
          "This order request was already submitted.",
          409
        );
      }

      if (
        String(
          createError.message
        ).includes(
          "subtotal changed"
        ) ||
        String(
          createError.message
        ).includes(
          "insufficient stock"
        ) ||
        String(
          createError.message
        ).includes(
          "Product unavailable"
        )
      ) {
        return fail(
          "Inventory or pricing changed. Please review your cart.",
          409
        );
      }

      throw new Error(
        "Order database function failed."
      );
    }

    /*
      Attach the private ID to the exact
      order that was just created.

      We SELECT the order here instead of
      trusting the RPC return shape. This
      fixes the missing tracking-number
      problem too.
    */
    const {
      data: savedOrder,
      error: attachError,
    } = await db
      .from("orders")
      .update({
        id_document_path:
          pendingId.storage_path,

        id_uploaded_at:
          pendingId.created_at,

        id_review_status:
          "pending",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "request_id",
        requestId
      )
      .select(
        `
        id,
        order_number,
        tracking_token,
        subtotal,
        delivery_fee,
        total,
        status,
        fulfillment,
        payment_status,
        id_review_status,
        created_at
        `
      )
      .single();

    if (
      attachError ||
      !savedOrder
    ) {
      console.error(
        "ID ATTACH ERROR:",
        attachError?.message ??
          "Order not found after creation."
      );

      throw new Error(
        "Order was created but ID attachment failed."
      );
    }

    /*
      The permanent order now references
      the ID, so remove only the temporary
      pointer row.
    */
    const {
      error:
        pendingDeleteError,
    } = await db
      .from(
        "pending_id_uploads"
      )
      .delete()
      .eq(
        "request_id",
        requestId
      );

    if (
      pendingDeleteError
    ) {
      console.error(
        "PENDING ID CLEANUP ERROR:",
        pendingDeleteError.message
      );
    }

    return NextResponse.json(
      {
        success: true,

        paymentCollected:
          false,

        ageEligibilityPassed:
          true,

        identityAgeVerified:
          false,

        idReviewStatus:
          "pending",

        order: savedOrder,
      },
      {
        status: 201,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    if (
      error instanceof
      CartInputError
    ) {
      return fail(
        error.message
      );
    }

    console.error(
      "ORDER API ERROR:",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return fail(
      "We could not save the order request. Please try again.",
      503
    );
  }
}