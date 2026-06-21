import { ExternalLink, Sparkles, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { JobResultCardJob, JobStatus } from "./job-result-card";
import { getScoreBorderColor } from "@/lib/scoreUtils";
import { FlagToggle } from "@/components/features/flag-toggle";
import { WorkTypeBadge } from "@/components/ui/work-type-badge";
import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Checkbox,
} from "@caliber/ui-kit";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

interface JobTableViewProps {
  jobs: JobResultCardJob[];
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onSelectAll: (checked: boolean) => void;
  onStatusChange: (id: number, status: JobStatus) => void;
  statusOptions: JobStatus[];
  statusPending: number | null;
  onAnalyze: (jobUrl: string) => void;
  analyzedJobIds: Set<number>;
}

function formatScore(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function getScoreObj(job: JobResultCardJob) {
  if (job.score) return job.score;
  const hasAnyScore = job.masterScore != null || job.atsScore != null || job.careerScore != null || job.outlookScore != null;
  if (!hasAnyScore) return null;
  return {
    atsScore: job.atsScore,
    careerScore: job.careerScore,
    outlookScore: job.outlookScore,
    masterScore: job.masterScore,
    atsReason: job.atsReason ?? undefined,
    isUnicorn: job.isUnicorn === true || job.isUnicorn === 1,
    unicornReason: job.unicornReason ?? null,
  };
}

export function JobTableView({
  jobs,
  selectedIds,
  onSelect,
  onSelectAll,
  onStatusChange,
  statusOptions,
  statusPending,
  onAnalyze,
  analyzedJobIds,
}: JobTableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const allSelected = jobs.length > 0 && jobs.every((job) => job.id && selectedIds.has(job.id));

  const columns: ColumnDef<JobResultCardJob>[] = [
    {
      id: "select",
      size: 40,
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => onSelectAll(!!checked)}
          aria-label="Select all jobs"
        />
      ),
      cell: ({ row }) =>
        row.original.id ? (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => onSelect(row.original.id!)}
            aria-label={`Select ${row.original.title}`}
          />
        ) : null,
      enableSorting: false,
    },
    {
      accessorKey: "title",
      header: "Position",
      cell: ({ row }) => {
        const job = row.original;
        const dateStr = job.postDateText && job.postDateText !== "Invalid Date"
          ? (() => { const d = new Date(job.postDateText!); return !isNaN(d.getTime()) ? d.toLocaleDateString() : job.postDateText; })()
          : null;
        return (
          <div>
            <div className="font-semibold text-slate-900 leading-tight">{job.title}</div>
            {dateStr && <div className="text-xs text-slate-400 mt-0.5">{dateStr}</div>}
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "company",
      header: "Company",
      cell: ({ row }) => {
        const job = row.original;
        const workType = job.location?.toLowerCase().includes("remote")
          ? "remote"
          : job.location?.toLowerCase().includes("hybrid")
          ? "hybrid"
          : undefined;
        return (
          <div>
            <div className="font-medium text-slate-700 leading-tight">{job.company}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {workType ? (
                <WorkTypeBadge workType={workType} />
              ) : job.location ? (
                <span className="text-xs text-slate-400 truncate max-w-[160px]">{job.location}</span>
              ) : null}
            </div>
          </div>
        );
      },
      enableSorting: true,
    },
    {
      id: "masterScore",
      accessorFn: (row) => getScoreObj(row)?.masterScore ?? -1,
      header: "Score",
      size: 80,
      cell: ({ row }) => {
        const score = getScoreObj(row.original);
        if (!score?.masterScore) return <span className="text-xs text-slate-300">—</span>;
        return (
          <div className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold border ${getScoreBorderColor(score.masterScore)}`}>
            {formatScore(score.masterScore)}
          </div>
        );
      },
      enableSorting: true,
    },
    {
      id: "status",
      header: "Status",
      size: 140,
      cell: ({ row }) => {
        const job = row.original;
        if (!job.id) return null;
        return (
          <select
            value={(job.status ?? "Analyzed") as JobStatus}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onStatusChange(job.id!, e.target.value as JobStatus)}
            disabled={statusPending === job.id}
            className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-orange-400"
            aria-label={`Status for ${job.title}`}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        );
      },
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      size: 90,
      cell: ({ row }) => {
        const job = row.original;
        const isAnalyzed = job.id ? analyzedJobIds.has(job.id) : false;
        const hasUrl = !!(job.sourceUrl && job.sourceUrl !== "text-input");
        return (
          <div className="flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => onAnalyze(job.sourceUrl)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs transition ${
                isAnalyzed
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
              title={isAnalyzed ? "View analysis" : "Analyze job"}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            {hasUrl ? (
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-orange-600 text-white text-xs transition hover:bg-orange-700"
                title="Open job posting"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-300 cursor-not-allowed"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            {job.id != null && (
              <FlagToggle jobId={job.id} initialFlagged={!!job.isFlagged} />
            )}
          </div>
        );
      },
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-b border-slate-200 hover:bg-transparent">
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="h-10">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-20 text-center text-sm text-slate-400">
                No jobs to display
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
