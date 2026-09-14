"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { CategoryInput } from "@/modules/menus/category";
import type { ActionResult } from "../actions";

export interface CategoryFormValues {
  name: string;
  description: string;
  isActive: boolean;
}

export const EMPTY_CATEGORY_VALUES: CategoryFormValues = {
  name: "",
  description: "",
  isActive: true,
};

export function valuesToCategoryInput(values: CategoryFormValues): CategoryInput {
  return {
    name: values.name,
    description: values.description || undefined,
    isActive: values.isActive,
  };
}

interface CategoryFormProps {
  initialValues?: Partial<CategoryFormValues>;
  onSubmit: (input: CategoryInput) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function CategoryForm({ initialValues, onSubmit, onSuccess, submitLabel }: CategoryFormProps) {
  const [values, setValues] = useState<CategoryFormValues>({ ...EMPTY_CATEGORY_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSubmit(valuesToCategoryInput(values));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Category Name</Label>
        <Input id="category-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-description">Category Description</Label>
        <Textarea
          id="category-description"
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
        />
      </div>
      <label htmlFor="category-active" className="flex w-fit cursor-pointer items-center gap-2">
        <Checkbox
          id="category-active"
          checked={values.isActive}
          onCheckedChange={(checked) => setField("isActive", checked === true)}
        />
        <span className="text-sm font-medium">Active</span>
      </label>
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
