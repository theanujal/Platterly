"use client";

import { useState } from "react";
import { Sparkles, IndianRupee } from "lucide-react";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import { DescriptionField, DESCRIPTION_MAX } from "@/components/catalog/description-field";
import { DrawerForm, useIsDirty } from "@/components/catalog/form-drawer";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const TYPE_OPTIONS = [
  { value: "LIVE_COUNTER", label: "Live Counter" },
  { value: "SPECIAL_ADD_ON", label: "Special Add-on" },
] as const;

const PRICE_TYPE_OPTIONS = [
  { value: "PER_PLATE", label: "Per Plate" },
  { value: "FIXED", label: "Fixed" },
] as const;

export interface AddOnFormValues {
  name: string;
  description: string;
  type: string;
  priceType: string;
  price: string;
  includedInPackage: boolean;
  /** true = every menu offers it. */
  appliesToAllMenus: boolean;
  menuIds: string[];
  imageUrl: string | null;
  isActive: boolean;
}

export const EMPTY_ADDON_VALUES: AddOnFormValues = {
  name: "",
  description: "",
  type: "LIVE_COUNTER",
  priceType: "PER_PLATE",
  price: "",
  includedInPackage: false,
  appliesToAllMenus: true,
  menuIds: [],
  imageUrl: null,
  isActive: true,
};

interface AddOnFormProps {
  initialValues?: Partial<AddOnFormValues>;
  availableMenus: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
  onCancel: () => void;
}

export function AddOnForm({ initialValues, availableMenus, onSubmit, onSuccess, submitLabel, onCancel }: AddOnFormProps) {
  const [values, setValues] = useState<AddOnFormValues>({ ...EMPTY_ADDON_VALUES, ...initialValues });
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = useIsDirty({ values, image: image?.name ?? null });

  function setField<K extends keyof AddOnFormValues>(key: K, value: AddOnFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.appliesToAllMenus && values.menuIds.length === 0) {
      setError("Choose at least one menu, or tick All menus.");
      return;
    }
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("description", values.description);
    formData.set("type", values.type);
    formData.set("priceType", values.priceType);
    formData.set("price", values.price);
    formData.set("includedInPackage", String(values.includedInPackage));
    formData.set("appliesToAllMenus", String(values.appliesToAllMenus));
    if (!values.appliesToAllMenus) for (const id of values.menuIds) formData.append("menuIds", id);
    formData.set("isActive", String(values.isActive));
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
    <DrawerForm dirty={dirty}
      onSubmit={handleSubmit}
      error={error}
      pending={pending}
      submitLabel={submitLabel}
      onCancel={onCancel}
      active={{ id: "addon-active", checked: values.isActive, onChange: (checked) => setField("isActive", checked), onLabel: "Active – customers can add it", offLabel: "Inactive – hidden from customers" }}
      className="flex  flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-name">Name</Label>
          <IconInput icon={Sparkles} id="addon-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <DescriptionField id="addon-description" label="Description" value={values.description} onChange={(v) => setField("description", v)} max={DESCRIPTION_MAX.addOn} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addon-image">Image</Label>
          <ImageDropzone id="addon-image" value={values.imageUrl} onFileSelect={setImage} maxSizeMB={4} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addon-type">Type</Label>
            <Select
              items={Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.type}
              onValueChange={(v) => setField("type", v ?? values.type)}
            >
              <SelectTrigger id="addon-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addon-price-type">Price Type</Label>
            <Select
              items={Object.fromEntries(PRICE_TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.priceType}
              onValueChange={(v) => setField("priceType", v ?? values.priceType)}
            >
              <SelectTrigger id="addon-price-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!values.includedInPackage && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addon-price">Price</Label>
            <IconInput
              icon={IndianRupee}
              id="addon-price"
              type="number"
              step="0.01"
              min="0"
              required
              className="max-w-40"
              value={values.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </div>
        )}
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox id="addon-included" checked={values.includedInPackage} onCheckedChange={(checked) => setField("includedInPackage", checked === true)} className="mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="addon-included">Included in the package</Label>
            <p className="text-xs text-muted-foreground">Customers still choose it, but it adds nothing to their bill, so no price is needed. Leave off to charge a price.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label>Applies to menus</Label>
          <p className="text-xs text-muted-foreground">Each menu only offers the add-ons ticked for it. Choose All menus to offer it everywhere, including menus you add later.</p>
          <label htmlFor="addon-menu-all" className="flex cursor-pointer items-center gap-2">
            <Checkbox id="addon-menu-all" checked={values.appliesToAllMenus} onCheckedChange={(checked) => setField("appliesToAllMenus", checked === true)} />
            <span className="text-sm font-medium">All menus</span>
          </label>
          <MultiSelect
            aria-label="Menus"
            options={availableMenus.map((m) => ({ value: m.id, label: m.name }))}
            value={values.appliesToAllMenus ? [] : values.menuIds}
            onValueChange={(ids) => setField("menuIds", ids)}
            disabled={values.appliesToAllMenus}
            placeholder={values.appliesToAllMenus ? "Every menu, including ones you add later" : "Choose menus"}
            searchPlaceholder="Search menus"
            emptyLabel={availableMenus.length === 0 ? "No menus yet — add some first." : "No menus match."}
          />
        </div>
      </div>

    </DrawerForm>
  );
}
