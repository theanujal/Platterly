"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};
const nowSecond = () => Math.floor(Date.now() / 1000);
/** The server and the first paint render a placeholder: the real time exists only in the browser, so there is nothing to mismatch. */
const serverSecond = () => null;

/** Splits a number of seconds into days, hours, minutes and seconds. */
export function splitDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

/**
 * The launch countdown on an upcoming product's card (AJ, 2026-11-15): days, hours, minutes and seconds to the launch date Ops holds, ticking while the page is open.
 * Once the date has passed it reads "Launching today" and stays until staff switch the product to live in Ops (then the card is no longer upcoming).
 */
export function Countdown({ launchAt }: { launchAt: string }) {
  const now = useSyncExternalStore(subscribe, nowSecond, serverSecond);
  const target = Math.floor(new Date(launchAt).getTime() / 1000);
  if (now === null) return <p className="pa-countdown" aria-hidden="true">&nbsp;</p>;
  if (now >= target) return <p className="pa-countdown pa-countdown-due" data-testid="countdown">Launching today</p>;
  const { days, hours, minutes, seconds } = splitDuration(target - now);
  const unit = (value: number, label: string) => (
    <span className="pa-countdown-unit"><strong>{String(value).padStart(2, "0")}</strong>{label}</span>
  );
  return (
    <p className="pa-countdown" data-testid="countdown" role="timer" aria-label={`Launching in ${days} days, ${hours} hours, ${minutes} minutes`}>
      <span className="pa-countdown-lead">Launching in</span>
      {unit(days, "d")}
      {unit(hours, "h")}
      {unit(minutes, "m")}
      {unit(seconds, "s")}
    </p>
  );
}
