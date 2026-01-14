import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Gem, Mail, MapPin, Phone } from "lucide-react";

export function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
              <Gem className="h-6 w-6" />
              <span>JewelCommerce</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider">
              {t('footer.quickLinks')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('header.home')}
                </Link>
              </li>
              <li>
                <Link href="/products" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('header.products')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider">
              {t('footer.categories')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/products/category/rings" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('products.rings')}
                </Link>
              </li>
              <li>
                <Link href="/products/category/necklaces" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('products.necklaces')}
                </Link>
              </li>
              <li>
                <Link href="/products/category/earrings" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('products.earrings')}
                </Link>
              </li>
              <li>
                <Link href="/products/category/bracelets" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('products.bracelets')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider">
              {t('footer.contact')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>support@jewelcommerce.com</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>123 Jewelry Street, New York, NY 10001</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground text-center">
            © {currentYear} JewelCommerce. {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
