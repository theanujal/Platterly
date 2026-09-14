"use client";

import { useRouter } from "next/navigation";
import { AddOnForm } from "../../_components/addon-form";
import { createAddOnAction } from "../../actions";

export function NewAddOnClient() {
  const router = useRouter();

  return (
    <AddOnForm submitLabel="Create add-on" onSubmit={createAddOnAction} onSuccess={() => router.push("/addons")} />
  );
}
