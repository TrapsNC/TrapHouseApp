import "server-only";

type CustomerAlertOrder = {
  id: string;
  order_number: string;
  fulfillment: string;
  total: number;
  tracking_token: string;
};

// Send only to the validated address belonging to this saved order request.
export async function notifyCustomerOfOrder(order: CustomerAlertOrder, customerEmail: string) {
  if (process.env.ENABLE_CUSTOMER_ORDER_EMAILS !== "true") return "disabled";
  const key = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.ORDER_ALERT_FROM_EMAIL?.trim();
  const to = customerEmail.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!key || !from || !to || !validEmail.test(from) || !validEmail.test(to)) {
    console.error("CUSTOMER ORDER EMAIL: configuration missing or invalid");
    return "failed";
  }
  try {
    const method = order.fulfillment === "delivery" ? "Local delivery" : "Local meetup";
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: "TrapHouseNC Orders" },
        subject: "TrapHouseNC: order request received",
        content: [{ type: "text/plain", value: [
          `We received your order request: ${order.order_number}`,
          `${method} · $${Number(order.total).toFixed(2)}`,
          "This is a request confirmation, not payment or fulfillment approval. Payment has not been collected and ID review is pending.",
          "View your order status:",
          "https://www.traphousenc.com/track",
          `Order number: ${order.order_number}`,
          `Tracking token: ${order.tracking_token}`,
          "Enter both on the tracking page. Keep your tracking token private.",
        ].join("\n") }],
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
      }),
    });
    if (response.status !== 202) {
      console.error("CUSTOMER ORDER EMAIL: provider rejected request", response.status);
      return "failed";
    }
    return "accepted";
  } catch {
    // Never log provider errors, credentials or customer information.
    console.error("CUSTOMER ORDER EMAIL: delivery request failed");
    return "failed";
  }
}
