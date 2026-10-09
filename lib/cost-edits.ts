import type { CostBasis } from "./inventory-costs";
export type ReceiptLine = { productId: string; boxes: number; unitsPerBox: number | null; amountCents: number | null };
export type Handwritten = { supplier: string; date: string; totalCents: number; confirmed: boolean; lines: ReceiptLine[] };
export type CostEdits = { version: number; overrides: Record<string, { unitCostCents: number; coveredUnits: number }>; handwritten: Handwritten | null };
export const emptyEdits = (): CostEdits => ({ version: 0, overrides: {}, handwritten: null });

export function validReceipt(value: Handwritten, productIds: Set<string>) {
  if (!value || typeof value.supplier !== "string" || value.supplier.length > 120 || typeof value.date !== "string" || typeof value.confirmed !== "boolean" || !Number.isSafeInteger(value.totalCents) || value.totalCents < 1 || value.totalCents > 100000000 || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100) return false;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(value.date) && !Number.isNaN(Date.parse(value.date)) && new Date(value.date).toISOString().slice(0,10) === value.date;
  if (value.date && !validDate) return false;
  if (value.lines.some(l => !productIds.has(l.productId) || !Number.isSafeInteger(l.boxes) || l.boxes < 1 || l.boxes > 10000 || (l.unitsPerBox !== null && (!Number.isSafeInteger(l.unitsPerBox) || l.unitsPerBox < 1 || l.unitsPerBox > 10000)) || (l.amountCents !== null && (!Number.isSafeInteger(l.amountCents) || l.amountCents < 0 || l.amountCents > 100000000)))) return false;
  return !value.confirmed || (value.supplier.trim().length > 0 && validDate && value.lines.every(l => l.unitsPerBox !== null && l.amountCents !== null) && value.lines.reduce((sum,l) => sum + l.amountCents!,0) === value.totalCents);
}
export function editedBasis(original: CostBasis[], edits: CostEdits) {
  const basis = original.map(b => ({ ...b, invoiceIds: [...b.invoiceIds] }));
  if (edits.handwritten?.confirmed) for (const line of edits.handwritten.lines) {
    const units = line.boxes * line.unitsPerBox!;
    const existing = basis.find(b => b.productId === line.productId);
    if (existing) {
      existing.unitCostCents = (existing.unitCostCents * existing.purchasedUnits + line.amountCents!) / (existing.purchasedUnits + units);
      existing.purchasedUnits += units;
      if (!existing.invoiceIds.includes("Handwritten")) existing.invoiceIds.push("Handwritten");
    } else basis.push({ productId: line.productId, purchasedUnits: units, unitCostCents: line.amountCents! / units, invoiceIds: ["Handwritten"] });
  }
  for (const [productId, value] of Object.entries(edits.overrides)) {
    const existing = basis.find(b => b.productId === productId);
    const override = { productId, purchasedUnits: value.coveredUnits, unitCostCents: value.unitCostCents, invoiceIds: ["Owner cost edit"] };
    if (existing) Object.assign(existing, override); else basis.push(override);
  }
  return basis;
}
