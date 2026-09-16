"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATALOG_ADD_TILE_CLASSNAME, CatalogAddTileContent } from "@/components/catalog/catalog-browser";
import { EnquiryForm } from "./enquiry-form";
import { createEnquiryAction } from "../actions";

/** Updated doc §11's "Add New Lead" — the lightweight quick-add form (Name/Phone/Source only); the fuller Enquiry fields are filled in later via Edit. */
export function AddLeadDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "tile" ? (
        <DialogTrigger className={CATALOG_ADD_TILE_CLASSNAME}>
          <CatalogAddTileContent label="Add Lead" description="Capture a new enquiry" />
        </DialogTrigger>
      ) : (
        // Updated doc §11's exact wording for the primary button.
        <DialogTrigger render={<Button />}>
          <Plus className="size-4" />
          Add New Lead
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>
        <EnquiryForm
          eventTypes={[]}
          menus={[]}
          submitLabel="Add lead"
          onSubmit={createEnquiryAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
