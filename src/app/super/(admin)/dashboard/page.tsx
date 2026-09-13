import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { getPlatformCounts } from "./queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TILES: { key: keyof Awaited<ReturnType<typeof getPlatformCounts>>; label: string }[] = [
  { key: "totalCaterers", label: "Total caterers" },
  { key: "activeCaterers", label: "Active caterers" },
  { key: "suspendedCaterers", label: "Suspended caterers" },
  { key: "deactivatedCaterers", label: "Deactivated caterers" },
  { key: "newRegistrations7d", label: "New registrations (7d)" },
  { key: "trialSubscriptions", label: "Trial accounts" },
  { key: "activeSubscriptions", label: "Paid accounts" },
  { key: "ordersProcessed", label: "Orders processed" },
  { key: "eventsProcessed", label: "Events processed" },
];

// Chunk 3 Group 3.4 — Basic Platform Analytics (PRD §11 subset: counts
// only). Revenue metrics (MRR/ARR/churn) need Chunk 20/24 billing data.
export default async function SuperAdminDashboardPage() {
  const session = await requireSuperAdminOrRedirect();
  const counts = await getPlatformCounts();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Welcome, {session.user.name}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {TILES.map((tile) => (
          <Card key={tile.key}>
            <CardHeader>
              <CardTitle>{tile.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{counts[tile.key]}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
