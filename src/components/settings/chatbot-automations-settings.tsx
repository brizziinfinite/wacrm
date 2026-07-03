"use client";

import { useState, useEffect } from "react";
import { useChatbotMenus, type ChatbotMenu } from "@/hooks/use-chatbot-menus";
import { ChatbotMenuBuilder } from "./chatbot-menu-builder";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ChatbotAutomationsSettings() {
  const { accountId } = useAuth();
  const { fetchMenus, createMenu } = useChatbotMenus();
  const [menus, setMenus] = useState<ChatbotMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWelcome, setNewWelcome] = useState("Olá! Como posso ajudar?");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountId) loadMenus();
  }, [accountId]);

  const loadMenus = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await fetchMenus(accountId);
      setMenus(data);
      if (data.length > 0 && !selectedMenuId) {
        setSelectedMenuId(data[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar menus:", err);
      toast.error("Erro ao carregar menus");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMenu = async () => {
    if (!newName.trim() || !accountId) return;

    setSaving(true);
    try {
      const menu = await createMenu(accountId, newName.trim(), newWelcome.trim());
      setMenus((prev) => [menu, ...prev]);
      setSelectedMenuId(menu.id);
      setNewName("");
      setNewWelcome("Olá! Como posso ajudar?");
      setIsCreating(false);
      toast.success("Menu criado");
    } catch (err) {
      console.error("Erro ao criar menu:", err);
      toast.error("Erro ao criar menu");
    } finally {
      setSaving(false);
    }
  };

  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Chatbot com Menu de Árvore</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure menus automáticos que qualificam leads antes de encaminhar para atendente.
        </p>
      </div>

      {/* Menu List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Seus Menus</h3>
          {!isCreating && (
            <Button
              size="sm"
              className="h-auto bg-primary hover:bg-primary/90 text-xs"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Novo Menu
            </Button>
          )}
        </div>

        {isCreating && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <input
              type="text"
              placeholder="Nome do menu (ex: Menu Principal)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
            />

            <textarea
              placeholder="Mensagem de boas-vindas"
              value={newWelcome}
              onChange={(e) => setNewWelcome(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50 resize-none"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-auto bg-primary hover:bg-primary/90 text-xs"
                onClick={handleCreateMenu}
                disabled={!newName.trim() || saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Criar"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 h-auto text-xs"
                onClick={() => {
                  setIsCreating(false);
                  setNewName("");
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
        ) : menus.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-xs text-muted-foreground">
            Nenhum menu. Crie o primeiro!
          </div>
        ) : (
          <div className="grid gap-2">
            {menus.map((menu) => (
              <button
                key={menu.id}
                onClick={() => setSelectedMenuId(menu.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  selectedMenuId === menu.id
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted/70"
                }`}
              >
                <p className="font-medium">{menu.name}</p>
                <p className="text-[10px] mt-0.5">{menu.welcome_message}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu Builder */}
      {selectedMenu && accountId && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          <div>
            <h3 className="font-medium text-sm">{selectedMenu.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedMenu.welcome_message}
            </p>
          </div>

          <ChatbotMenuBuilder
            menuId={selectedMenu.id}
            accountId={accountId}
          />
        </div>
      )}

      {/* Help */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-foreground">Como funciona:</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Cliente recebe mensagem de boas-vindas</li>
          <li>Digita número (1, 2, etc.) para selecionar opção</li>
          <li>Sistema navega na árvore ou encaminha para departamento</li>
          <li>Webhook integra com flow builder existente</li>
        </ul>
      </div>
    </div>
  );
}
