// Client-safe: the venue types the customer picks from on the approval link's Venue & Delivery step, and how the
// confirmation page names them.
export const VENUE_TYPE_OPTIONS = [
  { value: "CLUBHOUSE", label: "Clubhouse" },
  { value: "HOTEL", label: "Hotel" },
  { value: "BANQUET_HALL", label: "Banquet Hall" },
  { value: "RESORT", label: "Resort" },
  { value: "HOME", label: "Home" },
  { value: "OFFICE", label: "Office" },
  { value: "OTHER", label: "Other" },
] as const;
