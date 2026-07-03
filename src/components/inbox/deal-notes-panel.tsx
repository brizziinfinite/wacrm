"use client";

import { useState, useEffect } from "react";
import { useDealNotes, type DealNote } from "@/hooks/use-deal-notes";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DealNotesPanelProps {
  dealId: string;
  contactId: string;
  accountId: string;
}

export function DealNotesPanel({ dealId, contactId, accountId }: DealNotesPanelProps) {
  const { fetchNotes, addNote, deleteNote, loading } = useDealNotes();
  const [notes, setNotes] = useState<DealNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, [dealId]);

  const loadNotes = async () => {
    try {
      const data = await fetchNotes(dealId);
      setNotes(data);
    } catch (err) {
      console.error("Erro ao carregar notas:", err);
      toast.error("Erro ao carregar notas");
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      await addNote(dealId, contactId, accountId, newNote.trim());
      setNewNote("");
      await loadNotes();
      toast.success("Nota adicionada");
    } catch (err) {
      console.error("Erro ao adicionar nota:", err);
      toast.error("Erro ao adicionar nota");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Deletar esta nota?")) return;
    setDeleting(noteId);
    try {
      await deleteNote(noteId);
      await loadNotes();
      toast.success("Nota deletada");
    } catch (err) {
      console.error("Erro ao deletar nota:", err);
      toast.error("Erro ao deletar nota");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Notas do Deal
      </h3>

      <div className="flex gap-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Adicionar nota interna..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
        />
        <Button
          size="sm"
          className="h-auto bg-primary px-2 hover:bg-primary/90"
          onClick={handleAddNote}
          disabled={!newNote.trim() || adding}
        >
          {adding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-xs text-muted-foreground">
          Nenhuma nota ainda
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg bg-muted px-3 py-2 space-y-1 group hover:bg-muted/80 transition-colors relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="whitespace-pre-wrap text-xs text-foreground leading-relaxed">
                    {note.note}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-medium">
                      {note.author?.user_metadata?.full_name ||
                        note.author?.email?.split("@")[0] ||
                        "Anônimo"}
                    </span>
                    <span>•</span>
                    <time>
                      {format(new Date(note.created_at), "dd MMM HH:mm", {
                        locale: ptBR,
                      })}
                    </time>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteNote(note.id)}
                  disabled={deleting === note.id}
                >
                  {deleting === note.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
