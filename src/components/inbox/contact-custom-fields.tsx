"use client";

import { useState, useEffect } from "react";
import {
  useContactCustomFields,
  type ContactCustomField,
} from "@/hooks/use-contact-custom-fields";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ContactCustomFieldsProps {
  contactId: string;
  accountId: string;
}

export function ContactCustomFields({
  contactId,
  accountId,
}: ContactCustomFieldsProps) {
  const { fetchFields, addField, updateField, deleteField, loading } =
    useContactCustomFields();
  const [fields, setFields] = useState<ContactCustomField[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadFields();
  }, [contactId]);

  const loadFields = async () => {
    try {
      const data = await fetchFields(contactId);
      setFields(data);
    } catch (err) {
      console.error("Erro ao carregar campos:", err);
      toast.error("Erro ao carregar campos");
    }
  };

  const handleAddField = async () => {
    if (!newName.trim()) return;

    setSaving(true);
    try {
      await addField(contactId, accountId, newName.trim(), newValue.trim());
      setNewName("");
      setNewValue("");
      setIsAdding(false);
      await loadFields();
      toast.success("Campo adicionado");
    } catch (err) {
      console.error("Erro ao adicionar campo:", err);
      toast.error("Erro ao adicionar campo");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateField = async (fieldId: string) => {
    if (!editName.trim()) return;

    setSaving(true);
    try {
      await updateField(fieldId, editName.trim(), editValue.trim());
      setEditingId(null);
      await loadFields();
      toast.success("Campo atualizado");
    } catch (err) {
      console.error("Erro ao atualizar campo:", err);
      toast.error("Erro ao atualizar campo");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm("Deletar este campo?")) return;

    setDeleting(fieldId);
    try {
      await deleteField(fieldId);
      await loadFields();
      toast.success("Campo deletado");
    } catch (err) {
      console.error("Erro ao deletar campo:", err);
      toast.error("Erro ao deletar campo");
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (field: ContactCustomField) => {
    setEditingId(field.id);
    setEditName(field.name);
    setEditValue(field.value || "");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campos Customizados
        </h3>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <input
            type="text"
            placeholder="Nome do campo (ex: CPF, Segmento)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
          />
          <input
            type="text"
            placeholder="Valor (opcional)"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-auto bg-primary hover:bg-primary/90 text-xs"
              onClick={handleAddField}
              disabled={!newName.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Salvar"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-auto text-xs"
              onClick={() => {
                setIsAdding(false);
                setNewName("");
                setNewValue("");
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
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-xs text-muted-foreground">
          Nenhum campo customizado
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field) =>
            editingId === field.id ? (
              <div
                key={field.id}
                className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
                />
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-auto bg-primary hover:bg-primary/90 text-xs"
                    onClick={() => handleUpdateField(field.id)}
                    disabled={!editName.trim() || saving}
                  >
                    {saving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Salvar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-auto text-xs"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={field.id}
                className="rounded-lg bg-muted/50 px-3 py-2 space-y-1 group hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground break-words">
                      {field.name}
                    </p>
                    <p className="text-sm text-foreground break-words">
                      {field.value || "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(field)}
                      disabled={saving || deleting === field.id}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteField(field.id)}
                      disabled={deleting === field.id || saving}
                    >
                      {deleting === field.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
