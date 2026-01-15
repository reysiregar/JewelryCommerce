import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth-context";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartSheet } from "@/components/cart-sheet";
import { ScrollToTop } from "@/components/scroll-to-top";
import Home from "@/pages/home";
import Products from "@/pages/products";
import ProductDetail from "@/pages/product-detail";
import Checkout from "@/pages/checkout";
import OrderSuccess from "@/pages/order-success";
import NotFound from "@/pages/not-found";
import UserDashboard from "@/pages/user-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminProductForm from "@/pages/admin-product-form";
import AdminOrders from "@/pages/admin-orders";
import Login from "@/pages/login";
import Register from "@/pages/register";
import PurchaseHistory from "@/pages/purchase-history";
import { ThemeProvider } from "@/lib/theme-context";

function AppLayout() {
  const [location] = useLocation();
  const showFooter = location === "/" || location.startsWith("/products");

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        <Router />
      </main>
      {showFooter && <Footer />}
      <CartSheet />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products/category/:category" component={Products} />
      <Route path="/products" component={Products} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/dashboard" component={UserDashboard} />
      <Route path="/purchase-history" component={PurchaseHistory} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/products/new" component={AdminProductForm} />
      <Route path="/admin/products/:id/edit" component={AdminProductForm} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/order-success" component={OrderSuccess} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <AppLayout />
              <Toaster />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
