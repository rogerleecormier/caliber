// Shared score color/gradient utilities used by JobCard and JobDetailModal

export function getScoreColor(score: number): string {
    if (score >= 80) return "text-emerald-700 bg-emerald-50";
    if (score >= 65) return "text-green-700 bg-green-50";
    if (score >= 50) return "text-amber-700 bg-amber-50";
    return "text-red-700 bg-red-50";
}

export function getBarColor(score: number): string {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 65) return "bg-green-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-red-400";
}

export function getMasterScoreGradient(score: number): string {
    if (score >= 80) return "from-emerald-500 to-green-600";
    if (score >= 65) return "from-green-500 to-emerald-600";
    if (score >= 50) return "from-amber-400 to-amber-600";
    return "from-red-400 to-red-500";
}

export function getScoreBorderColor(score: number): string {
    if (score >= 80) return "border-emerald-200";
    if (score >= 65) return "border-green-200";
    if (score >= 50) return "border-amber-200";
    return "border-red-200";
}
