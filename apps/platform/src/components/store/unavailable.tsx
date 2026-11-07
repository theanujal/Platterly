import Link from "next/link";
import "./store.css";

/** Shown when the live plans cannot be read from Ops. The Store never substitutes made-up prices for real ones. */
export function StoreUnavailable() {
  return (
    <main className="ps-page ps-manage">
      <h1>Plans are not available right now</h1>
      <p>We could not load our plans and prices. Please try again in a few minutes.</p>
      <p><Link href="/">Try again</Link></p>
    </main>
  );
}
