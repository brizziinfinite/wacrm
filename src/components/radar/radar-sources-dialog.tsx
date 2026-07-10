"use client";

import { useEffect, useState } from "react";
import { useRadar, type OpportunitySource } from "@/hooks/use-radar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Rss, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface RadarSourcesDialogProps {
  brandId: string;
  accountId: string;
}

export function RadarSourcesDialog({ brandId, accountId }: RadarSourcesDialogProps) {
  const { fetchSources, addSource, toggleSource, deleteSource } = useRadar();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<OpportunitySource[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceType, setSourceType] = useState("rss");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchSources(brandId)
      .then(setSources)
      .catch(() => toast.error("Erro ao carregar fontes"))
      .finally(() => setLoading(false));
  }, [open, brandId, fetchSources]);

  const handleAdd = async () => {
    if (sourceType === "rss" && !sourceUrl.trim()) {
      toast.error("Informe a URL do feed RSS");
      return;
    }
    setSaving(true);
    try {
      const created = await addSource(
        accountId,
        brandId,
        sourceType,
        sourceType === "google_news" ? "auto" : sourceUrl.trim(),
        sourceName.trim() || undefined
      );
      setSources((prev) => [...prev, created]);
      setSourceUrl("");
      setSourceName("");
      toast.success("Fonte adicionada");
    } catch {
      toast.error("Erro ao adicionar fonte");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (source: OpportunitySource) => {
    try {
      await toggleSource(source.id, !source.active);
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s))
      );
    } catch {
      toast.error("Erro ao atualizar fonte");
    }
  };

  const handleDelete = async (sourceId: string) => {
    try {
      await deleteSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      toast.success("Fonte removida");
    } catch {
      toast.error("Erro ao remover fonte");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="ghost" className="h-7 text-xs" />}
      >
        <Settings2 className="h-3.5 w-3.5 mr-1" />
        Fontes
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rss className="h-4 w-4" />
            Fontes do Radar
          </DialogTitle>
        </DialogHeader>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhuma fonte configurada. Adicione abaixo.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-2 rounded-lg border border-border p-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {source.source_name || source.source_type}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {source.source_type === "google_news"
                      ? "Google News (busca pelo nome da marca)"
                      : source.source_url}
                  </p>
                </div>
                <Switch
                  checked={source.active}
                  onCheckedChange={() => handleToggle(source)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(source.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Adicionar */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex gap-2">
            <Select value={sourceType} onValueChange={(v) => v && setSourceType(v)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rss">RSS</SelectItem>
                <SelectItem value="google_news">Google News</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Nome (opcional)"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
            />
          </div>
          {sourceType === "rss" && (
            <Input
              placeholder="https://exemplo.com/feed.xml"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          )}
          <Button
            size="sm"
            className="w-full"
            onClick={handleAdd}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1" />
            )}
            Adicionar fonte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
