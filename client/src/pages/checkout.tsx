import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertOrderSchema, type InsertOrder } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CreditCard, Shield, Loader2, Truck, Zap, Store, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

export default function Checkout() {
  const { t } = useTranslation();
  const { items, totalPrice, clearCart } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const { me, loading } = useAuth();

  useEffect(() => {
    if (!loading && !me) {
      toast({
        title: t("cart.loginRequired"),
        description: t("cart.loginToCheckout"),
        variant: "destructive",
      });
      setLocation("/login?returnTo=%2Fcheckout");
    }
  }, [loading, me, setLocation, toast]);

  useEffect(() => {
    if (!isProcessing) return;

    const message = t("checkout.processingWarning", { defaultValue: "Your order is processing. Are you sure you want to leave this page?" });

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

  type CheckoutFormData = z.infer<typeof insertOrderSchema>;

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(insertOrderSchema),
    defaultValues: {
      customerName: me?.name || "",
      customerEmail: me?.email || "",
      customerPhone: "",
      shippingAddress: "",
      shippingCity: "",
      shippingPostalCode: "",
      shippingCountry: "Indonesia",
      shippingType: "express",
      totalAmount: 0,
      status: "pending",
      isPreOrder: false,
      paymentStatus: "pending",
    },
  });

  // Auto-fill name and email when user data is available
  useEffect(() => {
    if (me) {
      form.setValue("customerName", me.name);
      form.setValue("customerEmail", me.email);
    }
  }, [me, form]);

  // Watch shippingType for real-time updates
  const selectedShippingType = form.watch("shippingType");

  // Calculate shipping cost based on type
  const calculateShippingCost = (type: string): number => {
    switch (type) {
      case "instant":
        return 25000000; // Rp 250,000
      case "express":
        return 10000000; // Rp 100,000
      case "prioritize":
        return 0;
      case "free":
        return totalPrice >= 1000000000 ? 0 : 10000000; // Free if over Rp 10,000,000
      default:
        return 10000000;
    }
  };

  const shippingCost = calculateShippingCost(selectedShippingType);
  const isFreeShippingEligible = totalPrice >= 1000000000;

  const createOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiRequest("POST", "/api/orders", payload);
    },
    onSuccess: () => {
      toast({
        title: t("checkout.orderSuccess"),
        description: t("checkout.thankYouMessage", { defaultValue: "Thank you for your purchase. You will receive a confirmation email shortly." }),
      });
      clearCart();
      setLocation("/order-success");
    },
    onError: (error: any) => {
      toast({
        title: t("checkout.orderError"),
        description: error.message || t("checkout.errorMessage", { defaultValue: "Something went wrong. Please try again." }),
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  const onSubmit = async (data: CheckoutFormData) => {
    if (items.length === 0) {
      toast({
        title: t("cart.empty"),
        description: t("checkout.addItemsMessage", { defaultValue: "Please add items to your cart before checking out." }),
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const orderPayload = {
      ...data,
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
          <h2 className="font-serif text-2xl">{t("cart.empty")}</h2>
          <Link href="/products">
            <Button data-testid="button-continue-shopping">{t("cart.continueShopping")}</Button>
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
            {t("productDetail.backToProducts")}
          </Button>
        </Link>

        <h1 className="font-serif text-3xl lg:text-4xl font-light mb-8">{t("checkout.title")}</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <fieldset disabled={isProcessing} aria-busy={isProcessing} className={`space-y-6 ${isProcessing ? "opacity-60 pointer-events-none" : ""}`}>
                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">{t("checkout.contactInfo", { defaultValue: "Contact Information" })}</h2>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="customerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("checkout.fullName")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-name" placeholder={t("checkout.fullNamePlaceholder", { defaultValue: "Enter your full name" })} />
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
                          <FormLabel>{t("checkout.email")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              data-testid="input-email"
                              placeholder={t("checkout.emailPlaceholder", { defaultValue: "john@example.com" })}
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
                          <FormLabel>{t("checkout.phone")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              data-testid="input-phone"
                              placeholder={t("checkout.phonePlaceholder", { defaultValue: "+62 812 3456 7890" })}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">{t("checkout.shippingType", { defaultValue: "Shipping Method" })}</h2>
                  <FormField
                    control={form.control}
                    name="shippingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="space-y-3"
                          >
                            {/* Instant Delivery */}
                            <div className="flex items-start space-x-3 border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
                              <RadioGroupItem value="instant" id="instant" />
                              <label htmlFor="instant" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2 mb-1">
                                  <Zap className="h-4 w-4 text-yellow-500" />
                                  <span className="font-medium">{t("checkout.shipping.instant.title", { defaultValue: "Instant Delivery" })}</span>
                                  <Badge variant="secondary" className="ml-auto">Rp 250,000</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t("checkout.shipping.instant.description", { defaultValue: "Delivered in 1-2 hours" })}
                                </p>
                              </label>
                            </div>

                            {/* Express Delivery */}
                            <div className="flex items-start space-x-3 border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
                              <RadioGroupItem value="express" id="express" />
                              <label htmlFor="express" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2 mb-1">
                                  <Truck className="h-4 w-4 text-blue-500" />
                                  <span className="font-medium">{t("checkout.shipping.express.title", { defaultValue: "Express Delivery" })}</span>
                                  <Badge variant="secondary" className="ml-auto">Rp 100,000</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t("checkout.shipping.express.description", { defaultValue: "Delivered in 1-2 days" })}
                                </p>
                              </label>
                            </div>

                            {/* Prioritize Delivery */}
                            <div className="flex items-start space-x-3 border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
                              <RadioGroupItem value="prioritize" id="prioritize" />
                              <label htmlFor="prioritize" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2 mb-1">
                                  <Store className="h-4 w-4 text-green-500" />
                                  <span className="font-medium">{t("checkout.shipping.prioritize.title", { defaultValue: "Prioritize Delivery" })}</span>
                                  <Badge variant="secondary" className="ml-auto">{t("checkout.free", { defaultValue: "FREE" })}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t("checkout.shipping.prioritize.description", { defaultValue: "Priority handling with expedited processing" })}
                                </p>
                              </label>
                            </div>

                            {/* Free Shipping */}
                            <div className={`flex items-start space-x-3 border rounded-lg p-4 transition-colors ${
                              isFreeShippingEligible 
                                ? "hover:border-primary cursor-pointer" 
                                : "opacity-50 cursor-not-allowed"
                            }`}>
                              <RadioGroupItem 
                                value="free" 
                                id="free" 
                                disabled={!isFreeShippingEligible}
                              />
                              <label 
                                htmlFor="free" 
                                className={`flex-1 ${isFreeShippingEligible ? "cursor-pointer" : "cursor-not-allowed"}`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Gift className="h-4 w-4 text-purple-500" />
                                  <span className="font-medium">{t("checkout.shipping.free.title", { defaultValue: "Premium Free Shipping" })}</span>
                                  <Badge variant="secondary" className="ml-auto">{t("checkout.free", { defaultValue: "FREE" })}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t("checkout.shipping.free.description", { defaultValue: "Orders over Rp 10,000,000 - White glove delivery with extra protection & priority service" })}
                                </p>
                                {!isFreeShippingEligible && (
                                  <p className="text-xs text-destructive mt-1">
                                    {t("checkout.shipping.free.requirement", { 
                                      defaultValue: "Minimum order of Rp 10,000,000 required" 
                                    })}
                                  </p>
                                )}
                              </label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Card>

                <Card className="p-6">
                  <h2 className="font-serif text-xl mb-4">{t("checkout.shippingAddress", { defaultValue: "Shipping Address" })}</h2>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="shippingAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("checkout.address")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-address"
                              placeholder={t("checkout.addressPlaceholder", { defaultValue: "123 Main Street" })}
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
                            <FormLabel>{t("checkout.city")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-city" placeholder={t("checkout.cityPlaceholder", { defaultValue: "Jakarta" })} />
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
                            <FormLabel>{t("checkout.zipCode")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-postal" placeholder={t("checkout.zipCodePlaceholder", { defaultValue: "12345" })} />
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
                          <FormLabel>{t("checkout.country")}</FormLabel>
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
                  <h2 className="font-serif text-xl mb-4">{t("checkout.paymentMethod")}</h2>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border rounded-md">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{t("checkout.simulatedPayment", { defaultValue: "Simulated Payment" })}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("checkout.demoPaymentNote", { defaultValue: "This is a demo - no actual payment will be processed" })}
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
                    {isProcessing ? t("checkout.processing") : t("checkout.placeOrder")}
                  </Button>
                </fieldset>
              </form>
            </Form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-20">
              <h2 className="font-serif text-xl mb-4">{t("checkout.orderSummary")}</h2>
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
                          <p className="text-xs text-muted-foreground">{t("cart.size")}: {item.size}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{t("checkout.qty", { defaultValue: "Qty" })}: {item.quantity}</p>
                        <p className="text-sm font-medium mt-1">{formattedPrice}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("cart.subtotal")}</span>
                  <span>{formattedTotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex flex-col">
                    <span>{t("checkout.shippingLabel", { defaultValue: "Shipping" })}</span>
                    {selectedShippingType && (
                      <span className="text-xs text-muted-foreground">
                        {selectedShippingType === "instant" && t("checkout.shipping.instant.title", { defaultValue: "Instant Delivery" })}
                        {selectedShippingType === "express" && t("checkout.shipping.express.title", { defaultValue: "Express Delivery" })}
                        {selectedShippingType === "prioritize" && t("checkout.shipping.prioritize.title", { defaultValue: "Prioritize Delivery" })}
                        {selectedShippingType === "free" && t("checkout.shipping.free.title", { defaultValue: "Premium Free Shipping" })}
                      </span>
                    )}
                  </div>
                  <span className={shippingCost === 0 ? "text-green-600 font-medium" : ""}>
                    {shippingCost === 0 ? t("checkout.free", { defaultValue: "FREE" }) : formattedShipping}
                  </span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between font-serif text-lg font-semibold">
                <span>{t("cart.total")}</span>
                <span data-testid="text-order-total">{formattedFinalTotal}</span>
              </div>

              {items.some((item) => item.product.isPreOrder) && (
                <Badge variant="secondary" className="mt-4 w-full justify-center">
                  {t("checkout.containsPreOrder", { defaultValue: "Contains Pre-Order Items" })}
                </Badge>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
