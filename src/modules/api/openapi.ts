import { API_SCOPES } from "./scopes";
import { RATE_LIMIT_PER_KEY, RATE_LIMIT_PER_KITCHEN, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "@/lib/api/handler";

/**
 * Chunk 25 — the public API described as OpenAPI 3.0, served at /api/v1/openapi.json and rendered into docs/api.md.
 * It is the single written description of the API: a test checks that every route file under app/api/v1 appears here
 * with the same methods, and that nothing here lacks a route, so the document cannot say something the API does not do.
 */
type Json = Record<string, unknown>;
const str = (description?: string): Json => ({ type: "string", ...(description ? { description } : {}) });
const nullable = (schema: Json): Json => ({ ...schema, nullable: true });
const num = (description?: string): Json => ({ type: "number", ...(description ? { description } : {}) });
const int = (description?: string): Json => ({ type: "integer", ...(description ? { description } : {}) });
const bool = (description?: string): Json => ({ type: "boolean", ...(description ? { description } : {}) });
const obj = (properties: Record<string, Json>, required: string[] = []): Json => ({ type: "object", properties, ...(required.length ? { required } : {}) });
const arr = (items: Json): Json => ({ type: "array", items });
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const enumOf = (values: string[], description?: string): Json => ({ type: "string", enum: values, ...(description ? { description } : {}) });

const ORDER_STATUS = ["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "SENT_TO_KITCHEN", "COMPLETED", "CANCELLED"];
const MEALS = ["BREAKFAST", "LUNCH", "HITEA", "DINNER", "OTHER"];
const FOOD = ["VEGETARIAN", "NON_VEGETARIAN"];

const schemas: Record<string, Json> = {
  Error: obj({ error: obj({ code: str("A stable machine-readable code, such as NOT_FOUND."), message: str(), details: { description: "Field problems for VALIDATION_ERROR: a list of { field, message }." } }, ["code", "message"]) }, ["error"]),
  Meta: obj({ page: int(), per_page: int(), total: int(), total_pages: int() }),
  Kitchen: obj({ id: str(), name: str(), slug: str(), api_key: obj({ name: str(), scopes: arr(str()) }) }),
  Customer: obj({ id: str(), name: str(), phone: str("Normalised, with country code."), email: nullable(str()), status: enumOf(["LEAD", "CUSTOMER"], "A customer with at least one order is a CUSTOMER."), is_active: bool(), lead_source: nullable(str()), order_count: int(), created_at: str(), updated_at: str() }),
  Menu: obj({ id: str(), name: str(), description: nullable(str()), image: nullable(str()), menu_type: enumOf(FOOD), price_per_plate: num(), is_active: bool(), children: obj({ under_5_chargeable: bool(), under_5_price: nullable(num()), from_5_to_10_pricing_type: str(), from_5_to_10_value: nullable(num()) }), created_at: str(), updated_at: str() }),
  MenuDetail: { allOf: [ref("Menu"), obj({ categories: arr(obj({ id: str(), name: str() })), items: arr(obj({ id: str(), name: str(), food_type: enumOf(FOOD), price: num(), is_active: bool() })) })] },
  MenuItem: obj({ id: str(), name: str(), description: nullable(str()), image: nullable(str()), food_type: enumOf(FOOD), price: num(), is_active: bool(), is_popular: bool(), is_chefs_special: bool(), is_live_counter: bool(), created_at: str(), updated_at: str() }),
  MenuItemDetail: { allOf: [ref("MenuItem"), obj({ categories: arr(obj({ id: str(), name: str() })) })] },
  AddOn: obj({ id: str(), name: str(), description: nullable(str()), image: nullable(str()), type: enumOf(["LIVE_COUNTER", "SPECIAL_ADD_ON"]), price_type: enumOf(["PER_PLATE", "FIXED"]), price: num(), included_in_package: bool(), is_active: bool(), created_at: str(), updated_at: str() }),
  Event: obj({ id: str(), name: str(), status: enumOf(["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"]), start_date: str("YYYY-MM-DD"), end_date: str("YYYY-MM-DD"), venue: nullable(str()), guest_count: nullable(int()), order_id: nullable(str()), customer_id: str(), event_type_id: str(), event_type_name: str(), location_id: nullable(str()), location_name: nullable(str()), created_at: str(), updated_at: str() }),
  MealPlan: obj({
    id: str(), order_id: str(), date: str("YYYY-MM-DD"), meal_type: enumOf(MEALS), menu_id: nullable(str()), menu_name: nullable(str()), price_per_plate: nullable(num()),
    items: arr(obj({ id: str(), item_type: enumOf(["MENU", "MENU_ITEM", "ADD_ON"]), menu_item_id: nullable(str()), add_on_id: nullable(str()), name: str(), unit_price: num("Read from your catalog when the order is placed."), quantity: int(), is_extra: bool("An extra dish is charged per guest on top of the menu price.") })),
  }),
  Order: obj({
    id: str(), order_number: nullable(str()), status: enumOf(ORDER_STATUS), kitchen_status: nullable(enumOf(["PENDING", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"], "Where the kitchen is with it, once the menu is approved and sent.")), order_kind: enumOf(["SINGLE", "MULTI"]),
    customer_id: str(), customer_name: str(), event_type_id: nullable(str()), event_type_name: nullable(str()), event_ids: arr(str()), event_start_date: str("YYYY-MM-DD"), event_end_date: str("YYYY-MM-DD"), venue: nullable(str()), event_address: nullable(str()), menu_preference: nullable(enumOf(FOOD)),
    guests: obj({ adults: nullable(int()), children_below_5: nullable(int()), children_5_to_10: nullable(int()), total: nullable(int()) }),
    amounts: obj({ subtotal: num(), children_charge: num(), transportation: num(), other_charges: num(), discount: num(), total: num(), advance: num(), balance: num() }),
    payment_status: enumOf(["UNPAID", "PARTIALLY_PAID", "PAID"]), notes: nullable(str()), created_at: str(), updated_at: str(),
  }),
  OrderDetail: { allOf: [ref("Order"), obj({ meal_plans: arr(ref("MealPlan")) })] },
  CustomerCreate: obj({ name: str(), phone: str("7 to 15 digits, optional +."), email: str(), is_enquiry: bool("Create as a lead rather than a customer."), lead_source: str() }, ["name", "phone"]),
  CustomerPatch: obj({ name: str(), phone: str(), email: str(), is_active: bool() }),
  MealPlanInput: obj({ date: str("YYYY-MM-DD"), meal_type: enumOf(MEALS), menu_id: str(), items: arr(obj({ item_type: enumOf(["MENU_ITEM", "ADD_ON"]), catalog_id: str(), quantity: int(), is_extra: bool() }, ["item_type", "catalog_id"])) }, ["date", "meal_type"]),
  OrderCreate: obj({ customer_id: str(), event_type_id: str(), event_start_date: str("YYYY-MM-DD. Not in the past."), event_end_date: str("Defaults to the start date."), venue: str(), event_address: str(), menu_preference: enumOf(FOOD), adult_count: int(), child_below_5_count: int(), child_5_to_10_count: int(), notes: str(), meal_plans: arr(ref("MealPlanInput")) }, ["customer_id", "event_start_date"]),
  OrderPatch: obj({ customer_id: str(), event_type_id: str(), event_start_date: str(), event_end_date: str(), venue: str(), event_address: str(), menu_preference: enumOf(FOOD), adult_count: int(), child_below_5_count: int(), child_5_to_10_count: int(), notes: str(), meal_plans: arr(ref("MealPlanInput")) }),
};

const idParam = { name: "id", in: "path", required: true, schema: str() };
const paging = [
  { name: "page", in: "query", schema: int(`From 1. Default 1.`) },
  { name: "per_page", in: "query", schema: int(`Default ${PAGE_SIZE_DEFAULT}, at most ${PAGE_SIZE_MAX}.`) },
];
const q = (name: string, schema: Json) => ({ name, in: "query", schema });

const one = (name: string): Json => ({ description: "OK", content: { "application/json": { schema: obj({ data: ref(name) }) } } });
const many = (name: string): Json => ({ description: "OK", content: { "application/json": { schema: obj({ data: arr(ref(name)), meta: ref("Meta") }) } } });
const body = (name: string): Json => ({ required: true, content: { "application/json": { schema: ref(name) } } });

interface Op {
  summary: string;
  scope: string | null;
  tag: string;
  parameters?: Json[];
  requestBody?: Json;
  success: Json;
  status?: string;
  notes?: string;
}

const ops: Record<string, Record<string, Op>> = {
  "/kitchen": { get: { summary: "The kitchen and permissions of this API key", scope: null, tag: "Kitchen", success: one("Kitchen") } },
  "/menus": { get: { summary: "List menus", scope: "menus:read", tag: "Menus", parameters: [...paging, q("is_active", bool()), q("menu_type", enumOf(FOOD))], success: many("Menu") } },
  "/menus/{id}": { get: { summary: "Get a menu with its categories and dishes", scope: "menus:read", tag: "Menus", parameters: [idParam], success: one("MenuDetail") } },
  "/menu-items": { get: { summary: "List menu items (dishes)", scope: "menus:read", tag: "Menus", parameters: [...paging, q("is_active", bool()), q("food_type", enumOf(FOOD)), q("category_id", str()), q("search", str("At least 2 characters."))], success: many("MenuItem") } },
  "/menu-items/{id}": { get: { summary: "Get a menu item", scope: "menus:read", tag: "Menus", parameters: [idParam], success: one("MenuItemDetail") } },
  "/addons": { get: { summary: "List add-ons", scope: "addons:read", tag: "Add-ons", parameters: [...paging, q("is_active", bool()), q("type", enumOf(["LIVE_COUNTER", "SPECIAL_ADD_ON"]))], success: many("AddOn") } },
  "/addons/{id}": { get: { summary: "Get an add-on", scope: "addons:read", tag: "Add-ons", parameters: [idParam], success: one("AddOn") } },
  "/customers": {
    get: { summary: "List customers and leads", scope: "customers:read", tag: "Customers", parameters: [...paging, q("status", enumOf(["LEAD", "CUSTOMER"])), q("search", str("Name, phone or email. At least 2 characters."))], success: many("Customer") },
    post: { summary: "Create a customer or lead", scope: "customers:write", tag: "Customers", requestBody: body("CustomerCreate"), success: one("Customer"), status: "201", notes: "Send an Idempotency-Key header to make a retry safe. A phone number that already exists answers 409 CUSTOMER_ALREADY_EXISTS with the existing customer_id." },
  },
  "/customers/{id}": {
    get: { summary: "Get a customer", scope: "customers:read", tag: "Customers", parameters: [idParam], success: one("Customer") },
    patch: { summary: "Change a customer's name, phone, email or active flag", scope: "customers:write", tag: "Customers", parameters: [idParam], requestBody: body("CustomerPatch"), success: one("Customer") },
  },
  "/events": { get: { summary: "List events", scope: "events:read", tag: "Events", parameters: [...paging, q("status", enumOf(["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"])), q("customer_id", str()), q("from", str("Start date on or after, YYYY-MM-DD.")), q("to", str("Start date on or before, YYYY-MM-DD."))], success: many("Event"), notes: "Events are created automatically from orders that have an Event Type, so the API only reads them." } },
  "/events/{id}": { get: { summary: "Get an event", scope: "events:read", tag: "Events", parameters: [idParam], success: one("Event") } },
  "/events/{id}/meal-plans": { get: { summary: "The meals planned for an event", scope: "meal-plans:read", tag: "Meal plans", parameters: [idParam], success: { description: "OK", content: { "application/json": { schema: obj({ data: arr(ref("MealPlan")) }) } } } } },
  "/meal-plans/{id}": { get: { summary: "Get one planned meal", scope: "meal-plans:read", tag: "Meal plans", parameters: [idParam], success: one("MealPlan") } },
  "/orders": {
    get: { summary: "List orders", scope: "orders:read", tag: "Orders", parameters: [...paging, q("status", enumOf(ORDER_STATUS)), q("customer_id", str()), q("event_from", str("Event start on or after, YYYY-MM-DD.")), q("event_to", str("Event start on or before, YYYY-MM-DD."))], success: many("Order") },
    post: { summary: "Place an order", scope: "orders:write", tag: "Orders", requestBody: body("OrderCreate"), success: one("OrderDetail"), status: "201", notes: "Prices are read from your catalog, never from the request. The order starts as PENDING_REVIEW and its event and menu selection are created, as for an order placed in the app. Send an Idempotency-Key header so a retry cannot create a second order." },
  },
  "/orders/{id}": {
    get: { summary: "Get an order with its meal plans", scope: "orders:read", tag: "Orders", parameters: [idParam], success: one("OrderDetail") },
    patch: { summary: "Change an order's details", scope: "orders:write", tag: "Orders", parameters: [idParam], requestBody: body("OrderPatch"), success: one("OrderDetail"), notes: "Status, advance, discount, charges and payment status cannot be changed here. The meal plan can be replaced only while the order is PENDING_REVIEW (409 MEAL_PLAN_LOCKED afterwards). A COMPLETED or CANCELLED order answers 409 ORDER_CLOSED." },
  },
};

const errorResponses: Json = {
  "401": { description: "Missing, malformed, wrong or revoked API key.", content: { "application/json": { schema: ref("Error") } } },
  "403": { description: "The key lacks the permission (INSUFFICIENT_SCOPE), the kitchen is suspended (ACCOUNT_INACTIVE) or its plan has ended (ACCOUNT_LOCKED), or a plan limit was reached (PLAN_LIMIT_REACHED).", content: { "application/json": { schema: ref("Error") } } },
  "404": { description: "Not found, including anything that belongs to another kitchen.", content: { "application/json": { schema: ref("Error") } } },
  "422": { description: "VALIDATION_ERROR: every problem is listed in error.details.", content: { "application/json": { schema: ref("Error") } } },
  "429": { description: "Too many requests. See the Retry-After header.", content: { "application/json": { schema: ref("Error") } } },
};

export function buildOpenApi(): Json {
  const paths: Json = {};
  for (const [path, methods] of Object.entries(ops)) {
    const entry: Json = {};
    for (const [method, op] of Object.entries(methods)) {
      entry[method] = {
        tags: [op.tag],
        summary: op.summary,
        description: [op.scope ? `Needs the \`${op.scope}\` permission.` : "Any valid API key.", op.notes].filter(Boolean).join(" "),
        ...(op.parameters ? { parameters: op.parameters } : {}),
        ...(op.requestBody ? { requestBody: op.requestBody } : {}),
        responses: { [op.status ?? "200"]: op.success, ...errorResponses },
        "x-required-scope": op.scope,
      };
    }
    paths[path] = entry;
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Platterly API",
      version: "1.0.0",
      description: `The Platterly public API. Send your API key as \`Authorization: Bearer <key>\`. A key belongs to one kitchen and only ever sees that kitchen's data. Every response is JSON: \`{ "data": ... }\`, with \`meta\` for lists, or \`{ "error": { "code", "message" } }\`. Lists are paged (default ${PAGE_SIZE_DEFAULT}, at most ${PAGE_SIZE_MAX}). Limit: ${RATE_LIMIT_PER_KEY} requests a minute per key and ${RATE_LIMIT_PER_KITCHEN} per kitchen, shown in X-RateLimit-* headers.`,
    },
    servers: [{ url: "/api/v1", description: "Relative to your Platterly catering address" }],
    security: [{ bearerAuth: [] }],
    tags: [...new Set(Object.values(ops).flatMap((m) => Object.values(m).map((o) => o.tag)))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: `An API key from Settings > Integration > API & Webhooks. Scopes: ${API_SCOPES.map((s) => s.id).join(", ")}.` } },
      schemas,
    },
  };
}

export const documentedRoutes = () => Object.entries(ops).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`));
