import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { editInventoryItem } from "./inventory-helpers";
import { signUpCaterer } from "./auth-helpers";

/** Chunk 18.2 — add a supplier, pick it on an inventory item and an expense, see it on the profile, and see delete refused while in use. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("supplier: create, pick on inventory and expense, profile, delete guard", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-suppliers-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const supplier = `Grain Traders ${suffix}`;

  await signUpCaterer(page, email, { firstName: "Supplier", lastName: "Tester", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // Create from the sidebar link
  await page.getByRole("link", { name: "Stock & Supplies", exact: true }).click();
  await page.getByRole("navigation", { name: "Stock & Supplies" }).getByRole("link", { name: "Suppliers" }).click();
  await expect(page).toHaveURL(/\/suppliers$/);
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await page.getByLabel("Supplier Name").fill(supplier);
  await page.getByLabel("Phone", { exact: true }).fill("9876543210"); // the +91 is already there and cannot be edited
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(supplier)).toBeVisible();

  // A duplicate name (any case) is refused
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await page.getByLabel("Supplier Name").fill(supplier.toLowerCase());
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Pick it on an inventory item
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(`Rice ${suffix}`);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(`Rice ${suffix}`)).toBeVisible();
  await editInventoryItem(page, `Rice ${suffix}`, { supplier });

  // Pick it on a company expense
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("1500");
  await dialog.getByLabel("Supplier list").click();
  await page.getByRole("option", { name: supplier }).click();
  await dialog.getByRole("button", { name: "Add Expense" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("cell", { name: supplier })).toBeVisible();

  // Profile shows the item and the spend
  await page.goto("/suppliers");
  await page.getByRole("link", { name: supplier }).click();
  await expect(page.getByRole("heading", { name: supplier })).toBeVisible();
  await expect(page.getByText("Total spent: ₹1,500")).toBeVisible();
  await expect(page.getByRole("cell", { name: `Rice ${suffix}` })).toBeVisible();

  // Delete is refused while it is in use
  await page.goto("/suppliers");
  await page.getByRole("button", { name: `Delete ${supplier}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Deactivate it instead/)).toBeVisible();
});

test("supplier Products Supplied: map items, mark preferred (one supplier per item), edit, remove, deactivate", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-supplier-products-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [rice, dal] = [`Rice ${suffix}`, `Dal ${suffix}`];
  const [s1, s2] = [`Grain Co ${suffix}`, `Pulse Co ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Supplier", lastName: "Products", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  for (const name of [rice, dal]) {
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(name);
    await page.getByLabel("Category", { exact: true }).click();
    await page.getByRole("option", { name: "Grains & Cereals" }).click();
    await page.getByLabel("Base Stock Unit", { exact: true }).click();
    await page.getByRole("option", { name: "Kilogram (kg)" }).click();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }

  const addProduct = async (name: string) => {
    await page.getByRole("button", { name: "Add a product" }).click();
    await page.getByPlaceholder("Search inventory items…").fill(name.slice(0, 5).toLowerCase());
    await page.getByRole("option", { name: new RegExp(name) }).click();
  };

  // Supplier 1 with two products, preferred for rice only
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Select the inventory items this supplier provides.")).toBeVisible();
  await expect(dialog.getByText(/No products added yet/)).toBeVisible();
  await dialog.getByLabel("Supplier Name").fill(s1);
  await addProduct(rice);
  await addProduct(dal);
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(2);
  await dialog.getByRole("checkbox", { name: `Preferred supplier for ${rice}` }).click();
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await expect(dialog).not.toBeVisible();

  // Supplier 2 with the same rice, also preferred: it takes the flag over from supplier 1
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await dialog.getByLabel("Supplier Name").fill(s2);
  await addProduct(rice);
  await dialog.getByRole("checkbox", { name: `Preferred supplier for ${rice}` }).click();
  await dialog.getByRole("button", { name: "Create supplier" }).click();
  await expect(dialog).not.toBeVisible();

  // Supplier 1 reopens with its products; rice is no longer preferred, and an item already chosen is not offered again
  await page.getByRole("button", { name: `Edit ${s1}` }).click();
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(2);
  await expect(dialog.getByRole("checkbox", { name: `Preferred supplier for ${rice}` })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Add a product" }).click();
  await expect(page.getByRole("listbox", { name: "Add a product" }).getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Make dal preferred, remove rice, save; the rice item itself stays in Inventory
  await dialog.getByRole("checkbox", { name: `Preferred supplier for ${dal}` }).click();
  await dialog.getByRole("button", { name: `Remove ${rice}` }).click();
  // Removing asks first; Cancel keeps it
  await page.getByRole("alertdialog", { name: "Remove this product?" }).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(2);
  await dialog.getByRole("button", { name: `Remove ${rice}` }).click();
  await page.getByRole("alertdialog", { name: "Remove this product?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: `Edit ${s1}` }).click();
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(1);
  await expect(dialog.getByRole("checkbox", { name: `Preferred supplier for ${dal}` })).toBeChecked();
  await page.keyboard.press("Escape");
  await page.goto("/inventory");
  await expect(page.getByText(rice)).toBeVisible();

  // Deactivating keeps the mappings
  await page.goto("/suppliers");
  await page.getByRole("button", { name: `Edit ${s2}` }).click();
  await dialog.getByRole("switch", { name: /Active \(can be picked\)/ }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Inactive").first()).toBeVisible();
  await page.getByRole("button", { name: `Edit ${s2}` }).click();
  await expect(dialog.getByTestId("supplier-product-row")).toHaveCount(1);
  await expect(dialog.getByRole("checkbox", { name: `Preferred supplier for ${rice}` })).toBeChecked();
});

test("Products Supplied: create an inventory item from the supplier drawer; it is picked for the supplier, and the supplier's own values survive", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-supplier-newitem-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [supplier, ghee, existing] = [`Ghee House ${suffix}`, `Ghee ${suffix}`, `Salt ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Supplier", lastName: "NewItem", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // An existing inventory item, to prove a duplicate name is refused
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(existing);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Spices & Masalas" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(existing)).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const drawer = page.getByRole("dialog", { name: "New Supplier" });
  await drawer.getByLabel("Supplier Name").fill(supplier);
  await drawer.getByLabel("Phone", { exact: true }).fill("9876543210");

  // Two columns: the details on the left, Products Supplied on the right
  const [details, products] = await Promise.all([drawer.getByLabel("Supplier Name").boundingBox(), drawer.getByTestId("products-supplied").boundingBox()]);
  expect(products!.x).toBeGreaterThan(details!.x + details!.width);

  // A failed create (duplicate name) adds nothing to the supplier
  const nested = page.getByRole("dialog", { name: "New Inventory Item" });
  await drawer.getByRole("button", { name: "Add Inventory Item" }).click();
  await nested.getByLabel("Item Name").fill(existing);
  await nested.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Oils & Ghee" }).click();
  await nested.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await nested.getByRole("button", { name: "Create item" }).click();
  await expect(nested.getByRole("alert")).toBeVisible();
  await expect(drawer.getByTestId("supplier-product-row")).toHaveCount(0);

  // The real one: created, picked, supplier values intact, marked preferred
  await nested.getByLabel("Item Name").fill(ghee);
  await nested.getByRole("button", { name: "Create item" }).click();
  await expect(nested).not.toBeVisible();
  await expect(drawer.getByLabel("Supplier Name")).toHaveValue(supplier);
  await expect(drawer.getByLabel("Phone", { exact: true })).toHaveValue("+91 98765 43210");
  await expect(drawer.getByTestId("supplier-product-row")).toHaveCount(1);
  await expect(drawer.getByText(`${ghee} was added to Inventory`)).toBeVisible();
  await drawer.getByRole("checkbox", { name: `Preferred supplier for ${ghee}` }).click();
  await drawer.getByRole("button", { name: "Create supplier" }).click();
  await expect(drawer).not.toBeVisible();

  // The mapping was saved with the supplier
  await page.getByRole("button", { name: `Edit ${supplier}` }).click();
  const editDrawer = page.getByRole("dialog", { name: "Edit Supplier" });
  await expect(editDrawer.getByTestId("supplier-product-row")).toHaveCount(1);
  await expect(editDrawer.getByRole("checkbox", { name: `Preferred supplier for ${ghee}` })).toBeChecked();
  await page.keyboard.press("Escape");

  // A normal inventory record: on the Inventory page at zero stock with no cost, no stock movement
  await page.goto("/inventory");
  const row = page.getByRole("row").filter({ hasText: ghee });
  await expect(row).toContainText("0 kg");
  await expect(row).toContainText("—");
  await expect(page.getByRole("row").filter({ hasText: existing })).toHaveCount(1);
});
