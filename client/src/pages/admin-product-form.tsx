import { useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { Upload, X, Loader2 } from "lucide-react";

const FormSchema = insertProductSchema.extend({
  priceDisplay: z
    .string()
    .transform((v) => v.replace(/[^0-9]/g, ""))
    .refine((v) => v.length > 0, { message: "Price is required" })
    .refine((v) => parseInt(v, 10) > 0, { message: "Price must be greater than 0" }),
  imageUrl: z.string().min(1, "Product image is required"),
  sizes: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
}).omit({ price: true });

type FormValues = z.infer<typeof FormSchema> & { price?: number };

export default function AdminProductForm() {
  const { t } = useTranslation();
  const { me, loading } = useAuth();
  const isNew = !!useRoute("/admin/products/new")[0];
  const [, params] = useRoute("/admin/products/:id/edit");
  const productId = params?.id;
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);

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
    document.title = isNew ? t('admin.addNewProductTitle') : t('admin.editProductTitle');
  }, [isNew, t]);

  useEffect(() => {
    if (existing?.imageUrl) {
      setImagePreview(existing.imageUrl);
    }
    if (existing?.images && Array.isArray(existing.images)) {
      setGalleryImages(existing.images);
      setValue("images", existing.images as any);
    }
  }, [existing, setValue]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          
          // Target square dimensions for product images
          const targetSize = 600;
          canvas.width = targetSize;
          canvas.height = targetSize;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Calculate dimensions for center crop
          const imgWidth = img.width;
          const imgHeight = img.height;
          const imgAspect = imgWidth / imgHeight;
          
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = imgWidth;
          let sourceHeight = imgHeight;
          
          // Auto-crop to square from center
          if (imgAspect > 1) {
            // Landscape: crop sides
            sourceWidth = imgHeight;
            sourceX = (imgWidth - imgHeight) / 2;
          } else if (imgAspect < 1) {
            // Portrait: crop top/bottom
            sourceHeight = imgWidth;
            sourceY = (imgHeight - imgWidth) / 2;
          }
          
          // Fill with white background first
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetSize, targetSize);
          
          // Draw cropped image centered on canvas
          ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, targetSize, targetSize
          );
          
          // Start with aggressive compression
          let quality = 0.7;
          let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          let sizeInBytes = (compressedBase64.length * 3) / 4;
          
          // Keep reducing quality until under 500KB
          const maxSizeBytes = 500 * 1024;
          while (sizeInBytes > maxSizeBytes && quality > 0.3) {
            quality -= 0.05;
            compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            sizeInBytes = (compressedBase64.length * 3) / 4;
          }
          
          // If still too large, reject
          if (sizeInBytes > 1024 * 1024) {
            reject(new Error('Image is too large even after compression. Please use a smaller image.'));
            return;
          }
          
          resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const processImageFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Please select an image file', variant: 'destructive' });
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Image size must be less than 10MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    toast({ title: 'Processing...', description: 'Auto-cropping and optimizing your image' });
    try {
      const compressedBase64 = await compressImage(file);
      setValue('imageUrl', compressedBase64, { shouldValidate: true });
      setImagePreview(compressedBase64);
      toast({ title: 'Success', description: 'Image auto-cropped to square and optimized' });
      setUploading(false);
    } catch (error: any) {
      console.error('Image processing error:', error);
      toast({ 
        title: 'Upload Failed', 
        description: error.message || 'Failed to process image. Please try again.', 
        variant: 'destructive' 
      });
      setUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const removeImage = () => {
    setValue('imageUrl', '');
    setImagePreview('');
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Limit total gallery images to prevent large payloads
    const maxGalleryImages = 5;
    if (galleryImages.length >= maxGalleryImages) {
      toast({ title: 'Error', description: `Maximum ${maxGalleryImages} gallery images allowed`, variant: 'destructive' });
      return;
    }
    
    const remainingSlots = maxGalleryImages - galleryImages.length;
    const filesToUpload = files.slice(0, remainingSlots);
    
    setUploadingGallery(true);
    try {
      const newImages: string[] = [];
      for (const file of filesToUpload) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Error', description: `${file.name} is not an image`, variant: 'destructive' });
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: 'Error', description: `${file.name} is too large (max 10MB)`, variant: 'destructive' });
          continue;
        }
        
        const compressed = await compressImage(file);
        newImages.push(compressed);
      }
      
      const updatedGallery = [...galleryImages, ...newImages];
      setGalleryImages(updatedGallery);
      setValue("images", updatedGallery as any, { shouldValidate: true });
      toast({ title: 'Success', description: `${newImages.length} image(s) added to gallery` });
      
      if (files.length > remainingSlots) {
        toast({ title: 'Notice', description: `Only ${remainingSlots} images uploaded (max ${maxGalleryImages} total)`, variant: 'default' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to upload gallery images', variant: 'destructive' });
    } finally {
      setUploadingGallery(false);
      e.target.value = ''; // Reset input
    }
  };

  const removeGalleryImage = (index: number) => {
    const updated = galleryImages.filter((_, i) => i !== index);
    setGalleryImages(updated);
    setValue("images", updated as any, { shouldValidate: true });
  };

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
      
      // Handle images array - ensure it's always an array
      if (typeof payload.images === "string") {
        const parsed = payload.images.split(",").map((s: string) => s.trim()).filter(Boolean);
        payload.images = parsed.length > 0 ? parsed : [];
      } else if (!payload.images || !Array.isArray(payload.images)) {
        payload.images = [];
      }
      
      // Handle sizes array
      if (typeof payload.sizes === "string") {
        const list = payload.sizes.split(",").map((s: string) => s.trim()).filter(Boolean);
        payload.sizes = list.length ? list : null;
      } else if (!payload.sizes || payload.sizes.length === 0) {
        payload.sizes = null;
      }
      const res = await fetch(isNew ? "/api/products" : `/api/products/${productId}` , {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || t('admin.saveFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('admin.productSaved') });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setLocation("/admin");
    },
    onError: (e: any) => {
      toast({ title: t('admin.saveFailed'), description: e.message, variant: "destructive" });
    }
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  if (loading) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
            <Skeleton className="h-20 rounded" />
          </div>
        </div>
      </div>
    );
  }
  if (!me || me.role !== "admin") return <div className="container mx-auto p-6">{t('admin.unauthorized')}</div>;

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl lg:text-4xl font-light">{isNew ? t('admin.addNewProductTitle') : t('admin.editProductTitle')}</h1>
        <Link href="/admin"><Button variant="outline">{t('admin.backToDashboard')}</Button></Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="border rounded-lg p-6 bg-card">
          <Label htmlFor="imageUpload" className="text-lg font-semibold mb-4 block">{t('admin.productImage')}</Label>
          <div className="space-y-4">
            {imagePreview ? (
              <div className="relative w-full aspect-square max-w-md mx-auto border rounded-lg overflow-hidden bg-accent">
                <img src={imagePreview} alt="Product preview" className="w-full h-full object-contain" />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full"
                  onClick={removeImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div 
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-base font-medium mb-2">{t('admin.uploadImageText')}</p>
                <p className="text-sm text-muted-foreground mb-4">Drag and drop your image here, or</p>
              </div>
            )}
            <div className="flex items-center justify-center">
              <label htmlFor="imageUpload" className="relative">
                <Button 
                  type="button" 
                  variant="default" 
                  className="cursor-pointer"
                  disabled={uploading}
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? t('common.uploading') : 'Choose File'}
                  </span>
                </Button>
                <Input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
            {uploading && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t('common.uploading')}</p>
              </div>
            )}
            {errors.imageUrl && <p className="text-sm text-red-500 text-center">{errors.imageUrl.message as any}</p>}
          </div>
        </div>

        {/* Rest of the Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">{t('admin.productNameField')}</Label>
            <Input id="name" placeholder={t('admin.productNamePlaceholder')} {...register("name")} />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="category">{t('admin.categoryField')}</Label>
            <Select value={watch("category")} onValueChange={(v) => setValue("category", v as any)}>
              <SelectTrigger id="category"><SelectValue placeholder={t('admin.selectCategory')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rings">{t('products.rings')}</SelectItem>
                <SelectItem value="necklaces">{t('products.necklaces')}</SelectItem>
                <SelectItem value="bracelets">{t('products.bracelets')}</SelectItem>
                <SelectItem value="earrings">{t('products.earrings')}</SelectItem>
              </SelectContent>
            </Select>
            {errors.category && <p className="text-sm text-red-500 mt-1">{errors.category.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="priceDisplay">{t('admin.priceField')}</Label>
            <Input id="priceDisplay" placeholder={t('admin.pricePlaceholder')} {...register("priceDisplay")} />
            {errors as any && (errors as any).priceDisplay && <p className="text-sm text-red-500 mt-1">{(errors as any).priceDisplay.message as any}</p>}
          </div>
          <div>
            <Label htmlFor="material">{t('admin.materialField')}</Label>
            <Input id="material" placeholder={t('admin.materialPlaceholder')} {...register("material")} />
            {errors.material && <p className="text-sm text-red-500 mt-1">{errors.material.message as any}</p>}
          </div>
          
          {/* Gallery Images Upload Section */}
          <div>
            <Label className="text-base font-semibold mb-2 block">{t('admin.galleryImagesField')}</Label>
            <p className="text-xs text-muted-foreground mb-3">{t('admin.galleryImagesNote')}</p>
            
            {/* Gallery Preview Grid */}
            {galleryImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {galleryImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square border rounded-lg overflow-hidden bg-accent group">
                    <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeGalleryImage(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Upload Button */}
            <div className="flex items-center justify-start">
              <label htmlFor="galleryUpload" className="relative">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="cursor-pointer"
                  disabled={uploadingGallery}
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingGallery ? 'Uploading...' : 'Add Gallery Images'}
                  </span>
                </Button>
                <Input
                  id="galleryUpload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  disabled={uploadingGallery}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              {galleryImages.length > 0 && (
                <span className="ml-3 text-xs text-muted-foreground">
                  {galleryImages.length} image(s) in gallery
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="description">{t('admin.descriptionField')}</Label>
            <textarea id="description" className="w-full border rounded-md bg-background p-2 min-h-[120px]" {...register("description")} />
            {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description.message as any}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sizes">{t('admin.sizesField')}</Label>
              <Input id="sizes" placeholder={t('admin.sizesPlaceholder')} {...register("sizes" as any)} />
            </div>
            <div>
              <Label htmlFor="stock">{t('admin.stockField')}</Label>
              <Select value={watch("inStock") ? "in" : "out"} onValueChange={(v) => setValue("inStock", v === "in") }>
                <SelectTrigger id="stock"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">{t('admin.inStock')}</SelectItem>
                  <SelectItem value="out">{t('admin.outOfStock')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pre">{t('admin.preOrderField')}</Label>
              <Select value={watch("isPreOrder") ? "yes" : "no"} onValueChange={(v) => setValue("isPreOrder", v === "yes") }>
                <SelectTrigger id="pre"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t('admin.no')}</SelectItem>
                  <SelectItem value="yes">{t('admin.yes')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 flex gap-2">
            <Button type="submit" disabled={isSubmitting || uploading || uploadingGallery}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? (isNew ? t('admin.creatingProduct') || 'Creating...' : t('admin.savingChanges') || 'Saving...') : (isNew ? t('admin.createProduct') : t('admin.saveChanges'))}
            </Button>
            <Link href="/admin"><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
          </div>
        </div>
        </div>
      </form>
    </div>
  );
}
