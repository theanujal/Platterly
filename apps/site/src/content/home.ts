
export const HOME = {
  hero: {
    title: "Software built for the food business.",
    copy: "Platterly builds simple software to help food businesses manage their work, serve their customers and grow with less operational chaos.",
  },
  what: {
    title: "One platform. Built around the way food businesses work.",
    copy: "Food businesses manage customers, orders, menus, events, teams and countless moving parts. Platterly is building focused software around those workflows, starting with catering.",
  },
  featured: {
    title: "Meet Catering by Platterly",
    copy: "Run your catering business from enquiry to event completion. Manage customers, events, menus, guest requirements and orders from one connected workspace.",
    cta: "Explore Catering",
  },
  preview: { title: "See Platterly in action." },
  direction: {
    title: "Starting with catering. Built to grow with your business.",
    copy: "Catering is where Platterly starts. As the platform grows, new products can help more food businesses manage the work behind the scenes.",
  },
  cta: { title: "Ready to simplify your catering business?", copy: "Start with Catering by Platterly." },
} as const;

/** The single card in the pinned scene: what Catering by Platterly is. */
export const HOME_SCENE = {
  title: "Run your catering business from one place.",
  text: "Catering by Platterly keeps your customers, events, menus, orders, kitchen and payments together, from the first enquiry to the final delivery.",
};

/** The chapter dedicated to Catering, below the steps: a list on one side, the real screen on the other. */
export const HOME_CHAPTER = {
  label: "Our first product, Catering by Platterly",
  title: "Meet Catering by Platterly.",
  subtitle: "A better way to run your catering business",
  items: [
    { id: "events", icon: "calendar", title: "Events and calendar", text: "See how busy each day is, with every booked event and order where it belongs, including multi-day events.", card: "calendar", href: "/catering/#features" },
    { id: "menus", icon: "book", title: "Menus customers approve", text: "Plan each meal, watch the price build, and send a link your customer approves with no login.", card: "approval", href: "/catering/#features" },
    { id: "kitchen", icon: "chef", title: "A board for the kitchen", text: "Approved menus land on a board the team moves from Pending to In Preparation to Ready.", card: "kitchen", href: "/catering/#features" },
    { id: "payments", icon: "wallet", title: "Payments and invoices", text: "Track advances and balances on the order, and issue the invoice from the same page.", card: "payment", href: "/catering/#features" },
  ],
} as const;

export const HOME_STEPS = {
  eyebrow: "Software for food businesses",
  title: "Built for the people behind the food",
  copy: "Running a food business means managing a lot more than what's on the plate. Platterly brings the tools behind that work into one place, so you can spend less time managing systems and more time running the business.",
  steps: [
    { title: "Customers", text: "Keep every enquiry, customer and event together, from the first call to the final guest count.", points: ["Customer and event saved once", "Guests split into adults and children", "Customers approve menus from a link"] },
    { title: "Operations", text: "Plan the menu, run the kitchen and manage delivery without chasing people.", points: ["A menu for every meal of every day", "A kitchen board from Pending to Ready", "Staffing and delivery beside the order"] },
    { title: "Business", text: "Know what is booked, what is paid and what is still to collect.", points: ["Advance and balance on the order", "Invoice from the same page", "Reports on sales and events"] },
  ],
} as const;
