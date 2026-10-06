import { createId } from "./create-id";
export type Fulfillment = "pickup" | "delivery" | "shipping";
export type CartItem = {
  lineId: string;
  productId: string;
  variantId: string | null;
  name: string;
  variant: string | null;
  price: number;
  quantity: number;
  fulfillment: Fulfillment;
  image: string | null;
};
export const CART_KEY = "trap-cart";
export const MAX_QUANTITY = 99;
export function readCart(): CartItem[] {
  const saved: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  if (!Array.isArray(saved)) throw new Error("Your saved cart could not be read.");
  return saved.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Your saved cart contains an invalid item.");
    const item = value as Record<string, unknown>;
    if (typeof item.productId !== "string" || typeof item.name !== "string" || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) throw new Error("Your saved cart contains an invalid item.");
    return {
      lineId: typeof item.lineId === "string" ? item.lineId : createId(),
      productId: item.productId,
      variantId: typeof item.variantId === "string" ? item.variantId : null,
      name: item.name,
      variant: typeof item.variant === "string" ? item.variant : null,
      price: Number(item.price),
      quantity: Number(item.quantity),
      fulfillment: item.fulfillment === "delivery" || item.fulfillment === "shipping" ? item.fulfillment : "pickup",
      image: typeof item.image === "string" ? item.image : null,
    };
  });
}
export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("trap-cart-updated"));
}
export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100;
}

