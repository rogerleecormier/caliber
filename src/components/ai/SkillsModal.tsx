import { useState, useEffect } from "react";
import { X, Sparkles, FileText, Tags, Check, Loader2 } from "lucide-react";

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { resume?: string; skills: string[] }) => void;
}

const STORAGE_KEY = "spearyx_user_profile";

export interface UserProfile {
  resume?: string;
  skills: string[];
  lastUpdated: string;
}

export function loadUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function hasUserProfile(): boolean {
  const profile = loadUserProfile();
  return profile !== null && (!!profile.resume || profile.skills.length > 0);
}

export default function SkillsModal({ isOpen, onClose, onSave }: SkillsModalProps) {
  const [activeTab, setActiveTab] = useState<"resume" | "skills">("resume");
  const [resume, setResume] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Load existing profile on mount
  useEffect(() => {
    const profile = loadUserProfile();
    if (profile) {
      setResume(profile.resume || "");
      setSkills(profile.skills || []);
    }
  }, [isOpen]);

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    const profile: UserProfile = {
      resume: resume.trim() || undefined,
      skills,
      lastUpdated: new Date().toISOString(),
    };
    saveUserProfile(profile);
    onSave({ resume: profile.resume, skills: profile.skills });
    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-lg w-full shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <h2 className="font-semibold text-slate-900">Your Profile</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab("resume")}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "resume"
                ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/50"
                : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            <FileText size={16} />
            Paste Resume
          </button>
          <button
            onClick={() => setActiveTab("skills")}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "skills"
                ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/50"
                : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            <Tags size={16} />
            Add Skills
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === "resume" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Paste your resume text. AI will extract skills and match you to jobs.
              </p>
              <textarea
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder="Paste your resume here...

Example:
Senior Frontend Developer with 5+ years of experience in React, TypeScript, and Node.js. Led teams at startups and enterprise companies. Skilled in GraphQL, REST APIs, and cloud platforms (AWS, GCP)."
                className="w-full h-48 p-3 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
              {resume && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check size={12} />
                  Resume saved ({resume.split(/\s+/).length} words)
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Add your key skills. Press Enter after each one.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., React, Python, AWS..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                <button
                  onClick={handleAddSkill}
                  disabled={!skillInput.trim()}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-sm"
                    >
                      {skill}
                      <button
                        onClick={() => handleRemoveSkill(skill)}
                        className="hover:bg-amber-100 rounded-full p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {skills.length === 0 && (
                <p className="text-xs text-slate-400">No skills added yet</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-slate-500">
            Saved locally in your browser
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!resume.trim() && skills.length === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Save Profile
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
