"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_SCOPES } from "@/modules/api/scopes";
import { InfoBox, PanelHeader, SettingsPanel } from "../../../../_components/settings-ui";
import { createApiKeyAction, revokeApiKeyAction } from "../actions";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Chunk 25 — create and revoke API keys. The key itself is shown once, right after it is made. */
export function ApiKeysPanel({ keys, canEdit, baseUrl }: { keys: KeyRow[]; canEdit: boolean; baseUrl: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createApiKeyAction(name, scopes);
      if (!result.ok) return setError(result.error);
      setNewKey(result.key);
      setName("");
      setScopes([]);
      router.refresh();
    });
  }

  function revoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <SettingsPanel>
      <PanelHeader icon={KeyRound} title="API keys" description="A key lets another program use your Platterly data. Give each key only the permissions it needs, and revoke it the moment it is no longer used." />
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
        <span className="text-muted-foreground">Base address</span>
        <code className="font-mono text-sm break-all" data-testid="api-base-url">{baseUrl}</code>
        <CopyButton value={baseUrl} iconOnly label="Copy base address" />
      </div>

      {newKey && (
        <InfoBox tone="success" title="Your new API key">
          <p>Copy it now and keep it somewhere safe. For your security it is shown only this once; if you lose it, revoke it and make another.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-background px-3 py-2 font-mono text-sm break-all" data-testid="new-api-key">{newKey}</code>
            <CopyButton value={newKey} size="md" label="Copy key" />
            <Button type="button" variant="outline" size="md" onClick={() => setNewKey(null)}>
              I have saved it
            </Button>
          </div>
        </InfoBox>
      )}

      <ul className="flex flex-col gap-3">
        {keys.length === 0 && <li className="text-sm text-muted-foreground">No API keys yet.</li>}
        {keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-4" data-testid="api-key-row">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {key.name}
                <Badge variant={key.revokedAt ? "danger" : "success"}>{key.revokedAt ? "Revoked" : "Active"}</Badge>
              </p>
              <p className="font-mono text-xs text-muted-foreground">plt_live_{key.prefix}_••••••••</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {key.scopes.map((scope) => (
                  <Badge key={scope} variant="outline">{scope}</Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Created {date(key.createdAt)} · {key.lastUsedAt ? `last used ${date(key.lastUsedAt)}` : "never used"}
                {key.revokedAt ? ` · revoked ${date(key.revokedAt)}` : ""}
              </p>
            </div>
            {canEdit && !key.revokedAt && (
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" size="md" className="text-destructive" />}>Revoke</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke &ldquo;{key.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>Anything using this key stops working immediately. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={pending} onClick={() => revoke(key.id)}>
                      Revoke key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <form onSubmit={create} className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Create an API key</h3>
          <div className="flex max-w-md flex-col gap-1.5">
            <Label htmlFor="api-key-name">Name</Label>
            <Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Website orders" maxLength={80} />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Permissions</legend>
            {API_SCOPES.map((scope) => (
              <label key={scope.id} className="flex cursor-pointer items-start gap-3 text-sm">
                <Checkbox checked={scopes.includes(scope.id)} onCheckedChange={(checked) => setScopes((prev) => (checked === true ? [...prev, scope.id] : prev.filter((s) => s !== scope.id)))} className="mt-0.5" />
                <span>
                  <span className="font-medium">{scope.label}</span> <code className="font-mono text-xs text-muted-foreground">{scope.id}</code>
                  <span className="block text-xs text-muted-foreground">{scope.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="md" disabled={pending || name.trim() === "" || scopes.length === 0}>
              <Plus /> Create API Key
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only the owner can create or revoke API keys.</p>
      )}
    </SettingsPanel>
  );
}
