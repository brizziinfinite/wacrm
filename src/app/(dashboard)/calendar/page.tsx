"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useAppStore } from "@/store/useAppStore";
import { usePosts, type Post, type PostStatus } from "@/lib/content/hooks/usePosts";
import { PostDialog } from "@/components/posts/PostDialog";
import { getCalendarDays, groupPostsByDay, getPostsForDay, isSameMonth } from "@/lib/content/calendar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_COLOR: Record<PostStatus, string> = {
  draft: "bg-zinc-400",
  scheduled: "bg-blue-500",
  published: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  published: "Publicado",
  failed: "Falhado",
};

function DraggablePostChip({ post, onClick }: { post: Post; onClick: (post: Post) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, data: { post } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }} {...attributes}>
      <button
        {...listeners}
        onClick={() => { if (!transform) onClick(post); }}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs transition-colors hover:opacity-80 hover:bg-muted cursor-grab active:cursor-grabbing"
        title={post.content ?? ""}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[post.status]}`} />
        <span className="truncate text-foreground">
          {(post.content ?? "").slice(0, 22)}{(post.content ?? "").length > 22 ? "…" : ""}
        </span>
      </button>
    </div>
  );
}

function DroppableDay({ day, dayPosts, isCurrentMonth, isCurrentDay, idx, onPostClick }: {
  day: Date; dayPosts: Post[]; isCurrentMonth: boolean; isCurrentDay: boolean; idx: number; onPostClick: (post: Post) => void;
}) {
  const dateKey = day.toISOString().slice(0, 10);
  const { isOver, setNodeRef } = useDroppable({ id: dateKey });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] border-r border-b border-border p-1.5 transition-colors ${idx % 7 === 6 ? "border-r-0" : ""} ${!isCurrentMonth ? "bg-muted/20" : "bg-background"} ${isOver ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}
    >
      <div className="mb-1 flex items-center justify-end">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isCurrentDay ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"}`}>
          {format(day, "d")}
        </span>
      </div>
      <div className="space-y-0.5">
        {dayPosts.slice(0, 3).map((post) => <DraggablePostChip key={post.id} post={post} onClick={onPostClick} />)}
        {dayPosts.length > 3 && <p className="px-1 text-xs text-muted-foreground">+{dayPosts.length - 3} mais</p>}
      </div>
    </div>
  );
}

function DragOverlayChip({ post }: { post: Post }) {
  return (
    <div className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs shadow-lg">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[post.status]}`} />
      <span className="truncate max-w-[120px] text-foreground">{(post.content ?? "").slice(0, 22)}{(post.content ?? "").length > 22 ? "…" : ""}</span>
    </div>
  );
}

export default function CalendarPage() {
  const activeBrand = useAppStore((s) => s.activeBrand);
  const { posts, refetch } = usePosts(activeBrand?.id ?? null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingPost, setDraggingPost] = useState<Post | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);
  const postsByDay = useMemo(() => groupPostsByDay(posts), [posts]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  function handlePostClick(post: Post) { setEditingPost(post); setDialogOpen(true); }
  function handleDialogClose(open: boolean) { setDialogOpen(open); if (!open) setEditingPost(null); }
  function handleDragStart(event: DragStartEvent) { setDraggingPost(event.active.data.current?.post as Post ?? null); }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingPost(null);
    const { active, over } = event;
    if (!over) return;
    const post = active.data.current?.post as Post;
    const newDateKey = over.id as string;
    if (!post || !post.scheduled_at) return;
    const oldDateKey = post.scheduled_at.slice(0, 10);
    if (oldDateKey === newDateKey) return;
    const oldDate = new Date(post.scheduled_at);
    const [y, m, d] = newDateKey.split("-").map(Number);
    const newDate = new Date(y, m - 1, d, oldDate.getHours(), oldDate.getMinutes(), 0);
    const supabase = createClient();
    const { error } = await supabase.from("posts").update({ scheduled_at: newDate.toISOString() }).eq("id", post.id);
    if (error) { toast.error("Erro ao reagendar post", { description: error.message }); return; }
    toast.success("Post reagendado!", { description: `Movido para ${format(newDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` });
    refetch();
  }, [refetch]);

  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-4 rounded-full bg-muted p-4"><Palette className="h-10 w-10 text-muted-foreground" /></div>
        <h3 className="text-lg font-medium text-foreground">Nenhuma brand selecionada</h3>
        <p className="mt-1 text-sm text-muted-foreground">Selecione uma brand na barra lateral ou crie a sua primeira.</p>
        <Button render={<Link href="/brands" />} className="mt-6 gap-2">Criar Brand</Button>
      </div>
    );
  }

  const currentMonth = new Date(year, month);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendário</h1>
            <p className="mt-1 text-sm text-muted-foreground">{activeBrand.name} — arraste os posts para reagendar.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[160px] text-center font-semibold capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {(Object.entries(STATUS_COLOR) as [PostStatus, string][]).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${color}`} />{STATUS_LABEL[status]}
            </div>
          ))}
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block italic">Arraste um post para reagendar</div>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, idx) => (
                <DroppableDay
                  key={idx}
                  day={day}
                  dayPosts={getPostsForDay(postsByDay, day)}
                  isCurrentMonth={isSameMonth(day, currentMonth)}
                  isCurrentDay={isToday(day)}
                  idx={idx}
                  onPostClick={handlePostClick}
                />
              ))}
            </div>
          </div>
          <DragOverlay>{draggingPost && <DragOverlayChip post={draggingPost} />}</DragOverlay>
        </DndContext>
      </div>

      <PostDialog open={dialogOpen} onOpenChange={handleDialogClose} post={editingPost} brandId={activeBrand.id} onSuccess={refetch} />
    </>
  );
}
