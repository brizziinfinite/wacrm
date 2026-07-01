"use client";

import { useState } from "react";
import { Plus, Palette } from "lucide-react";
import { useBrands } from "@/lib/content/hooks/useBrands";
import { BrandCard } from "@/components/brands/BrandCard";
import { BrandDialog } from "@/components/brands/BrandDialog";
import { DeleteBrandDialog } from "@/components/brands/DeleteBrandDialog";
import { Button } from "@/components/ui/button";
import type { Brand } from "@/store/useAppStore";

export default function BrandsPage() {
  const { brands, loading, refetch } = useBrands();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);

  function handleEdit(brand: Brand) {
    setEditingBrand(brand);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditingBrand(null);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Brands</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gerencie as marcas que você administra.</p>
          </div>
          <Button onClick={() => { setEditingBrand(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Brand
          </Button>
        </div>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && brands.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} onEdit={handleEdit} onDelete={setDeletingBrand} />
            ))}
          </div>
        )}

        {!loading && brands.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Palette className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">Nenhuma brand ainda</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie sua primeira marca para começar a gerenciar conteúdo.
            </p>
            <Button className="mt-6 gap-2" onClick={() => { setEditingBrand(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Criar Brand
            </Button>
          </div>
        )}
      </div>

      <BrandDialog open={dialogOpen} onOpenChange={handleDialogClose} brand={editingBrand} onSuccess={refetch} />
      <DeleteBrandDialog
        open={!!deletingBrand}
        onOpenChange={(open) => !open && setDeletingBrand(null)}
        brand={deletingBrand}
        onSuccess={refetch}
      />
    </>
  );
}
