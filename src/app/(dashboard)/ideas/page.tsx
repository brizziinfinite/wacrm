"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, ThumbsUp, ThumbsDown, Loader2, RefreshCw, Pencil, Layers, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/use-auth";
import { RadarWidget } from "@/components/radar/radar-widget";

type IdeaStatus = "pending" | "approved" | "rejected" | "generated" | "posted" | "archived";
type IdeaFormat = "carrossel" | "reel" | "story" | "blog" | "email" | "post";

interface ContentIdea {
  id: string;
  brand_id: string;
  angle: string;
  topic: string;
  hook: string | null;
  detail: string | null;
  cta: string | null;
  format: IdeaFormat;
  pillar: string | null;
  rationale: string | null;
  contributes_to: string | null;
  scheduled_for: string | null;
  week_of: string | null;
  status: IdeaStatus;
  package_id: string | null;
  llm_model: string | null;
  created_at: string;
}

type IdeaPatch = Partial<Pick<ContentIdea, "topic" | "hook" | "detail" | "cta">>;

const FORMAT_COLORS: Record<IdeaFormat, string> = {
  carrossel: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  reel:      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  story:     "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  blog:      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  email:     "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  post:      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const STATUS_LABELS: Record<IdeaStatus, string> = {
  pending:   "Pendente",
  approved:  "Aprovado",
  rejected:  "Rejeitado",
  generated: "Gerado",
  posted:    "Publicado",
  archived:  "Arquivado",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

interface IdeaCardProps {
  idea: ContentIdea;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (idea: ContentIdea) => void;
  onGeneratePackage: (id: string) => void;
  generatingPackageId: string | null;
}

function IdeaCard({ idea, onApprove, onReject, onEdit, onGeneratePackage, generatingPackageId }: IdeaCardProps) {
  const router = useRouter();
  const isApproved = idea.status === "approved";
  const isRejected = idea.status === "rejected";
  const isGenerated = idea.status === "generated";
  const hasPackage = !!idea.package_id;
  const isGeneratingThis = generatingPackageId === idea.id;

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col shadow-sm">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FORMAT_COLORS[idea.format]}`}>
              {idea.format}
            </span>
            {idea.pillar && <Badge variant="outline" className="text-xs">{idea.pillar}</Badge>}
            {idea.status !== "pending" && (
              <Badge variant="secondary" className="text-xs">{STATUS_LABELS[idea.status]}</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(idea.scheduled_for)}</span>
        </div>

        {idea.angle && (
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide line-clamp-1">{idea.angle}</p>
        )}
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{idea.topic}</p>
        {idea.hook && (
          <div className="rounded bg-muted/60 px-3 py-2 text-xs italic text-muted-foreground line-clamp-2">
            &quot;{idea.hook}&quot;
          </div>
        )}
        {idea.detail && <p className="text-xs text-muted-foreground line-clamp-3">{idea.detail}</p>}
        {idea.cta && <p className="text-xs font-medium text-primary line-clamp-2">CTA: {idea.cta}</p>}
      </div>

      <div className="flex flex-col gap-2 p-3 border-t border-border">
        <div className="flex gap-2">
          <Button size="sm" variant={isApproved || isGenerated ? "default" : "outline"} className="flex-1 gap-1 text-xs" onClick={() => onApprove(idea.id)} disabled={isApproved || isGenerated}>
            <ThumbsUp className="h-3 w-3" />Aprovar
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => onEdit(idea)}>
            <Pencil className="h-3 w-3" />Editar
          </Button>
          <Button size="sm" variant={isRejected ? "destructive" : "outline"} className="flex-1 gap-1 text-xs" onClick={() => onReject(idea.id)} disabled={isRejected}>
            <ThumbsDown className="h-3 w-3" />Rejeitar
          </Button>
        </div>
        {(isApproved || isGenerated) && (
          hasPackage ? (
            <Button size="sm" variant="secondary" className="w-full gap-1 text-xs" onClick={() => router.push(`/packages/${idea.package_id}`)}>
              <ExternalLink className="h-3 w-3" />Ver pacote
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={() => onGeneratePackage(idea.id)} disabled={isGeneratingThis}>
              {isGeneratingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
              {isGeneratingThis ? "Gerando..." : "Gerar pacote"}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function EditDialog({ idea, open, onClose, onSave }: { idea: ContentIdea | null; open: boolean; onClose: () => void; onSave: (id: string, patch: IdeaPatch) => void }) {
  const [topic, setTopic] = useState(idea?.topic ?? "");
  const [hook, setHook] = useState(idea?.hook ?? "");
  const [detail, setDetail] = useState(idea?.detail ?? "");
  const [cta, setCta] = useState(idea?.cta ?? "");

  useEffect(() => {
    if (idea) { setTopic(idea.topic); setHook(idea.hook ?? ""); setDetail(idea.detail ?? ""); setCta(idea.cta ?? ""); }
  }, [idea]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar ideia</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-topic">Tópico</Label>
            <Input id="edit-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-hook">Hook</Label>
            <Input id="edit-hook" value={hook} onChange={(e) => setHook(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-detail">Detalhe</Label>
            <Textarea id="edit-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-cta">CTA</Label>
            <Input id="edit-cta" value={cta} onChange={(e) => setCta(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { if (idea) { onSave(idea.id, { topic, hook, detail, cta }); onClose(); } }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IdeasPage() {
  const activeBrand = useAppStore((s) => s.activeBrand);
  const { accountId } = useAuth();
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ContentIdea | null>(null);
  const [generatingPackageId, setGeneratingPackageId] = useState<string | null>(null);
  const supabase = createClient();

  const loadIdeas = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("content_ideas")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("scheduled_for", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar ideias: " + error.message);
    else setIdeas((data as ContentIdea[]) ?? []);
    setLoading(false);
  }, [activeBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadIdeas(); }, [loadIdeas]); // eslint-disable-line react-hooks/set-state-in-effect

  async function handleGenerate() {
    if (!activeBrand) { toast.error("Selecione uma brand primeiro."); return; }
    setGenerating(true);
    toast.info("Gerando ideias com IA...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada.");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agent-1-strategist`,
        { method: "POST", headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: activeBrand.id }) }
      );
      const json = await res.json() as { results?: Array<{ status: string; ideas_count?: number; error?: string }>; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const result = json.results?.[0];
      if (result?.status === "success") { toast.success(`${result.ideas_count ?? 7} ideias geradas!`); await loadIdeas(); }
      else if (result?.status === "skipped") toast.warning("Brand sem plano ativo.");
      else throw new Error(result?.error ?? "Erro desconhecido");
    } catch (err) {
      toast.error("Erro ao gerar ideias: " + (err instanceof Error ? err.message : String(err)));
    } finally { setGenerating(false); }
  }

  async function handleApprove(id: string) {
    const { error } = await supabase.from("content_ideas").update({ status: "approved" }).eq("id", id);
    if (error) toast.error("Erro ao aprovar: " + error.message);
    else { setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status: "approved" as IdeaStatus } : i)); toast.success("Ideia aprovada!"); }
  }

  async function handleReject(id: string) {
    const { error } = await supabase.from("content_ideas").update({ status: "rejected" }).eq("id", id);
    if (error) toast.error("Erro ao rejeitar: " + error.message);
    else { setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status: "rejected" as IdeaStatus } : i)); toast.info("Ideia rejeitada."); }
  }

  async function handleSaveEdit(id: string, patch: IdeaPatch) {
    const { error } = await supabase.from("content_ideas").update(patch).eq("id", id);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else { setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i)); toast.success("Ideia atualizada!"); }
  }

  async function handleGeneratePackage(ideaId: string) {
    setGeneratingPackageId(ideaId);
    toast.info("Gerando pacote de conteúdo...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada.");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agent-2-roteirista`,
        { method: "POST", headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ idea_id: ideaId }) }
      );
      const json = await res.json() as { package_id?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success("Pacote gerado com sucesso!");
      await loadIdeas();
    } catch (err) {
      toast.error("Erro ao gerar pacote: " + (err instanceof Error ? err.message : String(err)));
    } finally { setGeneratingPackageId(null); }
  }

  const pendingIdeas  = ideas.filter((i) => i.status === "pending");
  const approvedIdeas = ideas.filter((i) => i.status === "approved");
  const otherIdeas    = ideas.filter((i) => !["pending", "approved"].includes(i.status));

  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Selecione uma brand na barra lateral para ver as ideias.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />Ideias de Conteúdo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{activeBrand.name} — {ideas.length} ideia{ideas.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadIdeas} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar agora
          </Button>
        </div>
      </div>

      {/* Radar Widget */}
      {activeBrand && accountId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 p-4">
          <RadarWidget brandId={activeBrand.id} accountId={accountId} />
        </div>
      )}

      {!loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center border border-dashed border-border rounded-lg">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Nenhuma ideia ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em &quot;Gerar agora&quot; para criar 7 ideias para a próxima semana.</p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar agora
          </Button>
        </div>
      )}

      {pendingIdeas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pendentes — {pendingIdeas.length}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pendingIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} onApprove={handleApprove} onReject={handleReject} onEdit={setEditingIdea} onGeneratePackage={handleGeneratePackage} generatingPackageId={generatingPackageId} />)}
          </div>
        </section>
      )}

      {approvedIdeas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aprovadas — {approvedIdeas.length}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {approvedIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} onApprove={handleApprove} onReject={handleReject} onEdit={setEditingIdea} onGeneratePackage={handleGeneratePackage} generatingPackageId={generatingPackageId} />)}
          </div>
        </section>
      )}

      {otherIdeas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Histórico — {otherIdeas.length}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {otherIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} onApprove={handleApprove} onReject={handleReject} onEdit={setEditingIdea} onGeneratePackage={handleGeneratePackage} generatingPackageId={generatingPackageId} />)}
          </div>
        </section>
      )}

      <EditDialog idea={editingIdea} open={editingIdea !== null} onClose={() => setEditingIdea(null)} onSave={handleSaveEdit} />
    </div>
  );
}
