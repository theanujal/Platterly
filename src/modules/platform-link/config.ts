// Where this product accepts the Platform's signed commands and events (plan F6.1.2, F6.2.1, F8.2.2). Both secrets come from the Platform's registry
// (the product's pair): the Platform signs with COMMAND secrets (two during a rotation), and this product signs its answers with the EVENT secret.
// With either missing the routes answer 404, as if they did not exist.
export interface PlatformLinkConfig {
  commandSecrets: string[];
  answerSecret: string;
}

export function platformLink(): PlatformLinkConfig | null {
  const commandSecrets = (process.env.PLATFORM_COMMAND_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const answerSecret = (process.env.PLATFORM_ANSWER_SECRET ?? "").trim();
  return commandSecrets.length > 0 && answerSecret ? { commandSecrets, answerSecret } : null;
}

/** What Caterly needs to SEND to the Platform: the secret it signs with (the product's answer secret). Null means the Platform link is off, and nothing is queued. */
export function platformSender(): { answerSecret: string } | null {
  const answerSecret = (process.env.PLATFORM_ANSWER_SECRET ?? "").trim();
  return answerSecret ? { answerSecret } : null;
}
