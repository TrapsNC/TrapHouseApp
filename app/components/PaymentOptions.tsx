"use client";

import { useState } from "react";

type Method = "cashapp" | "zelle" | "cash";

const cashtag = (
  process.env.NEXT_PUBLIC_CASH_APP_CASHTAG ||
  "traphousedirect"
)
  .trim()
  .replace(/^\$/, "");

const zelleRecipient = (
  process.env.NEXT_PUBLIC_ZELLE_RECIPIENT || ""
).trim();

const cashQr =
  process.env.NEXT_PUBLIC_CASH_APP_QR_IMAGE ||
  "/payments/cash-app.svg";

export default function PaymentOptions({
  disabled,
  total,
  onMethodChange,
}: {
  disabled: boolean;
  total: number;
  onApplePay?: () => void;
  onMethodChange?: (method: Method) => void;
}) {
  const [method, setMethod] =
    useState<Method>("cash");

  const [copied, setCopied] =
    useState("");

  const [copyError, setCopyError] =
    useState("");

  const recipient =
    method === "cashapp"
      ? cashtag
        ? `$${cashtag}`
        : ""
      : zelleRecipient;

  async function copyRecipient() {
    if (!recipient) return;

    try {
      await navigator.clipboard.writeText(
        recipient
      );

      setCopied(recipient);
      setCopyError("");
    } catch {
      setCopyError(
        "Copy is unavailable. Select the payment details below to copy them."
      );
    }
  }

  const roundedCash = Math.round(total);
  const cashDifference =
    roundedCash - total;

  return (
    <section className="checkout-box">
      <h2>Payment</h2>

      <div
        className="checkout-methods"
        role="group"
        aria-label="Payment method"
      >
        <label
          className="checkout-method"
          style={{
            opacity: 0.55,
            cursor: "not-allowed",
          }}
        >
          <input
            type="radio"
            name="payment-method"
            value="apple"
            disabled
          />

          <span>
            Apple Pay - Coming Soon
          </span>
        </label>

        {(
          [
            ["cash", "Cash"],
            ["cashapp", "Cash App"],
            ["zelle", "Zelle"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={
              method === value
                ? "checkout-method selected"
                : "checkout-method"
            }
          >
            <input
              type="radio"
              name="payment-method"
              value={value}
              checked={method === value}
              disabled={disabled}
              onChange={() => {
                setMethod(value);
                onMethodChange?.(value);
                setCopied("");
                setCopyError("");
              }}
            />

            <span>{label}</span>
          </label>
        ))}
      </div>

      {method === "cash" ? (
        <div className="manual-payment-panel">
          <h3>Pay with cash</h3>

          <p>
            Order total:{" "}
            <strong>
              ${total.toFixed(2)}
            </strong>
          </p>

          <p>
            Cash rounding adjustment:{" "}
            <strong>
              {cashDifference < 0
                ? "-"
                : "+"}
              $
              {Math.abs(
                cashDifference
              ).toFixed(2)}
            </strong>
          </p>

          <p className="store-cart-total">
            Cash amount{" "}
            <strong>
              $
              {roundedCash.toFixed(2)}
            </strong>
          </p>

          <p className="cart-notice">
            Cash orders are rounded to the
            nearest whole dollar.
          </p>

          <p className="store-muted">
            Pay at local meetup or to your
            delivery driver. Your order will
            not be marked paid until payment
            is confirmed by Trap House NC.
          </p>
        </div>
      ) : (
        <div className="manual-payment-panel">
          <h3>
            {method === "cashapp"
              ? "Pay with Cash App"
              : "Pay with Zelle"}
          </h3>

          <p>
            Amount due:{" "}
            <strong>
              ${total.toFixed(2)}
            </strong>
          </p>

          <p className="cart-notice">
            Verify the payment recipient and
            exact amount before sending
            payment.
          </p>

          {recipient ? (
            <>
              <p className="manual-payment-recipient">
                {recipient}
              </p>

              <button
                type="button"
                className="cart-back-link"
                onClick={copyRecipient}
              >
                Copy payment details
              </button>

              {copied === recipient && (
                <p role="status">
                  Payment details copied.
                </p>
              )}

              {copyError && (
                <p role="alert">
                  {copyError}
                </p>
              )}
            </>
          ) : (
            <p className="store-muted">
              {method === "cashapp"
                ? "Cash App payment details are unavailable."
                : "Zelle payment details are being connected."}
            </p>
          )}

          {method === "cashapp" &&
            cashQr && (
              <figure className="manual-payment-qr">
                <img
                  src={cashQr}
                  alt="Cash App payment QR code for Trap House NC"
                />

                <figcaption>
                  Scan with your phone and
                  verify the cashtag is
                  ${cashtag}.
                </figcaption>
              </figure>
            )}

          {method === "cashapp" &&
            cashtag && (
              <a
                className="store-primary cart-checkout-link"
                href={`https://cash.app/$${encodeURIComponent(
                  cashtag
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                OPEN CASH APP
              </a>
            )}

          {method === "zelle" && (
            <p className="store-muted">
              Open Zelle inside your banking
              app and send the exact amount to
              the recipient shown above.
            </p>
          )}

          <p className="store-muted">
            Sending payment does not
            automatically mark the order as
            paid. Trap House NC must verify
            receipt.
          </p>
        </div>
      )}
    </section>
  );
}