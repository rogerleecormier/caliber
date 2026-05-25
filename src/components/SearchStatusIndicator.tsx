import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { useSearchStatusContext } from "@/hooks/useSearchStatus";

export function SearchStatusIndicator() {
  const { getLatestSearch, clearSearch } = useSearchStatusContext();
  const [latestSearch, setLatestSearch] = useState(getLatestSearch());
  const [isVisible, setIsVisible] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const latest = getLatestSearch();
    setLatestSearch(latest);

    if (latest) {
      setIsVisible(true);

      // Auto-hide after 5 seconds if completed
      if (latest.status === "completed" || latest.status === "error") {
        if (autoHideTimer) clearTimeout(autoHideTimer);
        const timer = setTimeout(() => {
          setIsVisible(false);
          clearSearch(latest.id);
        }, 5000);
        setAutoHideTimer(timer);
      }
    }
  }, [getLatestSearch, clearSearch]);

  if (!isVisible || !latestSearch) {
    return null;
  }

  const getDuration = () => {
    if (!latestSearch.startTime) return "";
    const endTime = latestSearch.endTime || Date.now();
    const seconds = Math.floor((endTime - latestSearch.startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const getStatusColor = () => {
    switch (latestSearch.status) {
      case "running":
        return "bg-blue-50 border-blue-200";
      case "completed":
        return "bg-emerald-50 border-emerald-200";
      case "error":
        return "bg-red-50 border-red-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  const getStatusTextColor = () => {
    switch (latestSearch.status) {
      case "running":
        return "text-blue-900";
      case "completed":
        return "text-emerald-900";
      case "error":
        return "text-red-900";
      default:
        return "text-slate-900";
    }
  };

  const getStatusIcon = () => {
    switch (latestSearch.status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`fixed bottom-6 right-6 max-w-sm rounded-lg border shadow-lg transition-all z-50 ${getStatusColor()}`}
    >
      <div className={`flex items-start justify-between gap-3 p-4 ${getStatusTextColor()}`}>
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <p className="text-sm font-semibold">{latestSearch.message}</p>
            <div className="mt-1 space-y-1">
              {latestSearch.jobsFound > 0 && (
                <p className="text-xs opacity-75">
                  {latestSearch.jobsFound} job{latestSearch.jobsFound !== 1 ? "s" : ""} found
                </p>
              )}
              {getDuration() && (
                <p className="text-xs opacity-75">
                  {latestSearch.status === "running" ? "Duration: " : "Completed in "}
                  {getDuration()}
                </p>
              )}
              {latestSearch.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {latestSearch.errors.map((error, i) => (
                    <p key={i} className="text-xs">
                      • {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {(latestSearch.status === "completed" || latestSearch.status === "error") && (
          <button
            type="button"
            onClick={() => {
              setIsVisible(false);
              clearSearch(latestSearch.id);
            }}
            className="shrink-0 text-current opacity-50 transition hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
