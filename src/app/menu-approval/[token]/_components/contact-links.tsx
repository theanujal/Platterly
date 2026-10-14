import { Mail, MessageCircle, Phone } from "lucide-react";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";

/** Call, WhatsApp and email the kitchen as tappable buttons (AJ, 2026-10-14). Renders nothing when the kitchen gave no contact. */
export function ContactLinks({ contact, message }: { contact: { phone: string | null; email: string | null }; message?: string }) {
  if (!contact.phone && !contact.email) return null;
  const link = "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted";
  return (
    <div className="flex flex-wrap gap-2" data-testid="contact-links">
      {contact.phone && (
        <a href={`tel:+${whatsappDigits(contact.phone)}`} className={link}>
          <Phone className="size-4" /> Call {formatPhoneDisplay(contact.phone)}
        </a>
      )}
      {contact.phone && (
        <a href={`https://wa.me/${whatsappDigits(contact.phone)}${message ? `?text=${encodeURIComponent(message)}` : ""}`} target="_blank" rel="noopener" className={link}>
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`} className={link}>
          <Mail className="size-4" /> Email
        </a>
      )}
    </div>
  );
}
