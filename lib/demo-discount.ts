export function demoDiscount(code: string, subtotalCents: number) {
 const normalized = code.trim().toUpperCase();
 if (!normalized) return { cents: 0, error: "Enter a discount code." };
 if (normalized === "EXPIRED") return { cents: 0, error: "This sample code has expired." };
 if (normalized !== "DEMO10" && normalized !== "SAVE5") return { cents: 0, error: "Code not recognized." };
 if (subtotalCents < 2500) return { cents: 0, error: "This code needs a sample subtotal of at least $25." };
 return { cents: Math.min(subtotalCents, normalized === "DEMO10" ? Math.round(subtotalCents * 0.1) : 500), error: "" };
}
