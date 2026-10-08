import type { ShowcaseItem } from "@/components/feature-showcase";

export const CATERING = {
  hero: {
    title: "Run your catering business without the chaos.",
    copy: "From enquiries and customers to menus, events and orders, Catering by Platterly brings your entire catering workflow into one place.",
  },
  howSteps: [
    { card: "order", colourway: "sunrise", title: "Add the customer and the event", text: "to keep every enquiry, date and guest count together. Adults and children are counted separately, so pricing and quantities are right." },
    { card: "menu", colourway: "blossom", title: "Plan the menu for each meal", text: "with the dishes your customer wants, for every meal of every day. The price builds as you choose, extras and add-ons included." },
    { card: "approval", colourway: "citrus", title: "Let the customer approve it", text: "from a link, with no login. You see the choice, then send the approved menu to the kitchen yourself." },
    { card: "kitchen", colourway: "dusk", title: "Run the kitchen from one board", text: "so the team moves each order from Pending to In Preparation to Ready, and everyone sees where it stands." },
    { card: "payment", colourway: "sunrise", title: "Deliver, then get paid", text: "with advances and balances tracked on the order, and the invoice issued from the same page." },
  ],
  features: {
    title: "Everything your catering team needs.",
    groups: [
      { id: "events", icon: "calendar", title: "Events", text: "Manage dates, guests, meals and event details, including multi-day events.", card: "calendar" },
      { id: "menus", icon: "book", title: "Menus", text: "Create menus, assign meals and organise selections for every event.", card: "menu" },
      { id: "kitchen", icon: "chef", title: "Kitchen", text: "Give the team a clear operational view of what to prepare and when.", card: "kitchen" },
      { id: "payments", icon: "wallet", title: "Payments", text: "Track payment status and outstanding amounts.", card: "payment" },
    ] satisfies ShowcaseItem[],
  },
  chapters: {
    title: "Built for the day the kitchen is busiest.",
    items: [
      { id: "approval", icon: "book", title: "Let customers choose their own menu", text: "Share a link and your customer selects from your menu, sees the total and approves it, with no login. You review the choice before it reaches the kitchen.", card: "approval" },
      { id: "kitchen", icon: "chef", title: "Move work through the kitchen", text: "Confirmed menus appear on the kitchen board. The team moves each order from Pending to In Preparation to Ready, and everyone sees where it stands.", card: "kitchen" },
      { id: "staff", icon: "truck", title: "Staffing and delivery in one place", text: "Enter how many people each event needs for every duty, and keep the vehicle, driver and dispatch details beside it.", card: "staffing" },
    ] satisfies ShowcaseItem[],
  },
  useCases: {
    title: "Built for different catering businesses.",
    items: [
      { title: "Wedding Caterers", text: "Multi-day events, multiple meals and large guest counts." },
      { title: "Corporate Caterers", text: "Recurring requirements and organised customer records." },
      { title: "Party & Event Caterers", text: "Simple management for smaller events." },
      { title: "Outdoor Caterers", text: "Coordinate menus, transport and event requirements." },
    ],
  },
  faq: {
    title: "Frequently asked questions.",
    items: [
      { q: "What is Catering by Platterly?", a: "It is web software for catering businesses. It keeps your customers, events, menus, orders, kitchen work, delivery and payments in one place instead of across spreadsheets and chats." },
      { q: "Is it suitable for wedding caterers?", a: "Yes. Wedding events often run over several days with several meals and large guest counts, and Platterly is built to plan exactly that: each day, each meal, each menu." },
      { q: "Can I manage multi-day events?", a: "Yes. An order can span several days and carry a different meal plan for each day. Platterly groups the work by day so nothing is missed." },
      { q: "Can I create multiple menus?", a: "Yes. You can build as many menus as you offer, with your own food items, categories and prices, and assign them to meals on an order." },
      { q: "Can customers select their menu?", a: "Yes. You can share a link where your customer chooses from your menu and approves the final selection, with no login. You review it before it goes to the kitchen." },
      { q: "Can I manage guest information?", a: "You record the number of guests for each event, split into adults and children, and Platterly uses it for menu pricing and for the quantities your kitchen prepares." },
      { q: "Can my kitchen team use Platterly?", a: "Yes. Your kitchen team gets its own view of what to prepare, and you decide what each team member can see and change." },
      { q: "Is there a free trial?", a: "Yes. Every new account starts with a free 7-day trial with full access. You do not need to add a card to begin." },
      { q: "Can I upgrade later?", a: "Yes. You can move to the paid plan at any time from your account, and your data stays exactly as it is." },
      { q: "Do I need to install anything?", a: "No. Catering by Platterly runs in your web browser on a computer, tablet or phone." },
    ],
  },
  cta: { title: "Your next event shouldn't start with another spreadsheet.", copy: "Bring your catering workflow into one place." },
} as const;

/**
 * Plans and prices as they stand in the product today (the Trial plan and the Premium plan, GST at 18% on top).
 * TODO(ops): when Platterly ops owns pricing, this is what it will feed.
 */
export const PRICING = {
  note: "Prices are in Indian rupees and GST (18%) is added at checkout.",
  plans: [
    {
      name: "Free Trial",
      price: "₹0",
      per: "for 7 days",
      blurb: "Try the whole product with your own data. No card needed.",
      features: ["Full access to every feature", "Your customers, events, menus and orders", "Kitchen dashboard and team access", "Invoices and payment tracking"],
      cta: "Start Free",
      featured: false,
    },
    {
      name: "Premium",
      price: "₹3,000",
      per: "per month + GST",
      blurb: "Everything in the trial, for as long as you run your business.",
      yearly: "or ₹33,000 a year + GST, which saves ₹3,000",
      features: ["Everything in the Free Trial", "No limits on customers, events or orders", "Menu approval links for your customers", "Reports and CSV or Excel export", "Team roles for sales, kitchen, store and accounts"],
      cta: "Get Started",
      featured: true,
    },
  ],
} as const;
