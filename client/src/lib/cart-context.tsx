import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Product } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";

export interface CartItemType {
  product: Product;
  quantity: number;
  size?: string;
}

interface CartContextType {
  items: CartItemType[];
  totalItems: number;
  totalPrice: number;
  addToCart: (product: Product, size?: string, quantity?: number) => void;
  removeFromCart: (productId: string, size?: string) => void;
  updateQuantity: (productId: string, quantity: number, size?: string) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  toggleCart: () => void;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemType[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { me } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!me) {
        setItems([]);
        return;
      }
      try {
        const res = await fetch("/api/cart", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load cart");
        const data = (await res.json()) as { id: string; product: Product; quantity: number; size?: string | null }[];
        if (!cancelled) setItems(data.map((d) => ({ product: d.product, quantity: d.quantity, size: d.size ?? undefined })));
      } catch {
        if (!cancelled) setItems([]);
      }
    };
    load();
    return () => { cancelled = true };
  }, [me]);

  const addToCart = (product: Product, size?: string, quantity: number = 1) => {
    if (!me) {
      toast({
        title: "Login required",
        description: "Please log in to add items to your cart.",
        variant: "destructive",
      });
      setIsCartOpen(false);
      const current = window.location.pathname + window.location.search;
      setLocation(`/login?returnTo=${encodeURIComponent(current)}`);
      return;
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id && i.size === size);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { product, quantity, size }];
    });
    apiRequest("POST", "/api/cart", { productId: product.id, size, quantity }).catch(() => {
      fetch("/api/cart", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setItems(Array.isArray(data) ? data.map((d: any) => ({ product: d.product, quantity: d.quantity, size: d.size ?? undefined })) : []))
        .catch(() => setItems([]));
    });
  };

  const removeFromCart = (productId: string, size?: string) => {
    fetch("/api/cart", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("load");
        const data = await r.json();
        const match = (data as any[]).find((i) => i.product?.id === productId && (i.size ?? undefined) === (size ?? undefined));
        if (match) {
          return apiRequest("DELETE", `/api/cart/${match.id}`).then(async (res) => res.ok);
        }
        return true;
      })
      .finally(() => {
        fetch("/api/cart", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => setItems(Array.isArray(data) ? data.map((d: any) => ({ product: d.product, quantity: d.quantity, size: d.size ?? undefined })) : []))
          .catch(() => setItems([]));
      });
  };

  const updateQuantity = (productId: string, quantity: number, size?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId, size);
      return;
    }

    fetch("/api/cart", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("load");
        const data = await r.json();
        const match = (data as any[]).find((i) => i.product?.id === productId && (i.size ?? undefined) === (size ?? undefined));
        if (match) {
          return apiRequest("PATCH", `/api/cart/${match.id}`, { quantity }).then(async () => true);
        }
        return true;
      })
      .finally(() => {
        fetch("/api/cart", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => setItems(Array.isArray(data) ? data.map((d: any) => ({ product: d.product, quantity: d.quantity, size: d.size ?? undefined })) : []))
          .catch(() => setItems([]));
      });
  };

  const clearCart = () => {
    setItems([]);
    apiRequest("DELETE", "/api/cart").catch(() => {});
  };

  const toggleCart = () => {
    setIsCartOpen(!isCartOpen);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalPrice,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        toggleCart,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
