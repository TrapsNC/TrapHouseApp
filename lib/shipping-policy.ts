import type { CartItem } from "./cart";

export type ShippingApproval = {
  productId: string;
  variantId: string | null;
  state: string;
  zip: string;
  carrier: string;
  reviewReference: string;
  expiresAt: string;
};

// Deliberately empty. Add exact product/variant, state/ZIP and carrier approvals
// only after legal and carrier review. Storefront categories are not approvals.
const shippingApprovals: readonly ShippingApproval[] = [];
const states = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

export function shippingIsApproved(
  items: Pick<CartItem, "productId" | "variantId">[],
  state: string,
  zip: string,
  carrier: string,
  approvals: readonly ShippingApproval[] = shippingApprovals,
  now = Date.now(),
): boolean {
  if (!items.length || !states.has(state) || !/^\d{5}$/.test(zip) || !carrier.trim() || !Number.isFinite(now)) return false;
  return items.every(item => approvals.some(approval =>
    approval.productId === item.productId && approval.variantId === item.variantId &&
    approval.state === state && approval.zip === zip && approval.carrier === carrier &&
    typeof approval.reviewReference === "string" && approval.reviewReference.trim().length > 0 &&
    Number.isFinite(Date.parse(approval.expiresAt)) && Date.parse(approval.expiresAt) > now
  ));
}
