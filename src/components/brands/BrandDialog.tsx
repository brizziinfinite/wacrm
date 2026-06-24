"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { brandSchema, type BrandFormData } from "@/lib/content/validations/brand";
import type { Brand } from "@/store/useAppStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";

interface BrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand | null;
  onSuccess: () => void;
}

export function BrandDialog({ open, onOpenChange, brand, onSuccess }: BrandDialogProps) {
  const isEditing = !!brand;
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: "", slug: "", primary_color: "#6C5CE7" },
  });

  const nameValue = watch("name");

  useEffect(() => {
    if (isEditing) return;
    const slug = nameValue
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    setValue("slug", slug, { shouldValidate: false });
  }, [nameValue, isEditing, setValue]);

  useEffect(() => {
    if (open && brand) {
      reset({ name: brand.name, slug: brand.slug, primary_color: brand.primary_color ?? "#6C5CE7" });
      setLogoPreview(brand.logo_url ?? null);
      setLogoFile(null);
    } else if (open && !brand) {
      reset({ name: "", slug: "", primary_color: "#6C5CE7" });
      setLogoPreview(null);
      setLogoFile(null);
    }
  }, [open, brand, reset]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function onSubmit(data: BrandFormData) {
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      let logo_url = brand?.logo_url ?? null;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        logo_url = urlData.publicUrl;
      } else if (!logoPreview && brand?.logo_url) {
        logo_url = null;
      }

      if (isEditing && brand) {
        const { error } = await supabase
          .from("brands")
          .update({ name: data.name, slug: data.slug, primary_color: data.primary_color ?? null, logo_url })
          .eq("id", brand.id);
        if (error) throw error;
        toast.success("Brand atualizada com sucesso!");
      } else {
        const { error } = await supabase.from("brands").insert({
          name: data.name,
          slug: data.slug,
          primary_color: data.primary_color ?? null,
          logo_url,
        });
        if (error) {
          if (error.code === "23505") {
            toast.error("Já existe uma brand com este slug.");
            return;
          }
          throw error;
        }
        toast.success("Brand criada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Ocorreu um erro. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Brand" : "Nova Brand"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label>Logo</Label>
            {logoPreview ? (
              <div className="relative h-20 w-20">
                <Image src={logoPreview} alt="Logo preview" fill className="rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="sr-only" onChange={handleLogoChange} />
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" placeholder="Ex: Minha Marca" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" placeholder="minha-marca" {...register("slug")} />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="primary_color">Cor Primária</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primary_color"
                {...register("primary_color")}
                className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              />
              <Input placeholder="#6C5CE7" {...register("primary_color")} className="font-mono" />
            </div>
            {errors.primary_color && <p className="text-xs text-destructive">{errors.primary_color.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Brand"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
