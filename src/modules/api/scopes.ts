/**
 * Chunk 25 — what an API key may do. A key carries only the scopes its owner ticked; it never gets a team member's
 * whole role. Safe for the browser (the Settings page lists these).
 */
export const API_SCOPES = [
  { id: "menus:read", label: "Read menus and menu items", description: "Menus, their categories and dishes, and the menu items." },
  { id: "addons:read", label: "Read add-ons", description: "Live counters and other add-ons." },
  { id: "customers:read", label: "Read customers", description: "Customers and leads, with their contact details." },
  { id: "customers:write", label: "Create and update customers", description: "Add a customer or lead and change their details." },
  { id: "events:read", label: "Read events", description: "Events (created automatically from orders), read only." },
  { id: "meal-plans:read", label: "Read meal plans", description: "The meals planned for an event or an order." },
  { id: "orders:read", label: "Read orders", description: "Orders with their meals, guests and amounts." },
  { id: "orders:write", label: "Create and update orders", description: "Place an order and change its details. Status is not changed through the API." },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["id"];

export const API_SCOPE_IDS: readonly string[] = API_SCOPES.map((s) => s.id);

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && API_SCOPE_IDS.includes(value);
}

/** Keeps only known scopes, once each, in the order they are listed above. */
export function cleanScopes(values: unknown): ApiScope[] {
  const wanted = new Set(Array.isArray(values) ? values : []);
  return API_SCOPES.map((s) => s.id).filter((id) => wanted.has(id));
}
