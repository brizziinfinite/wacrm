"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useBroadcastSending } from "@/hooks/use-broadcast-sending";
import type { MessageTemplate } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageContent: string;
  packageId: string;
  brandName: string;
}

export function SendToWhatsAppDialog({ open, onOpenChange, packageContent, packageId, brandName }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [audienceType, setAudienceType] = useState<"all" | "tags">("all");
  const [broadcastName, setBroadcastName] = useState("");
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();
  const supabase = createClient();

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .eq("status", "APPROVED")
      .order("name");
    setTemplates((data as MessageTemplate[]) ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      void loadTemplates();
      setBroadcastName(`${brandName} — pacote ${packageId.slice(0, 8)}`);
      setSelectedTemplate(null);
    }
  }, [open, loadTemplates, brandName, packageId]);

  async function handleSend() {
    if (!selectedTemplate) {
      toast.error("Selecione um template");
      return;
    }

    try {
      const broadcastId = await createAndSendBroadcast({
        name: broadcastName,
        template: selectedTemplate,
        audience: { type: audienceType },
        variables: {},
      });

      // Registrar no pacote que foi enviado via broadcast
      await supabase
        .from("content_packages")
        .update({ status: "converted_to_post" })
        .eq("id", packageId);

      toast.success("Broadcast criado!", {
        description: `ID: ${broadcastId.slice(0, 8)}… — enviando para contatos.`,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao criar broadcast", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Enviar via WhatsApp Broadcast
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome do broadcast */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nome do broadcast</label>
            <input
              type="text"
              value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Template WhatsApp</label>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum template aprovado encontrado.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selectedTemplate?.id === t.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <p className="font-medium">{t.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.body_text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audiência */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Audiência</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAudienceType("all")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  audienceType === "all"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Todos os contatos
              </button>
              <button
                onClick={() => setAudienceType("tags")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  audienceType === "tags"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Por tags
              </button>
            </div>
            {audienceType === "tags" && (
              <p className="text-xs text-muted-foreground">
                Para filtrar por tags específicas, use a página de{" "}
                <a href="/broadcasts/new" className="text-primary underline">Broadcasts</a>.
              </p>
            )}
          </div>

          {/* Preview do conteúdo */}
          {packageContent && (
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Conteúdo do pacote (referência)</p>
              <p className="text-xs text-foreground line-clamp-3">{packageContent}</p>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Enviando...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isProcessing || !selectedTemplate} className="gap-2">
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</>
            ) : (
              <><Send className="h-4 w-4" />Enviar Broadcast</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
