"use client";

import { ApprovalHistoryCard, ApprovalVersionDialog } from "./approval-history-card";
import { ApprovalMenuPlanner } from "./approval-menu-planner";
import { ApprovalNotesCard } from "./approval-notes-card";
import { ApprovalPricingCard } from "./approval-pricing-card";
import { ApprovalStageNotices } from "./approval-stage-notices";
import { ApprovalStatusCard } from "./approval-status-card";
import { ApprovalVersionBar } from "./approval-version-bar";
import { CustomMenuPriceCard } from "./custom-menu-price-card";
import type { ApprovalController } from "./use-approval-controller";
import type { MenuApprovalReviewProps, ReviewActions } from "./types";

/**
 * Everything under the page header: the error line, stage notices, version bar, the planner and quote on the left, the status, notes,
 * history and pricing cards on the right, and the all-versions dialog. Used by the order's Menu Approval tab,
 * which puts its own header above it. Renders siblings (a fragment) so each page keeps its own spacing.
 */
export function ApprovalReviewBody({ data, c, actions }: { data: MenuApprovalReviewProps; c: ApprovalController; actions: ReviewActions }) {
  const { status, statusLabel, orderCompleted = false, currentVersion, lockedAt, isCustomMenu, pricing, menus, notes, versions, statusHistory, venueDetailsSubmittedAt, viewVersion, capabilities } = data;
  return (
    <>
      {c.error && (
        <p role="alert" className="text-sm text-destructive">
          {c.error}
        </p>
      )}

      {!c.shownVersion && (
        <ApprovalStageNotices
          status={status}
          statusLabel={statusLabel}
          currentVersion={currentVersion}
          withCustomer={c.withCustomer}
          liveUrl={c.liveUrl}
          venueDetailsSubmittedAt={venueDetailsSubmittedAt}
          lockedAt={lockedAt}
        />
      )}
      {viewVersion !== null && (
        <ApprovalVersionBar
          viewVersion={viewVersion}
          shownVersion={c.shownVersion}
          versionHasDishIds={c.versionHasDishIds}
          compareOn={c.compareOn}
          onToggleCompare={c.toggleCompare}
          onBack={c.backToCurrent}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- Main column: the same Menu Planning as the order ---------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {isCustomMenu && !c.shownVersion && (
            <CustomMenuPriceCard
              pricePerPlate={c.pricePerPlate}
              onPriceChange={c.setPricePerPlate}
              quotedAmount={c.quotedAmount}
              menuGuests={pricing.menuGuests}
              pending={c.pending}
              onSave={c.handleSavePrice}
              canQuote={capabilities.canQuotePrice && c.editable}
              savedPrice={data.customPricePerPlate}
              withTeam={c.editable}
            />
          )}

          <ApprovalMenuPlanner
            shownVersion={c.shownVersion}
            compareOn={c.compareOn}
            versionHasDishIds={c.versionHasDishIds}
            editable={c.editable}
            canAct={capabilities.canAct}
            isCustomMenu={isCustomMenu}
            individualPricingEnabled={pricing.individualPricingEnabled}
            totalGuests={pricing.totalGuests}
            days={data.days}
            entries={c.entries}
            currentEntries={data.entries}
            menus={menus}
            menuPreference={c.menuPreference}
            foodDialogTarget={c.foodDialogTarget}
            loadPickerData={actions.loadPickerData}
            onEntriesChange={c.setEntries}
            onMenuPreferenceChange={c.setMenuPreference}
            onFoodDialogChange={c.setFoodDialogTarget}
          />
        </div>

        {/* ---------------- Sidebar: status, notes, history, pricing ---------------- */}
        <aside className="flex min-w-0 flex-col gap-4">
          <ApprovalStatusCard
            status={status}
            statusLabel={statusLabel}
            currentVersion={currentVersion}
            orderCompleted={orderCompleted}
            canChange={capabilities.canAct}
            history={statusHistory}
            onChange={c.handleChangeStatus}
          />
          <ApprovalNotesCard notes={notes} noteDraft={c.noteDraft} onNoteDraftChange={c.setNoteDraft} pending={c.pending} onAdd={c.handleAddNote} canAdd={capabilities.canAct && !orderCompleted} />
          <ApprovalHistoryCard
            versions={versions}
            currentVersion={currentVersion}
            status={status}
            statusLabel={statusLabel}
            viewVersion={viewVersion}
            onOpenVersion={c.openVersion}
            onViewAll={() => c.setHistoryOpen(true)}
          />
          <ApprovalPricingCard
            menuAmount={c.priced.menuAmount}
            extrasAmount={c.priced.extrasAmount}
            childrenCharge={pricing.childrenCharge}
            chargesAndDiscount={c.chargesAndDiscount}
            total={c.total}
            sinceLastSent={c.sinceLastSent}
            lastSentTotal={c.lastSentTotal}
            dirty={c.dirty}
          />
        </aside>
      </div>

      <ApprovalVersionDialog
        open={c.historyOpen}
        onOpenChange={c.setHistoryOpen}
        versions={versions}
        currentVersion={currentVersion}
        status={status}
        statusLabel={statusLabel}
        onOpenVersion={c.openVersion}
      />
    </>
  );
}
