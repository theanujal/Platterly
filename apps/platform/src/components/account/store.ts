"use client";

import { useSyncExternalStore } from "react";
import { INITIAL_STATE, parseStored, reduce, type AccountState, type Action } from "@/lib/account/state";

/**
 * Client-side store for the product switcher. The choice lives in this module (so it survives moving between pages) and is
 * mirrored to sessionStorage (so it survives a reload of the tab). It is a per-tab convenience, not data: nothing is sent
 * anywhere, and storage being blocked only means the choice resets on reload.
 */
const KEY = "platterly-account-product-v3";
let state: AccountState = INITIAL_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = parseStored(window.sessionStorage.getItem(KEY));
  } catch {
    state = INITIAL_STATE;
  }
}

export function dispatch(action: Action) {
  load();
  state = reduce(state, action);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the state still works for this page view */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return state;
}

/** The server and the first client render both see the initial state, so hydration always matches. */
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_STATE);
}
