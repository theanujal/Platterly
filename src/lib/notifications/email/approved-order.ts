/** What the "your order is approved" email shows beyond the usual order lines. Plain data (it travels in the notification payload). */
export interface ApprovedOrderEmail {
  menuName: string;
  orderDetails: string;
  /** The customer's own order page (/menu-approval/{token}). */
  statusUrl: string | null;
  /** Venue lines, or null while the customer has not sent the venue and delivery details yet. */
  venue: string[] | null;
  priceRows: { label: string; detail?: string; amount: number; negative?: boolean }[];
  total: number;
  shareUrl: string | null;
  /** A hosted picture of the share link's QR: mail apps do not show a QR embedded in the email itself. */
  shareQrUrl: string | null;
  kitchen: { name: string; phone: string | null; email: string | null; address: string | null };
}
