"use client";
import { createId } from "@/lib/create-id";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { StoreHeader, StoreFooter } from "@/app/components/StoreChrome";
import { collectionFor } from "@/lib/catalog";
import { readCart, writeCart } from "@/lib/cart";

type Product = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  price: number | string;
  stock: number;
  image_url?: string | null;
  handle: string;
  vendor?: string | null;
};

type Variant = {
  id: string;
  product_id: string;
  option1_name?: string | null;
  option1_value?: string | null;
  option2_name?: string | null;
  option2_value?: string | null;
  option3_name?: string | null;
  option3_value?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price: number | string;
  compare_at_price?: number | string | null;
  stock: number;
  image_url?: string | null;
  active: boolean;
};

type FulfillmentMethod = "pickup" | "delivery" | "shipping";

export default function ProductPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-white text-zinc-900">
        <p className="text-zinc-600">Loading product...</p>
      </main>
    }>
      <ProductContent />
    </Suspense>
  );
}

function ProductContent() {
  const params = useParams();
  const router = useRouter();

  const handle = params.handle as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] =
    useState<FulfillmentMethod>("pickup");
  const [loading, setLoading] = useState(true);
  const [cartMessage, setCartMessage] = useState("");

  useEffect(() => {
    loadProduct();
  }, [handle]);

  async function loadProduct() {
    setLoading(true);
    setProduct(null);
    setVariants([]);
    setSelectedVariantId("");
    setQuantity(1);

    const {
      data: productData,
      error: productError,
    } = await supabase
      .from("products")
      .select("*")
      .eq(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle) ? "id" : "handle", handle)
      .eq("active", true)
      .single();

    if (productError || !productData) {
      console.error(productError);
      setLoading(false);
      return;
    }

    setProduct(productData);

    const {
      data: variantData,
      error: variantError,
    } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productData.id)
      .eq("active", true)
      .order("price", { ascending: true });

    if (variantError) {
      console.error(variantError);
    }

    const loadedVariants: Variant[] = variantData || [];

    setVariants(loadedVariants);

    if (loadedVariants.length > 0) {
      setSelectedVariantId((loadedVariants.find((variant) => variant.stock > 0) || loadedVariants[0]).id);
    }

    setLoading(false);
  }

  const selectedVariant = useMemo(() => {
    return variants.find(
      (variant) => variant.id === selectedVariantId
    );
  }, [variants, selectedVariantId]);

  const displayPrice = selectedVariant
    ? Number(selectedVariant.price)
    : Number(product?.price || 0);

  const displayStock = selectedVariant
    ? selectedVariant.stock
    : product?.stock || 0;

  const displayImage =
    selectedVariant?.image_url ||
    product?.image_url ||
    null;

  function variantLabel(variant: Variant) {
    const options = [
      variant.option1_value,
      variant.option2_value,
      variant.option3_value,
    ].filter(
      (value) =>
        value &&
        value.toLowerCase() !== "default title"
    );

    if (options.length === 0) {
      return product?.name || "Default";
    }

    return options.join(" / ");
  }

  const cleanCategory = product ? collectionFor(product.category, product.name) : "";
  const total = (displayPrice * quantity).toFixed(2);

  function addToCart() {
    if (!product) return;

    if (displayStock <= 0) {
      setCartMessage("This option is out of stock.");
      return;
    }

    const item = {
      lineId: createId(),
      productId: product.id,
      variantId: selectedVariant?.id || null,
      name: product.name,
      variant: selectedVariant
        ? variantLabel(selectedVariant)
        : null,
      price: displayPrice,
      quantity,
      fulfillment,
      image: displayImage,
    };

    try {
      const existingCart = readCart();
      const alreadyAdded = existingCart
        .filter(line => line.productId === item.productId && line.variantId === item.variantId)
        .reduce((sum, line) => sum + line.quantity, 0);
      if (alreadyAdded + quantity > displayStock) {
        setCartMessage(`Only ${displayStock} available; you already have ${alreadyAdded} in your cart. Open Cart to edit your selections.`);
        return;
      }
      const matching = existingCart.find(line =>
        line.productId === item.productId && line.variantId === item.variantId && line.fulfillment === fulfillment
      );
      if (matching) {
        matching.quantity += quantity;
        matching.price = displayPrice;
      } else {
        existingCart.push(item);
      }
      writeCart(existingCart);
    } catch {
      setCartMessage("Your cart could not be saved on this device. Please try again.");
      return;
    }
    setCartMessage(`Added to cart: ${quantity} × ${item.variant || item.name} · ${fulfillment} · $${total}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-zinc-900">
        <p className="text-zinc-600">
          Loading product...
        </p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-zinc-900">
        <div className="text-center">
          <h1 className="text-3xl font-black">
            Product not found
          </h1>

          <button
            onClick={() => router.push("/")}
            className="mt-5 rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            BACK TO SHOP
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="storefront min-h-screen bg-white pb-32 text-zinc-900 md:pb-0">
      <StoreHeader />
      {cartMessage && (
        <div role="status" className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-white shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <p>{cartMessage}</p>
            <button aria-label="Dismiss cart message" onClick={() => setCartMessage("")} className="shrink-0 px-2 py-1 font-bold">×</button>
          </div>
        </div>
      )}
      <div className="store-product-content mx-auto max-w-6xl p-5 md:p-8">

        <button
          onClick={() => router.back()}
          className="mb-6 text-sm font-bold text-zinc-600"
        >
          ← BACK
        </button>

        <div className="grid gap-8 md:grid-cols-2">

          <div>
            <div className="product-media overflow-hidden border border-zinc-200 bg-white">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={product.name}
                  className="aspect-square w-full object-contain"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-zinc-600">
                  PRODUCT IMAGE
                </div>
              )}
            </div>
          </div>

          <div>

            <p className="text-xs font-bold uppercase text-zinc-600">
              {cleanCategory}
            </p>

            <h1 className="mt-2 text-4xl font-black">
              {product.name}
            </h1>

            {product.vendor && (
              <p className="mt-2 text-sm text-zinc-600">
                {product.vendor}
              </p>
            )}

            <p className="mt-5 text-3xl font-black">
              ${displayPrice.toFixed(2)}
            </p>

            <p
              className={
                displayStock > 0
                  ? "mt-2 font-bold text-green-700"
                  : "mt-2 font-bold text-red-700"
              }
            >
              {displayStock > 0
                ? `${displayStock} in stock`
                : "Out of stock"}
            </p>

            {variants.length > 0 && (
              <section className="mt-8">

                <h2 className="text-sm font-bold uppercase text-zinc-600">
                  Choose Flavor / Option
                </h2>

                <div className="variant-grid mt-3">

                  {variants.map((variant) => {
                    const selected =
                      selectedVariantId === variant.id;

                    return (
                      <button
                        key={variant.id}
                        disabled={variant.stock <= 0}
                        onClick={() => {
                          if (selectedVariantId !== variant.id) {
                            setSelectedVariantId(variant.id);
                            setQuantity(1);
                          }
                        }}
                        aria-pressed={selected}
                        className={`variant-choice flex items-center justify-between border p-4 text-left ${
                          selected
                            ? "border-black bg-black text-white"
                            : "border-zinc-200 bg-white"
                        } ${
                          variant.stock <= 0
                            ? "opacity-40"
                            : ""
                        }`}
                      >
                        <span className="font-bold">
                          {variantLabel(variant)}
                        </span>

                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {variant.stock <= 0 && (
                            <span className="text-xs font-black">SOLD OUT</span>
                          )}
                          <span>${Number(variant.price).toFixed(2)}</span>
                        </span>
                      </button>
                    );
                  })}

                </div>

              </section>
            )}

            <section className="mt-8">

              <p className="text-sm font-bold uppercase text-zinc-600">
                Quantity
              </p>

              <div className="mt-3 flex w-fit items-center rounded-2xl border border-zinc-200">

                <button
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1 || displayStock <= 0}
                  onClick={() =>
                    setQuantity((q) =>
                      Math.max(1, q - 1)
                    )
                  }
                  className="px-5 py-3 text-xl"
                >
                  −
                </button>

                <span className="min-w-12 text-center font-bold">
                  {quantity}
                </span>

                <button
                  aria-label="Increase quantity"
                  disabled={displayStock <= 0 || quantity >= displayStock}
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(
                        Math.max(1, displayStock),
                        q + 1
                      )
                    )
                  }
                  className="px-5 py-3 text-xl"
                >
                  +
                </button>

              </div>

            </section>

            <section className="mt-8">

              <p className="text-sm font-bold uppercase text-zinc-600">
                Fulfillment
              </p>

              <div className="mt-3 space-y-3">

                <button
                  onClick={() =>
                    setFulfillment("pickup")
                  }
                  className={`w-full border p-4 text-left ${
                    fulfillment === "pickup"
                      ? "border-black bg-black text-white"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <p className="font-black">
                    🏪 LOCAL MEETUP
                  </p>

                  <p className="mt-1 text-sm opacity-70">
                    Arrange a local meetup after your order is confirmed.
                  </p>
                </button>

                <button
                  onClick={() =>
                    setFulfillment("delivery")
                  }
                  className={`w-full border p-4 text-left ${
                    fulfillment === "delivery"
                      ? "border-black bg-black text-white"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <p className="font-black">
                    🚗 LOCAL DELIVERY
                  </p>

                  <p className="mt-1 text-sm opacity-70">
                    Delivery availability is confirmed
                    at checkout.
                  </p>
                </button>

              </div>

            </section>

            {product.description && (
              <section className="mt-8 border-t border-zinc-200 pt-6">

                <h2 className="font-black">
                  Product Details
                </h2>

                <div
                  className="product-description mt-3 leading-7 text-zinc-600"
                  dangerouslySetInnerHTML={{
                    __html: product.description,
                  }}
                />

              </section>
            )}

            <button
              disabled={displayStock <= 0}
              onClick={addToCart}
              className="mt-8 w-full rounded-2xl bg-black py-5 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {displayStock <= 0
                ? "OUT OF STOCK"
                : `ADD TO CART · $${(
                    displayPrice * quantity
                  ).toFixed(2)}`}
            </button>

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-xs leading-5 text-zinc-600">
                21+ only. Age confirmation on this site
                does not replace legally required age
                verification for regulated purchases.
                Delivery and shipping eligibility must
                be confirmed before checkout.
              </p>
            </div>

          </div>

        </div>

      </div>
      <StoreFooter />
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white p-4 md:hidden"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="shrink-0">
            <p className="text-xs font-bold text-zinc-600">TOTAL</p>
            <p className="text-xl font-black" aria-live="polite">${total}</p>
          </div>
          <button
            disabled={displayStock <= 0}
            onClick={addToCart}
            className="flex-1 rounded-2xl bg-black px-4 py-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {displayStock <= 0 ? "SOLD OUT" : "ADD TO CART"}
          </button>
        </div>
      </div>
    </main>
  );
}
