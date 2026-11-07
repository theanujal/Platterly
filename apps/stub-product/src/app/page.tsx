import { accessFor } from "@/lib/access";
import { pool } from "@/lib/db";
import { currentSession } from "@/lib/server";

export const dynamic = "force-dynamic";

/** A deliberately plain page: who is signed in, and what this product's own copy of the memberships says they can do. */
export default async function Home() {
  const session = await currentSession();
  if (!session)
    return (
      <main>
        <h1>Stub product</h1>
        <p data-state="signed-out">You are not signed in.</p>
        <p>
          <a href="/login">Sign in with Platterly</a>
        </p>
      </main>
    );
  const access = await accessFor(pool(), session.sub);
  return (
    <main>
      <h1>Stub product</h1>
      <p data-state="signed-in">
        Signed in as <strong>{session.email}</strong>
      </p>
      {access.allowed ? <p data-access="allowed">You have access.</p> : <p data-access="denied">You do not have access to this product.</p>}
      <ul aria-label="Memberships">
        {access.memberships.map((m) => (
          <li key={m.businessId}>
            {m.businessId}: {m.role} ({m.status}, business {m.businessStatus})
          </li>
        ))}
      </ul>
      <form method="post" action="/auth/signout">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
