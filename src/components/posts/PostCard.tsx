"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MoreHorizontal, Pencil, Trash2, Calendar, ImageIcon, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Post } from "@/lib/content/hooks/usePosts";
import type { Brand } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG = {
  draft:     { label: "Rascunho",  className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendado",  className: "bg-yellow-500/15 text-yellow-500" },
  published: { label: "Publicado", className: "bg-green-500/15 text-green-500" },
  failed:    { label: "Falhado",   className: "bg-red-500/15 text-red-500" },
} as const;

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  twitter: "Twitter / X",
};

interface PostCardProps {
  post: Post;
  brand: Brand | null;
  onEdit: (post: Post) => void;
  onDelete: (post: Post) => void;
  onRefetch: () => void;
}

export function PostCard({ post, onEdit, onDelete, onRefetch }: PostCardProps) {
  const [publishing, setPublishing] = useState(false);
  const status = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft;
  const canPublish = post.status !== "published";

  async function handlePublishNow() {
    setPublishing(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("posts")
        .update({ status: "published", scheduled_at: new Date().toISOString() })
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post publicado!");
      onRefetch();
    } catch (err) {
      toast.error("Erro ao publicar", { description: err instanceof Error ? err.message : "Erro desconhecido" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card className="group border-border bg-card transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className={status.className}>{status.label}</Badge>
            <span className="text-xs text-muted-foreground">{PLATFORM_LABEL[post.platform ?? ""] ?? post.platform}</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              <DropdownMenuItem onClick={() => onEdit(post)} className="cursor-pointer text-popover-foreground focus:bg-muted">
                <Pencil className="mr-2 h-4 w-4" />Editar
              </DropdownMenuItem>
              {canPublish && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem onClick={handlePublishNow} className="cursor-pointer text-green-500 focus:text-green-500" disabled={publishing}>
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Publicar agora
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={() => onDelete(post)} className="cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="mt-3 line-clamp-3 text-sm text-foreground">
          {post.content ?? <span className="italic text-muted-foreground">Sem conteúdo</span>}
        </p>

        {post.scheduled_at && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {format(new Date(post.scheduled_at), "dd/MM/yyyy", { locale: ptBR })}
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground/60">
          Criado em {format(new Date(post.created_at), "dd/MM/yyyy", { locale: ptBR })}
        </p>
      </CardContent>
    </Card>
  );
}
