"use client";

import { useSensitive } from "@/components/sensitive-access";

/** Whether the viewer holds the menu-prices right (Sensitive data: menuPrices; AJ, 2026-10-17): the dish, menu and add-on forms leave their price fields out without it. The actions ignore a submitted price either way. */
export function useMenuPricesVisible() {
  return useSensitive().menuPrices;
}
