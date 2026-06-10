import { useState, useCallback } from 'react';
import {
  Badge,
  Button,
  PrimaryCard,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@caliber/ui-kit';
import {
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  MapPin,
  DollarSign,
  Briefcase,
  Clock,
  Sparkles,
} from 'lucide-react';

export interface AggregatedJobCardJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  source: 'adzuna' | 'jooble' | 'remotive';
  postedDate?: Date | string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  description?: string;
  jobType?: 'full-time' | 'part-time' | 'contract' | 'temporary';
  remote?: boolean;
}

interface AggregatedJobCardProps {
  job: AggregatedJobCardJob;
  onSave?: (job: AggregatedJobCardJob) => Promise<void>;
  isSaved?: boolean;
  onAnalyze?: (job: AggregatedJobCardJob) => Promise<void>;
  isAnalyzing?: boolean;
}

const SOURCE_ICONS: Record<'adzuna' | 'jooble' | 'remotive', string> = {
  adzuna: '🔷',
  jooble: '🔶',
  remotive: '🌍',
};

const SOURCE_COLORS: Record<'adzuna' | 'jooble' | 'remotive', string> = {
  adzuna: 'bg-blue-50 border-blue-200',
  jooble: 'bg-orange-50 border-orange-200',
  remotive: 'bg-green-50 border-green-200',
};

const JOB_TYPE_ICONS: Record<string, React.ReactNode> = {
  'full-time': <Briefcase className="h-3.5 w-3.5" />,
  'part-time': <Clock className="h-3.5 w-3.5" />,
  contract: <Briefcase className="h-3.5 w-3.5" />,
  temporary: <Clock className="h-3.5 w-3.5" />,
};

export function AggregatedJobCard({
  job,
  onSave,
  isSaved = false,
  onAnalyze,
  isAnalyzing = false,
}: AggregatedJobCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(job);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save job');
    } finally {
      setIsSaving(false);
    }
  }, [job, onSave]);

  const handleAnalyze = useCallback(async () => {
    if (!onAnalyze) return;

    try {
      await onAnalyze(job);
    } catch (error) {
      console.error('Analysis error:', error);
    }
  }, [job, onAnalyze]);

  const formattedDate = job.postedDate
    ? new Date(job.postedDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <PrimaryCard className={`p-4 ${SOURCE_COLORS[job.source]}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base leading-tight line-clamp-2">
            {job.title}
          </h3>
          <p className="text-sm text-gray-700 font-medium">{job.company}</p>
        </div>

        {/* Source Badge */}
        <Badge variant="secondary" className="flex-shrink-0">
          <span className="mr-1">{SOURCE_ICONS[job.source]}</span>
          {job.source}
        </Badge>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-gray-600">
        {/* Location */}
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate" title={job.location}>
            {job.location}
          </span>
        </div>

        {/* Job Type */}
        {job.jobType && (
          <div className="flex items-center gap-1">
            {JOB_TYPE_ICONS[job.jobType] || <Briefcase className="h-3.5 w-3.5" />}
            <span className="capitalize">{job.jobType}</span>
          </div>
        )}

        {/* Salary */}
        {job.salary && (
          <div className="flex items-center gap-1 col-span-2">
            <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">
              ${job.salary.min?.toLocaleString()}-${job.salary.max?.toLocaleString()}{' '}
              {job.salary.currency || 'USD'}
            </span>
          </div>
        )}

        {/* Posted Date */}
        {formattedDate && (
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{formattedDate}</span>
          </div>
        )}
      </div>

      {/* Description Preview */}
      {job.description && (
        <div className="mb-3">
          <p className="text-xs text-gray-600 line-clamp-2">
            {job.description}
          </p>
        </div>
      )}

      {/* Error Message */}
      {saveError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {saveError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          asChild
        >
          <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            View Job
          </a>
        </Button>

        {onSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isSaved}
                className="px-3"
              >
                {isSaved ? (
                  <BookmarkCheck className="h-4 w-4 text-blue-600" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSaved ? 'Already saved' : 'Save for later'}
            </TooltipContent>
          </Tooltip>
        )}

        {onAnalyze && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="px-3"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
      </div>
    </PrimaryCard>
  );
}
