"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StoreFooter, StoreHeader } from "./components/StoreChrome";

const homeCategories = [
  {
    name: "DISPOSABLES",
    image: "/categories/disposables.png",
    href: "/shop?category=DISPOSABLES#shop",
  },
  {
    name: "THCA",
    image: "/categories/thca.png",
    href: "/shop?category=THCA#shop",
  },
  {
    name: "TOBACCO",
    image: "/categories/tobacco.png",
    href: "/shop?category=TOBACCO#shop",
  },
  {
    name: "ACCESSORIES",
    image: "/categories/accessories.png",
    href: "/shop?category=ACCESSORIES#shop",
  },
];

export default function Home() {
  const [verified, setVerified] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setVerified(
      sessionStorage.getItem("trap-age-confirmed") === "true"
    );

    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main
        className="storefront min-h-screen"
        style={{ background: "#050505" }}
      />
    );
  }

  if (!verified) {
    return (
      <main
        className="storefront min-h-screen flex items-center justify-center p-6"
        style={{
          background: "#050505",
          color: "white",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 440,
            border: "1px solid #3f3f46",
            padding: 40,
            textAlign: "center",
          }}
        >
          <img
            src="/trap-house-logo.png"
            alt="TRAP HOUSE NC"
            style={{
              width: 130,
              height: 130,
              objectFit: "cover",
              borderRadius: "50%",
              margin: "0 auto 24px",
            }}
          />

          <p
            style={{
              fontSize: 11,
              letterSpacing: ".2em",
              color: "#aaa",
            }}
          >
            WELCOME TO
          </p>

          <h1
            style={{
              marginTop: 12,
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            TRAP HOUSE NC
          </h1>

          <p
            style={{
              marginTop: 22,
              color: "#ccc",
              lineHeight: 1.6,
            }}
          >
            You must be 21 or older to enter.
          </p>

          <button
            onClick={() => {
              sessionStorage.setItem(
                "trap-age-confirmed",
                "true"
              );
              setVerified(true);
            }}
            style={{
              marginTop: 30,
              width: "100%",
              background: "white",
              color: "#050505",
              padding: 16,
              fontWeight: 800,
              letterSpacing: ".08em",
            }}
          >
            I AM 21+
          </button>

          <a
            href="https://google.com"
            style={{
              display: "block",
              marginTop: 12,
              border: "1px solid #555",
              padding: 16,
            }}
          >
            EXIT
          </a>

          <p
            style={{
              marginTop: 22,
              fontSize: 11,
              color: "#777",
              lineHeight: 1.6,
            }}
          >
            Age confirmation does not replace legally
            required age verification for regulated purchases.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="storefront min-h-screen">
      <StoreHeader />

      <section
        style={{
          background:
            "radial-gradient(circle at 80% 40%, #3a260c 0%, #15100a 24%, #050505 62%)",
          color: "white",
          minHeight: "clamp(520px, 72vh, 760px)",
          display: "flex",
          alignItems: "center",
          padding: "70px 24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            width: "100%",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "center",
            gap: 48,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                letterSpacing: ".22em",
                color: "#d3ad62",
                marginBottom: 18,
              }}
            >
              WELCOME TO THE TRAP
            </p>

            <h1
              style={{
                fontSize: "clamp(48px, 8vw, 90px)",
                lineHeight: .94,
                letterSpacing: "-.04em",
                fontWeight: 900,
                maxWidth: 700,
              }}
            >
              TRAP
              <br />
              HOUSE NC
            </h1>

            <p
              style={{
                maxWidth: 570,
                marginTop: 28,
                color: "#bbb",
                lineHeight: 1.7,
                fontSize: 16,
              }}
            >
              Shop disposables, THCA, tobacco,
              accessories and more from one place.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 32,
              }}
            >
              <Link
                href="/shop"
                style={{
                  background: "white",
                  color: "#050505",
                  padding: "16px 26px",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: ".1em",
                }}
              >
                SHOP ALL
              </Link>

              <Link
                href="/shop?category=THCA#shop"
                style={{
                  border: "1px solid #777",
                  color: "white",
                  padding: "16px 26px",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: ".1em",
                }}
              >
                SHOP THCA
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src="/trap-house-logo.png"
              alt="TRAP HOUSE NC"
              style={{
                width: "min(420px, 82vw)",
                height: "auto",
                display: "block",
                borderRadius: "50%",
              }}
            />
          </div>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "75px 24px",
        }}
      >
        <p className="store-kicker">
          SHOP THE TRAP
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 20,
            marginBottom: 36,
          }}
        >
          <div>
            <h2 className="store-title">
              Choose your category.
            </h2>

            <p className="store-intro">
              Jump straight into what you came for,
              or browse the full shop.
            </p>
          </div>

          <Link
            href="/shop"
            style={{
              fontSize: 12,
              letterSpacing: ".1em",
              textDecoration: "underline",
              textUnderlineOffset: 5,
            }}
          >
            VIEW ALL PRODUCTS
          </Link>
        </div>

        <div className="store-collections">
          {homeCategories.map((item) => (
            <Link
              className="store-collection"
              href={item.href}
              key={item.name}
            >
              <img
                src={item.image}
                alt={`${item.name} collection`}
              />

              <span>
                {item.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{
          background: "#050505",
          color: "white",
          padding: "80px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <p
            style={{
              color: "#999",
              fontSize: 11,
              letterSpacing: ".18em",
            }}
          >
            SHOP YOUR WAY
          </p>

          <h2
            style={{
              fontSize: "clamp(34px, 5vw, 56px)",
              margin: "12px 0 40px",
              lineHeight: 1.05,
            }}
          >
            Pickup. Delivery. Shipping.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 18,
            }}
          >
            <HomeInfoCard
              number="01"
              title="STORE PICKUP"
              text="Place your order online and pick it up when it is ready."
            />

            <HomeInfoCard
              number="02"
              title="LOCAL DELIVERY"
              text="Eligible local orders can choose delivery where available."
            />

            <HomeInfoCard
              number="03"
              title="SHIPPING"
              text="Eligible products can be shipped to permitted destinations."
            />
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "90px 24px",
          textAlign: "center",
        }}
      >
        <p className="store-kicker">
          READY?
        </p>

        <h2
          style={{
            fontSize: "clamp(38px, 7vw, 72px)",
            margin: "14px auto 20px",
            lineHeight: 1,
          }}
        >
          ENTER THE SHOP.
        </h2>

        <p
          style={{
            color: "#666",
            maxWidth: 500,
            margin: "0 auto 30px",
            lineHeight: 1.7,
          }}
        >
          Browse all available products,
          categories and current inventory.
        </p>

        <Link
          href="/shop"
          style={{
            display: "inline-block",
            background: "#050505",
            color: "white",
            padding: "17px 30px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".12em",
          }}
        >
          SHOP NOW
        </Link>
      </section>

      <StoreFooter />
    </main>
  );
}

function HomeInfoCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #333",
        padding: 30,
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: "#777",
          letterSpacing: ".14em",
          marginBottom: 28,
        }}
      >
        {number}
      </p>

      <h3
        style={{
          fontSize: 18,
          letterSpacing: ".06em",
          marginBottom: 12,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          color: "#aaa",
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {text}
      </p>
    </div>
  );
}