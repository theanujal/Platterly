import { fail, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { isId, isProductKey } from "../../contract/src/ids";
import { PLATFORM_CONTRACT_VERSION } from "./version";

/** Where a product receives Platform Core's commands and events. */
export const PLATFORM_LINK_PATH = "/api/platform/commands";
export const PLATFORM_EVENTS_PATH = "/api/platform/events";

/**
 * `organisation.link`: Platform Core asks a product to link a business. Idempotent: the product adopts `businessId` as it is,
 * creates no users, and a repeat returns the same answer (F6.1.2, F8.2.2).
 */
export interface OrganisationLinkCommand {
  version: number;
  /** `cmd_<32 hex>`; a retry sends the same one. */
  commandId: string;
  type: "organisation.link";
  businessId: string;
  businessName: string;
}

export interface OrganisationLinkAnswer {
  businessId: string;
  /** False when the product already had this business: the repeat changed nothing. */
  created: boolean;
}

export function parseOrganisationLinkCommand(input: unknown): ParseResult<OrganisationLinkCommand> {
  if (!isRecord(input)) return fail("the command must be an object");
  if (input.version !== PLATFORM_CONTRACT_VERSION) return fail(`contract version ${String(input.version)} is not supported`);
  if (!isId("command", input.commandId)) return fail("commandId is not valid");
  if (input.type !== "organisation.link") return fail("type is not known");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  const name = typeof input.businessName === "string" ? input.businessName.trim() : "";
  if (!name || name.length > 200) return fail("businessName is required");
  return ok({ version: input.version, commandId: input.commandId, type: "organisation.link", businessId: input.businessId, businessName: name });
}

export function parseOrganisationLinkAnswer(input: unknown): ParseResult<OrganisationLinkAnswer> {
  if (!isRecord(input)) return fail("the answer must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  if (typeof input.created !== "boolean") return fail("created must be true or false");
  return ok({ businessId: input.businessId, created: input.created });
}

/** Where the Platform receives a product's "business created" message (the product signs it with its per-product answer secret). */
export const BUSINESS_CREATED_PATH = "/api/products/business-created";

/**
 * `business.created`: a product tells the Platform that a person who came through its sign-in made a business, so the Platform creates the matching
 * organisation with that person as Admin and the person's Account shows it. Sent through the product's outbox with retry. `owner.subject` is the identity
 * provider's person id; the email is never carried (the Platform reads the provider's own verified record for that person). A repeat is answered the same.
 */
export interface BusinessCreatedMessage {
  version: number;
  /** `cmd_<32 hex>`; a retry sends the same one. */
  messageId: string;
  type: "business.created";
  productKey: string;
  businessId: string;
  businessName: string;
  owner: { subject: string };
}

export interface BusinessCreatedAnswer {
  businessId: string;
  /** False when the Platform already had this business: the repeat changed nothing. */
  created: boolean;
}

export function parseBusinessCreated(input: unknown): ParseResult<BusinessCreatedMessage> {
  if (!isRecord(input)) return fail("the message must be an object");
  if (input.version !== PLATFORM_CONTRACT_VERSION) return fail(`contract version ${String(input.version)} is not supported`);
  if (!isId("command", input.messageId)) return fail("messageId is not valid");
  if (input.type !== "business.created") return fail("type is not known");
  if (!isProductKey(input.productKey)) return fail("productKey is not valid");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  const name = typeof input.businessName === "string" ? input.businessName.trim() : "";
  if (!name || name.length > 120) return fail("businessName is required (1 to 120 characters)");
  const owner = input.owner;
  if (!isRecord(owner) || typeof owner.subject !== "string" || owner.subject.trim() === "" || owner.subject.length > 100) return fail("owner.subject is required");
  return ok({ version: input.version, messageId: input.messageId, type: "business.created", productKey: input.productKey, businessId: input.businessId, businessName: name, owner: { subject: owner.subject } });
}

export function parseBusinessCreatedAnswer(input: unknown): ParseResult<BusinessCreatedAnswer> {
  if (!isRecord(input)) return fail("the answer must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  if (typeof input.created !== "boolean") return fail("created must be true or false");
  return ok({ businessId: input.businessId, created: input.created });
}

/** Where the Platform receives a product's "business renamed" message (signed like `business.created`). */
export const BUSINESS_RENAMED_PATH = "/api/products/business-renamed";

/**
 * `business.renamed`: a product tells the Platform its business now has a new name, so the Account and the Store show the same name. `nameVersion` grows
 * with every rename (the product uses the time of the change in milliseconds); the Platform ignores any message older than the last one it applied, so a
 * retry that arrives late can never bring an old name back. A repeat is answered the same.
 */
export interface BusinessRenamedMessage {
  version: number;
  /** `cmd_<32 hex>`; a retry sends the same one. */
  messageId: string;
  type: "business.renamed";
  productKey: string;
  businessId: string;
  businessName: string;
  nameVersion: number;
}

export interface BusinessRenamedAnswer {
  businessId: string;
  /** False when the Platform already had this name, or had a newer rename: nothing changed. */
  changed: boolean;
}

export function parseBusinessRenamed(input: unknown): ParseResult<BusinessRenamedMessage> {
  if (!isRecord(input)) return fail("the message must be an object");
  if (input.version !== PLATFORM_CONTRACT_VERSION) return fail(`contract version ${String(input.version)} is not supported`);
  if (!isId("command", input.messageId)) return fail("messageId is not valid");
  if (input.type !== "business.renamed") return fail("type is not known");
  if (!isProductKey(input.productKey)) return fail("productKey is not valid");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  const name = typeof input.businessName === "string" ? input.businessName.trim() : "";
  if (!name || name.length > 120) return fail("businessName is required (1 to 120 characters)");
  if (typeof input.nameVersion !== "number" || !Number.isSafeInteger(input.nameVersion) || input.nameVersion < 1) return fail("nameVersion must be a positive whole number");
  return ok({ version: input.version, messageId: input.messageId, type: "business.renamed", productKey: input.productKey, businessId: input.businessId, businessName: name, nameVersion: input.nameVersion });
}

export function parseBusinessRenamedAnswer(input: unknown): ParseResult<BusinessRenamedAnswer> {
  if (!isRecord(input)) return fail("the answer must be an object");
  if (!isId("business", input.businessId)) return fail("businessId is not valid");
  if (typeof input.changed !== "boolean") return fail("changed must be true or false");
  return ok({ businessId: input.businessId, changed: input.changed });
}
