"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button } from "@/components/ui";
import { rotateSecretsAction } from "../actions";
import { SecretsPanel } from "../secrets-panel";

export function RotateForm({ productKey }: { productKey: string }) {
  const { state, onSubmit, pending } = useFormAction(rotateSecretsAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={productKey} />
      <div>
        <Button type="submit" variant="outline" size="md" disabled={pending}>{pending ? "Rotating…" : "Rotate secrets"}</Button>
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <SecretsPanel reveal={state} />
    </form>
  );
}
