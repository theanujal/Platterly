import { Icon } from "@/components/icons";
import { productVars, type Product } from "@/content/products";

/** A product's icon on a tile in its own colour, the way calendly.com marks each product. */
export function ProductTile({ product, className = "size-10", iconClass = "size-5" }: { product: Product; className?: string; iconClass?: string }) {
  if (product.logo) {
    // eslint-disable-next-line @next/next/no-img-element -- a small static logo from /public
    return <img src={product.logo} alt="" aria-hidden className={`shrink-0 rounded-[10px] object-contain ${className}`} />;
  }
  return (
    <span style={productVars(product)} className={`flex shrink-0 items-center justify-center rounded-[10px] bg-product text-white ${className}`} aria-hidden>
      <Icon name={product.icon} className={iconClass} />
    </span>
  );
}
