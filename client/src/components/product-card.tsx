import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { sanitizeImageUrl } from "@/lib/image-utils";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { t } = useTranslation();
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const imageUrl = sanitizeImageUrl(product.imageUrl);
  
  const formattedPrice = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(product.price / 100);

  return (
    <Link href={`/product/${product.id}`}>
      <Card
        data-testid={`card-product-${product.id}`}
        className="group overflow-hidden border hover-elevate active-elevate-2 cursor-pointer transition-all duration-300"
      >
        <div className="relative aspect-square overflow-hidden bg-accent">
          {!imageLoaded && (
            <Skeleton className="absolute inset-0 w-full h-full" />
          )}
          <img
            src={imageUrl}
            alt={product.name}
            className={`h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02] ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            data-testid={`img-product-${product.id}`}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              const currentSrc = e.currentTarget.src;
              if (currentSrc.endsWith('/favicon.png') || currentSrc.includes('favicon')) {
                setImageLoaded(true);
                return;
              }
              e.currentTarget.src = "/favicon.png";
              setImageLoaded(true);
            }}
          />
          {product.isPreOrder && (
            <Badge
              variant="secondary"
              data-testid={`badge-preorder-${product.id}`}
              className="absolute top-3 right-3 font-medium"
            >
              {t('products.preOrder')}
            </Badge>
          )}
          {!product.inStock && !product.isPreOrder && (
            <Badge
              variant="secondary"
              data-testid={`badge-outofstock-${product.id}`}
              className="absolute top-3 right-3 font-medium"
            >
              {t('products.outOfStock')}
            </Badge>
          )}
        </div>
        <div className="p-4 space-y-2">
          <h3
            className="font-medium text-base lg:text-lg line-clamp-1"
            data-testid={`text-product-name-${product.id}`}
          >
            {product.name}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {product.material}
          </p>
          <p
            className="font-serif text-lg font-semibold"
            data-testid={`text-product-price-${product.id}`}
          >
            {formattedPrice}
          </p>
        </div>
      </Card>
    </Link>
  );
}
