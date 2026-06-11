import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@caliber/ui-kit";
import { Star, Loader2 } from "lucide-react";
import { setPipelineJobFlag } from "@/server/functions/jobs-pipeline";

interface FlagToggleProps {
  jobId: number;
  initialFlagged: boolean;
  onFlagChange?: (isFlagged: boolean) => void;
}

export function FlagToggle({ jobId, initialFlagged, onFlagChange }: FlagToggleProps) {
  const [isFlagged, setIsFlagged] = useState(initialFlagged);

  useEffect(() => {
    setIsFlagged(initialFlagged);
  }, [jobId, initialFlagged]);

  const { mutate, isPending } = useMutation({
    mutationFn: (next: boolean) =>
      setPipelineJobFlag({ data: { id: jobId, isFlagged: next } }),
    onMutate: (next) => {
      setIsFlagged(next);
      onFlagChange?.(next);
      return { previous: !next };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) {
        setIsFlagged(ctx.previous);
        onFlagChange?.(ctx.previous);
      }
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => mutate(!isFlagged)}
      disabled={isPending}
      aria-label={isFlagged ? "Unflag job" : "Flag job"}
      className={isFlagged ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Star className={`h-4 w-4 ${isFlagged ? "fill-current" : ""}`} />
      )}
    </Button>
  );
}
