import "server-only";

type OwnerAlertOrder = {
  id: string;
  order_number: string;
  fulfillment: string;
  total: number;
};

// Only server configuration controls the recipient; never use customer input.
export async function notifyOwnerOfOrder(order: OwnerAlertOrder) {
  if (process.env.ENABLE_OWNER_ORDER_EMAILS !== "true") return "disabled";
  const key = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.ORDER_ALERT_FROM_EMAIL?.trim();
  const to = process.env.ORDER_ALERT_TO_EMAIL?.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!key || !from || !to || !validEmail.test(from) || !validEmail.test(to)) {
    console.error("OWNER ORDER EMAIL: configuration missing or invalid");
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
        subject: "TrapHouseNC: new order request",
        content: [{ type: "text/plain", value: [
          `New order request: ${order.order_number}`,
          `${method} · $${Number(order.total).toFixed(2)}`,
          "Payment has not been collected. ID review is pending.",
          "Open your admin dashboard to review the order:",
          "https://www.traphousenc.com/admin/orders",
        ].join("\n") }],
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
      }),
    });
    if (response.status !== 202) {
      console.error("OWNER ORDER EMAIL: provider rejected request", response.status);
      return "failed";
    }
    return "accepted";
  } catch {
    // Never log provider errors, credentials or customer information.
    console.error("OWNER ORDER EMAIL: delivery request failed");
    return "failed";
  }
}
