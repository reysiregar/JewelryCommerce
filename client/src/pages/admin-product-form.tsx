import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type Product } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

const FormSchema = insertProductSchema.extend({
  priceDisplay: z
    .string()
    .transform((v) => v.replace(/[^0-9]/g, ""))
    .refine((v) => v.length > 0, { message: "Price is required" }),
}).omit({ price: true });

type FormValues = z.infer<typeof FormSchema> & { price?: number };

export default function AdminProductForm() {
  const { me, loading } = useAuth();
  const isNew = !!useRoute("/admin/products/new")[0];
  const [, params] = useRoute("/admin/products/:id/edit");
  const productId = params?.id;

  const { data: existing } = useQuery<Product>({
    queryKey: productId ? ["/api/products", productId] : ["/api/products", null],
    enabled: !!productId,
  });

  const defaultValues = useMemo(() => {
    if (!existing) return {
      name: "",
      description: "",
      category: "rings",
      imageUrl: "",
      images: [],
      material: "",
      isPreOrder: false,
      inStock: true,
      sizes: null,
      priceDisplay: "",
    } as any;
    return {
      name: existing.name,
      description: existing.description,
      category: existing.category,
      imageUrl: existing.imageUrl,
      images: existing.images || [],
      material: existing.material,
      isPreOrder: existing.isPreOrder,
      inStock: existing.inStock,
      sizes: existing.sizes,
      priceDisplay: String(Math.round((existing.price || 0) / 100)),
    } as any;
  }, [existing]);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(FormSchema as any),
    defaultValues,
    values: defaultValues,
  });

  useEffect(() => {
    document.title = isNew ? "Add New Product" : "Edit Product";
  }, [isNew]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const price = parseInt(values.priceDisplay.replace(/[^0-9]/g, ""), 10) * 100;
      const payload: any = {
        ...values,
        price,
      };
      delete payload.priceDisplay;
      if (typeof payload.images === "string") {
        payload.images = payload.images.split(",").map((s: string) => s.trim()).filter(Boolean);
      }
      if (typeof payload.sizes === "string") {
        const list = payload.sizes.split(",").map((s: string) => s.trim()).filter(Boolean);
        payload.sizes = list.length ? list : null;
      }
      const res = await fetch(isNew ? "/api/products" : `/api/products/${productId}` , {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Failed to save product");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Product saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setLocation("/admin");
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  if (loading) return <div className="container mx-auto p-6">Loading…</div>;
  if (!me || me.role !== "admin") return <div className="container mx-auto p-6">Unauthorized</div>;

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl lg:text-4xl font-light">{isNew ? "Add New Product" : "Edit Product"}</h1>
        <Link href="/admin"><Button variant="outline">Back to Dashboard</Button></Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Product Name</Label>
            <Input id="name" placeholder="e.g. Aurora Twist Bracelet" {...register("name")} />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={watch("category")} onValueChange={(v) => setValue("category", v as any)}>
              <SelectTrigger id="category"><SelectValue placeholder="Select Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rings">Rings</SelectItem>
                <SelectItem value="necklaces">Necklaces</SelectItem>
                <SelectItem value="bracelets">Bracelets</SelectItem>
                <SelectItem value="earrings">Earrings</SelectItem>
              </SelectContent>
            </Select>
            {errors.category && <p className="text-sm text-red-500 mt-1">{errors.category.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="priceDisplay">Selling Price (IDR)</Label>
            <Input id="priceDisplay" placeholder="e.g. 1500000" {...register("priceDisplay")} />
            {errors as any && (errors as any).priceDisplay && <p className="text-sm text-red-500 mt-1">{(errors as any).priceDisplay.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="material">Material</Label>
            <Input id="material" placeholder="e.g. Sterling Silver" {...register("material")} />
            {errors.material && <p className="text-sm text-red-500 mt-1">{errors.material.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input id="imageUrl" placeholder="/assets/image.png" {...register("imageUrl")} />
            {errors.imageUrl && <p className="text-sm text-red-500 mt-1">{errors.imageUrl.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="images">Gallery Images (comma separated)</Label>
            <Input id="images" placeholder="/img1.png, /img2.png" {...register("images" as any)} />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="description">Description</Label>
            <textarea id="description" className="w-full border rounded-md bg-background p-2 min-h-[120px]" {...register("description")} />
            {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description.message as any}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sizes">Sizes (comma separated or empty)</Label>
              <Input id="sizes" placeholder="S,M,L or 5,6,7" {...register("sizes" as any)} />
            </div>
            <div>
              <Label htmlFor="stock">Stock</Label>
              <Select value={watch("inStock") ? "in" : "out"} onValueChange={(v) => setValue("inStock", v === "in") }>
                <SelectTrigger id="stock"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">In Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pre">Pre-Order</Label>
              <Select value={watch("isPreOrder") ? "yes" : "no"} onValueChange={(v) => setValue("isPreOrder", v === "yes") }>
                <SelectTrigger id="pre"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 flex gap-2">
            <Button type="submit" disabled={isSubmitting}>{isNew ? "Create Product" : "Save Changes"}</Button>
            <Link href="/admin"><Button type="button" variant="outline">Cancel</Button></Link>
          </div>
        </div>
      </form>
    </div>
  );
}
