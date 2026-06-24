"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Layers, RefreshCw, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";

type PackageStatus = "generating" | "pending_review" | "approved" | "converted_to_post" | "rejected" | "failed";
type PackageFormat = "carrossel" | "reel" | "story" | "blog" | "email" | "post";

interface ContentPackage {
  id: string;
  brand_id: string;
  idea_id: string;
  format: PackageFormat;
  status: PackageStatus;
  visual_prompt: string | null;
  estimated_post_length: number | null;
  llm_model: string | null;
  llm_cost_usd: number;
  created_at: string;
  carousel_slides: Array<{ title?: string; body?: string; cta?: string }> | null;
  reel_script: { hook_3s?: string; narration?: string; cta_final?: string } | null;
  story_frames: Array<{ text?: string; sticker?: string }> | null;
  blog_content: { title?: string; intro?: string; conclusion?: string } | null;
  email_content: { subject?: string; preview_text?: string; body_html?: string } | null;
  post_content: { caption?: string; first_comment?: string } | null;
}

const FORMAT_COLORS: Record<PackageFormat, string> = {
  carrossel: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  reel:      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  story:     "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  blog:      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  email:     "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  post:      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const STATUS_LABELS: Record<PackageStatus, string> = {
  generating:         "Gerando",
  pending_review:     "Aguardando revisão",
  approved:           "Aprovado",
  converted_to_post:  "Convertido",
  rejected:           "Rejeitado",
  failed:             "Falhou",
};

const STATUS_VARIANTS: Record<PackageStatus, "default" | "secondary" | "destructive" | "outline"> = {
  generating:        "secondary",
  pending_review:    "outline",
  approved:          "default",
  converted_to_post: "secondary",
  rejected:          "destructive",
  failed:            "destructive",
};

function extractPreview(pkg: ContentPackage): string {
  switch (pkg.format) {
    case "post":      return pkg.post_content?.caption?.slice(0, 120) ?? "—";
    case "carrossel": return pkg.carousel_slides?.[0]?.body?.slice(0, 120) ?? "—";
    case "reel":      return pkg.reel_script?.hook_3s?.slice(0, 120) ?? "—";
    case "story":     return pkg.story_frames?.[0]?.text?.slice(0, 120) ?? "—";
    case "blog":      return pkg.blog_content?.title?.slice(0, 120) ?? "—";
    case "email":     return pkg.email_content?.subject?.slice(0, 120) ?? "—";
  }
}

function PackageCard({ pkg, onView }: { pkg: ContentPackage; onView: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card flex flex-col shadow-sm">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FORMAT_COLORS[pkg.format]}`}>{pkg.format}</span>
            <Badge variant={STATUS_VARIANTS[pkg.status]} className="text-xs">{STATUS_LABELS[pkg.status]}</Badge>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(pkg.created_at).toLocaleDateString("pt-BR")}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">{extractPreview(pkg)}</p>
        {pkg.visual_prompt && (
          <p className="text-xs text-muted-foreground line-clamp-2"><span className="font-medium">Visual: </span>{pkg.visual_prompt}</p>
        )}
      </div>
      <div className="p-3 border-t border-border">
        <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={() => onView(pkg.id)}>
          <ExternalLink className="h-3 w-3" />Ver detalhes
        </Button>
      </div>
    </div>
  );
}

export default function PackagesPage() {
  const activeBrand = useAppStore((s) => s.activeBrand);
  const router = useRouter();
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PackageStatus | "all">("all");
  const supabase = createClient();

  const loadPackages = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("content_packages")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar pacotes: " + error.message);
    else setPackages((data as ContentPackage[]) ?? []);
    setLoading(false);
  }, [activeBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadPackages(); }, [loadPackages]); // eslint-disable-line react-hooks/set-state-in-effect

  const filtered = statusFilter === "all" ? packages : packages.filter((p) => p.status === statusFilter);
  const statusCounts = packages.reduce<Record<string, number>>((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {});

  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Layers className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Selecione uma brand na barra lateral para ver os pacotes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />Pacotes de Conteúdo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{activeBrand.name} — {packages.length} pacote{packages.length !== 1 ? "s" : ""}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadPackages} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {packages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>Todos ({packages.length})</Button>
          {(Object.keys(statusCounts) as PackageStatus[]).map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
              {STATUS_LABELS[s]} ({statusCounts[s]})
            </Button>
          ))}
        </div>
      )}

      {!loading && packages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center border border-dashed border-border rounded-lg">
          <Layers className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Nenhum pacote ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Aprove ideias e clique em &quot;Gerar pacote&quot; para criar conteúdo.</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/ideas")}>Ir para Ideias</Button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} onView={(id) => router.push(`/packages/${id}`)} />)}
        </div>
      )}
    </div>
  );
}
