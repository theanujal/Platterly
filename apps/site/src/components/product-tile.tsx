import { Icon } from "@/components/icons";
import { productVars, type Product } from "@/content/products";

/** A product's icon on a tile in its own colour, the way calendly.com marks each product. */
export function ProductTile({ product, className = "size-10", iconClass = "size-5" }: { product: Product; className?: string; iconClass?: string }) {
  return (
    <span style={productVars(product)} className={`flex shrink-0 items-center justify-center rounded-[10px] bg-product text-ink-navy ${className}`} aria-hidden>
      <Icon name={product.icon} className={iconClass} />
    </span>
  );
}
