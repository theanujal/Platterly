import type { CSSProperties, ReactNode } from "react";

/**
 * The big rounded gradient scene a product card sits on, like Calendly's coloured panels: a soft warm gradient (the
 * orange and peach of the catering app) with a card on top.
 */
export function Stage({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[28px] sm:rounded-[44px] ${className}`} style={{ background: "var(--stage-bg)", ...style }}>
      {children}
    </div>
  );
}
