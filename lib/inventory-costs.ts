export type CostBasis = { productId: string; purchasedUnits: number; unitCostCents: number; invoiceIds: string[] };
type Product = { id: string; name: string; stock: number; price: number | string | null };
type Variant = { product_id: string; stock: number; price: number | string | null };

export function inventoryCosts(products: Product[], variants: Variant[], basis: CostBasis[]) {
  const rows = products.map(product => {
    const options = variants.filter(v => v.product_id === product.id);
    const stock = options.length ? options.reduce((sum, v) => sum + Number(v.stock), 0) : Number(product.stock);
    const source = basis.find(b => b.productId === product.id);
    const prices = options.length ? options.map(v => ({ stock: Number(v.stock), price: Number(v.price ?? product.price) })) : [{ stock, price: Number(product.price) }];
    const validStock = Number.isSafeInteger(stock) && stock >= 0 && prices.every(p => Number.isSafeInteger(p.stock) && p.stock >= 0);
    const validCost = source && Number.isFinite(source.unitCostCents) && source.unitCostCents >= 0 && source.purchasedUnits > 0;
    let status = stock === 0 ? "No stock" : !validStock ? "Check stock quantity" : !validCost ? "Receipt cost missing" : stock > source!.purchasedUnits ? "More stock than receipts cover" : prices.some(p => p.stock > 0 && (!Number.isFinite(p.price) || p.price <= 0)) ? "Selling price missing" : "Estimate ready";
    if (stock > 0 && /flower/i.test(product.name)) status = "Confirm grams / bag sizes";
    const included = status === "Estimate ready";
    const costCents = included ? Math.round(stock * source!.unitCostCents) : null;
    const revenueCents = included ? prices.reduce((sum, p) => sum + Math.round(p.stock * p.price * 100), 0) : null;
    return { id: product.id, name: product.name, stock, purchasedUnits: source?.purchasedUnits ?? null, unitCostCents: validCost ? source!.unitCostCents : null, costCents, revenueCents, grossProfitCents: included ? revenueCents! - costCents! : null, status, invoiceIds: source?.invoiceIds ?? [] };
  });
  const included = rows.filter(r => r.status === "Estimate ready");
  const costCents = included.reduce((sum, r) => sum + r.costCents!, 0);
  const revenueCents = included.reduce((sum, r) => sum + r.revenueCents!, 0);
  return { rows, costCents, revenueCents, grossProfitCents: revenueCents - costCents, coveredProducts: included.length, reviewProducts: rows.filter(r => r.stock > 0 && r.status !== "Estimate ready").length };
}
