"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter / X" },
] as const;

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

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: { content: "", platform: "instagram", status: "draft", scheduled_at: null },
  });

  const statusValue = watch("status");

  useEffect(() => {
    if (open && post) {
      reset({
        content: post.content ?? "",
        platform: (post.platform as PostFormData["platform"]) ?? "instagram",
        status: post.status === "failed" ? "draft" : (post.status as PostFormData["status"]),
        scheduled_at: post.scheduled_at,
      });
    } else if (open && !post) {
      reset({ content: "", platform: "instagram", status: "draft", scheduled_at: null });
    }
  }, [open, post, reset]);

  async function onSubmit(data: PostFormData) {
    setSubmitting(true);
    try {
      const supabase = createClient();
      if (isEditing && post) {
        const { error } = await supabase
          .from("posts")
          .update({ content: data.content, platform: data.platform, status: data.status, scheduled_at: data.scheduled_at ?? null })
          .eq("id", post.id);
        if (error) throw error;
        toast.success("Post atualizado!");
      } else {
        const { error } = await supabase.from("posts").insert({
          brand_id: brandId,
          content: data.content,
          platform: data.platform,
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
              <Label>Plataforma</Label>
              <Select defaultValue="instagram" onValueChange={(v) => setValue("platform", v as PostFormData["platform"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Post"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
