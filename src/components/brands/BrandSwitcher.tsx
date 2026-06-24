"use client";

import { ChevronDown, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useBrands } from "@/lib/content/hooks/useBrands";
import { useAppStore } from "@/store/useAppStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BrandSwitcher() {
  const { brands, loading } = useBrands();
  const activeBrand = useAppStore((s) => s.activeBrand);
  const setActiveBrand = useAppStore((s) => s.setActiveBrand);

  if (loading) {
    return <div className="mx-3 h-8 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60">
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: activeBrand?.primary_color ?? "#6366f1" }}
        >
          <Palette className="h-3 w-3 text-white" />
        </div>
        <span className="flex-1 truncate font-medium text-foreground">
          {activeBrand?.name ?? "Selecionar brand"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56 bg-popover text-popover-foreground ring-border">
        {brands.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            Nenhuma brand criada
          </DropdownMenuItem>
        ) : (
          brands.map((brand) => (
            <DropdownMenuItem
              key={brand.id}
              onClick={() => setActiveBrand(brand)}
              className={`gap-2 text-popover-foreground focus:bg-accent focus:text-accent-foreground ${activeBrand?.id === brand.id ? "bg-accent/50" : ""}`}
            >
              <div
                className="flex h-4 w-4 shrink-0 rounded"
                style={{ backgroundColor: brand.primary_color ?? "#6366f1" }}
              />
              <span className="truncate">{brand.name}</span>
              {activeBrand?.id === brand.id && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          render={<Link href="/brands" className="gap-2 text-popover-foreground focus:bg-accent focus:text-accent-foreground" />}
        >
          <Plus className="h-4 w-4" />
          Gerenciar brands
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
