"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  X,
  FileText,
  Image,
  Layers,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { SendToWhatsAppDialog } from "@/components/content/SendToWhatsAppDialog";

type PackageStatus = "generating" | "pending_review" | "approved" | "converted_to_post" | "rejected" | "failed";
type PackageFormat = "carrossel" | "reel" | "story" | "blog" | "email" | "post";

interface CarouselSlide {
  slide: number;
  title?: string;
  body?: string;
  image_prompt?: string;
  layout_hint?: string;
}

interface ReelScene {
  scene: number;
  voiceover?: string;
  onscreen_text?: string;
  visual_description?: string;
  duration_s?: number;
}

interface ReelScript {
  duration_seconds?: number;
  hook_3s?: string;
  scenes?: ReelScene[];
  cta_final?: string;
  music_mood?: string;
}

interface StoryFrame {
  frame: number;
  text?: string;
  visual_description?: string;
  interactive_element?: { type: string; options?: string[] } | null;
}

interface BlogContent {
  title?: string;
  slug?: string;
  meta_description?: string;
  intro?: string;
  sections?: Array<{ h2: string; body: string }>;
  conclusion?: string;
  internal_cta?: string;
}

interface EmailContent {
  subject?: string;
  preview_text?: string;
  greeting?: string;
  body_html?: string;
  ps?: string;
  cta_url_placeholder?: string;
}

interface PostContent {
  caption?: string;
  alt_text?: string;
  hashtags?: string[];
  first_comment?: string;
}

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
  error_message: string | null;
  created_at: string;
  updated_at: string;
  carousel_slides: CarouselSlide[] | null;
  reel_script: ReelScript | null;
  story_frames: StoryFrame[] | null;
  blog_content: BlogContent | null;
  email_content: EmailContent | null;
  post_content: PostContent | null;
}

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

const FORMAT_LABEL: Record<PackageFormat, string> = {
  carrossel: "Carrossel",
  reel:      "Reel",
  story:     "Stories",
  blog:      "Blog",
  email:     "Email",
  post:      "Post",
};

// ─── Renderers por formato ────────────────────────────────────────────────────

function CarouselView({ slides }: { slides: CarouselSlide[] }) {
  return (
    <div className="space-y-3">
      {slides.map((s) => (
        <div key={s.slide} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{s.slide}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{s.layout_hint}</span>
          </div>
          {s.title && <p className="font-semibold text-foreground">{s.title}</p>}
          {s.body && <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>}
          {s.image_prompt && (
            <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
              <Image className="mt-0.5 h-3 w-3 shrink-0" />
              {s.image_prompt}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReelView({ script }: { script: ReelScript }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hook 3s</p>
        <p className="mt-1 text-lg font-bold text-foreground">{script.hook_3s}</p>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          {script.duration_seconds && <span>⏱ {script.duration_seconds}s</span>}
          {script.music_mood && <span>🎵 {script.music_mood}</span>}
        </div>
      </div>
      {(script.scenes ?? []).map((scene) => (
        <div key={scene.scene} className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cena {scene.scene} {scene.duration_s ? `· ${scene.duration_s}s` : ""}</p>
          {scene.onscreen_text && <p className="font-semibold text-foreground">{scene.onscreen_text}</p>}
          {scene.voiceover && <p className="mt-1 text-sm text-muted-foreground italic">"{scene.voiceover}"</p>}
          {scene.visual_description && (
            <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
              <Image className="mt-0.5 h-3 w-3 shrink-0" />{scene.visual_description}
            </p>
          )}
        </div>
      ))}
      {script.cta_final && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">CTA Final</p>
          <p className="mt-1 text-sm font-medium text-foreground">{script.cta_final}</p>
        </div>
      )}
    </div>
  );
}

function StoryView({ frames }: { frames: StoryFrame[] }) {
  return (
    <div className="space-y-3">
      {frames.map((f) => (
        <div key={f.frame} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500 text-xs font-bold text-white">{f.frame}</span>
          </div>
          {f.text && <p className="font-medium text-foreground">{f.text}</p>}
          {f.visual_description && <p className="mt-1 text-xs text-muted-foreground">{f.visual_description}</p>}
          {f.interactive_element && (
            <div className="mt-2 rounded border border-border bg-muted px-3 py-1.5 text-xs">
              <span className="font-medium">{f.interactive_element.type}</span>
              {f.interactive_element.options && (
                <span className="ml-2 text-muted-foreground">{f.interactive_element.options.join(" / ")}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BlogView({ content }: { content: BlogContent }) {
  return (
    <div className="space-y-4">
      {content.title && <h2 className="text-2xl font-bold text-foreground">{content.title}</h2>}
      {content.meta_description && (
        <p className="rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
          <span className="font-medium">Meta: </span>{content.meta_description}
        </p>
      )}
      {content.intro && <p className="text-sm leading-relaxed text-muted-foreground">{content.intro}</p>}
      {(content.sections ?? []).map((sec, i) => (
        <div key={i}>
          <h3 className="text-lg font-semibold text-foreground">{sec.h2}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{sec.body}</p>
        </div>
      ))}
      {content.conclusion && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm leading-relaxed text-foreground">{content.conclusion}</p>
        </div>
      )}
      {content.internal_cta && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
          {content.internal_cta}
        </div>
      )}
    </div>
  );
}

function EmailView({ content }: { content: EmailContent }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assunto</p>
        <p className="mt-1 text-lg font-bold text-foreground">{content.subject}</p>
        {content.preview_text && <p className="mt-1 text-sm text-muted-foreground">{content.preview_text}</p>}
      </div>
      {content.greeting && <p className="font-medium text-foreground">{content.greeting}</p>}
      {content.body_html && (
        <div
          className="prose prose-sm max-w-none text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: content.body_html }}
        />
      )}
      {content.ps && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">PS: </span>{content.ps}
        </p>
      )}
    </div>
  );
}

function PostView({ content }: { content: PostContent }) {
  return (
    <div className="space-y-4">
      {content.caption && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{content.caption}</p>
        </div>
      )}
      {content.alt_text && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Alt text: </span>{content.alt_text}
        </p>
      )}
      {content.hashtags && content.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {content.hashtags.map((tag) => (
            <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{tag}</span>
          ))}
        </div>
      )}
      {content.first_comment && (
        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primeiro comentário</p>
          <p className="mt-1 text-sm text-foreground">{content.first_comment}</p>
        </div>
      )}
    </div>
  );
}

function PackageContent({ pkg }: { pkg: ContentPackage }) {
  switch (pkg.format) {
    case "carrossel": return pkg.carousel_slides ? <CarouselView slides={pkg.carousel_slides} /> : null;
    case "reel":      return pkg.reel_script ? <ReelView script={pkg.reel_script} /> : null;
    case "story":     return pkg.story_frames ? <StoryView frames={pkg.story_frames} /> : null;
    case "blog":      return pkg.blog_content ? <BlogView content={pkg.blog_content} /> : null;
    case "email":     return pkg.email_content ? <EmailView content={pkg.email_content} /> : null;
    case "post":      return pkg.post_content ? <PostView content={pkg.post_content} /> : null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pkg, setPkg] = useState<ContentPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("content_packages").select("*").eq("id", id).single();
    if (error) { toast.error("Pacote não encontrado"); router.push("/packages"); return; }
    setPkg(data as ContentPackage);
    setLoading(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(status: PackageStatus) {
    if (!pkg) return;
    setSaving(true);
    const { error } = await supabase.from("content_packages").update({ status }).eq("id", pkg.id);
    if (error) toast.error("Erro ao atualizar: " + error.message);
    else { toast.success("Status atualizado"); setPkg({ ...pkg, status }); }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pkg) return null;

  const isPendingReview = pkg.status === "pending_review";
  const isApproved = pkg.status === "approved";

  function extractText(): string {
    if (!pkg) return "";
    switch (pkg.format) {
      case "post":      return pkg.post_content?.caption ?? "";
      case "carrossel": return pkg.carousel_slides?.map((s) => `${s.title ?? ""} ${s.body ?? ""}`).join(" ") ?? "";
      case "blog":      return pkg.blog_content?.intro ?? pkg.blog_content?.title ?? "";
      case "email":     return pkg.email_content?.subject ?? "";
      case "reel":      return pkg.reel_script?.hook_3s ?? "";
      case "story":     return pkg.story_frames?.[0]?.text ?? "";
    }
  }

  return (
    <>
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{FORMAT_LABEL[pkg.format]}</h1>
            <Badge variant={STATUS_VARIANTS[pkg.status]}>{STATUS_LABELS[pkg.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(pkg.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            {pkg.llm_model && <> · {pkg.llm_model}</>}
            {pkg.llm_cost_usd > 0 && <> · ${pkg.llm_cost_usd.toFixed(4)}</>}
          </p>
        </div>
      </div>

      {/* Ações */}
      {(isPendingReview || isApproved) && (
        <div className="flex flex-wrap gap-2">
          {isPendingReview && (
            <Button onClick={() => updateStatus("approved")} disabled={saving} className="gap-2">
              <Check className="h-4 w-4" />Aprovar
            </Button>
          )}
          {isApproved && (
            <Button onClick={() => setWhatsappOpen(true)} disabled={saving} variant="outline" className="gap-2 border-green-500/40 text-green-600 hover:bg-green-50 dark:hover:bg-green-950">
              <Send className="h-4 w-4" />Enviar via WhatsApp
            </Button>
          )}
          {(isPendingReview || isApproved) && (
            <Button variant="outline" onClick={() => updateStatus("rejected")} disabled={saving} className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground">
              <X className="h-4 w-4" />Rejeitar
            </Button>
          )}
        </div>
      )}

      {/* Erro */}
      {pkg.error_message && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {pkg.error_message}
        </div>
      )}

      {/* Visual prompt */}
      {pkg.visual_prompt && (
        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Image className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><span className="font-medium text-foreground">Prompt visual: </span>{pkg.visual_prompt}</span>
          </p>
        </div>
      )}

      {/* Conteúdo */}
      {pkg.status === "generating" ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Gerando conteúdo...</p>
          <Button variant="outline" size="sm" onClick={load}>Verificar</Button>
        </div>
      ) : pkg.status === "failed" ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16">
          <Layers className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Geração falhou. Veja o erro acima.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />Conteúdo gerado
          </div>
          <PackageContent pkg={pkg} />
        </div>
      )}
    </div>

    {whatsappOpen && (
      <SendToWhatsAppDialog
        open={whatsappOpen}
        onOpenChange={(open) => {
          setWhatsappOpen(open);
          if (!open) void load();
        }}
        packageContent={extractText()}
        packageId={pkg.id}
        brandName={pkg.brand_id}
      />
    )}
  </>
  );
}
