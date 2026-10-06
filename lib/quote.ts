import type { CartItem } from "./cart";

export type ProductRow = { id: string; name: string; price: number | string; stock: number; active: boolean; image_url: string | null };
export type VariantRow = { id: string; product_id: string; price: number | string; stock: number; active: boolean; image_url: string | null; option1_value: string | null; option2_value: string | null; option3_value: string | null };
export type QuotedItem = CartItem & { stock: number; error: string | null; priceChanged: boolean };
export type Quote = { items: QuotedItem[]; subtotal: number; canCheckout: boolean };

export function quoteCart(items: CartItem[], products: ProductRow[], variants: VariantRow[], productsWithVariants: Set<string>): Quote {
  const requested = new Map<string, number>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId || "base"}`;
    requested.set(key, (requested.get(key) || 0) + item.quantity);
  }
  const quoted = items.map(item => {
    const product = products.find(product => product.id === item.productId && product.active);
    const variant = item.variantId ? variants.find(variant => variant.id === item.variantId && variant.product_id === item.productId && variant.active) : null;
    const row = item.variantId ? variant : product;
    let error: string | null = null;
    if (!product || !row) error = "This option is no longer available. Remove it from your cart.";
    else if (!item.variantId && productsWithVariants.has(item.productId)) error = "Choose a product option before checking out.";
    const stock = Math.max(0, Number(row?.stock || 0));
    const price = Number(row?.price ?? item.price);
    if (!Number.isFinite(price) || price < 0) error = "The price is unavailable. Please contact the shop.";
    if (!error && stock <= 0) error = "Sold out. Remove this option or choose another.";
    const quantityRequested = requested.get(`${item.productId}:${item.variantId || "base"}`) || 0;
    if (!error && quantityRequested > stock) error = `Only ${stock} available; your cart requests ${quantityRequested} across all entries of this option.`;
    const label = variant ? [variant.option1_value,variant.option2_value,variant.option3_value].filter(value => value && value.toLowerCase() !== "default title").join(" / ") : null;
    return { ...item, name: product?.name || item.name, variant: label || item.variant, image: variant?.image_url || product?.image_url || item.image, price: Number.isFinite(price) ? price : item.price, stock, error, priceChanged: Math.round(price * 100) !== Math.round(item.price * 100) };
  });
  return { items: quoted, subtotal: quoted.reduce((sum,item)=>sum + Math.round(item.price * 100)*item.quantity,0)/100, canCheckout: quoted.length > 0 && quoted.every(item => !item.error) };
}
