"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { postSchema, type PostFormData } from "@/lib/content/validations/post";
import type { Post } from "@/lib/content/hooks/usePosts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  postiz_integration_id: string | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
  bluesky: "Bluesky",
};

const STATUSES = [
  { value: "draft", label: "Rascunho" },
  { value: "scheduled", label: "Agendado" },
  { value: "published", label: "Publicado" },
] as const;

interface PostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post?: Post | null;
  brandId: string;
  onSuccess: () => void;
}

export function PostDialog({ open, onOpenChange, post, brandId, onSuccess }: PostDialogProps) {
  const isEditing = !!post;
  const [submitting, setSubmitting] = useState(false);
  const [channels, setChannels] = useState<SocialAccount[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  const supabase = createClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: { content: "", social_account_id: "", status: "draft", scheduled_at: null },
  });

  const statusValue = watch("status");

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    const { data } = await supabase
      .from("social_accounts")
      .select("id, platform, account_name, postiz_integration_id")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .not("postiz_integration_id", "is", null);
    setChannels((data as SocialAccount[]) ?? []);
    setLoadingChannels(false);
  }, [brandId, supabase]);

  useEffect(() => {
    if (open) fetchChannels();
  }, [open, fetchChannels]);

  useEffect(() => {
    if (open && post) {
      reset({
        content: post.content ?? "",
        social_account_id: (post as Post & { social_account_id?: string }).social_account_id ?? "",
        status: post.status === "failed" ? "draft" : (post.status as PostFormData["status"]),
        scheduled_at: post.scheduled_at,
      });
    } else if (open && !post) {
      reset({ content: "", social_account_id: "", status: "draft", scheduled_at: null });
    }
  }, [open, post, reset]);

  async function onSubmit(data: PostFormData) {
    const channel = channels.find((c) => c.id === data.social_account_id);
    setSubmitting(true);
    try {
      if (isEditing && post) {
        const { error } = await supabase
          .from("posts")
          .update({
            content: data.content,
            platform: channel?.platform ?? null,
            social_account_id: data.social_account_id,
            status: data.status,
            scheduled_at: data.scheduled_at ?? null,
          })
          .eq("id", post.id);
        if (error) throw error;
        toast.success("Post atualizado!");
      } else {
        const { error } = await supabase.from("posts").insert({
          brand_id: brandId,
          content: data.content,
          platform: channel?.platform ?? null,
          social_account_id: data.social_account_id,
          status: data.status,
          scheduled_at: data.scheduled_at ?? null,
          media_urls: [],
        });
        if (error) throw error;
        toast.success("Post criado!");
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao salvar post: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Post" : "Novo Post"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="content">Conteúdo</Label>
            <Textarea id="content" rows={5} placeholder="Escreva o conteúdo do post..." {...register("content")} />
            {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              {loadingChannels ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
                </div>
              ) : channels.length === 0 ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
                  <Share2 className="h-3 w-3" />
                  <Link href="/canais" className="underline hover:text-foreground" onClick={() => onOpenChange(false)}>
                    Conectar canal
                  </Link>
                </div>
              ) : (
                <Select
                  defaultValue={(post as Post & { social_account_id?: string })?.social_account_id ?? ""}
                  onValueChange={(v) => setValue("social_account_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.account_name ?? PLATFORM_LABEL[c.platform] ?? c.platform}
                        <span className="ml-1 text-muted-foreground">
                          · {PLATFORM_LABEL[c.platform] ?? c.platform}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.social_account_id && (
                <p className="text-xs text-destructive">{errors.social_account_id.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select defaultValue="draft" onValueChange={(v) => setValue("status", v as PostFormData["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {statusValue === "scheduled" && (
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_at">Data de agendamento</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                onChange={(e) => setValue("scheduled_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                defaultValue={post?.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : ""}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={submitting || channels.length === 0}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
