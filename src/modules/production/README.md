# production

Chunk 18.4, reworked 2026-10-10 — what orders need from the store, and the "Send items to this order" step on an order's Inventory tab.

- `getOrderInventory` works out what one order requires: every dish in its meal plan through its recipe (guests plus the Kitchen Rules' extra percentage), plus the extra items added by hand on the order (no recipe: gas, disposables). It sets that against what has already been sent, read from the ledger (stock-out rows tagged with the order, less stock-in rows for returns), and against stock on hand. Dishes without a recipe are listed, not guessed at.
- `sendOrderItems` takes what is still required from the shelf and records it against the order. It only works once the customer has approved the menu (order Approved or Sent to Kitchen) and while the order is open. It can be run again after the menu or extra items change and then sends only the difference. Where stock is short it takes what is there (never below zero) and writes the shortfall on the ledger row. A lock on the order row means two clicks at once send once.
- `returnOrderItem` (the undo arrow) puts everything sent for one item back as a stock-in row tagged with the order, until the order is Completed or Cancelled.
- `getProductionPlan` is the Production Planning page (`/kitchen-dashboard/production`): orders with the kitchen in the board's window and the combined shortfall of orders whose items are not sent yet.
