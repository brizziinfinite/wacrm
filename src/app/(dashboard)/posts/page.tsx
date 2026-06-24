"use client";

import { useState } from "react";
import { Plus, FileText, Palette } from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { usePosts, type Post, type PostStatus } from "@/lib/content/hooks/usePosts";
import { PostCard } from "@/components/posts/PostCard";
import { PostDialog } from "@/components/posts/PostDialog";
import { DeletePostDialog } from "@/components/posts/DeletePostDialog";
import { Button } from "@/components/ui/button";

const STATUS_FILTERS: { label: string; value: PostStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Rascunho", value: "draft" },
  { label: "Agendados", value: "scheduled" },
  { label: "Publicados", value: "published" },
  { label: "Falhados", value: "failed" },
];

export default function PostsPage() {
  const activeBrand = useAppStore((s) => s.activeBrand);
  const { posts, loading, refetch } = usePosts(activeBrand?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [deletingPost, setDeletingPost] = useState<Post | null>(null);
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");

  const filtered = statusFilter === "all" ? posts : posts.filter((p) => p.status === statusFilter);

  function handleEdit(post: Post) {
    setEditingPost(post);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditingPost(null);
  }

  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Palette className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Nenhuma brand selecionada</h3>
        <p className="mt-1 text-sm text-muted-foreground">Selecione uma brand na barra lateral ou crie a sua primeira.</p>
        <Button render={<Link href="/brands" />} className="mt-6 gap-2">
          <Plus className="h-4 w-4" />Criar Brand
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Posts</h1>
            <p className="mt-1 text-sm text-muted-foreground">{activeBrand.name} — gerencie o conteúdo desta brand.</p>
          </div>
          <Button onClick={() => { setEditingPost(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />Novo Post
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <PostCard key={post.id} post={post} brand={activeBrand} onEdit={handleEdit} onDelete={setDeletingPost} onRefetch={refetch} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">
              {statusFilter === "all" ? "Nenhum post ainda" : `Nenhum post com status "${statusFilter}"`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter === "all" ? "Crie seu primeiro post para começar." : "Tente outro filtro."}
            </p>
            {statusFilter === "all" && (
              <Button className="mt-6 gap-2" onClick={() => { setEditingPost(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" />Criar Post
              </Button>
            )}
          </div>
        )}
      </div>

      <PostDialog open={dialogOpen} onOpenChange={handleDialogClose} post={editingPost} brandId={activeBrand.id} onSuccess={refetch} />
      <DeletePostDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)} post={deletingPost} onSuccess={refetch} />
    </>
  );
}
