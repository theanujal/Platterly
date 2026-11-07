import { NextResponse } from "next/server";

// Next.js looks for this file; with the bundler root at the repository root it would otherwise load the catering app's own request proxy (host routing
// for Caterly). The stub serves one host and needs no routing, so this passes every request through.
export function proxy() {
  return NextResponse.next();
}
