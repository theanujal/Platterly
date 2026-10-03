import type { ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "cn";

export interface PublicBrand {
  name: string;
  logo: string | null;
}

/**
 * The page every customer-facing screen sits in (storefront, the plan steps, the menu-approval link, the quotation
 * link): a warm page background, the caterer's brand, an optional big title and subtitle, the content, and a
 * footer. One shell so these pages read as one product. Built from the app's own tokens; nothing here adds a color.
 */
export function PublicShell({
  brand,
  title,
  subtitle,
  width = "max-w-5xl",
  children,
}: {
  brand: PublicBrand;
  title?: string;
  subtitle?: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-accent/80">
      <main className={cn("mx-auto flex w-full flex-1 flex-col gap-8 px-4 py-8 md:px-8 md:py-12", width)}>
        <header className="flex flex-col items-center gap-3 text-center">
          <Brand brand={brand} />
          {title && (
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}
        </header>
        {children}
      </main>
      <footer className="px-4 pb-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Platterly. Crafting memorable events.
      </footer>
    </div>
  );
}

function Brand({ brand }: { brand: PublicBrand }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- the caterer's own uploaded logo
        <img src={brand.logo} alt={brand.name} className="h-14 w-auto" />
      ) : (
        <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UtensilsCrossed className="size-7" />
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{brand.name}</p>
    </div>
  );
}
