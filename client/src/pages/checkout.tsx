import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertOrderSchema, type InsertOrder } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CreditCard, Shield, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

export default function Checkout() {
  const { items, totalPrice, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { me, loading } = useAuth();

  useEffect(() => {
    if (!loading && !me) {
      toast({
        title: "Login required",
        description: "Please log in to continue to checkout.",
        variant: "destructive",
      });
      setLocation("/login?returnTo=%2Fcheckout");
    }
  }, [loading, me, setLocation, toast]);

  useEffect(() => {
    if (!isProcessing) return;

    const message = "Your order is processing. Are you sure you want to leave this page?";

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Triggers native prompt
      return "";
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const anchor = (target.closest && target.closest("a[href]")) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      const sameOrigin = url.origin === window.location.origin;
      if (!sameOrigin) return; // let external links proceed (browser will warn via beforeunload)
      e.preventDefault();
      const proceed = window.confirm(message);
      if (proceed) setLocation(url.pathname + url.search + url.hash);
    };

    const onPopState = () => {
      const proceed = window.confirm(message);
      if (!proceed) {
        history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [isProcessing, setLocation]);

  const checkoutFormSchema = insertOrderSchema.omit({ userId: true });
  type CheckoutFormData = z.infer<typeof checkoutFormSchema>;

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      shippingAddress: "",
      shippingCity: "",
      shippingPostalCode: "",
      shippingCountry: "Indonesia",
      totalAmount: 0,
      status: "pending",
      isPreOrder: false,
      paymentStatus: "pending",
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiRequest("POST", "/api/orders", payload);
    },
    onSuccess: () => {
      toast({
        title: "Order placed successfully!",
        description: "Thank you for your purchase. You will receive a confirmation email shortly.",
      });
      clearCart();
      setLocation("/order-success");
    },
    onError: (error: any) => {
      toast({
        title: "Order failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  const onSubmit = async (data: CheckoutFormData) => {
    if (items.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Please add items to your cart before checking out.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const { userId, ...orderData } = data as any;
    
    const orderPayload = {
      ...orderData,
      totalAmount: finalTotal,
      isPreOrder: items.some((item) => item.product.isPreOrder),
      paymentStatus: "paid" as const,
      status: "processing" as const,
      items: items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        productPrice: item.product.price,
        quantity: item.quantity,
        size: item.size || null,
      })),
    };

    createOrderMutation.mutate(orderPayload);
  };

  const formattedTotal = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(totalPrice / 100);

  const shippingCost = totalPrice >= 100000000 ? 0 : 5000000;
  const formattedShipping = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(shippingCost / 100);

  const finalTotal = totalPrice + shippingCost;
  const formattedFinalTotal = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(finalTotal / 100);

  if (!loading && !me) {
    return null; // Redirecting
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="font-serif text-2xl">Your cart is empty</h2>
          <Link href="/products">
            <Button data-testid="button-continue-shopping">Continue Shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 lg:py-12">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <Link href="/products">
          <Button variant="ghost" className="mb-8" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
        </Link>

        <h1 className="font-serif text-3xl lg:text-4xl font-light mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <fieldset disabled={isProcessing} aria-busy={isProcessing} className={`space-y-6 ${isProcessing ? "opacity-60 pointer-events-none" : ""}`}>
                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">Contact Information</h2>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="customerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-name" placeholder="John Doe" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              data-testid="input-email"
                              placeholder="john@example.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customerPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              data-testid="input-phone"
                              placeholder="+62 812 3456 7890"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">Shipping Address</h2>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="shippingAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-address"
                              placeholder="123 Main Street"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="shippingCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-city" placeholder="Jakarta" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shippingPostalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postal Code</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-postal" placeholder="12345" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="shippingCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-country" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">Payment Method</h2>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border rounded-md">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">Simulated Payment</p>
                        <p className="text-sm text-muted-foreground">
                          This is a demo - no actual payment will be processed
                        </p>
                      </div>
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </Card>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isProcessing}
                    data-testid="button-place-order"
                  >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isProcessing ? "Processing..." : "Place Order"}
                  </Button>
                </fieldset>
              </form>
            </Form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-20">
              <h2 className="font-serif text-xl mb-4">Order Summary</h2>
              <div className="space-y-4">
                {items.map((item) => {
                  const itemKey = `${item.product.id}-${item.size || "default"}`;
                  const formattedPrice = new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                  }).format((item.product.price * item.quantity) / 100);

                  return (
                    <div key={itemKey} className="flex gap-3">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-accent">
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.product.name}</p>
                        {item.size && (
                          <p className="text-xs text-muted-foreground">Size: {item.size}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        <p className="text-sm font-medium mt-1">{formattedPrice}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formattedTotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>{shippingCost === 0 ? "FREE" : formattedShipping}</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between font-serif text-lg font-semibold">
                <span>Total</span>
                <span data-testid="text-order-total">{formattedFinalTotal}</span>
              </div>

              {items.some((item) => item.product.isPreOrder) && (
                <Badge variant="secondary" className="mt-4 w-full justify-center">
                  Contains Pre-Order Items
                </Badge>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
