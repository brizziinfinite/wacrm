"use client";

import { useState, useEffect } from "react";
import { useChatbotMenus, type ChatbotMenuOption } from "@/hooks/use-chatbot-menus";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ChatbotMenuBuilderProps {
  menuId: string;
  accountId: string;
}

export function ChatbotMenuBuilder({ menuId, accountId }: ChatbotMenuBuilderProps) {
  const { fetchMenuOptions, addOption, deleteOption } = useChatbotMenus();
  const [options, setOptions] = useState<ChatbotMenuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [newIsLeaf, setNewIsLeaf] = useState(true);
  const [newDepartment, setNewDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadOptions();
  }, [menuId]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const data = await fetchMenuOptions(menuId);
      setOptions(data);
    } catch (err) {
      console.error("Erro ao carregar opções:", err);
      toast.error("Erro ao carregar opções");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOption = async () => {
    if (!newLabel.trim() || !newResponse.trim()) {
      toast.error("Preencha rótulo e resposta");
      return;
    }

    setSaving(true);
    try {
      await addOption(
        menuId,
        accountId,
        newLabel.trim(),
        newResponse.trim(),
        newIsLeaf,
        newIsLeaf ? newDepartment.trim() : undefined,
        undefined,
        (options.filter((o) => !o.parent_id).length) + 1
      );

      setNewLabel("");
      setNewResponse("");
      setNewIsLeaf(true);
      setNewDepartment("");
      setIsAdding(false);
      await loadOptions();
      toast.success("Opção adicionada");
    } catch (err) {
      console.error("Erro ao adicionar opção:", err);
      toast.error("Erro ao adicionar opção");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm("Deletar esta opção?")) return;

    setDeleting(optionId);
    try {
      await deleteOption(optionId);
      await loadOptions();
      toast.success("Opção deletada");
    } catch (err) {
      console.error("Erro ao deletar:", err);
      toast.error("Erro ao deletar opção");
    } finally {
      setDeleting(null);
    }
  };

  const rootOptions = options.filter((o) => !o.parent_id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Opções do Menu</h3>
        {!isAdding && (
          <Button
            size="sm"
            className="h-auto bg-primary hover:bg-primary/90"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <input
            type="text"
            placeholder="Rótulo (ex: 1️⃣ Vendas)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
          />

          <textarea
            placeholder="Resposta ao selecionar..."
            value={newResponse}
            onChange={(e) => setNewResponse(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50 resize-none"
          />

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={newIsLeaf}
                onChange={(e) => {
                  setNewIsLeaf(e.target.checked);
                  if (!e.target.checked) setNewDepartment("");
                }}
                className="w-3 h-3 rounded"
              />
              <span>Encaminhar para departamento</span>
            </label>

            {newIsLeaf && (
              <input
                type="text"
                placeholder="Departamento (ex: vendas, suporte)"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-auto bg-primary hover:bg-primary/90 text-xs"
              onClick={handleAddOption}
              disabled={!newLabel.trim() || !newResponse.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Adicionar"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-auto text-xs"
              onClick={() => {
                setIsAdding(false);
                setNewLabel("");
                setNewResponse("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rootOptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-xs text-muted-foreground">
          Nenhuma opção. Crie a primeira!
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          {rootOptions.map((opt) => (
            <div key={opt.id} className="rounded-lg border border-border p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground break-words">
                    {opt.label}
                  </p>
                  <p className="text-muted-foreground break-words">
                    {opt.response_text}
                  </p>
                  {opt.is_leaf && opt.route_to_department && (
                    <p className="text-[10px] text-blue-400 mt-1">
                      → {opt.route_to_department}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-destructive hover:bg-destructive/10 ml-2 flex-shrink-0"
                  onClick={() => handleDeleteOption(opt.id)}
                  disabled={deleting === opt.id}
                >
                  {deleting === opt.id ? (
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

      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2 text-xs text-muted-foreground">
        <strong>💡 Dica:</strong> Use emojis nos rótulos (1️⃣, 2️⃣) para melhor UX.
      </div>
    </div>
  );
}
