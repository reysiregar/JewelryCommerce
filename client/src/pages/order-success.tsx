import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OrderSuccess() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-primary" data-testid="icon-success" />
          </div>
        </div>
        <h1 className="font-serif text-2xl lg:text-3xl font-light mb-4">
          {t('checkout.orderSuccess')}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t('checkout.thankYouMessage')}
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/purchase-history">
            <Button className="w-full" data-testid="button-view-orders">
              <Receipt className="h-4 w-4 mr-2" />
              {t('dashboard.orders')}
            </Button>
          </Link>
          <Link href="/products">
            <Button variant="outline" className="w-full" data-testid="button-continue-shopping">
              {t('cart.continueShopping')}
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full" data-testid="button-back-home">
              {t('common.back')} {t('header.home')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
