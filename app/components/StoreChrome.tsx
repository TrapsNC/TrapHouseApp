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
  const textDialog = useRef<HTMLDialogElement>(null);
  const [copyMessage, setCopyMessage] = useState("");
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
            <span>Cart</span>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="20" r="1" />
              <circle cx="19" cy="20" r="1" />
              <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6" />
            </svg>
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

      {!open && (
        <button
          type="button"
          onClick={() => { setCopyMessage(""); textDialog.current?.showModal(); }}
          aria-label="Text Trap House NC at (424) 262-7604"
          className="store-text-button"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z" />
          </svg>
          Text the store
        </button>
      )}

      <dialog ref={textDialog} aria-labelledby="store-text-title" className="store-contact-dialog"
        onClick={(event) => { if (event.target === event.currentTarget) textDialog.current?.close(); }}>
        <div className="flex justify-between items-center gap-4">
          <h2 id="store-text-title" className="text-xl font-bold">Text Trap House NC</h2>
          <button type="button" aria-label="Close text options" className="p-3"
            onClick={() => textDialog.current?.close()}>Close</button>
        </div>
        <p className="mt-4">Send your message to <strong>(424) 262-7604</strong>.</p>
        <p className="mt-2 text-sm">On your phone, open Messages below. On a computer, copy the number into your texting app.</p>
        <div className="flex flex-wrap gap-3 mt-5">
          <a href="sms:+14242627604" className="store-primary p-3">Open Messages</a>
          <button type="button" className="border rounded-lg p-3" onClick={async () => {
            try { await navigator.clipboard.writeText("(424) 262-7604"); setCopyMessage("Number copied."); }
            catch { setCopyMessage("Select and copy the number above."); }
          }}>Copy number</button>
          <a href="mailto:traphousenc919@gmail.com" className="underline p-3">Email instead</a>
        </div>
        <p role="status" className="mt-3">{copyMessage}</p>
      </dialog>

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
              {"\u00d7"}
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
            View full cart {"\u2192"}
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

      <Link href="/rewards" className="underline block mb-4">REWARDS &amp; OFFERS</Link>
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