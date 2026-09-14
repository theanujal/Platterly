"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActionResult } from "../actions";

export interface MenuFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  itemIds: string[];
}

export const EMPTY_MENU_VALUES: MenuFormValues = {
  name: "",
  description: "",
  imageUrl: null,
  itemIds: [],
};

interface MenuFormProps {
  initialValues?: Partial<MenuFormValues>;
  availableItems: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function MenuForm({ initialValues, availableItems, onSubmit, onSuccess, submitLabel }: MenuFormProps) {
  const [values, setValues] = useState<MenuFormValues>({ ...EMPTY_MENU_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof MenuFormValues>(key: K, value: MenuFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleItem(itemId: string, checked: boolean) {
    setField(
      "itemIds",
      checked ? [...values.itemIds, itemId] : values.itemIds.filter((id) => id !== itemId),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    if (image) formData.set("image", image);
    for (const itemId of values.itemIds) formData.append("itemIds", itemId);

    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-name">Name</Label>
        <Input id="menu-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-description">Description</Label>
        <Textarea id="menu-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="menu-image">Image (PNG or JPG, up to 2MB)</Label>
        {values.imageUrl && !image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={values.imageUrl} alt="" className="size-16 rounded-lg border border-border object-cover" />
        )}
        <input id="menu-image" type="file" accept="image/png,image/jpeg" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Items in this menu</Label>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
          {availableItems.map((item) => (
            <label key={item.id} htmlFor={`menu-item-${item.id}`} className="flex cursor-pointer items-center gap-2 py-1">
              <Checkbox
                id={`menu-item-${item.id}`}
                checked={values.itemIds.includes(item.id)}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
              />
              <span className="text-sm">{item.name}</span>
            </label>
          ))}
          {availableItems.length === 0 && (
            <p className="text-sm text-muted-foreground">No active menu items yet — add some first.</p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
