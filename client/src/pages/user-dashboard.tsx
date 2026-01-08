import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm-dialog";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DeleteAccountDialog from "@/components/modals/delete-account-dialog";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserDashboard() {
  const { me, loading, logout } = useAuth();

  useEffect(() => {
    document.title = "Your Dashboard";
  }, []);

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
      <p className="mb-4">You are not logged in.</p>
      <Link href="/products"><Button>Browse products</Button></Link>
    </div>
  );

  const { toast } = useToast();

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
      toast({ title: "Account deleted" });
      await logout();
    },
    onError: (e: any) => {
      toast({ title: "Deletion failed", description: e.message, variant: "destructive" });
    },
  });

  const recentOrders = orders.slice(0, 3);

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="font-serif text-3xl lg:text-4xl font-light">Welcome, {me.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">Account</h3>
          <p className="text-sm text-muted-foreground">{me.email}</p>
          {me.role !== "admin" && (
            <div className="pt-4">
              <DeleteAccountDialog
                onConfirm={(password, confirm) => deleteMutation.mutate({ password, confirm })}
                loading={deleteMutation.isLoading}
              >
                <Button variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10">
                  Delete My Account
                </Button>
              </DeleteAccountDialog>
            </div>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Your Orders</h3>
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          {recentOrders.length > 0 ? (
            <>
              <p className="text-2xl font-serif font-light mb-2">{orders.length}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {recentOrders.length} recent order{recentOrders.length !== 1 ? 's' : ''}
              </p>
              <Link href="/purchase-history">
                <Button variant="outline" className="w-full">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  View All Orders
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">No orders yet</p>
              <Link href="/products">
                <Button variant="outline" className="w-full">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Start Shopping
                </Button>
              </Link>
            </>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">Actions</h3>
          <div className="flex gap-2">
            <Confirm
              title="Confirm Logout"
              description="Are you sure you want to sign out of your account?"
              confirmLabel="Logout"
              onConfirm={logout}
            >
              <Button variant="outline">Logout</Button>
            </Confirm>
            {me.role === "admin" && (
              <Link href="/admin"><Button>Admin Dashboard</Button></Link>
            )}
          </div>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <div className="border rounded-xl p-6 bg-card">
          <h3 className="font-medium mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-sm">Order #{order.id.slice(0, 8)}</p>
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
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {orders.length > 3 && (
            <div className="mt-4 text-center">
              <Link href="/purchase-history">
                <Button variant="link">View all {orders.length} orders →</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
