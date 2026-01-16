import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

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

export default function AdminOrders() {
  const { t } = useTranslation();
  const { me, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    document.title = t('admin.manageOrdersTitle');
  }, [t]);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t('admin.failedToLoadOrders'));
      return res.json();
    },
    enabled: !!me && !authLoading && me.role === "admin",
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(t('admin.failedToUpdateStatus'));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('admin.orderStatusUpdated') });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/summary"] });
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      toast({ 
        title: t('admin.failedToUpdateStatus'), 
        description: error.message, 
        variant: "destructive" 
      });
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

  if (!me || me.role !== "admin") {
    return (
      <div className="container mx-auto p-6">
        <p className="mb-4">{t('admin.unauthorized')}. {t('admin.adminsOnly')}</p>
        <Link href="/products">
          <Button>{t('products.title')}</Button>
        </Link>
      </div>
    );
  }

  const filteredOrders = orders.filter((order: Order) => {
    if (filterStatus === "all") return true;
    return order.status === filterStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      case "processing":
        return <Package className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      case "processing":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-3xl lg:text-4xl font-light">{t('admin.manageOrdersTitle')}</h1>
            <p className="text-muted-foreground">{t('admin.viewUpdateStatuses')}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('admin.ordersCount', { count: filteredOrders.length })}
          </span>
        </div>
        <div className="w-full sm:w-auto">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder={t('admin.filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.allOrders')}</SelectItem>
              <SelectItem value="pending">{t('orderStatus.pending')}</SelectItem>
              <SelectItem value="processing">{t('orderStatus.processing')}</SelectItem>
              <SelectItem value="completed">{t('orderStatus.completed')}</SelectItem>
              <SelectItem value="cancelled">{t('orderStatus.cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError && (
        <Card className="p-4 bg-red-50 border-red-200 mb-6">
          <p className="text-red-700">{t('admin.failedToLoadOrders')}</p>
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
      ) : filteredOrders.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            {filterStatus === "all" ? t('admin.noOrdersFound') : t('admin.noStatusOrders', { status: filterStatus })}
          </p>
          {filterStatus !== "all" && (
            <Button variant="outline" onClick={() => setFilterStatus("all")}>
              {t('admin.showAllOrders')}
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order: Order) => (
            <Card key={order.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-lg">Order #{order.id.slice(0, 8).toUpperCase()}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()} at{" "}
                        {new Date(order.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('admin.customer')}:</span>{" "}
                      <span className="font-medium">{order.customerName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('admin.email')}:</span> {order.customerEmail}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('admin.items')}:</span> {order.items.length} {t(order.items.length === 1 ? 'admin.item' : 'admin.items')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <div className="text-right">
                    <p className="font-serif text-xl font-light mb-2">
                      ${(order.totalAmount / 100).toFixed(2)}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <span
                        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getStatusColor(
                          order.paymentStatus
                        )}`}
                      >
                        {order.paymentStatus}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {getStatusIcon(order.status)}
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {t('admin.viewDetails')}
                    </Button>
                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatusMutation.mutate({ orderId: order.id, status: "processing" })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        {t('admin.startProcessing')}
                      </Button>
                    )}
                    {order.status === "processing" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatusMutation.mutate({ orderId: order.id, status: "completed" })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('admin.complete')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <Card
            className="max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h2 className="font-serif text-2xl font-light">{t('admin.orderDetails')}</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-2xl leading-none hover:text-muted-foreground"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.orderId')}</p>
                  <p className="font-medium font-mono">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.orderDate')}</p>
                  <p className="font-medium">
                    {new Date(selectedOrder.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.totalAmount')}</p>
                  <p className="font-serif text-xl font-light">
                    ${(selectedOrder.totalAmount / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('admin.status')}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedOrder.paymentStatus)}`}>
                      {selectedOrder.paymentStatus}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">{t('admin.customerInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('admin.name')}</p>
                    <p className="font-medium">{selectedOrder.customerName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('admin.email')}</p>
                    <p className="font-medium">{selectedOrder.customerEmail}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">{t('admin.phone')}</p>
                    <p className="font-medium">{selectedOrder.customerPhone}</p>
                  </div>
                </div>
              </div>

              {/* Shipping Info */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">{t('admin.shippingAddress')}</h3>
                <div className="space-y-2">
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
                    <p className="text-xs text-muted-foreground">{t('checkout.address')}</p>
                    <div className="text-sm text-muted-foreground">
                      <p>{selectedOrder.shippingAddress}</p>
                      <p>
                        {selectedOrder.shippingCity}, {selectedOrder.shippingPostalCode}
                      </p>
                      <p>{selectedOrder.shippingCountry}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-4">{t('admin.orderItems')}</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between text-sm border-b pb-3">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('admin.quantity')}: {item.quantity}
                          {item.size && <span> | {t('admin.size')}: {item.size}</span>}
                        </p>
                      </div>
                      <p className="font-medium">
                        ${((item.productPrice * item.quantity) / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between font-medium text-lg">
                  <span>{t('admin.total')}</span>
                  <span className="font-serif font-light">
                    ${(selectedOrder.totalAmount / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedOrder(null)}>
                  {t('common.close')}
                </Button>
                {selectedOrder.status === "pending" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      updateStatusMutation.mutate({
                        orderId: selectedOrder.id,
                        status: "processing",
                      });
                    }}
                    disabled={updateStatusMutation.isPending}
                  >
                    {t('admin.startProcessing')}
                  </Button>
                )}
                {selectedOrder.status === "processing" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      updateStatusMutation.mutate({
                        orderId: selectedOrder.id,
                        status: "completed",
                      });
                    }}
                    disabled={updateStatusMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {t('admin.markAsCompleted')}
                  </Button>
                )}
                {(selectedOrder.status === "pending" || selectedOrder.status === "processing") && (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      updateStatusMutation.mutate({
                        orderId: selectedOrder.id,
                        status: "cancelled",
                      });
                    }}
                    disabled={updateStatusMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {t('admin.cancelOrder')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
