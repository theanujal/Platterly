import { isId, isProductKey } from "./ids";
import { parseSnapshot, type EntitlementSnapshot } from "./snapshot";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";
import { CONTRACT_VERSION, DELETE_RETENTION_DAYS } from "./version";
import type { EntitlementDef } from "./manifest";

/* ---------- Commands: ops -> product (POST {product}/api/ops/commands) ---------- */

export const COMMAND_TYPES = ["business.provision", "snapshot.push", "business.suspend", "business.reactivate", "notice.set", "business.delete", "business.restore", "business.update", "provider.set"] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export interface ProvisionPayload {
  businessName: string;
  ownerEmail: string;
  ownerName: string;
  snapshot: EntitlementSnapshot;
}
export interface NoticePayload {
  enabled: boolean;
  title: string | null;
  message: string | null;
  buttonLabel: string | null;
  /** A path starting with "/" or an https URL. */
  buttonUrl: string | null;
}
/** Identity fields ops may change. At least one; the product applies only what is present. */
export interface UpdatePayload {
  businessName?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerEmail?: string;
  contactPhone?: string;
  /** The public link, `platterly.in/<slug>`-style. The product checks format and that nobody else has it. */
  slug?: string;
}
export const PROVIDER_CHANNELS = ["whatsapp", "email"] as const;
export type ProviderChannel = (typeof PROVIDER_CHANNELS)[number];
export interface DeletePayload {
  /** The typed confirmation: the business name, as ops asked the operator to type it. */
  confirmation: string;
  /** Suspended and restorable for this long before the product really deletes. */
  retentionDays: number;
}

export type Command =
  | { commandId: string; type: "business.provision"; businessId: string; payload: ProvisionPayload }
  | { commandId: string; type: "snapshot.push"; businessId: string; payload: { snapshot: EntitlementSnapshot } }
  | { commandId: string; type: "business.suspend"; businessId: string; payload: { reason: string } }
  | { commandId: string; type: "business.reactivate"; businessId: string; payload: Record<string, never> }
  | { commandId: string; type: "notice.set"; businessId: string; payload: NoticePayload }
  | { commandId: string; type: "business.delete"; businessId: string; payload: DeletePayload }
  | { commandId: string; type: "business.restore"; businessId: string; payload: Record<string, never> }
  | { commandId: string; type: "business.update"; businessId: string; payload: UpdatePayload }
  | { commandId: string; type: "provider.set"; businessId: string; payload: { channel: ProviderChannel; connected: boolean } };

function shortText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

export function parseCommand(input: unknown, defs?: readonly EntitlementDef[]): ParseResult<Command> {
  if (!isRecord(input)) return fail("command must be an object");
  if (!isId("command", input.commandId)) return fail("commandId is invalid");
  if (!isId("business", input.businessId)) return fail("businessId is invalid");
  const type = input.type as CommandType;
  if (!COMMAND_TYPES.includes(type)) return fail(`unknown command type "${String(input.type)}"`);
  const payload = isRecord(input.payload) ? input.payload : {};
  const base = { commandId: input.commandId, businessId: input.businessId };

  switch (type) {
    case "business.provision": {
      const name = shortText(payload.businessName, 200);
      const email = shortText(payload.ownerEmail, 254);
      const owner = shortText(payload.ownerName, 200);
      if (!name || !email || !owner || !email.includes("@")) return fail("provision needs businessName, ownerEmail and ownerName");
      const snapshot = parseSnapshot(payload.snapshot, defs);
      if (!snapshot.ok) return fail(`snapshot: ${snapshot.error}`);
      if (snapshot.value.businessId !== base.businessId) return fail("snapshot is for another business");
      return ok({ ...base, type, payload: { businessName: name, ownerEmail: email, ownerName: owner, snapshot: snapshot.value } });
    }
    case "snapshot.push": {
      const snapshot = parseSnapshot(payload.snapshot, defs);
      if (!snapshot.ok) return fail(`snapshot: ${snapshot.error}`);
      if (snapshot.value.businessId !== base.businessId) return fail("snapshot is for another business");
      return ok({ ...base, type, payload: { snapshot: snapshot.value } });
    }
    case "business.suspend": {
      const reason = shortText(payload.reason, 500);
      if (!reason?.trim()) return fail("suspend needs a reason");
      return ok({ ...base, type, payload: { reason } });
    }
    case "business.reactivate":
    case "business.restore":
      return ok({ ...base, type, payload: {} });
    case "notice.set": {
      const buttonUrl = payload.buttonUrl === null || payload.buttonUrl === undefined ? null : shortText(payload.buttonUrl, 500);
      // Same rule as the platform notice today: a button link is a path on the product or an https URL, never anything else.
      if (buttonUrl !== null && !/^(\/(?!\/)|https:\/\/)/.test(buttonUrl)) return fail("buttonUrl must start with / or https://");
      return ok({
        ...base,
        type,
        payload: {
          enabled: payload.enabled === true,
          title: shortText(payload.title, 120),
          message: shortText(payload.message, 500),
          buttonLabel: shortText(payload.buttonLabel, 40),
          buttonUrl,
        },
      });
    }
    case "business.update": {
      const out: UpdatePayload = {};
      const fields: [keyof UpdatePayload, number][] = [["businessName", 200], ["ownerFirstName", 100], ["ownerLastName", 100], ["ownerEmail", 254], ["contactPhone", 40], ["slug", 63]];
      for (const [key, max] of fields) {
        if (payload[key] === undefined) continue;
        const value = shortText(payload[key], max);
        if (value === null || !value.trim()) return fail(`${key} must be short, non-empty text`);
        out[key] = value.trim();
      }
      if (out.ownerEmail !== undefined && !out.ownerEmail.includes("@")) return fail("ownerEmail is invalid");
      if (Object.keys(out).length === 0) return fail("business.update needs at least one field");
      return ok({ ...base, type, payload: out });
    }
    case "provider.set": {
      if (!PROVIDER_CHANNELS.includes(payload.channel as ProviderChannel) || typeof payload.connected !== "boolean") return fail("provider.set needs a channel (whatsapp or email) and connected true or false");
      return ok({ ...base, type, payload: { channel: payload.channel as ProviderChannel, connected: payload.connected } });
    }
    case "business.delete": {
      const confirmation = shortText(payload.confirmation, 200);
      if (!confirmation?.trim()) return fail("delete needs the typed confirmation");
      const retentionDays = payload.retentionDays === undefined ? DELETE_RETENTION_DAYS : payload.retentionDays;
      if (!Number.isInteger(retentionDays) || (retentionDays as number) < 0 || (retentionDays as number) > 365) return fail("retentionDays must be 0 to 365");
      return ok({ ...base, type, payload: { confirmation, retentionDays: retentionDays as number } });
    }
  }
}

/* ---------- Events: product -> ops (POST {ops}/api/products/events) ---------- */

export const EVENT_TYPES = ["business.signed_up", "business.updated", "usage.reported", "alert.raised", "owner.changed", "message.requested"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type EventData =
  // `backfill: true` marks a business that already existed when the product was linked to ops: ops records it but raises no "signed up" alert.
  | { type: "business.signed_up"; data: { businessName: string; ownerName: string; ownerEmail: string; backfill?: boolean } }
  | { type: "business.updated"; data: { businessName?: string; ownerName?: string } }
  | { type: "usage.reported"; data: { periodStart: string; counts: Record<string, number> } }
  | { type: "alert.raised"; data: { severity: AlertSeverity; code: string; message: string } }
  | { type: "owner.changed"; data: { ownerEmail: string } }
  | { type: "message.requested"; data: { template: string; variables: Record<string, string | number> } };

export type ProductEvent = EventData & { eventId: string; productKey: string; businessId: string; occurredAt: string; contract: number };

export function parseEvent(input: unknown): ParseResult<ProductEvent> {
  if (!isRecord(input)) return fail("event must be an object");
  if (!isId("event", input.eventId)) return fail("eventId is invalid");
  if (!isProductKey(input.productKey)) return fail("productKey is invalid");
  if (!isId("business", input.businessId)) return fail("businessId is invalid");
  if (!isIsoDate(input.occurredAt)) return fail("occurredAt must be an ISO date");
  const type = input.type as EventType;
  if (!EVENT_TYPES.includes(type)) return fail(`unknown event type "${String(input.type)}"`);
  const data = isRecord(input.data) ? input.data : {};
  const base = { eventId: input.eventId, productKey: input.productKey, businessId: input.businessId, occurredAt: input.occurredAt, contract: CONTRACT_VERSION };

  switch (type) {
    case "business.signed_up": {
      const businessName = shortText(data.businessName, 200);
      const ownerName = shortText(data.ownerName, 200);
      const ownerEmail = shortText(data.ownerEmail, 254);
      if (!businessName || !ownerName || !ownerEmail?.includes("@")) return fail("signed_up needs businessName, ownerName and ownerEmail");
      if (data.backfill !== undefined && typeof data.backfill !== "boolean") return fail("backfill must be true or false");
      return ok({ ...base, type, data: { businessName, ownerName, ownerEmail, ...(data.backfill ? { backfill: true } : {}) } });
    }
    case "business.updated": {
      // At least one field, and only the fields that changed. Sent when a business is renamed in onboarding or settings.
      const businessName = data.businessName === undefined ? undefined : shortText(data.businessName, 200);
      const ownerName = data.ownerName === undefined ? undefined : shortText(data.ownerName, 200);
      if (businessName === null || ownerName === null) return fail("businessName and ownerName must be short text");
      if (businessName === undefined && ownerName === undefined) return fail("business.updated needs businessName or ownerName");
      if (businessName !== undefined && !businessName.trim()) return fail("businessName must not be empty");
      return ok({ ...base, type, data: { ...(businessName !== undefined ? { businessName } : {}), ...(ownerName !== undefined ? { ownerName } : {}) } });
    }
    case "usage.reported": {
      if (!isIsoDate(data.periodStart)) return fail("periodStart must be an ISO date");
      if (!isRecord(data.counts)) return fail("counts must be an object");
      const counts: Record<string, number> = {};
      for (const [key, value] of Object.entries(data.counts)) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(key) || !Number.isInteger(value) || (value as number) < 0) return fail(`count "${key}" is invalid`);
        counts[key] = value as number;
      }
      return ok({ ...base, type, data: { periodStart: data.periodStart, counts } });
    }
    case "alert.raised": {
      const code = shortText(data.code, 80);
      const message = shortText(data.message, 500);
      if (!ALERT_SEVERITIES.includes(data.severity as AlertSeverity) || !code || !message) return fail("alert needs severity, code and message");
      return ok({ ...base, type, data: { severity: data.severity as AlertSeverity, code, message } });
    }
    case "owner.changed": {
      const ownerEmail = shortText(data.ownerEmail, 254);
      if (!ownerEmail?.includes("@")) return fail("ownerEmail is invalid");
      return ok({ ...base, type, data: { ownerEmail } });
    }
    case "message.requested": {
      const template = shortText(data.template, 80);
      if (!template) return fail("template is required");
      const variables: Record<string, string | number> = {};
      if (data.variables !== undefined) {
        if (!isRecord(data.variables)) return fail("variables must be an object");
        for (const [key, value] of Object.entries(data.variables)) {
          if (typeof value !== "string" && typeof value !== "number") return fail(`variable "${key}" must be text or a number`);
          variables[key] = value;
        }
      }
      return ok({ ...base, type, data: { template, variables } });
    }
  }
}
