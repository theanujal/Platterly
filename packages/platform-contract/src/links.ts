import { fail, isRecord, ok, type ParseResult } from "../../contract/src/result";
import { isId } from "../../contract/src/ids";
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
