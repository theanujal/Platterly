"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

type Direction = "up" | "left" | "right" | "scale";

/**
 * Fades its content in as it scrolls into view. One shared observer per element, fired once. Children marked `rv-child`
 * inside a Reveal wait for the parent and then rise one after the other (set `--d` on each for the stagger).
 * Without scripts, or for people who ask for less motion, nothing is hidden (see globals.css).
 */
export function Reveal({ children, delay = 0, from = "up", as, className = "", style }: { children: ReactNode; delay?: number; from?: Direction; as?: ElementType; className?: string; style?: CSSProperties }) {
  const Tag = as ?? "div";
  const ref = useRef<HTMLElement>(null);
  // "Revealed" lives in React state and is rendered into the className. A class added by hand would be wiped the next
  // time a parent re-renders this element with a different className (the step cards did exactly that on hover).
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const dir = from === "left" ? "reveal-left" : from === "right" ? "reveal-right" : from === "scale" ? "reveal-scale" : "";
  return (
    <Tag ref={ref} className={`reveal ${dir} ${shown ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms`, ...style } as CSSProperties}>
      {children}
    </Tag>
  );
}
