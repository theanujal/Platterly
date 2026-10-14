# purchasing

Chunk 18.3 — purchase orders to suppliers. A draft is the purchase request; it is sent to the supplier from the order page (Send via WhatsApp, below), and the order becomes Ordered only after the person confirms they sent it; Receive stock books a real STOCK_IN ledger row per line ("Received on PO-0001") and the order moves to Partly received or Received. Receiving is atomic per line, so two people receiving at once cannot take more than was ordered. Cancel only before anything arrives; delete only a draft or cancelled order. `supplier-payment.ts` records money paid to a supplier; the outstanding balance is the value received on non-cancelled orders minus those payments. Maths shared with the pages is in `po-math.ts`.


## Raising an order (2026-10-15)

- No expected date and no prices. A new line is stored with `unitCost` 0, and `isPriced` (po-math) is false until some line has a cost, so the pages say "Not yet priced" instead of ₹0.00. `PurchaseOrder.expectedDate` stays in the database (old orders keep it) but nothing reads or writes it. An edited draft keeps the cost an older line already had.
- Items must be ones the supplier provides (`SupplierItem`, Products Supplied): the form only offers those, and `checkInput` refuses others (an edited draft keeps the lines it already had). An inactive supplier cannot be chosen for a new order. Inventory has no active flag, so every mapped item is offered. The quantity is in the item's own stock unit, shown beside the field.
- Send via WhatsApp (`po-whatsapp.ts`, pure): `buildPoWhatsappMessage` (supplier greeting, PO number, item names with quantity and unit, a request to confirm availability and delivery, no prices) and `whatsappOrderLink` (`https://wa.me/<digits>?text=<encoded>`; the number goes through `normalizePhone` / `whatsappDigits`, so a number that already has a country code is not prefixed again, and a missing or invalid one gives null). The button is a real link (`target=_blank`, `rel=noopener noreferrer`); clicking it opens "Have you sent this purchase order to the supplier?" and only "Yes, I sent it" calls `markOrdered` (which can only succeed once, from Draft). With no usable number the dialog shows the message, a copy button and "I sent it another way".
- Receipt history on the order page comes from the stock ledger rows written by `receiveStock` (`listReceipts`).

## Next phase: receiving and FIFO batches (not built)

What exists today: `receiveStock(orderId, [{ itemId, quantity }])` adds the quantity to `Inventory.stockCount` and writes one `InventoryTransaction` STOCK_IN ("Received on PO-0001") per line; `PurchaseOrderItem.receivedQuantity` and `statusAfterReceipt` give Partly received / Received. It takes no price, date, expiry, lot or invoice, and keeps one running stock number and one `Inventory.costPerUnit`; recipe costing (`costPerServing`) and the stock take read that single cost and count. Supplier balances use `receivedQuantity x unitCost` of the order line.

What the next phase has to change:
- Capture per delivery: actual quantity received, actual unit purchase cost, received date, expiry date, optional supplier lot or batch number, optional invoice number and receiving notes. That needs a receipt record (a `GoodsReceipt` header and lines) instead of only the ledger note, so partial and repeated deliveries, and the receipt history, have real data.
- A stock batch table (`StockBatch`: inventory item, receipt line, quantity received and remaining, unit cost, received date, expiry date, lot) so different costs or expiry dates stay separate. `Inventory.stockCount` becomes the sum of open batches (or is kept in step inside the same transaction as every batch change).
- Existing stock has no batches: the migration needs one opening batch per item from the current `stockCount` and `costPerUnit`, with no expiry.
- FIFO consumption: every STOCK_OUT, order stock take (`takeOrderStock`) and "return to stock" must draw from the oldest batch first (or by earliest expiry, to be decided) and record which batches it used; undo must put quantities back into the same batches.
- Batch-aware costing: the supplier balance should use the actual receipt cost (the order line's `unitCost` is then only an estimate or is dropped); recipe cost per serving would use the FIFO or current batch cost, and `Inventory.costPerUnit` becomes derived or a "last purchase" figure. `recipe-math.ts` should not change until this is decided.
- Expiry: a screen and alert for batches near or past expiry, and a guard so expired batches are not consumed (or need an override with a reason).
- Revisit `deleteInventoryItem`, the low-stock alert and the Inventory page's value totals, which all read `stockCount` and `costPerUnit` today.
