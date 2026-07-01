"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Brand } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface BrandCardProps {
  brand: Brand;
  onEdit: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
}

export function BrandCard({ brand, onEdit, onDelete }: BrandCardProps) {
  return (
    <Card className="group border-border bg-card transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: brand.primary_color ?? "#6C5CE7" }}
          >
            {brand.logo_url ? (
              <Image
                src={brand.logo_url}
                alt={brand.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              brand.name[0].toUpperCase()
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              <DropdownMenuItem
                onClick={() => onEdit(brand)}
                className="cursor-pointer text-popover-foreground focus:bg-muted"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(brand)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4">
          <p className="font-semibold text-foreground">{brand.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">/{brand.slug}</p>
        </div>

        {brand.primary_color && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: brand.primary_color }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {brand.primary_color}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
