import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  FileText,
  Shield,
  Sparkles,
  Target,
  Wrench,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          style={{
            position: "absolute",
            top: "-15%",
            left: "-10%",
            width: "55vw",
            height: "55vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 65%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "0%",
            right: "-5%",
            width: "45vw",
            height: "45vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-20 px-4">
        <div className="spx-glass-card-strong spx-grid-spotlight mx-auto max-w-5xl rounded-[2rem] px-8 py-12 text-center sm:px-12 sm:py-14">
          <div className="spx-kicker mb-8">
            <Sparkles size={11} />
            Spearyx Platform
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-950 mb-6 tracking-tight leading-[1.05]">
            Clarity for{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #dc2626 0%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Modern Teams
            </span>
          </h1>

          <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto leading-relaxed">
            AI-powered tools that help project managers deliver results with precision — from RACI charts to career intelligence.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a
              href="https://caliber.rcormier.dev/tools"
              className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-semibold text-white transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                boxShadow: "0 4px 20px rgba(220,38,38,0.30)",
              }}
            >
              <Wrench size={16} />
              Explore Tools
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://caliber.rcormier.dev"
              className="spx-glass-card inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 font-semibold text-slate-900 transition-all duration-200 hover:-translate-y-0.5"
            >
              <Briefcase size={16} className="text-primary-600" />
              Find Jobs
            </a>
          </div>

        </div>
      </section>

      {/* ── Value props ── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">Why Spearyx</p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Built for how modern teams work</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Sparkles size={20} className="text-violet-600" />,
                iconBg: "bg-violet-50 border-violet-100",
                title: "AI-Powered Analysis",
                description:
                  "Advanced algorithms identify risks, optimize resource allocation, and score job-resume fit automatically.",
              },
              {
                icon: <Shield size={20} className="text-primary-600" />,
                iconBg: "bg-red-50 border-red-100",
                title: "Strategic Alignment",
                description:
                  "Every project deliverable maps to your organization's strategic goals — no ambiguity.",
              },
              {
                icon: <Zap size={20} className="text-amber-600" />,
                iconBg: "bg-amber-50 border-amber-100",
                title: "Real-time Intelligence",
                description:
                  "Live updates, smart scoring, and automated workflows keep your team and job search always current.",
              },
            ].map(({ icon, iconBg, title, description }) => (
              <div
                key={title}
                className="spx-glass-card rounded-2xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-4 ${iconBg}`}>
                  {icon}
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products ── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">Our Ecosystem</p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Everything you need to succeed</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Spearyx Tools */}
            <div
              className="spx-glass-card-strong relative overflow-hidden rounded-2xl border border-primary-200/70 border-t-[3px] border-t-primary-600 p-8 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div
                className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
                style={{ background: "radial-gradient(circle at top right, rgba(220,38,38,0.05) 0%, transparent 65%)" }}
              />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center mb-5">
                  <Wrench size={22} className="text-primary-600" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 mb-3">
                  <Sparkles size={10} />
                  AI-Powered
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Spearyx Tools</h3>
                <p className="text-slate-500 mb-5 leading-relaxed text-sm">
                  A suite of intelligent project management tools — generate RACI charts, risk registers, project charters, and more with AI assistance in seconds.
                </p>
                <ul className="space-y-2 mb-6">
                  {[
                    { icon: <BarChart3 size={13} className="text-primary-600" />, label: "RACI Chart Generator" },
                    { icon: <FileText size={13} className="text-indigo-600" />, label: "Project Charter Builder" },
                    { icon: <Shield size={13} className="text-rose-600" />, label: "Risk Register Creator" },
                  ].map(({ icon, label }) => (
                    <li key={label} className="flex items-center gap-2 text-sm text-slate-600">
                      {icon}
                      {label}
                    </li>
                  ))}
                </ul>
                <a
                  href="https://caliber.rcormier.dev/tools"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 group-hover:gap-3 transition-all"
                >
                  Explore Tools <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* Spearyx Jobs */}
            <div
              className="spx-glass-card-strong relative overflow-hidden rounded-2xl border border-indigo-200/70 border-t-[3px] border-t-indigo-600 p-8 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div
                className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
                style={{ background: "radial-gradient(circle at top right, rgba(99,102,241,0.05) 0%, transparent 65%)" }}
              />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-5">
                  <Briefcase size={22} className="text-indigo-600" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 mb-3">
                  <BarChart3 size={10} />
                  Smart Scoring
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Spearyx Jobs</h3>
                <p className="text-slate-500 mb-5 leading-relaxed text-sm">
                  AI-curated tech jobs with JD-resume match scoring, application tracking, cover letter generation, and unicorn opportunity detection.
                </p>
                <ul className="space-y-2 mb-6">
                  {[
                    { icon: <Target size={13} className="text-indigo-600" />, label: "AI JD-Resume Analysis" },
                    { icon: <Briefcase size={13} className="text-sky-600" />, label: "Application Tracking" },
                    { icon: <FileText size={13} className="text-emerald-600" />, label: "Cover Letter Generator" },
                  ].map(({ icon, label }) => (
                    <li key={label} className="flex items-center gap-2 text-sm text-slate-600">
                      {icon}
                      {label}
                    </li>
                  ))}
                </ul>
                <a
                  href="https://caliber.rcormier.dev"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 group-hover:gap-3 transition-all"
                >
                  Browse Jobs <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI highlight band ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div
            className="spx-band relative overflow-hidden rounded-3xl p-10 text-center md:p-14"
          >
            <div
              className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)" }}
            />
            <div className="relative max-w-2xl mx-auto">
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#7c3aed" }}
              >
                <Sparkles size={11} />
                AI-First Platform
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
                Intelligence in every feature
              </h2>
              <p className="text-slate-500 leading-relaxed mb-8 text-sm">
                From generating RACI matrices to scoring job-resume fit, every Spearyx feature is backed by AI — saving hours of manual work and surfacing insights you'd otherwise miss.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "RACI AI Generation",
                  "Resume Tailoring",
                  "JD Analysis",
                  "Job Scoring",
                  "Cover Letters",
                  "Unicorn Detection",
                ].map((feat) => (
                  <span
                    key={feat}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-700"
                    style={{
                      background: "rgba(255,255,255,0.75)",
                      border: "1px solid rgba(226,232,240,0.8)",
                    }}
                  >
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="mt-auto border-t border-slate-200/70 bg-white/65 px-4 py-8 backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/images/caliber-logo.svg" alt="Caliber" className="h-6 w-auto opacity-80" />
            <span className="text-sm text-slate-400">© 2025 Caliber. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://caliber.rcormier.dev/tools" className="text-sm text-slate-400 hover:text-slate-700 transition-colors font-medium">
              Tools
            </a>
            <a href="https://caliber.rcormier.dev" className="text-sm text-slate-400 hover:text-slate-700 transition-colors font-medium">
              Jobs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
