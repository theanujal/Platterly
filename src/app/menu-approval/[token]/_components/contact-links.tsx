import { Mail, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";

/** Call, WhatsApp and email the kitchen as full-width buttons, WhatsApp in its own green (AJ, 2026-10-14 / 2026-10-17). Renders nothing when the kitchen gave no contact. */
export function ContactLinks({ contact, message }: { contact: { phone: string | null; email: string | null }; message?: string }) {
  if (!contact.phone && !contact.email) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="contact-links">
      {contact.phone && (
        <a href={`tel:+${whatsappDigits(contact.phone)}`} className={cn(buttonVariants({ variant: "outline", size: "md" }), "w-full")}>
          <Phone className="size-4" /> Call {formatPhoneDisplay(contact.phone)}
        </a>
      )}
      {contact.phone && (
        <a
          href={`https://wa.me/${whatsappDigits(contact.phone)}${message ? `?text=${encodeURIComponent(message)}` : ""}`}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ size: "md" }), "w-full bg-[#25D366] text-white hover:bg-[#1FAD54]")}
        >
          <WhatsAppIcon className="size-4" /> WhatsApp
        </a>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`} className={cn(buttonVariants({ variant: "outline", size: "md" }), "w-full")}>
          <Mail className="size-4" /> Email
        </a>
      )}
    </div>
  );
}
