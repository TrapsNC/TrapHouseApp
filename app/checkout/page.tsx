"use client";

import { deliveryFee, orderTotal } from "@/lib/fulfillment-pricing";
import { createId } from "@/lib/create-id";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  StoreFooter,
  StoreHeader,
} from "@/app/components/StoreChrome";
import { readCart, writeCart } from "@/lib/cart";
import type { CartItem, Fulfillment } from "@/lib/cart";
import type { Quote } from "@/lib/quote";
import PaymentOptions from "@/app/components/PaymentOptions";

type Receipt = {
  id: string;
  reference: string;
  subtotal: number;
  fulfillment: Fulfillment;
  createdAt: string;
  items: CartItem[];
  demo: true;
};

type CustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  street: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  instructions: string;
};

type RealOrder = {
  id?: string;
  order_number?: string;
  tracking_token?: string;
  subtotal?: number | string;
  delivery_fee?: number | string;
  total?: number | string;
  status?: string;
  fulfillment?: Fulfillment;
  created_at?: string;
};

type OrderConfirmation = {
  orderNumber: string;
  trackingToken: string;
  subtotal: number;
  fulfillment: Fulfillment;
  paymentCollected: false;
};

const emptyDetails: CustomerDetails = {
  fullName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  street: "",
  apartment: "",
  city: "",
  state: "NC",
  zip: "",
  instructions: "",
};

const money = (value: number) => `$${value.toFixed(2)}`;

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-black p-3 text-white";

function cartItems(quote: Quote): CartItem[] {
  return quote.items.map((item) => ({
    lineId: item.lineId,
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    variant: item.variant,
    price: item.price,
    quantity: item.quantity,
    fulfillment: item.fulfillment,
    image: item.image,
  }));
}

function buildAddress(details: CustomerDetails) {
  const lines = [
    details.street.trim(),
    details.apartment.trim(),
    `${details.city.trim()}, ${details.state.trim()} ${details.zip.trim()}`,
  ].filter(Boolean);

  if (details.instructions.trim()) {
    lines.push(
      `Instructions: ${details.instructions.trim()}`
    );
  }

  return lines.join("\n");
}

function normalizeOrder(value: unknown): RealOrder | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const first = value[0];

    if (first && typeof first === "object") {
      return first as RealOrder;
    }

    return null;
  }

  if (typeof value === "object") {
    return value as RealOrder;
  }

  return null;
}

function isAtLeast21(dateOfBirth: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const birthDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return false;
  }

  const now = new Date();

  let age =
    now.getUTCFullYear() -
    birthDate.getUTCFullYear();

  const birthdayPassed =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() >= birthDate.getUTCDate());

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 21;
}

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fulfillment, setFulfillment] =
    useState<Fulfillment | "">("");

  const [details, setDetails] =
    useState<CustomerDetails>(emptyDetails);

  const [ageConfirmed, setAgeConfirmed] =
    useState(false);

  const [idFile, setIdFile] =
    useState<File | null>(null);

  const [idUploaded, setIdUploaded] =
    useState(false);

  const [idUploadBusy, setIdUploadBusy] =
    useState(false);

  const [idUploadError, setIdUploadError] =
    useState("");

  const [step, setStep] =
    useState<"information" | "review">("information");

  const [detailsError, setDetailsError] =
    useState("");

  // Demo checkout
  const [receipt, setReceipt] =
    useState<Receipt | null>(null);

  const [busy, setBusy] = useState(false);

  const [paymentError, setPaymentError] =
    useState("");

  const [outcome, setOutcome] =
    useState("approved");

  // Real order requests
  const [orderBusy, setOrderBusy] =
    useState(false);

  const [orderError, setOrderError] =
    useState("");

  const [
    orderConfirmation,
    setOrderConfirmation,
  ] = useState<OrderConfirmation | null>(null);

  const sheet =
    useRef<HTMLDialogElement>(null);

  const requestId = useRef("");

  /*
    BOTH switches are required for real order requests.

    NEXT_PUBLIC_ENABLE_ORDER_REQUESTS=true
    ENABLE_ORDER_REQUESTS=true

    The server-side variable is the actual security gate.
  */
  const orderRequestsEnabled =
    process.env.NEXT_PUBLIC_ENABLE_ORDER_REQUESTS ===
    "true";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const saved = readCart();

        if (cancelled) return;

        setItems(saved);

        const methods = new Set(
          saved.map(
            (item) => item.fulfillment
          )
        );

        if (
          methods.size === 1 &&
          saved.length
        ) {
          setFulfillment(
            saved[0].fulfillment
          );
        }

        if (!saved.length) {
          setLoading(false);
          return;
        }

        const response = await fetch(
          "/api/cart/quote",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              items: saved,
            }),
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Checkout could not be loaded."
          );
        }

        if (!cancelled) {
          setQuote(result);
          setItems(
            cartItems(result)
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Checkout could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateDetail(
    field: keyof CustomerDetails,
    value: string
  ) {
    setDetails((current) => ({
      ...current,
      [field]: value,
    }));

    setDetailsError("");
    setOrderError("");
  }

  function chooseFulfillment(
    value: Fulfillment
  ) {
    setFulfillment(value);

    setItems((current) =>
      current.map((item) => ({
        ...item,
        fulfillment: value,
      }))
    );

    setDetailsError("");
    setOrderError("");
    setStep("information");
  }

  async function uploadIdImage() {
    if (!idFile || idUploadBusy) {
      return;
    }

    setIdUploadBusy(true);
    setIdUploadError("");
    setIdUploaded(false);

    requestId.current ||= createId();

    try {
      const formData = new FormData();

      formData.append(
        "requestId",
        requestId.current
      );

      formData.append(
        "idImage",
        idFile
      );

      const response = await fetch(
        "/api/orders/id-upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "ID upload failed."
        );
      }

      setIdUploaded(true);
    } catch (err) {
      setIdUploadError(
        err instanceof Error
          ? err.message
          : "ID upload failed."
      );
    } finally {
      setIdUploadBusy(false);
    }
  }

  function continueToReview(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setDetailsError("");
    setOrderError("");

    if (!fulfillment || fulfillment === "shipping") {
      setDetailsError(
        "Please choose local meetup or local delivery."
      );
      return;
    }

    if (
      details.fullName.trim().length < 2
    ) {
      setDetailsError(
        "Please enter your full name."
      );
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        details.email.trim()
      )
    ) {
      setDetailsError(
        "Please enter a valid email address."
      );
      return;
    }

    if (
      details.phone.replace(
        /\D/g,
        ""
      ).length < 10
    ) {
      setDetailsError(
        "Please enter a valid phone number."
      );
      return;
    }

    if (!details.dateOfBirth) {
      setDetailsError(
        "Please enter your date of birth."
      );
      return;
    }

    if (
      !isAtLeast21(
        details.dateOfBirth
      )
    ) {
      setDetailsError(
        "You must be at least 21 years old to continue."
      );
      return;
    }

    if (!ageConfirmed) {
      setDetailsError(
        "Please confirm that you are 21 or older."
      );
      return;
    }

    if (!idUploaded) {
      setDetailsError(
        "Please securely upload a photo of your government-issued ID before continuing."
      );
      return;
    }

    if (
      fulfillment !== "pickup"
    ) {
      if (
        !details.street.trim() ||
        !details.city.trim() ||
        !details.state.trim() ||
        !/^\d{5}$/.test(
          details.zip.trim()
        )
      ) {
        setDetailsError(
          "Please complete your address and enter a valid 5-digit ZIP code."
        );
        return;
      }
    }

    if (!quote?.canCheckout) {
      setDetailsError(
        "Please review unavailable products or price changes."
      );
      return;
    }

    setStep("review");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const [paymentMethod, setPaymentMethod] = useState("cash");

  async function submitOrderRequest() {
    if (
      orderBusy ||
      !quote?.canCheckout ||
      !fulfillment ||
      step !== "review"
    ) {
      return;
    }

    if (
      !orderRequestsEnabled
    ) {
      setOrderError(
        "Online order requests are still locked while checkout safety and compliance testing is completed."
      );
      return;
    }

    setOrderError("");
    if (!["cashapp", "zelle", "cash"].includes(paymentMethod)) {
      setOrderError("Choose Cash App, Zelle or cash below before submitting your request.");
      return;
    }
    setOrderBusy(true);

    requestId.current ||=
      createId();

    try {
      const response = await fetch(
        "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requestId:
              requestId.current,

            customerName:
              details.fullName.trim(),

            customerEmail:
              details.email.trim(),

            customerPhone:
              details.phone.trim(),

            dateOfBirth:
              details.dateOfBirth,

            ageConfirmed,
            paymentMethod,

            fulfillment,

            deliveryAddress:
              fulfillment === "pickup"
                ? ""
                : buildAddress(
                    details
                  ),

            deliveryState:
              fulfillment === "pickup"
                ? ""
                : details.state
                    .trim()
                    .toUpperCase(),

            deliveryZip:
              fulfillment === "pickup"
                ? ""
                : details.zip.trim(),

            expectedSubtotalCents:
              Math.round(
                quote.subtotal *
                  100
              ),

            items: items.map(
              (item) => ({
                ...item,
                fulfillment,
              })
            ),
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        if (result.quote) {
          setQuote(result.quote);

          setItems(
            cartItems(
              result.quote
            ).map((item) => ({
              ...item,
              fulfillment,
            }))
          );

          requestId.current =
            "";
        }

        throw new Error(
          result.error ||
            "The order request could not be submitted."
        );
      }

      if (!result.success) {
        throw new Error(
          "The order request could not be confirmed."
        );
      }

      const realOrder =
        normalizeOrder(
          result.order
        );

      if (
        !realOrder?.order_number ||
        !realOrder?.tracking_token
      ) {
        throw new Error(
          "The order was saved, but tracking information was not returned. Contact the store before submitting again."
        );
      }

      setOrderConfirmation({
        orderNumber:
          realOrder.order_number,

        trackingToken:
          realOrder.tracking_token,

        subtotal: Number(realOrder.total),
        fulfillment,

        paymentCollected:
          false,
      });

      try {
        sessionStorage.setItem(
          "trap-order-tracking",
          JSON.stringify({
            orderNumber:
              realOrder.order_number,

            trackingToken:
              realOrder.tracking_token,
          })
        );
      } catch {}

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      setOrderError(
        err instanceof Error
          ? err.message
          : "The order request could not be submitted."
      );
    } finally {
      setOrderBusy(false);
    }
  }

  function openPayment() {
    if (
      !quote?.canCheckout ||
      !fulfillment ||
      step !== "review"
    ) {
      return;
    }

    setPaymentError("");
    sheet.current?.showModal();
  }

  async function simulate() {
    if (
      busy ||
      !quote ||
      !fulfillment
    ) {
      return;
    }

    if (
      outcome === "declined"
    ) {
      setPaymentError(
        "Demo payment declined. No charge or order was made. Choose Approved to try the success flow."
      );
      return;
    }

    setBusy(true);
    setPaymentError("");

    requestId.current ||=
      createId();

    try {
      const response = await fetch(
        "/api/checkout/demo",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requestId:
              requestId.current,

            items: items.map(
              (item) => ({
                ...item,
                fulfillment,
              })
            ),

            fulfillment,

            expectedSubtotalCents:
              Math.round(
                quote.subtotal *
                  100
              ),
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        if (result.quote) {
          setQuote(result.quote);

          setItems(
            cartItems(
              result.quote
            ).map((item) => ({
              ...item,
              fulfillment,
            }))
          );

          requestId.current =
            "";
        }

        throw new Error(
          result.error ||
            "The demo could not finish."
        );
      }

      if (
        !result.demo ||
        !result.receipt?.demo
      ) {
        throw new Error(
          "The demo receipt could not be verified."
        );
      }

      setReceipt(
        result.receipt
      );

      try {
        sessionStorage.setItem(
          "trap-demo-receipt",
          JSON.stringify(
            result.receipt
          )
        );
      } catch {}

      sheet.current?.close();
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : "The demo could not finish."
      );
    } finally {
      setBusy(false);
    }
  }

  function saveReviewedCart() {
    try {
      writeCart(items);
      setError("");
    } catch {
      setError(
        "Your reviewed cart could not be saved on this device."
      );
    }
  }

  return (
    <main className="storefront min-h-screen">
      <StoreHeader />

      <div className="store-container">
        {!orderRequestsEnabled && (
          <div className="demo-banner">
            <span className="demo-badge">
              TESTING
            </span>

            <p>
              Online order requests
              are currently locked.
              Demo checkout remains
              available while age,
              payment, delivery and
              shipping safeguards are
              completed.
            </p>
          </div>
        )}

        {orderConfirmation ? (
          <section className="demo-receipt">
            <div
              className="demo-success-icon"
              aria-hidden="true"
            >
              âœ“
            </div>

            <p className="store-kicker">
              ORDER REQUEST RECEIVED
            </p>

            <h1 className="store-title">
              Your order request was
              saved.
            </h1>

            <p>
              This is an order request
              only. No payment has been
              collected.
            </p>

            <div className="checkout-box">
              <p className="store-muted">
                ORDER NUMBER
              </p>

              <p className="receipt-reference">
                {
                  orderConfirmation.orderNumber
                }
              </p>

              <p className="mt-4">
                Total before tax:{" "}
                <strong>
                  {money(
                    Number(
                      orderConfirmation.subtotal
                    )
                  )}
                </strong>
              </p>

              <p className="mt-2">
                Fulfillment:{" "}
                <strong>
                  {
                    orderConfirmation.fulfillment
                  }
                </strong>
              </p>

              <p className="mt-2">
                Payment status:{" "}
                <strong>
                  NOT COLLECTED
                </strong>
              </p>

              <p className="store-muted mt-5">
                Save the tracking
                information below. It is
                required with the order
                number to view order
                status.
              </p>

              <div className="mt-4 rounded-lg border border-zinc-700 bg-black p-4 break-all">
                <p className="text-xs text-zinc-500">
                  TRACKING TOKEN
                </p>

                <strong>
                  {
                    orderConfirmation.trackingToken
                  }
                </strong>
              </div>
            </div>

            <Link
              href="/track"
              className="store-primary cart-checkout-link"
            >
              TRACK ORDER →
            </Link>

            <Link
              href="/#shop"
              className="cart-back-link"
            >
              Continue shopping
            </Link>
          </section>
        ) : receipt ? (
          <section className="demo-receipt">
            <div
              className="demo-success-icon"
              aria-hidden="true"
            >
              âœ“
            </div>

            <p className="store-kicker">
              DEMO COMPLETE
            </p>

            <h1 className="store-title">
              Your demo receipt is
              ready.
            </h1>

            <p>
              No money was charged and
              no real customer order
              was placed.
            </p>

            <div className="checkout-box">
              <p className="receipt-reference">
                {receipt.reference}
              </p>

              <p>
                Demo amount:{" "}
                <strong>
                  {money(
                    Number(
                      receipt.subtotal
                    )
                  )}
                </strong>
              </p>

              <p>
                Fulfillment preference:{" "}
                {
                  receipt.fulfillment
                }
              </p>

              <p>
                Demo receipt saved
                separately in Supabase.
                Customer information
                was not submitted.
              </p>
            </div>

            <p className="store-muted">
              Your shopping cart has
              been kept for testing.
            </p>

            {receipt.fulfillment ===
              "delivery" && (
              <Link
                href="/delivery"
                className="store-primary cart-checkout-link"
              >
                TRACK DEMO DELIVERY →
              </Link>
            )}

            <Link
              href="/cart"
              className="store-primary cart-checkout-link"
            >
              RETURN TO CART
            </Link>

            <Link
              href="/#shop"
              className="cart-back-link"
            >
              Continue shopping
            </Link>
          </section>
        ) : (
          <>
            <p className="store-kicker">
              TRAP HOUSE NC
            </p>

            <h1 className="store-title">
              {step ===
              "information"
                ? "Customer & Delivery Information"
                : "Review Your Order"}
            </h1>

            <p className="store-intro">
              {step ===
              "information"
                ? "Enter your contact information and choose how you want to receive your order."
                : "Review your information before continuing."}
            </p>

            <div className="flex flex-wrap gap-3 mb-8 text-sm">
              <span
                className={
                  step ===
                  "information"
                    ? "font-bold text-black"
                    : "text-zinc-400"
                }
              >
                1. INFORMATION
              </span>

              <span className="text-zinc-500">
                →
              </span>

              <span
                className={
                  step === "review"
                    ? "font-bold text-black"
                    : "text-zinc-400"
                }
              >
                2. REVIEW & PAYMENT
              </span>
            </div>

            {loading ? (
              <p role="status">
                Checking current prices
                and stockâ€¦
              </p>
            ) : (
              <>
                {error && (
                  <p
                    role="alert"
                    className="cart-error"
                  >
                    {error}
                  </p>
                )}

                {!items.length ? (
                  <div className="cart-empty">
                    <p>
                      Your cart is empty.
                    </p>

                    <Link
                      href="/#shop"
                      className="store-primary"
                    >
                      EXPLORE PRODUCTS
                    </Link>
                  </div>
                ) : (
                  <div className="checkout-layout">
                    <div>
                      {step ===
                      "information" ? (
                        <form
                          onSubmit={
                            continueToReview
                          }
                        >
                          <section className="checkout-box">
                            <h2 className="text-xl font-bold mb-4">
                              Contact
                              Information
                            </h2>

                            <div className="grid gap-4">
                              <label>
                                Full Name *

                                <input
                                  className={
                                    fieldClass
                                  }
                                  required
                                  autoComplete="name"
                                  value={
                                    details.fullName
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    updateDetail(
                                      "fullName",
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="First and last name"
                                />
                              </label>

                              <label>
                                Email Address
                                *

                                <input
                                  className={
                                    fieldClass
                                  }
                                  required
                                  type="email"
                                  autoComplete="email"
                                  value={
                                    details.email
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    updateDetail(
                                      "email",
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="you@example.com"
                                />
                              </label>

                              <label>
                                Phone Number *

                                <input
                                  className={
                                    fieldClass
                                  }
                                  required
                                  type="tel"
                                  autoComplete="tel"
                                  value={
                                    details.phone
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    updateDetail(
                                      "phone",
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="(919) 555-0000"
                                />
                              </label>
                            </div>
                          </section>

                          <section className="checkout-box mt-5">
                            <h2 className="text-xl font-bold mb-4">
                              Age Verification
                            </h2>

                            <p className="store-muted mb-4">
                              You must be 21
                              or older to
                              submit an order
                              request for
                              age-restricted
                              products.
                            </p>

                            <label className="block">
                              Date of Birth *

                              <input
                                className={
                                  fieldClass
                                }
                                required
                                type="date"
                                autoComplete="bday"
                                value={
                                  details.dateOfBirth
                                }
                                onChange={(
                                  e
                                ) =>
                                  updateDetail(
                                    "dateOfBirth",
                                    e.target
                                      .value
                                  )
                                }
                              />
                            </label>

                            <label className="mt-5 flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={
                                  ageConfirmed
                                }
                                onChange={(
                                  e
                                ) => {
                                  setAgeConfirmed(
                                    e
                                      .target
                                      .checked
                                  );

                                  setDetailsError(
                                    ""
                                  );

                                  setOrderError(
                                    ""
                                  );
                                }}
                                className="mt-1 h-5 w-5"
                              />

                              <span>
                                I confirm
                                that I am at
                                least 21
                                years old.
                              </span>
                            </label>

                            <p className="store-muted mt-4">
                              Date of birth
                              and this
                              confirmation
                              are an
                              eligibility
                              check only.
                              Additional
                              identity or age
                              verification
                              may be required
                              before
                              fulfillment.
                            </p>

                            <div className="mt-6 border-t border-zinc-800 pt-6">
                              <h3 className="font-bold text-lg">
                                Government-Issued ID *
                              </h3>

                              <p className="store-muted mt-2">
                                Upload a clear photo of the front of your valid government-issued photo ID.
                                JPG, PNG, or WEBP only. Maximum 8 MB.
                              </p>

                              <input
                                className={`${fieldClass} mt-4`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                capture="environment"
                                onChange={(e) => {
                                  const file =
                                    e.target.files?.[0] || null;

                                  setIdFile(file);
                                  setIdUploaded(false);
                                  setIdUploadError("");
                                  setDetailsError("");
                                  setOrderError("");
                                }}
                              />

                              {idFile && !idUploaded && (
                                <button
                                  type="button"
                                  className="store-primary mt-4 w-full"
                                  disabled={idUploadBusy}
                                  onClick={() =>
                                    void uploadIdImage()
                                  }
                                >
                                  {idUploadBusy
                                    ? "UPLOADING ID SECURELY…"
                                    : "UPLOAD ID SECURELY"}
                                </button>
                              )}

                              {idUploaded && (
                                <div className="mt-4 rounded-lg border border-green-700 bg-green-950/30 p-4">
                                  <strong>
                                    ✓ ID uploaded securely
                                  </strong>

                                  <p className="store-muted mt-1">
                                    Your ID will still require verification before fulfillment.
                                  </p>
                                </div>
                              )}

                              {idUploadError && (
                                <p
                                  role="alert"
                                  className="cart-error mt-4"
                                >
                                  {idUploadError}
                                </p>
                              )}
                            </div>
                          </section>

                          <section className="checkout-box mt-5">
                            <h2 className="text-xl font-bold mb-4">
                              Fulfillment
                              Method
                            </h2>

                            <div className="checkout-methods">
                              {(
                                [
                                  [
                                    "pickup",
                                    "Local Meetup",
                                  ],
                                  [
                                    "delivery",
                                    "Local Delivery",
                                  ],
                                ] as const
                              ).map(
                                ([
                                  value,
                                  label,
                                ]) => (
                                  <label
                                    key={
                                      value
                                    }
                                    className={
                                      fulfillment ===
                                      value
                                        ? "checkout-method selected"
                                        : "checkout-method"
                                    }
                                  >
                                    <input
                                      type="radio"
                                      name="fulfillment"
                                      checked={
                                        fulfillment ===
                                        value
                                      }
                                      onChange={() =>
                                        chooseFulfillment(
                                          value
                                        )
                                      }
                                    />

                                    <span>
                                      {
                                        label
                                      }
                                    </span>
                                  </label>
                                )
                              )}
                            </div>

                            {fulfillment ===
                              "pickup" && (
                              <div className="mt-5">
                                <h3 className="font-bold">
                                  Local Meetup
                                </h3>

                                <p className="store-muted">
                                  You&apos;ll
                                  collect your order at the agreed meetup location
                                  after
                                  confirmation.
                                </p>
                              </div>
                            )}

                            {fulfillment !==
                              "" &&
                              fulfillment !==
                                "pickup" && (
                                <div className="mt-6">
                                  <h3 className="text-lg font-bold mb-4">
                                    {fulfillment ===
                                    "delivery"
                                      ? "Delivery Address"
                                      : "Shipping Address"}
                                  </h3>

                                  <div className="grid gap-4">
                                    <label>
                                      Street
                                      Address *

                                      <input
                                        className={
                                          fieldClass
                                        }
                                        required
                                        autoComplete="street-address"
                                        value={
                                          details.street
                                        }
                                        onChange={(
                                          e
                                        ) =>
                                          updateDetail(
                                            "street",
                                            e
                                              .target
                                              .value
                                          )
                                        }
                                        placeholder="Street address"
                                      />
                                    </label>

                                    <label>
                                      Apartment
                                      / Suite

                                      <input
                                        className={
                                          fieldClass
                                        }
                                        value={
                                          details.apartment
                                        }
                                        onChange={(
                                          e
                                        ) =>
                                          updateDetail(
                                            "apartment",
                                            e
                                              .target
                                              .value
                                          )
                                        }
                                        placeholder="Optional"
                                      />
                                    </label>

                                    <label>
                                      City *

                                      <input
                                        className={
                                          fieldClass
                                        }
                                        required
                                        autoComplete="address-level2"
                                        value={
                                          details.city
                                        }
                                        onChange={(
                                          e
                                        ) =>
                                          updateDetail(
                                            "city",
                                            e
                                              .target
                                              .value
                                          )
                                        }
                                      />
                                    </label>

                                    <div className="grid grid-cols-2 gap-3">
                                      <label>
                                        State *

                                        <input
                                          className={
                                            fieldClass
                                          }
                                          required
                                          autoComplete="address-level1"
                                          maxLength={
                                            2
                                          }
                                          value={
                                            details.state
                                          }
                                          onChange={(
                                            e
                                          ) =>
                                            updateDetail(
                                              "state",
                                              e.target.value.toUpperCase()
                                            )
                                          }
                                        />
                                      </label>

                                      <label>
                                        ZIP Code
                                        *

                                        <input
                                          className={
                                            fieldClass
                                          }
                                          required
                                          inputMode="numeric"
                                          maxLength={
                                            5
                                          }
                                          autoComplete="postal-code"
                                          value={
                                            details.zip
                                          }
                                          onChange={(
                                            e
                                          ) =>
                                            updateDetail(
                                              "zip",
                                              e
                                                .target
                                                .value
                                                .replace(
                                                  /\D/g,
                                                  ""
                                                )
                                            )
                                          }
                                        />
                                      </label>
                                    </div>

                                    <label>
                                      Delivery
                                      Instructions

                                      <textarea
                                        className={
                                          fieldClass
                                        }
                                        rows={
                                          3
                                        }
                                        maxLength={
                                          500
                                        }
                                        value={
                                          details.instructions
                                        }
                                        onChange={(
                                          e
                                        ) =>
                                          updateDetail(
                                            "instructions",
                                            e
                                              .target
                                              .value
                                          )
                                        }
                                        placeholder="Apartment gate, entrance, or delivery notes"
                                      />
                                    </label>
                                  </div>
                                </div>
                              )}
                          </section>

                          {detailsError && (
                            <p
                              role="alert"
                              className="cart-error mt-4"
                            >
                              {
                                detailsError
                              }
                            </p>
                          )}

                          <button
                            type="submit"
                            className="store-primary mt-6 w-full"
                            disabled={
                              !quote?.canCheckout
                            }
                          >
                            CONTINUE TO
                            REVIEW →
                          </button>

                          <Link
                            className="cart-back-link mt-5 block"
                            href="/cart"
                          >
                            {"\u2190"} Back to Cart
                          </Link>
                        </form>
                      ) : (
                        <>
                          <section className="checkout-box">
                            <h2 className="text-xl font-bold mb-4">
                              Customer
                              Information
                            </h2>

                            <p>
                              <strong>
                                {
                                  details.fullName
                                }
                              </strong>
                            </p>

                            <p>
                              {
                                details.email
                              }
                            </p>

                            <p>
                              {
                                details.phone
                              }
                            </p>

                            <p className="mt-3">
                              <strong>
                                Age
                                eligibility:
                              </strong>{" "}
                              21+ confirmed
                            </p>

                            <h3 className="font-bold mt-5">
                              {fulfillment ===
                              "pickup"
                                ? "Local Meetup"
                                : fulfillment ===
                                    "delivery"
                                  ? "Local Delivery"
                                  : "Shipping"}
                            </h3>

                            {fulfillment !==
                              "pickup" && (
                              <p className="mt-2">
                                {
                                  details.street
                                }
                                {details.apartment &&
                                  `, ${details.apartment}`}
                                <br />
                                {
                                  details.city
                                }
                                ,{" "}
                                {
                                  details.state
                                }{" "}
                                {
                                  details.zip
                                }
                              </p>
                            )}

                            <button
                              type="button"
                              className="cart-back-link mt-5"
                              onClick={() =>
                                setStep(
                                  "information"
                                )
                              }
                            >
                              EDIT
                              INFORMATION
                            </button>
                          </section>

                          <section className="checkout-box mt-5">
                            <h2 className="text-xl font-bold mb-4">
                              Order Request
                            </h2>

                            {orderRequestsEnabled ? (
                              <>
                                <p className="store-muted">
                                  Submit your
                                  information
                                  as an order
                                  request. No
                                  payment is
                                  collected by
                                  this step.
                                </p>

                                <button
                                  type="button"
                                  className="store-primary mt-5 w-full"
                                  disabled={
                                    orderBusy ||
                                    !quote?.canCheckout
                                  }
                                  onClick={() =>
                                    void submitOrderRequest()
                                  }
                                >
                                  {orderBusy
                                    ? "SUBMITTINGâ€¦"
                                    : "SUBMIT ORDER REQUEST"}
                                </button>
                              </>
                            ) : (
                              <>
                                <p className="store-muted">
                                  Online order
                                  requests are
                                  currently
                                  locked. The
                                  connection is
                                  installed but
                                  will remain
                                  disabled
                                  until
                                  checkout
                                  safeguards
                                  are complete.
                                </p>

                                <button
                                  type="button"
                                  className="store-primary mt-5 w-full"
                                  disabled
                                >
                                  ORDER
                                  REQUESTS
                                  LOCKED
                                </button>
                              </>
                            )}

                            {orderError && (
                              <p
                                role="alert"
                                className="cart-error mt-4"
                              >
                                {
                                  orderError
                                }
                              </p>
                            )}
                          </section>

                          <section className="checkout-box mt-5">
                            <h2 className="text-xl font-bold mb-4">
                              Demo Payment
                            </h2>

                            <p className="store-muted">
                              The Apple Pay
                              interface below
                              remains a demo.
                              It does not
                              charge money or
                              create a
                              customer order.
                            </p>
                          </section>

                          <PaymentOptions
                            onMethodChange={setPaymentMethod}
                            disabled={
                              !quote?.canCheckout ||
                              !fulfillment
                            }
                            total={orderTotal(quote?.subtotal || 0, fulfillment)}
                            onApplePay={
                              openPayment
                            }
                          />

                          <Link
                            className="cart-back-link"
                            href="/cart"
                          >
                            {"\u2190"} Edit Your Cart
                          </Link>
                        </>
                      )}
                    </div>

                    <aside className="checkout-summary">
                      <h2 className="text-xl">
                        Order Summary
                      </h2>

                      {quote?.items.map(
                        (item) => (
                          <div
                            key={
                              item.lineId
                            }
                            className="store-cart-line"
                          >
                            <div className="cart-item-heading">
                              {item.image && (
                                <img
                                  src={
                                    item.image
                                  }
                                  alt=""
                                />
                              )}

                              <div>
                                <strong>
                                  {
                                    item.name
                                  }
                                </strong>

                                <p>
                                  {
                                    item.variant
                                  }
                                </p>

                                <p>
                                  {
                                    item.quantity
                                  }{" "}
                                  ×{" "}
                                  {money(
                                    item.price
                                  )}
                                </p>
                              </div>
                            </div>

                            {item.error && (
                              <p className="cart-error">
                                {
                                  item.error
                                }
                              </p>
                            )}

                            {item.priceChanged && (
                              <p className="cart-notice">
                                Price
                                updated to{" "}
                                {money(
                                  item.price
                                )}{" "}
                                each.
                              </p>
                            )}
                          </div>
                        )
                      )}

                      <p className="store-cart-total">
                        Subtotal

                        <strong>
                          {money(
                            quote?.subtotal ||
                              0
                          )}
                        </strong>
                      </p>

                      {fulfillment === "delivery" && <p className="store-cart-total">Local delivery fee <strong>{money(deliveryFee(fulfillment))}</strong></p>}<p className="store-cart-total">Total before tax <strong>{money(orderTotal(quote?.subtotal || 0, fulfillment))}</strong></p><p className="store-muted">Taxes are not yet included.</p>

                      {quote &&
                        !quote.canCheckout && (
                          <p className="cart-error">
                            Fix the
                            highlighted
                            items before
                            continuing.
                          </p>
                        )}

                      <button
                        type="button"
                        className="cart-back-link mt-4"
                        onClick={
                          saveReviewedCart
                        }
                      >
                        Save reviewed cart
                      </button>
                    </aside>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <StoreFooter />

      <dialog
        ref={sheet}
        className="demo-payment-sheet"
        onCancel={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
      >
        <header className="demo-sheet-header">
          <strong>
            Apple Pay{" "}
            <span className="demo-badge">
              DEMO
            </span>
          </strong>

          <button
            disabled={busy}
            onClick={() =>
              sheet.current?.close()
            }
          >
            Cancel
          </button>
        </header>

        <div className="demo-sheet-body">
          <p className="demo-sheet-disclaimer">
            SIMULATION ONLY Â· NO
            MONEY WILL BE CHARGED
          </p>

          <div className="demo-card">
            <div className="demo-card-mark">
              DEMO CARD
            </div>

            <strong>
              Sample Wallet Card
            </strong>

            <p>
              â€¢â€¢â€¢â€¢ 0000 Â· Not a real
              card
            </p>
          </div>

          <div className="demo-sheet-row">
            <span>
              Merchant
            </span>

            <strong>
              TRAP HOUSE NC
            </strong>
          </div>

          <div className="demo-sheet-row">
            <span>
              Fulfillment
            </span>

            <strong>
              {fulfillment ===
              "pickup"
                ? "Local Meetup"
                : fulfillment ===
                    "delivery"
                  ? "Local Delivery"
                  : "Shipping"}
            </strong>
          </div>

          <div className="demo-sheet-row">
            <span>
              Demo Amount
            </span>

            <strong>
              {money(orderTotal(quote?.subtotal || 0, fulfillment))}
            </strong>
          </div>

          <label className="demo-outcome">
            Simulation Result

            <select
              disabled={busy}
              value={outcome}
              onChange={(event) => {
                setOutcome(
                  event.target.value
                );

                setPaymentError("");
              }}
            >
              <option value="approved">
                Approved
              </option>

              <option value="declined">
                Declined
              </option>
            </select>
          </label>

          {paymentError && (
            <p
              role="alert"
              className="cart-error"
            >
              {paymentError}
            </p>
          )}

          <button
            className="demo-pay-button"
            disabled={
              busy ||
              !quote?.canCheckout
            }
            onClick={simulate}
          >
            {busy
              ? "SAVING DEMO RECEIPTâ€¦"
              : "SIMULATE PAYMENT"}
          </button>

          <p
            className="store-muted"
            style={{
              textAlign: "center",
              marginTop: 14,
            }}
          >
            No card, passcode,
            fingerprint, or Face ID is
            requested. Customer contact
            information is not saved by
            the demo payment.
          </p>
        </div>
      </dialog>
    </main>
  );
}

