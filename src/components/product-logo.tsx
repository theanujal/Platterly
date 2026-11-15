"use client";

import { useState } from "react";

/** Caterly's logo as Ops has it (served by the Platform), falling back to the bundled mark when Ops has none or cannot be reached. */
export function ProductLogo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={failed ? "/caterly-mark.png" : src} onError={() => setFailed(true)} alt="Caterly by Platterly" className={className} />;
}
