"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { collections } from "@/lib/catalog";
import { CartContents } from "./CartContents";
import "./storefront.css";

export function StoreHeader() {
  const [open, setOpen] = useState(false);
  const dialog =
    useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;

    const sheet = dialog.current;
    sheet?.showModal();

    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      sheet?.close();

      document.body.style.overflow =
        previous;
    };
  }, [open]);

  return (
    <>
      <div className="store-announcement">
        WELCOME TO TRAP HOUSE NC
      </div>

      <header className="store-header">
        <div className="store-header-top">
          <Link
            href="/shop#shop"
            className="store-search-link"
          >
            Search
          </Link>

          <Link
            href="/"
            aria-label="Trap House home"
            className="store-brand"
          >
            <img
              src="/trap-house-logo.png"
              alt="TRAP HOUSE NC"
              style={{
                width:
                  "clamp(130px, 22vw, 170px)",
                height: "auto",
                display: "block",
              }}
            />
          </Link>

          <button
            onClick={() =>
              setOpen(true)
            }
            className="store-cart-button"
          >
            Cart{" "}
            <span aria-hidden="true">
              ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â€
            </span>
          </button>
        </div>

        <nav
          aria-label="Collections"
          className="store-navigation"
        >
          {collections.map(
            (category) => (
              <a
                key={category}
                href={`/shop?category=${category}#shop`}
              >
                {category}
              </a>
            )
          )}
        </nav>
      </header>

      <dialog
        ref={dialog}
        aria-label="Your cart"
        className="store-cart-dialog"
        onCancel={() =>
          setOpen(false)
        }
        onClose={() =>
          setOpen(false)
        }
        onClick={(event) => {
          if (
            event.target ===
            event.currentTarget
          ) {
            setOpen(false);
          }
        }}
      >
        <section className="store-cart-panel">
          <div className="store-cart-title">
            <h2>Your cart</h2>

            <button
              autoFocus
              aria-label="Close cart"
              onClick={() =>
                setOpen(false)
              }
            >
              ÃƒÆ’Ã¢â‚¬â€
            </button>
          </div>

          {open && (
            <CartContents
              onNavigate={() =>
                setOpen(false)
              }
            />
          )}

          <Link
            href="/cart"
            className="cart-back-link"
            onClick={() =>
              setOpen(false)
            }
          >
            View full cart ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
          </Link>

          <button
            className="cart-back-link"
            onClick={() =>
              setOpen(false)
            }
          >
            Continue shopping
          </button>
        </section>
      </dialog>
    </>
  );
}

export function StoreFooter() {
  const [year, setYear] =
    useState(2026);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setYear(
          new Date().getFullYear()
        ),
      0
    );

    return () =>
      clearTimeout(timer);
  }, []);

  return (
    <footer className="store-footer">
      <p className="store-footer-heading">
        Discover the Unseen.
      </p>

      <p>
        Find your next favorite at
        Trap House NC.
      </p>

      <div className="store-footer-links">
        <Link href="/shop#shop">
          SHOP ALL
        </Link>

        {collections.map(
          (category) => (
            <a
              key={category}
              href={`/shop?category=${category}#shop`}
            >
              {category}
            </a>
          )
        )}

        <Link href="/cart">
          CART
        </Link>
      </div>

      <nav
        aria-label="Store information"
        className="store-footer-links"
      >
        <Link href="/pages/about-us">
          ABOUT US
        </Link>

        <Link href="/pages/contact">
          CONTACT
        </Link>

        <Link href="/pages/delivery">
          DELIVERY INFORMATION
        </Link>

        <Link href="/pages/lab-results">
          LAB RESULTS
        </Link>
      </nav>

      <nav
        aria-label="Policies"
        className="store-footer-links store-policy-links"
      >
        <Link href="/policies/privacy-policy">
          Privacy policy
        </Link>

        <Link href="/policies/refund-policy">
          Refund policy
        </Link>

        <Link href="/policies/terms-of-service">
          Terms of service
        </Link>

        <Link href="/policies/shipping-policy">
          Shipping policy
        </Link>

        <Link href="/policies/contact-information">
          Contact information
        </Link>

        <Link href="/policies/legal-notice">
          Legal notice
        </Link>

        
      </nav>

      <p className="store-footer-small">
        21+ only. Delivery and
        shipping eligibility are
        confirmed before checkout.
      </p>

      <p className="store-footer-small">
        Copyright {year} TRAP HOUSE NC
      </p>
    </footer>
  );
}