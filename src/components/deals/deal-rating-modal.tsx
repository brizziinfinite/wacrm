"use client";

import { useState } from "react";
import { useDealRatings } from "@/hooks/use-deal-ratings";
import { Button } from "@/components/ui/button";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DealRatingModalProps {
  dealId: string;
  contactId: string;
  userId: string;
  accountId: string;
  onClose: () => void;
}

export function DealRatingModal({
  dealId,
  contactId,
  userId,
  accountId,
  onClose,
}: DealRatingModalProps) {
  const { addRating } = useDealRatings();
  const [rate, setRate] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (rate === 0) {
      toast.error("Selecione uma avaliação");
      return;
    }

    setSaving(true);
    try {
      await addRating(dealId, contactId, userId, accountId, rate, comment);
      toast.success("Avaliação registrada");
      onClose();
    } catch (err) {
      console.error("Erro ao salvar avaliação:", err);
      toast.error("Erro ao salvar avaliação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Como foi o atendimento?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sua avaliação nos ajuda a melhorar
          </p>
        </div>

        {/* Stars */}
        <div className="flex justify-center gap-3 py-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRate(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className="h-8 w-8"
                fill={star <= rate ? "#fbbf24" : "none"}
                stroke={star <= rate ? "#fbbf24" : "#6b7280"}
              />
            </button>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Deixe um comentário (opcional)..."
          rows={3}
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 resize-none"
        />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Pular
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={saving || rate === 0}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Enviar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
