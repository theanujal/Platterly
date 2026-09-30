"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ActiveToggleCard } from "@/components/ui/active-toggle-card";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_TYPE_ICON_OPTIONS, getEventTypeIcon } from "@/lib/event-type-icons";
import type { ActionResult } from "../actions";

export interface EventTypeFormValues {
  name: string;
  description: string;
  imageUrl: string | null;
  minGuests: string;
  isActive: boolean;
  icon: string;
  menuIds: string[];
}

export const EMPTY_EVENT_TYPE_VALUES: EventTypeFormValues = {
  name: "",
  description: "",
  imageUrl: null,
  minGuests: "",
  isActive: true,
  icon: "other",
  menuIds: [],
};

interface EventTypeFormProps {
  initialValues?: Partial<EventTypeFormValues>;
  availableMenus: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function EventTypeForm({ initialValues, availableMenus, onSubmit, onSuccess, submitLabel }: EventTypeFormProps) {
  const [values, setValues] = useState<EventTypeFormValues>({ ...EMPTY_EVENT_TYPE_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof EventTypeFormValues>(key: K, value: EventTypeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMenu(menuId: string, checked: boolean) {
    setField("menuIds", checked ? [...values.menuIds, menuId] : values.menuIds.filter((id) => id !== menuId));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("minGuests", values.minGuests);
    formData.set("isActive", String(values.isActive));
    formData.set("icon", values.icon);
    for (const id of values.menuIds) formData.append("menuIds", id);
    if (image) formData.set("image", image);

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
        <Label htmlFor="event-name">Event Name</Label>
        {/* Icon matches whatever's picked below (AJ, 2026-09-19) — reinforces the choice instead of showing an unrelated generic glyph. */}
        <IconInput icon={getEventTypeIcon(values.icon)} id="event-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-description">Description</Label>
        <Textarea id="event-description" value={values.description} onChange={(e) => setField("description", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-image">Event Image</Label>
        <ImageDropzone id="event-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={2} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-icon">Icon</Label>
        <Select
          items={Object.fromEntries(EVENT_TYPE_ICON_OPTIONS.map((o) => [o.value, o.label]))}
          value={values.icon}
          onValueChange={(v) => setField("icon", v ?? values.icon)}
        >
          <SelectTrigger id="event-icon" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPE_ICON_OPTIONS.map((option) => {
              const Icon = getEventTypeIcon(option.value);
              return (
                <SelectItem key={option.value} value={option.value}>
                  <Icon className="size-4" />
                  {option.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-min-guests">Min Number of Guests</Label>
        <Input
          id="event-min-guests"
          type="number"
          min="0"
          className="max-w-40"
          value={values.minGuests}
          onChange={(e) => setField("minGuests", e.target.value)}
        />
      </div>
      <ActiveToggleCard
        id="event-active"
        checked={values.isActive}
        onCheckedChange={(checked) => setField("isActive", checked)}
      />

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label>Event Menus</Label>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
          {availableMenus.map((menu) => (
            <label key={menu.id} htmlFor={`event-menu-${menu.id}`} className="flex cursor-pointer items-center gap-2 py-1">
              <Checkbox
                id={`event-menu-${menu.id}`}
                checked={values.menuIds.includes(menu.id)}
                onCheckedChange={(checked) => toggleMenu(menu.id, checked === true)}
              />
              <span className="text-sm">{menu.name}</span>
            </label>
          ))}
          {availableMenus.length === 0 && <p className="text-sm text-muted-foreground">No menus yet — add some first.</p>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
