"use client";

import { useState } from "react";
import { ProgressSteps } from "@/components/public/progress-steps";
import type { VenueDetails } from "@/modules/menu-approvals/approval-link";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";
import { ReviewScreen } from "./review-screen";
import { VenueScreen } from "./venue-screen";

const STEPS = ["Review & Approve", "Venue & Delivery", "Confirmation"];

/**
 * The first two steps of the approval link while the menu is still unapproved. "Approve Menu" only moves to the venue
 * form here (nothing is saved); the approval is recorded when the venue details are sent, so the order's status changes
 * at confirmation, not at the first click.
 */
export function ReviewFlow({ token, view, versionNumber, venue }: { token: string; view: ApprovalView; versionNumber: number; venue: VenueDetails }) {
  const [step, setStep] = useState<"review" | "venue">("review");
  return (
    <>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{step === "review" ? "Review & Approve Your Menu" : "Venue & Delivery Details"}</h1>
        <p className="text-sm text-muted-foreground">
          {step === "review"
            ? `Version ${versionNumber} · We've prepared this menu based on your event requirements. Please review it carefully before approving or requesting changes.`
            : "Tell us where and how we should deliver and set up. Your approval is recorded when you send these details."}
        </p>
      </div>
      <ProgressSteps steps={STEPS} current={step === "review" ? 0 : 1} />
      {step === "review" ? (
        <ReviewScreen token={token} view={view} onApprove={() => { setStep("venue"); window.scrollTo({ top: 0 }); }} />
      ) : (
        <VenueScreen token={token} view={view} initial={venue} onBack={() => setStep("review")} />
      )}
    </>
  );
}
