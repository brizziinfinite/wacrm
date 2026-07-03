"use client";

import { useState, useEffect } from "react";
import {
  useScheduledMessages,
  type ScheduledMessage,
} from "@/hooks/use-scheduled-messages";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ScheduledMessagesPanelProps {
  contactId: string;
  conversationId: string | null;
  accountId: string;
}

export function ScheduledMessagesPanel({
  contactId,
  conversationId,
  accountId,
}: ScheduledMessagesPanelProps) {
  const { fetchScheduled, scheduleMessage, cancelMessage, loading } =
    useScheduledMessages();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, [contactId]);

  const loadMessages = async () => {
    try {
      const data = await fetchScheduled(contactId);
      setMessages(data);
    } catch (err) {
      console.error("Erro ao carregar agendamentos:", err);
      toast.error("Erro ao carregar agendamentos");
    }
  };

  const handleSchedule = async () => {
    if (!msgText.trim() || !scheduleDate || !scheduleTime) {
      toast.error("Preencha mensagem e data/hora");
      return;
    }

    setSaving(true);
    try {
      const sendAt = new Date(`${scheduleDate}T${scheduleTime}`);
      if (sendAt <= new Date()) {
        toast.error("Data/hora deve ser no futuro");
        return;
      }

      await scheduleMessage(
        contactId,
        conversationId,
        accountId,
        msgText.trim(),
        sendAt
      );

      setMsgText("");
      setScheduleDate("");
      setScheduleTime("09:00");
      setIsScheduling(false);
      await loadMessages();
      toast.success("Mensagem agendada");
    } catch (err) {
      console.error("Erro ao agendar:", err);
      toast.error("Erro ao agendar mensagem");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (messageId: string) => {
    if (!confirm("Cancelar agendamento?")) return;

    setCancelling(messageId);
    try {
      await cancelMessage(messageId);
      await loadMessages();
      toast.success("Agendamento cancelado");
    } catch (err) {
      console.error("Erro ao cancelar:", err);
      toast.error("Erro ao cancelar agendamento");
    } finally {
      setCancelling(null);
    }
  };

  const pendingMessages = messages.filter((m) => m.status === "pending");
  const sentMessages = messages.filter((m) => m.status === "sent");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mensagens Agendadas
        </h3>
        {!isScheduling && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setIsScheduling(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Agendar
          </Button>
        )}
      </div>

      {isScheduling && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <textarea
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder="Mensagem..."
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50 resize-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
            />
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/50"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-auto bg-primary hover:bg-primary/90 text-xs"
              onClick={handleSchedule}
              disabled={!msgText.trim() || !scheduleDate || !scheduleTime || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Agendar"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-auto text-xs"
              onClick={() => {
                setIsScheduling(false);
                setMsgText("");
                setScheduleDate("");
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
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-4 text-center text-xs text-muted-foreground">
          Nenhuma mensagem agendada
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pendentes */}
          {pendingMessages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">
                Aguardando envio ({pendingMessages.length})
              </p>
              {pendingMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2 space-y-1 group hover:bg-blue-500/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground break-words leading-relaxed">
                        {msg.body}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
                        <Clock className="h-2.5 w-2.5" />
                        <time>
                          {format(new Date(msg.send_at), "dd MMM HH:mm", {
                            locale: ptBR,
                          })}
                        </time>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={() => handleCancel(msg.id)}
                      disabled={cancelling === msg.id}
                    >
                      {cancelling === msg.id ? (
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

          {/* Enviadas */}
          {sentMessages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">
                Enviadas ({sentMessages.length})
              </p>
              {sentMessages.slice(0, 2).map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg bg-muted/40 px-3 py-1.5"
                >
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {msg.body}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(msg.sent_at!), "dd MMM HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
              ))}
              {sentMessages.length > 2 && (
                <p className="text-[10px] text-muted-foreground px-1">
                  +{sentMessages.length - 2} mais
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
