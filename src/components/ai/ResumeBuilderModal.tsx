import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, FileText, AlertTriangle, X, UserCheck, FileSignature, Search, LineChart } from "lucide-react";
import type { JobWithCategory } from "../../lib/search-utils";
import { loadUserProfile } from "./SkillsModal";

interface ResumeBuilderModalProps {
    job: JobWithCategory;
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'resume' | 'coverLetter' | 'gapAnalysis' | 'careerAnalysis';

interface GeneratedResult {
    resume: string;
    coverLetter: string;
    gapAnalysis: string;
    careerAnalysis: string;
}

function ResumeSkeleton() {
    return (
        <div className="flex-1 overflow-y-auto p-8 space-y-8 animate-pulse bg-white">
            {/* Header */}
            <div className="space-y-4 border-b border-slate-100 pb-6">
                <div className="h-8 bg-slate-200 rounded-lg w-1/3" />
                <div className="h-4 bg-slate-100 rounded-lg w-1/4" />
            </div>

            {/* Summary */}
            <div className="space-y-3">
                <div className="h-5 bg-slate-200 rounded-md w-32" />
                <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-4/5" />
                </div>
            </div>

            {/* Experience */}
            <div className="space-y-6">
                <div className="h-5 bg-slate-200 rounded-md w-32" />

                {[1, 2].map((i) => (
                    <div key={i} className="space-y-3 pl-4 border-l-2 border-slate-50">
                        <div className="flex justify-between items-start">
                            <div className="space-y-2 w-1/3">
                                <div className="h-4 bg-slate-200 rounded w-3/4" />
                                <div className="h-3 bg-slate-100 rounded w-1/2" />
                            </div>
                            <div className="h-3 bg-slate-100 rounded w-24" />
                        </div>
                        <div className="space-y-2 pt-1">
                            <div className="h-2.5 bg-slate-50 rounded w-11/12" />
                            <div className="h-2.5 bg-slate-50 rounded w-10/12" />
                            <div className="h-2.5 bg-slate-50 rounded w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ResumeBuilderModal({ job, isOpen, onClose }: ResumeBuilderModalProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GeneratedResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [userResume, setUserResume] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('resume');

    useEffect(() => {
        if (isOpen) {
            const profile = loadUserProfile();
            if (profile?.resume) {
                setUserResume(profile.resume);
            }

            // Auto-trigger generation if we don't have a result yet and aren't loading
            if (!result && !loading && !error) {
                // Pass the resume directly to avoid stale state closure
                handleGenerate(profile?.resume || null);
            }
        } else {
            // Optional: Reset state on close if desired, but user might want to keep it.
            // keeping it for now allows them to close/reopen and see result.
            // If we want to reset every time:
            // setResult(null); setError(null); setLoading(false);
        }
    }, [isOpen]);

    const handleGenerate = async (resumeOverride?: string | null) => {
        setLoading(true);
        setError(null);
        setResult(null);
        setActiveTab('resume');

        try {
            const response = await fetch('/api/ai/generate-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobTitle: job.title,
                    jobCompany: job.company,
                    jobDescription: job.description,
                    userResume: resumeOverride !== undefined ? resumeOverride : userResume
                })
            });

            const data = await response.json() as any;

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate resume');
            }

            if (data.data) {
                // Handle different response shapes safely
                if (typeof data.data === 'string') {
                    // Fallback for single string response
                    setResult({
                        resume: data.data,
                        coverLetter: "",
                        gapAnalysis: "",
                        careerAnalysis: ""
                    });
                } else if (typeof data.data === 'object' && data.data !== null) {
                    // Ensure all fields are strings (TS guard)
                    setResult({
                        resume: typeof data.data.resume === 'string' ? data.data.resume : JSON.stringify(data.data.resume || ""),
                        coverLetter: typeof data.data.coverLetter === 'string' ? data.data.coverLetter : (data.data.coverLetter ? JSON.stringify(data.data.coverLetter) : ""),
                        gapAnalysis: typeof data.data.gapAnalysis === 'string' ? data.data.gapAnalysis : (data.data.gapAnalysis ? JSON.stringify(data.data.gapAnalysis) : ""),
                        careerAnalysis: typeof data.data.careerAnalysis === 'string' ? data.data.careerAnalysis : (data.data.careerAnalysis ? JSON.stringify(data.data.careerAnalysis) : "")
                    });
                }
            }

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    const stripMarkdown = (text: string): string => {
        if (!text) return "";
        return text
            .replace(/^#+\s+/gm, '') // Remove headers
            .replace(/^[-*•]\s+/gm, '') // Remove bullets
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
            .replace(/`{3}[\s\S]*?`{3}/g, '') // Remove code blocks
            .replace(/`(.+?)`/g, '$1') // Remove inline code
            .replace(/\n{3,}/g, '\n\n') // Normalize newlines
            .trim();
    };

    const handleCopy = () => {
        const rawText = activeTab === 'resume' ? result?.resume : (activeTab === 'coverLetter' ? result?.coverLetter : '');
        if (rawText) {
            const cleanText = stripMarkdown(rawText);
            navigator.clipboard.writeText(cleanText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) return null;

    const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
        { id: 'resume', label: 'Resume', icon: FileText },
        { id: 'coverLetter', label: 'Cover Letter', icon: FileSignature },
        { id: 'gapAnalysis', label: 'Gap Analysis', icon: Search },
        { id: 'careerAnalysis', label: 'Career Impact', icon: LineChart },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-start p-6 border-b-2 border-slate-200 gap-4">
                    <div className="flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <FileText className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 leading-tight">Tailor Resume</h2>
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                    Targeting <span className="font-semibold text-slate-700">{job.title}</span> at {job.company}
                                </p>
                            </div>
                        </div>
                        {userResume && (
                            <div className="mt-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                                    <UserCheck size={10} />
                                    Using your profile
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
                        aria-label="Close modal"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden min-h-[400px] flex flex-col bg-slate-50">
                    {/* Combined Loading/Idle State */}
                    {(!result && !error) && (
                        <div className="flex-1 flex flex-col min-h-0 container mx-auto max-w-4xl p-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                                {/* Status Banner */}
                                <div className="flex items-center gap-3 p-4 bg-amber-50 border-b border-amber-100">
                                    <Loader2 size={18} className="animate-spin text-amber-600 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-900">
                                            Tailoring Resume...
                                        </p>
                                        <p className="text-xs text-amber-700 mt-0.5">
                                            Analyzing job requirements and adapting your profile. This may take a few seconds.
                                        </p>
                                    </div>
                                </div>

                                {/* Skeleton Content */}
                                <ResumeSkeleton />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
                            <div className="p-4 bg-red-50 rounded-full border border-red-100">
                                <AlertTriangle className="w-12 h-12 text-red-600" />
                            </div>
                            <h3 className="font-semibold text-red-900">Generation Failed</h3>
                            <p className="text-red-600 text-center max-w-md">{error}</p>
                            <button
                                onClick={() => handleGenerate(null)}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {result && (
                        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 bg-white px-4 pt-4 gap-2 overflow-x-auto flex-shrink-0 relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0
                                            ${activeTab === tab.id
                                                ? 'border-amber-600 text-amber-700 bg-amber-50 rounded-t-lg'
                                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'}
                                        `}
                                    >
                                        <tab.icon size={16} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 p-6 overflow-hidden relative bg-slate-50 min-h-0 flex flex-col">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
                                    <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                                        <div className="flex items-center gap-2">
                                            {activeTab === 'gapAnalysis' || activeTab === 'careerAnalysis' ? (
                                                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                                                    <Search size={14} />
                                                    <span className="text-xs font-semibold uppercase tracking-wider">Strategic Insight</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2">Generated Content</span>
                                            )}
                                        </div>

                                        {(activeTab === 'resume' || activeTab === 'coverLetter') && (
                                            <button
                                                onClick={handleCopy}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm"
                                            >
                                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                {copied ? "Copied!" : "Copy Text"}
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8 min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
                                        <div className="text-slate-800 leading-relaxed pb-8">
                                            {(() => {
                                                const rawContent = typeof result[activeTab] === 'string' ? result[activeTab] : JSON.stringify(result[activeTab], null, 2);

                                                if (!rawContent) {
                                                    return (
                                                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                                            <p>No content generated for this section.</p>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div className="space-y-4">
                                                        {rawContent.split('\n').map((line, i) => {
                                                            const trimmed = line.trim();
                                                            if (!trimmed) return <div key={i} className="h-2" />; // Add visual spacing for empty lines

                                                            // Handle headers (lines starting with #)
                                                            if (trimmed.startsWith('#')) {
                                                                const level = trimmed.match(/^#+/)?.[0].length || 0;
                                                                const text = trimmed.replace(/^#+\s*/, '');
                                                                const styles = level === 1 ? "text-2xl border-b pb-2 mb-4" : level === 2 ? "text-xl mt-6 mb-3 text-slate-700" : "text-lg mt-4 mb-2 text-slate-600";

                                                                return <h4 key={i} className={`font-bold ${styles}`}>{text}</h4>;
                                                            }

                                                            // Handle bold headers (Role lines) that might have accidental bullets
                                                            const pureText = trimmed.replace(/^[-*•+]\s*/, '');
                                                            if (pureText.startsWith('**') && pureText.endsWith('**') && pureText.length > 20) {
                                                                return <div key={i} className="text-base font-bold text-slate-800 mt-5 mb-2">{pureText.replace(/\*\*/g, '')}</div>;
                                                            }

                                                            // Handle bullets (but exclude bold lines starting with **)
                                                            if ((trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•') || trimmed.startsWith('+')) && !trimmed.startsWith('**')) {
                                                                const text = trimmed.replace(/^[-*•+]\s*/, '');
                                                                // Simple bold parsing
                                                                const parts = text.split(/(\*\*.*?\*\*)/g);
                                                                return (
                                                                    <div key={i} className="flex gap-2 items-start ml-2">
                                                                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                                                                        <span>
                                                                            {parts.map((part, j) => {
                                                                                if (part.startsWith('**') && part.endsWith('**')) {
                                                                                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                                                                                }
                                                                                return part;
                                                                            })}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }

                                                            // Regular paragraphs with bold support
                                                            const parts = trimmed.split(/(\*\*.*?\*\*)/g);
                                                            return (
                                                                <p key={i} className="whitespace-pre-wrap">
                                                                    {parts.map((part, j) => {
                                                                        if (part.startsWith('**') && part.endsWith('**')) {
                                                                            return <strong key={j}>{part.slice(2, -2)}</strong>;
                                                                        }
                                                                        return part;
                                                                    })}
                                                                </p>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
