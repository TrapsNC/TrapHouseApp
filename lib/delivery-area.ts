// Delivery service area approved for Raleigh, Knightdale, Garner,
// Wake Forest, Wendell and Clayton. Postal zones can cross city boundaries.
export const deliveryZips = [
  "27601", "27603", "27604", "27605", "27606", "27607", "27608", "27609", "27610",
  "27612", "27613", "27614", "27615", "27616", "27617",
  "27545", "27529", "27587", "27591", "27520", "27527",
] as const;
export function deliveryIsAvailable(state: string, zip: string): boolean {
  return state === "NC" && deliveryZips.some(allowed => allowed === zip);
}