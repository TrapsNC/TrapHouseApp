
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
              <strong>Method:</strong> {order.fulfillment}
            </p>

            <p className="mt-2">
              <strong>Placed:</strong>{" "}
              {new Date(order.createdAt).toLocaleString()}
            </p>

            <p className="mt-2">
              <strong>Last Updated:</strong>{" "}
              {new Date(order.updatedAt).toLocaleString()}
            </p>

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
