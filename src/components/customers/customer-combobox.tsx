"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, Loader2, UserPlus, X, User, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatPhoneDisplay } from "@/lib/phone";

export interface SelectedCustomer {
  id: string;
  name: string;
  phone: string;
  /** Known for a searched-for or pre-loaded customer; a just-created one carries whatever was typed, or nothing. */
  email?: string | null;
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export type CreateCustomerResult = { ok: true; customer: { id: string; name: string; phone: string } } | { ok: false; error: string };

interface CustomerComboboxProps {
  /** Field id, so a page can have more than one of these without a duplicate-id collision. */
  id?: string;
  /** Edit mode's already-selected customer — shown as the input's starting text until the user searches for someone else. */
  initialCustomer?: SelectedCustomer | null;
  onSelect: (customer: SelectedCustomer) => void;
  /** Fires when the user edits the search text away from a confirmed selection, so the parent's customerId doesn't silently stay stale. */
  onClear: () => void;
  /** Debounced search-by-name/phone — Order and Quotation both call the same underlying `customers` module, just through their own feature's server action. */
  onSearch: (query: string) => Promise<CustomerSearchResult[]>;
  /** Inline "this customer doesn't exist yet" create flow. */
  onCreate: (formData: FormData) => Promise<CreateCustomerResult>;
}

/**
 * Create Order's Customer field (2026-09-19) — a search-autocomplete
 * replacing the old flat `<Select>` (which loaded every Customer up front
 * and didn't scale, and offered no inline "this customer doesn't exist yet"
 * path). Debounce/click-outside pattern mirrors
 * `src/components/app-shell/global-search.tsx` exactly — deliberately a
 * plain input + absolutely-positioned list, no `cmdk` dependency, same as
 * that component's own precedent.
 *
 * Item-picker parity with Quotation (2026-09-28) — moved out of
 * `orders/_components/` into this shared directory once Quotation needed
 * the same customer field; `onSearch`/`onCreate` are now props instead of
 * hardcoded imports, so each feature wires its own server action (both
 * happen to check only the generic `customers` permission today, not an
 * `orders`- or `quotations`-specific one, but the component itself no
 * longer assumes that).
 */
export function CustomerCombobox({ id = "customer", initialCustomer, onSelect, onClear, onSearch, onCreate }: CustomerComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialCustomer ? `${initialCustomer.name} (${formatPhoneDisplay(initialCustomer.phone)})` : "");
  const [confirmed, setConfirmed] = useState(Boolean(initialCustomer));
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const queryTooShort = trimmedQuery.length < 2;

  useEffect(() => {
    // No setState here for the skip case — dropdown visibility is derived at
    // render time (`showDropdown` below), same as global-search.tsx's own
    // precedent, since calling setState synchronously in an effect body
    // (rather than inside the async timeout callback) trips
    // react-hooks/set-state-in-effect.
    if (confirmed || queryTooShort) return;
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const data = await onSearch(trimmedQuery);
        setResults(data);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, queryTooShort, confirmed, onSearch]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (confirmed) {
      setConfirmed(false);
      onClear();
    }
  }

  function selectCustomer(customer: SelectedCustomer) {
    onSelect(customer);
    setQuery(`${customer.name} (${formatPhoneDisplay(customer.phone)})`);
    setConfirmed(true);
    setOpen(false);
    setShowCreateForm(false);
  }

  function openCreateForm() {
    const looksLikePhone = /^[0-9+\s()-]+$/.test(trimmedQuery);
    setNewName(looksLikePhone ? "" : trimmedQuery);
    setNewPhone(looksLikePhone ? trimmedQuery : "");
    setNewEmail("");
    setCreateError(null);
    setShowCreateForm(true);
    setOpen(false);
  }

  async function handleCreate() {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("Customer name is required.");
      return;
    }
    if (!newPhone.trim()) {
      setCreateError("Phone is required.");
      return;
    }
    setCreating(true);
    const formData = new FormData();
    formData.set("name", newName.trim());
    formData.set("phone", newPhone.trim());
    if (newEmail.trim()) formData.set("email", newEmail.trim());
    const result = await onCreate(formData);
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    selectCustomer({ ...result.customer, email: newEmail.trim() || null });
  }

  const showDropdown = open && !confirmed && !queryTooShort && !showCreateForm;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => !confirmed && results.length > 0 && setOpen(true)}
          placeholder="Search customer..."
          className="w-full pl-9"
          autoComplete="off"
          required
        />
        {isPending && <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          {results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatPhoneDisplay(customer.phone)}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={openCreateForm}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted"
          >
            <UserPlus className="size-4" />
            {results.length === 0 ? `Create new customer "${trimmedQuery}"` : "Customer not listed? Create new"}
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Customer</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel new customer" onClick={() => setShowCreateForm(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-new-name`} required>Customer Name</Label>
              <IconInput icon={User} id={`${id}-new-name`} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-new-phone`} required>Phone</Label>
              <PhoneInput id={`${id}-new-phone`} value={newPhone} onChange={setNewPhone} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-new-email`}>Email</Label>
              <IconInput icon={Mail} id={`${id}-new-email`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
          </div>
          {createError && (
            <p role="alert" className="text-xs text-destructive">
              {createError}
            </p>
          )}
          <Button type="button" size="md" disabled={creating} onClick={handleCreate} className="self-start">
            {creating ? "Creating…" : "Create & Select Customer"}
          </Button>
        </div>
      )}
    </div>
  );
}
