import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Mail,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import {
  deleteHistoryItem,
  getDocumentDownload,
  getHistory,
} from "@/server/functions/get-history";
import type { HistoryPipelineCounts, HistoryRow } from "@/server/functions/get-history";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { Input, PageActionBar, PageHero, PageSection } from "@caliber/ui-kit";
import { setApplicationOutcome, type ApplicationOutcome } from "@/server/functions/toggle-applied";

const PAGE_SIZE = 20;

type HistorySearchParams = {
  page: number;
  query: string;
};

export const Route = createFileRoute("/history")({
  beforeLoad: ({ context, location }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) requireLoginRedirect(location, "analysis history");
  },
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(1, Number(search.page) || 1),
    query: String(search.query ?? ""),
  }),
  loaderDeps: ({ search }: { search: HistorySearchParams }) => search,
  loader: async ({ deps }: { deps: HistorySearchParams }) =>
    getHistory({ data: { page: deps.page, pageSize: PAGE_SIZE, query: deps.query } }),
  component: HistoryPage,
  pendingComponent: HistoryLoading,
});

type Row = HistoryRow;
type WorkflowStatusKey = "analyzed" | "prepped" | "applied" | "interviewed" | "hired";

const workflowSteps: Array<{
  key: WorkflowStatusKey;
  label: string;
  note: string;
  dotClass: string;
  pillClass: string;
}> = [
  {
    key: "analyzed",
    label: "Analyzed",
    note: "Fit reviewed",
    dotClass: "bg-slate-400",
    pillClass: "border-slate-200 bg-slate-50 text-slate-600",
  },
  {
    key: "prepped",
    label: "Prepped",
    note: "Docs generated",
    dotClass: "bg-violet-500",
    pillClass: "border-violet-100 bg-violet-50 text-violet-700",
  },
  {
    key: "applied",
    label: "Applied",
    note: "Submitted",
    dotClass: "bg-emerald-500",
    pillClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
  },
  {
    key: "interviewed",
    label: "Interviewed",
    note: "Conversation started",
    dotClass: "bg-sky-500",
    pillClass: "border-sky-100 bg-sky-50 text-sky-700",
  },
  {
    key: "hired",
    label: "Hired",
    note: "Offer won",
    dotClass: "bg-amber-500",
    pillClass: "border-amber-100 bg-amber-50 text-amber-700",
  },
];

async function triggerDownload(r2Key: string, fileName: string) {
  const result = await getDocumentDownload({ data: { r2Key } });
  const blob = new Blob([new Uint8Array(result.data)], { type: result.contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function HistoryPage() {
  const loaderData = Route.useLoaderData();
  const { page, query } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const [inputValue, setInputValue] = useState(query);
  const [rows, setRows] = useState(loaderData.rows);
  const [total, setTotal] = useState(loaderData.total);
  const [totalApplied, setTotalApplied] = useState(loaderData.totalApplied);
  const [totalPursued, setTotalPursued] = useState(loaderData.totalPursued);
  const [totalDocuments, setTotalDocuments] = useState(loaderData.totalDocuments);
  const [pipelineCounts, setPipelineCounts] = useState(loaderData.pipelineCounts);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [updatingOutcomeId, setUpdatingOutcomeId] = useState<number | null>(null);
  const [confirmingRow, setConfirmingRow] = useState<Row | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const didMount = useRef(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setRows(loaderData.rows);
    setTotal(loaderData.total);
    setTotalApplied(loaderData.totalApplied);
    setTotalPursued(loaderData.totalPursued);
    setTotalDocuments(loaderData.totalDocuments);
    setPipelineCounts(loaderData.pipelineCounts);
  }, [loaderData]);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (inputValue.trim() !== query) {
        navigate({
          to: "/history",
          search: (prev) => ({ ...prev, query: inputValue.trim(), page: 1 }),
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue, navigate, query]);

  const avgScore = useMemo(() =>
    rows.length
      ? Math.round((rows.reduce((s, r) => s + r.matchScore, 0) / rows.length) * 10) / 10
      : 0,
  [rows]);

  async function handleDownload(r2Key: string, fileName: string) {
    setDownloadingKey(r2Key);
    try { await triggerDownload(r2Key, fileName); }
    finally { setDownloadingKey(null); }
  }

  async function handleApplicationOutcomeChange(id: number, status: ApplicationOutcome) {
    const currentRow = rows.find((r) => r.id === id);
    if (!currentRow) return;

    const previousRows = rows;
    const wasApplied = currentRow.applied;
    const nextRow = {
      ...currentRow,
      applied: status !== null,
      applicationStatus: status,
      appliedAt: status ? new Date().toISOString() : null,
    };
    const from = getWorkflowStatus(currentRow).key;
    const to = getWorkflowStatus(nextRow).key;

    setUpdatingOutcomeId(id);
    setRows((prev) => prev.map((row) => (row.id === id ? nextRow : row)));
    setPipelineCounts((prev) => movePipelineCount(prev, from, to));
    setTotalApplied((prev) => Math.max(0, prev + (!wasApplied && status ? 1 : wasApplied && !status ? -1 : 0)));

    try {
      const result = await setApplicationOutcome({ data: { id, status } });
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                applied: result.applied,
                applicationStatus: result.applicationStatus,
                appliedAt: result.appliedAt,
              }
            : row,
        ),
      );
      await router.invalidate();
    } catch (error) {
      setRows(previousRows);
      setPipelineCounts((prev) => movePipelineCount(prev, to, from));
      setTotalApplied((prev) => Math.max(0, prev + (!wasApplied && status ? -1 : wasApplied && !status ? 1 : 0)));
      alert(error instanceof Error ? error.message : "Unable to update application status.");
    } finally {
      setUpdatingOutcomeId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmingRow) return;
    setDeletingId(confirmingRow.id);
    try {
      await deleteHistoryItem({ data: { id: confirmingRow.id } });
      const nextRows = rows.filter((r) => r.id !== confirmingRow.id);
      const nextTotal = Math.max(total - 1, 0);
      setRows(nextRows);
      setTotal(nextTotal);
      setConfirmingRow(null);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > nextTotalPages) {
        await navigate({ to: "/history", search: { page: nextTotalPages, query } });
      } else if (nextRows.length === 0 && page > 1) {
        await navigate({ to: "/history", search: { page: page - 1, query } });
      } else {
        await router.invalidate();
      }
    } finally {
      setDeletingId(null);
    }
  }

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "jobTitle",
        header: ({ column }) => (
          <SortHeader
            label="Position"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <Link
              to="/analyze/$id"
              params={{ id: String(row.original.id) }}
              className="font-semibold text-slate-900 hover:text-primary-600 transition-colors line-clamp-1"
            >
              {row.original.jobTitle}
            </Link>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{row.original.company}</p>
          </div>
        ),
        size: 260,
      },
      {
        accessorKey: "matchScore",
        header: ({ column }) => (
          <SortHeader
            label="Match"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => <ScorePill score={getValue() as number} />,
        size: 80,
      },
      {
        accessorKey: "pursue",
        header: "Status",
        cell: ({ row }) => (
          <StatusPill row={row.original} />
        ),
        size: 132,
      },
      {
        accessorKey: "applicationStatus",
        header: "Outcome",
        cell: ({ row }) => (
          <ApplicationOutcomeSelect
            value={row.original.applicationStatus}
            pending={updatingOutcomeId === row.original.id}
            onChange={(status) => handleApplicationOutcomeChange(row.original.id, status)}
          />
        ),
        size: 150,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <SortHeader
            label="Analyzed"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => (
          <span className="text-sm text-slate-500">{formatDate(getValue() as string)}</span>
        ),
        size: 110,
      },
      {
        id: "documents",
        header: "Documents",
        cell: ({ row }) => {
          const resumeDoc = row.original.documents.find((d) => d.docType === "resume");
          const coverDoc = row.original.documents.find((d) => d.docType === "cover_letter");
          return (
            <div className="flex flex-col gap-1">
              {resumeDoc ? (
                <DocButton
                  icon={downloadingKey === resumeDoc.r2Key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileText className="h-3.5 w-3.5" />}
                  label="Resume"
                  onClick={() => handleDownload(resumeDoc.r2Key, resumeDoc.fileName || "resume.pdf")}
                />
              ) : (
                <DocButtonDisabled label="Resume" />
              )}
              {coverDoc ? (
                <DocButton
                  icon={downloadingKey === coverDoc.r2Key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Mail className="h-3.5 w-3.5" />}
                  label="Cover"
                  onClick={() => handleDownload(coverDoc.r2Key, coverDoc.fileName || "cover-letter.pdf")}
                />
              ) : (
                <DocButtonDisabled label="Cover" />
              )}
            </div>
          );
        },
        size: 92,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <a
              href={`/analyze/${row.original.id}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
              title="Open analysis"
            >
              <Search className="h-3.5 w-3.5" />
            </a>
            {row.original.jobUrl && (
              <a
                href={row.original.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
                title="View job description"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={() => setConfirmingRow(row.original)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              title="Delete analysis"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        size: 100,
      },
    ],
    [downloadingKey, rows, updatingOutcomeId]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Analysis History"
        icon={<History className="h-3.5 w-3.5" />}
        title="Review past analyses"
        description="Revisit saved analyses, reopen the original job description, and grab the resume or cover letter tied to each role."
        stats={[
          { label: "Total Saved", value: String(total) },
          { label: "Applied", value: String(totalApplied) },
          { label: "Avg Match", value: `${avgScore}%` },
        ]}
        actions={
          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            <Zap className="h-4 w-4" />
            Analyze a Job
          </Link>
        }
      />

      {/* Summary tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Pursue Recommendations"
          value={String(totalPursued)}
          note="Total roles recommended to pursue"
          tone="emerald"
        />
        <MetricTile
          label="Applications Logged"
          value={String(totalApplied)}
          note="Total roles marked as applied"
          tone="sky"
        />
        <MetricTile
          label="Documents Available"
          value={String(totalDocuments)}
          note="Total resume and cover letter files"
          tone="violet"
        />
      </div>
      <div className="flex justify-end">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          See more metrics
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Application Pipeline</h2>
            <p className="text-xs text-slate-500">Status is derived from generated documents and the selected application outcome.</p>
          </div>
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 sm:inline-flex">
            {total} total
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <div
              key={step.key}
              className={`rounded-xl border px-3 py-3 ${step.pillClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                  <span className={`h-2 w-2 rounded-full ${step.dotClass}`} />
                  {step.label}
                </span>
                <span className="text-lg font-bold">{pipelineCounts[step.key]}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] opacity-80">
                <span>{step.note}</span>
                <span>Step {index + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Table */}
      {rows.length === 0 ? (
        <PageSection>
          <HistorySearchBar
            value={inputValue}
            query={query}
            total={total}
            onChange={setInputValue}
            onClear={() => setInputValue("")}
          />
          <div className="flex flex-col items-center py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <History className="h-6 w-6 text-slate-500" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-900">No analyses yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {query
                ? "No saved analyses match that search."
                : "Start by analyzing a job posting. Your saved analyses, generated resumes, and cover letters will show up here."}
            </p>
            <Link
              to="/analyze"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Zap className="h-4 w-4" />
              Analyze a Job
            </Link>
          </div>
        </PageSection>
      ) : (
        <PageSection
          title={`Analyses — page ${page} of ${totalPages}`}
          description={query ? `${total} matching saved analyses` : `${total} total saved analyses`}
        >
          <HistorySearchBar
            value={inputValue}
            query={query}
            total={total}
            onChange={setInputValue}
            onClear={() => setInputValue("")}
          />
          <div className="overflow-x-auto -mx-6">
            <table className="w-full min-w-[720px]">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-slate-100">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100/70 transition-colors hover:bg-slate-50/60 ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-4 py-3 align-middle"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageSection>
      )}

      {totalPages > 1 && (
        <PageActionBar>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ to: "/history", search: { page: page - 1, query } })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => navigate({ to: "/history", search: { page: page + 1, query } })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </PageActionBar>
      )}

      {confirmingRow && (
        <ConfirmDeleteModal
          row={confirmingRow}
          deleting={deletingId === confirmingRow.id}
          onCancel={() => { if (deletingId !== confirmingRow.id) setConfirmingRow(null); }}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SortHeader({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 uppercase tracking-wider text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 transition-opacity ${sorted ? "opacity-100 text-primary-500" : "opacity-40"}`}
      />
    </button>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : score >= 60
        ? "bg-sky-50 text-sky-700 border-sky-100"
        : "bg-amber-50 text-amber-700 border-amber-100";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-semibold ${tone}`}>
      {score}%
    </span>
  );
}

function HistorySearchBar({
  value,
  query,
  total,
  onChange,
  onClear,
}: {
  value: string;
  query: string;
  total: number;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-1 focus-within:ring-primary-300">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <Input
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          placeholder="Search by title, company, status, or outcome"
          className="h-auto border-0 bg-transparent px-2 py-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-xs font-medium text-slate-500">
          {query ? `${total} match${total === 1 ? "" : "es"}` : "Search all analyses"}
        </span>
        {query ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getWorkflowStatus(row: Pick<Row, "applied" | "applicationStatus" | "documents">) {
  const hasDocs = row.documents.length > 0;
  if (row.applicationStatus === "Hired") return workflowSteps.find((step) => step.key === "hired")!;
  if (row.applicationStatus === "Interviewed") return workflowSteps.find((step) => step.key === "interviewed")!;
  if (row.applicationStatus === "Applied" || row.applied) return workflowSteps.find((step) => step.key === "applied")!;
  if (hasDocs) return workflowSteps.find((step) => step.key === "prepped")!;
  return workflowSteps.find((step) => step.key === "analyzed")!;
}

function movePipelineCount(
  counts: HistoryPipelineCounts,
  from: WorkflowStatusKey,
  to: WorkflowStatusKey,
): HistoryPipelineCounts {
  if (from === to) return counts;
  return (
    {
      ...counts,
      [from]: Math.max(0, counts[from] - 1),
      [to]: counts[to] + 1,
    }
  );
}

function StatusPill({ row }: { row: Row }) {
  const status = getWorkflowStatus(row);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.pillClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
      {status.label}
    </span>
  );
}

function ApplicationOutcomeSelect({
  value,
  pending,
  onChange,
}: {
  value: ApplicationOutcome;
  pending: boolean;
  onChange: (status: ApplicationOutcome) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value ?? ""}
        onChange={(event) => onChange((event.target.value || null) as ApplicationOutcome)}
        disabled={pending}
        className="h-8 min-w-[132px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        aria-label="Application outcome"
      >
        <option value="">Track outcome</option>
        <option value="Applied">Applied</option>
        <option value="Interviewed">Interviewed</option>
        <option value="Hired">Hired</option>
      </select>
      {pending ? (
        <Loader2 className="pointer-events-none absolute right-2 h-3.5 w-3.5 animate-spin text-slate-400" />
      ) : null}
    </div>
  );
}

function DocButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
    >
      {icon}
      {label}
    </button>
  );
}

function DocButtonDisabled({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 text-[11px] font-medium text-slate-300">
      <FileText className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

const toneMap = {
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
  sky: "bg-sky-50 border-sky-100 text-sky-700",
  violet: "bg-violet-50 border-violet-100 text-violet-700",
} as const;

function MetricTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: keyof typeof toneMap;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.84)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.7)",
        boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
      }}
    >
      <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneMap[tone]}`}>
        {label}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function ConfirmDeleteModal({
  row,
  deleting,
  onCancel,
  onConfirm,
}: {
  row: Row;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Delete this analysis?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This will remove{" "}
          <span className="font-medium text-slate-900">{row.jobTitle}</span> from your history,
          along with any saved resume or cover letter.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HistoryLoading() {
  return (
    <div className="spx-page space-y-6 animate-pulse">
      <div className="h-36 rounded-2xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-muted" />
    </div>
  );
}
