import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@caliber/ui-kit";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toggleApplied } from "@/server/functions/toggle-applied";

interface AppliedToggleProps {
  analysisId: number;
  initialApplied: boolean;
  onAppliedChange?: (applied: boolean) => void;
}

export function AppliedToggle({ analysisId, initialApplied, onAppliedChange }: AppliedToggleProps) {
  const [applied, setApplied] = useState(initialApplied);

  useEffect(() => {
    setApplied(initialApplied);
  }, [analysisId, initialApplied]);

  const { mutate, isPending } = useMutation({
    mutationFn: (next: boolean) =>
      toggleApplied({ data: { id: analysisId, applied: next } }),
    onMutate: (next) => {
      setApplied(next);
      onAppliedChange?.(next);
      return { previous: !next };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) {
        setApplied(ctx.previous);
        onAppliedChange?.(ctx.previous);
      }
    },
    onSuccess: (result) => {
      setApplied(result.applied);
    },
  });

  return (
    <Button
      variant={applied ? "default" : "outline"}
      size="sm"
      onClick={() => mutate(!applied)}
      disabled={isPending}
      className={applied ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white" : undefined}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : applied ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {applied ? "Applied" : "Mark as Applied"}
    </Button>
  );
}
