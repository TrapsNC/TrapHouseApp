
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  StoreHeader,
  StoreFooter,
} from "@/app/components/StoreChrome";

type Order = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  idReviewStatus: string;
  refundStatus: string;
  fulfillment: string;
  createdAt: string;
  updatedAt: string;
};

const statusLabels: Record<string, string> = {
  pending: "Order Received",
  confirmed: "Order Confirmed",
  preparing: "Preparing Your Order",
  ready_for_pickup: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

function nextStep(order: Order) {
  if (order.refundStatus === "required") return "Your refund is awaiting confirmation from the store. Contact us if you need an update.";
  if (order.refundStatus === "refunded") return "The store has recorded your refund as sent. Contact us if it has not arrived.";
  if (order.status === "cancelled") return "This order was cancelled. Contact the store if you have questions.";
  if (order.status === "completed") return "Your order is complete. Thank you for shopping with us!";
  if (order.idReviewStatus === "rejected") return "Your ID needs attention. Contact the store before arranging fulfillment.";
  if (order.idReviewStatus !== "approved") return order.paymentStatus === "paid"
    ? "Payment is confirmed. Your ID still needs approval before fulfillment."
    : "Your ID review and payment confirmation are pending. Fulfillment requires both.";
  if (order.paymentStatus !== "paid") return "Your ID is approved. Payment still needs confirmation before fulfillment. Contact the store to arrange payment.";
  if (order.status === "ready_for_pickup") return "Your order is ready. Contact the store to confirm your meetup details.";
  if (order.status === "out_for_delivery") return "Your order is out for delivery. Keep your phone available for updates.";
  if (order.status === "shipped") return "Your order has shipped. Contact the store for carrier tracking details.";
  if (order.status === "preparing") return "The store is preparing your order. Check back for the next update.";
  return "Your ID and payment are approved. The store will update your order as it moves forward.";
}

export default function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function trackOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          trackingToken: trackingToken.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Tracking failed.");
      }

      setOrder(result.order);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="storefront min-h-screen">
      <StoreHeader />

      <div className="store-container">
        <p className="store-kicker">TRAP HOUSE NC</p>
        <h1 className="store-title">Track Your Order</h1>

        <p className="store-intro">
          Enter the order number and private tracking code
          from your confirmation.
        </p>

        <form
          onSubmit={trackOrder}
          className="checkout-box"
          style={{ maxWidth: 600 }}
        >
          <label htmlFor="orderNumber">
            Order Number
          </label>

          <input
            id="orderNumber"
            required
            autoComplete="off"
            placeholder="TH-XXXXXXXXXXXX"
            value={orderNumber}
            onChange={(event) =>
              setOrderNumber(event.target.value)
            }
            className="w-full border border-zinc-700 bg-black p-3 text-white"
          />

          <label
            htmlFor="trackingToken"
            className="mt-5 block"
          >
            Private Tracking Code
          </label>

          <input
            id="trackingToken"
            required
            autoComplete="off"
            placeholder="Paste your tracking code"
            value={trackingToken}
            onChange={(event) =>
              setTrackingToken(event.target.value)
            }
            className="w-full border border-zinc-700 bg-black p-3 text-white"
          />

          <button
            type="submit"
            disabled={loading}
            className="store-primary mt-6 w-full"
          >
            {loading ? "CHECKING..." : "TRACK ORDER"}
          </button>

          {error && (
            <p role="alert" className="cart-error mt-4">
              {error}
            </p>
          )}
        </form>

        {process.env.NODE_ENV === "development" && (
          <div className="checkout-box mt-6" style={{ maxWidth: 600 }}>
            <h2 className="font-bold">Demo order tracking</h2>
            <p className="store-muted mt-2">Preview only. No order, payment, or inventory changes are saved.</p>
            <div className="flex flex-wrap gap-3 mt-4">
              {[
                { label: "Awaiting review", status: "pending", paymentStatus: "unpaid", idReviewStatus: "pending", refundStatus: "none" },
                { label: "Paid, ID pending", status: "pending", paymentStatus: "paid", idReviewStatus: "pending", refundStatus: "none" },
                { label: "Ready for meetup", status: "ready_for_pickup", paymentStatus: "paid", idReviewStatus: "approved", refundStatus: "none" },
                { label: "Refund pending", status: "cancelled", paymentStatus: "paid", idReviewStatus: "approved", refundStatus: "required" },
                { label: "Refund recorded", status: "cancelled", paymentStatus: "paid", idReviewStatus: "approved", refundStatus: "refunded" },
              ].map(({ label, ...state }) => (
                <button key={label} type="button" disabled={loading} className="border border-zinc-700 rounded-lg p-3"
                  onClick={() => {
                    setError("");
                    setOrder({ ...state, orderNumber: "DEMO — NOT A REAL ORDER", fulfillment: "pickup",
                      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
                  }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {order && (
          <section
            className="checkout-box mt-8"
            style={{ maxWidth: 600 }}
            aria-live="polite"
          >
            <p className="store-kicker">
              ORDER STATUS
            </p>

            <h2 className="text-2xl font-bold">
              {statusLabels[order.status] || order.status}
            </h2>

            <p className="mt-4">
              <strong>Order:</strong> {order.orderNumber}
            </p>

            <p className="mt-2">
              <strong>Method:</strong> {({ pickup: "Local Meetup", delivery: "Local Delivery", shipping: "Shipping" } as Record<string, string>)[order.fulfillment] || "Contact store"}
            </p>

            <p className="mt-2">
              <strong>Placed:</strong>{" "}
              {new Date(order.createdAt).toLocaleString()}
            </p>

            <p className="mt-2">
              <strong>Last Updated:</strong>{" "}
              {new Date(order.updatedAt).toLocaleString()}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="store-muted">PAYMENT</p>
                <strong className={order.refundStatus === "refunded" ? "text-green-400" : order.paymentStatus === "paid" ? "text-green-400" : "text-red-400"}>
                  {order.refundStatus === "refunded" ? "Refund recorded" : order.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                </strong>
                {order.refundStatus === "required" && <p className="text-amber-400 mt-2">Refund pending</p>}
              </div>
              <div>
                <p className="store-muted">ID REVIEW</p>
                <strong className={order.idReviewStatus === "approved" ? "text-green-400" : order.idReviewStatus === "rejected" ? "text-red-400" : "text-amber-400"}>
                  {order.idReviewStatus === "approved" ? "Approved" : order.idReviewStatus === "rejected" ? "Needs attention" : "Pending review"}
                </strong>
              </div>
            </div>
            <div className="mt-6 rounded-lg border border-zinc-700 p-4">
              <h3 className="font-bold">What's next</h3>
              <p className="mt-2">{nextStep(order)}</p>
              <Link href="/pages/contact" className="underline mt-3 inline-block">Contact the store</Link>
            </div>

            <p className="store-muted mt-4">
              Tracking shows order status, not live GPS location.
            </p>
          </section>
        )}

        <Link
          href="/#shop"
          className="cart-back-link mt-8 block"
        >
          ← Continue Shopping
        </Link>
      </div>

      <StoreFooter />
    </main>
  );
}
