
export const HOME = {
  hero: {
    title: "Software built for the food business.",
    copy: "Platterly brings focused software for managing the work behind modern food businesses into one place.",
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
  label: "Catering by Platterly",
  title: "A better way to run your catering business",
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
  copy: "Taking orders, planning menus and running the kitchen should not mean five tools and a lot of chasing. Platterly keeps the work in one place, from the first call to the final payment.",
  steps: [
    { title: "Take the order", text: "A customer enquires. Save them, their event and their guests in one place.", points: ["Customer and event saved once", "Guests split into adults and children", "Every order on one calendar"], card: "customers" },
    { title: "Plan the menu", text: "Pick a menu for each meal and see the price build.", points: ["A menu for every meal of every day", "Price updates as you choose", "Customer approves from a link"], card: "approval" },
    { title: "Run the kitchen", text: "Approved menus land on the kitchen board.", points: ["Pending, In Preparation, Ready", "Everyone sees where an order stands", "Nothing to forward or retype"], card: "kitchen" },
    { title: "Get paid", text: "Track advances and balances, and issue the invoice.", points: ["Advance and balance on the order", "Invoice from the same page", "Know what is still to collect"], card: "payment" },
  ],
} as const;
