import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  size?: string;
}

interface Order {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  shippingType: string;
  totalAmount: number;
  status: string;
  isPreOrder: boolean;
  paymentStatus: string;
  createdAt: string;
  items: OrderItem[];
}

export default function PurchaseHistory() {
  const { me, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('header.purchaseHistory');
  }, [t]);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["/api/user/orders"],
    queryFn: async () => {
      const res = await fetch("/api/user/orders", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: !!me && !authLoading,
  });

  const downloadReceiptMutation = useMutation({
    mutationFn: async (order: Order) => {
      const res = await fetch("/api/receipt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: order.id }),
      });
      if (!res.ok) throw new Error("Failed to generate receipt");
      return { blob: await res.blob(), orderId: order.id };
    },
    onSuccess: ({ blob, orderId }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${orderId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: t('common.success') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="container mx-auto p-6">
        <p className="mb-4">{t('auth.login.welcomeBack')}</p>
        <Link href="/products">
          <Button>{t('products.title')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-3xl lg:text-4xl font-light">{t('header.purchaseHistory')}</h1>
            <p className="text-muted-foreground">{t('dashboard.orderHistory')}</p>
          </div>
        </div>
      </div>

      {isError && (
        <Card className="p-4 bg-red-50 border-red-200 mb-6">
          <p className="text-red-700">{t('common.error')}</p>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-1/3 mb-4" />
              <Skeleton className="h-4 w-1/2 mb-3" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">{t('dashboard.noOrders')}</p>
          <Link href="/products">
            <Button>{t('home.hero.cta')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Order) => (
            <Card key={order.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-medium text-lg mb-1">{t('dashboard.orderNumber')}{order.id.slice(0, 8)}</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4 mt-4 lg:mt-0">
                  <div className="text-right">
                    <p className="font-serif text-lg font-light">${(order.totalAmount / 100).toFixed(2)}</p>
                    <div className="flex gap-2 mt-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          order.paymentStatus === "paid"
                            ? "bg-green-100 text-green-700"
                            : order.paymentStatus === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          order.status === "completed"
                            ? "bg-blue-100 text-blue-700"
                            : order.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t(`orderStatus.${order.status}`)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-b py-4 mb-4">
                <h4 className="font-medium text-sm mb-2">{t('cart.items')}</h4>
                <div className="space-y-2">
                  {order.items.map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between text-sm text-muted-foreground">
                      <div>
                        <p>{item.productName}</p>
                        <p className="text-xs">
                          {item.quantity}x ${(item.productPrice / 100).toFixed(2)}
                          {item.size && <span> - {t('cart.size')}: {item.size}</span>}
                        </p>
                      </div>
                      <p>${((item.productPrice * item.quantity) / 100).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedOrder(order)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {t('dashboard.viewOrder')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => downloadReceiptMutation.mutate(order)}
                  disabled={downloadReceiptMutation.isPending}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('dashboard.downloadReceipt')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <h2 className="font-serif text-2xl font-light">{t('dashboard.viewOrder')}</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-2xl leading-none hover:text-muted-foreground"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.orderNumber')}</p>
                  <p className="font-medium">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.orderDate')}</p>
                  <p className="font-medium">{new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.orderTotal')}</p>
                  <p className="font-serif text-lg font-light">${(selectedOrder.totalAmount / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.orderStatus')}</p>
                  <p className="font-medium">{t(`orderStatus.${selectedOrder.status}`)}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">{t('checkout.shippingInfo')}</h3>
                <div className="space-y-1">
                  {selectedOrder.shippingType && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('checkout.shippingType')}</p>
                      <p className="text-sm font-medium">
                        {selectedOrder.shippingType === "instant" ? t('checkout.shipping.instant.title', { defaultValue: "Instant Delivery" })
                        : selectedOrder.shippingType === "express" ? t('checkout.shipping.express.title', { defaultValue: "Express Delivery" })
                        : selectedOrder.shippingType === "prioritize" ? t('checkout.shipping.prioritize.title', { defaultValue: "Prioritize Delivery" })
                        : selectedOrder.shippingType === "free" ? t('checkout.shipping.free.title', { defaultValue: "Premium Free Shipping" })
                        : selectedOrder.shippingType.charAt(0).toUpperCase() + selectedOrder.shippingType.slice(1).replace(/-/g, ' ')}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mt-2">{t('checkout.address')}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.shippingAddress}, {selectedOrder.shippingCity} {selectedOrder.shippingPostalCode},
                      {selectedOrder.shippingCountry}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-4">{t('cart.items')}</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('productDetail.quantity')}: {item.quantity}
                          {item.size && <span> | {t('cart.size')}: {item.size}</span>}
                        </p>
                      </div>
                      <p className="font-medium">${((item.productPrice * item.quantity) / 100).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between font-medium text-lg">
                  <span>{t('cart.total')}</span>
                  <span className="font-serif font-light">${(selectedOrder.totalAmount / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedOrder(null)}
                >
                  {t('common.close')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    downloadReceiptMutation.mutate(selectedOrder);
                    setSelectedOrder(null);
                  }}
                  disabled={downloadReceiptMutation.isPending}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('dashboard.downloadReceipt')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
