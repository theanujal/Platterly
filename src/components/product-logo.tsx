"use client";

import { useEffect, useRef, useState } from "react";

/** Caterly's logo as Ops has it (served by the Platform), falling back to the bundled mark when Ops has none or cannot be reached. */
export function ProductLogo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The server-rendered image can fail before React attaches onError, so check once after hydration too (#118).
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={failed ? "/caterly-mark.png" : src} onError={() => setFailed(true)} alt="Caterly by Platterly" className={className} />;
}
