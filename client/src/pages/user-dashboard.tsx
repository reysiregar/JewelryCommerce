import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm-dialog";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import DeleteAccountDialog from "@/components/modals/delete-account-dialog";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserDashboard() {
  const { me, loading, logout } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    document.title = t('dashboard.welcome');
  }, [t]);

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/user/orders"],
    queryFn: async () => {
      const res = await fetch("/api/user/orders", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: !!me && !loading,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ password, confirm }: { password: string; confirm: string }) => {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, confirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Failed to delete account");
      return true;
    },
    onSuccess: async () => {
      toast({ title: t('common.success') });
      await logout();
    },
    onError: (e: any) => {
      toast({ title: t('common.error'), description: e.message, variant: "destructive" });
    },
  });

  const recentOrders = orders.slice(0, 3);

  if (loading) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }
  
  if (!me) return (
    <div className="container mx-auto p-6">
      <p className="mb-4">{t('auth.login.welcomeBack')}</p>
      <Link href="/products"><Button>{t('products.title')}</Button></Link>
    </div>
  );

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="font-serif text-3xl lg:text-4xl font-light">{t('dashboard.welcome')}, {me.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">{t('header.myAccount')}</h3>
          <p className="text-sm text-muted-foreground">{me.email}</p>
          {me.role !== "admin" && (
            <div className="pt-4">
              <DeleteAccountDialog
                onConfirm={(password, confirm) => deleteMutation.mutate({ password, confirm })}
                loading={deleteMutation.isPending}
              >
                <Button variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10">
                  {t('common.delete')} {t('header.myAccount')}
                </Button>
              </DeleteAccountDialog>
            </div>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">{t('dashboard.orders')}</h3>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          {recentOrders.length > 0 ? (
            <>
              <p className="text-2xl font-serif font-light mb-2">{orders.length}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {recentOrders.length} {t('dashboard.recentOrders').toLowerCase()}
              </p>
              <Link href="/purchase-history">
                <Button variant="outline" className="w-full">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {t('dashboard.orderHistory')}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">{t('dashboard.noOrders')}</p>
              <Link href="/products">
                <Button variant="outline" className="w-full">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {t('home.hero.cta')}
                </Button>
              </Link>
            </>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">{t('admin.actions')}</h3>
          <div className="flex gap-2">
            <Confirm
              title={t('header.logout')}
              description={t('dashboard.confirmLogout')}
              confirmLabel={t('header.logout')}
              onConfirm={logout}
            >
              <Button variant="outline">{t('header.logout')}</Button>
            </Confirm>
            {me.role === "admin" && (
              <Link href="/admin"><Button>{t('admin.title')}</Button></Link>
            )}
          </div>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <div className="border rounded-xl p-6 bg-card">
          <h3 className="font-medium mb-4">{t('dashboard.recentOrders')}</h3>
          <div className="space-y-3">
            {recentOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-sm">{t('dashboard.orderNumber')}{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif font-light">${(order.totalAmount / 100).toFixed(2)}</p>
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
            ))}
          </div>
          {orders.length > 3 && (
            <div className="mt-4 text-center">
              <Link href="/purchase-history">
                <Button variant="ghost">{t('dashboard.orderHistory')} ({orders.length}) →</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
