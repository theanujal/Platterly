"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Chunk 24 — the Export button: CSV (plain text, opens anywhere) or Excel (.xlsx). Each choice is a normal link to the
 * page's own export route with the page's current filters, so the file holds exactly what is on screen.
 */
export function ExportMenu({ href, params = {} }: { href: string; params?: Record<string, string | undefined> }) {
  const link = (format: "csv" | "xlsx") => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    query.set("format", format);
    return `${href}?${query}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="md" />}>
        <Download /> Export
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLinkItem closeOnClick render={<a href={link("csv")} download />}>
          <FileText /> CSV file
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem closeOnClick render={<a href={link("xlsx")} download />}>
          <FileSpreadsheet /> Excel file (.xlsx)
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
