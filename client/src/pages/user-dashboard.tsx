import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm-dialog";
import { Link } from "wouter";

export default function UserDashboard() {
  const { me, loading, logout } = useAuth();

  useEffect(() => {
    document.title = "Your Dashboard";
  }, []);

  if (loading) return <div className="container mx-auto p-6">Loading…</div>;
  if (!me) return (
    <div className="container mx-auto p-6">
      <p className="mb-4">You are not logged in.</p>
      <Link href="/products"><Button>Browse products</Button></Link>
    </div>
  );

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
      <h1 className="font-serif text-3xl lg:text-4xl font-light">Welcome, {me.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">Account</h3>
          <p className="text-sm text-muted-foreground">{me.email}</p>
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <h3 className="font-medium mb-2">Orders</h3>
          <p className="text-sm text-muted-foreground">View your recent orders soon.</p>
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
    </div>
  );
}
