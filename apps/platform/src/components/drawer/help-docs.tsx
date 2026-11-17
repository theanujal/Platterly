import { Icon, type IconName } from "@/components/account/icons";

const SITE = "https://platterly.in";

/** The help pages on platterly.in, in the order shown. Each row has the design system's icon chip (primary tint, 10px radius, orange icon), at a smaller 32px. */
export const DOCS: { label: string; href: string; icon: IconName }[] = [
  { label: "FAQs", href: `${SITE}/caterly/#faq`, icon: "helpCircle" },
  { label: "Contact Us", href: `${SITE}/contact/`, icon: "phone" },
];

/** The "Help documents" heading and the six rows, used in the Help panel and inside the account drawer. `onNavigate` lets the caller close its panel on a click. */
export function HelpDocuments({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <h3 className="pd-help-title">Help documents</h3>
      <ul className="pd-help-list">
        {DOCS.map((d) => (
          <li key={d.label}>
            <a href={d.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
              <span className="pd-help-icon"><Icon name={d.icon} size={20} /></span>
              {d.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
