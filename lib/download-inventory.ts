type Product = { id: string; name: string; stock: number; price?: number | string; barcode?: string | null };
type Variant = { id: string; product_id: string; stock: number; price?: number | string; sku?: string | null; barcode?: string | null; option1_value?: string | null; option2_value?: string | null; option3_value?: string | null };

export function inventoryCsv(products: Product[], variants: Variant[]) {
  const rows: (string | number)[][] = [["Product", "Flavor / variant", "SKU", "Barcode", "App stock", "Counted stock", "Difference", "Selling price", "Unit cost", "Notes", "Product ID", "Variant ID"]];
  for (const product of products) {
    const options = variants.filter(variant => variant.product_id === product.id);
    if (options.length) {
      for (const variant of options) rows.push([product.name,
        [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(" / "),
        variant.sku || "", variant.barcode || product.barcode || "", variant.stock, "", "",
        Number(variant.price ?? product.price ?? 0).toFixed(2), "", "", product.id, variant.id]);
    } else rows.push([product.name, "", "", product.barcode || "", product.stock, "", "",
      Number(product.price ?? 0).toFixed(2), "", "", product.id, ""]);
  }
  const cell = (value: string | number) => {
    const text = String(value);
    return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}

export function downloadInventory(products: Product[], variants: Variant[]) {
  const url = URL.createObjectURL(new Blob([inventoryCsv(products, variants)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `trap-house-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
