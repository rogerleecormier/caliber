'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@caliber/ui-kit'
import { CheckCircle2, Loader2, Upload, AlertCircle, Edit2, Save, X, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveResume, parseResumeText, aiParseResume, type ResumeData } from '@/server/functions/manage-resume'
import { getResumeSections, upsertResumeSection } from '@/server/functions/manage-resume-sections'
import type { SectionType, ExperienceEntry, EducationEntry, PersonalProjectEntry } from '@/lib/resume-sections'

type EditMode = 'professional_summary' | 'core_competencies' | 'technical_skills' | 'professional_experience' | 'education' | 'personal_projects' | 'awards' | null
type Tab = 'upload' | 'text'

export function ResumeManagerV2({ initial }: { initial: ResumeData | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('upload')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'extracting' | 'done' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parseStatus, setParseStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle')
  const [parseError, setParseError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSaved, setLastSaved] = useState<string | null>(initial?.updatedAt ?? null)
  const [editingSection, setEditingSection] = useState<EditMode>(null)
  const [loadingResumeSections, setLoadingResumeSections] = useState(false)

  // Contact info
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [rawText, setRawText] = useState(initial?.rawText ?? '')

  // Resume sections
  const [sections, setSections] = useState<Partial<Record<SectionType, any>>>({})

  // Fetch resume sections on mount
  const loadSections = useCallback(async () => {
    setLoadingResumeSections(true)
    try {
      const result = await getResumeSections()
      setSections(result)
    } catch (err) {
      console.error('Failed to load resume sections:', err)
      toast.error('Failed to load resume sections')
    } finally {
      setLoadingResumeSections(false)
    }
  }, [])

  // Load sections on mount
  useEffect(() => {
    loadSections()
  }, [loadSections])

  const parseFile = useCallback(async (file: File) => {
    setUploadStatus('extracting')
    setUploadError(null)
    try {
      let text = ''
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        const arrayBuffer = await file.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
        const pages: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          pages.push(content.items.map((item: any) => ('str' in item ? item.str : '')).join(' '))
        }
        text = pages.join('\n\n')
      } else if (ext === 'docx') {
        const mammoth = await import('mammoth/mammoth.browser')
        const arrayBuffer = await file.arrayBuffer()
        const result = await (mammoth as any).extractRawText({ arrayBuffer })
        text = result.value
      } else {
        text = await file.text()
      }
      setRawText(text)

      const parsed = await parseResumeText({ data: { text } })
      if (parsed) {
        if (parsed.fullName && !fullName) setFullName(parsed.fullName)
        if (parsed.email && !email) setEmail(parsed.email)
        if (parsed.phone && !phone) setPhone(parsed.phone)
        if (parsed.linkedin && !linkedin) setLinkedin(parsed.linkedin)
        if (parsed.website && !website) setWebsite(parsed.website)
      }

      setUploadStatus('done')
      setTimeout(() => setUploadStatus('idle'), 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read file'
      setUploadError(msg)
      setUploadStatus('error')
      toast.error('Resume upload failed', { description: msg })
    }
  }, [fullName, email, phone, linkedin, website])

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    parseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!rawText.trim()) {
      toast.error('No resume text to parse')
      return
    }

    setParseStatus('parsing')
    setParseError(null)

    const toastId = toast.loading('AI is parsing your resume…', {
      description: 'Extracting experience, skills, and projects.',
    })

    try {
      const aiParsed = await aiParseResume({ data: { text: rawText } })
      if (!aiParsed || Object.keys(aiParsed).length === 0) {
        throw new Error('No data extracted from resume')
      }

      // Update local sections - initialize all sections with defaults
      // Note: aiParsed.certifications maps to awards section
      const newSections: Partial<Record<SectionType, any>> = {
        professional_summary: aiParsed.summary || '',
        core_competencies: aiParsed.competencies || [],
        technical_skills: aiParsed.tools || [],
        professional_experience: aiParsed.experience || [],
        education: aiParsed.education || [],
        personal_projects: aiParsed.personalProjects || [],
        awards: aiParsed.awards || aiParsed.certifications || [],
      }

      // Save all sections to DB
      for (const [sectionType, content] of Object.entries(newSections)) {
        try {
          await upsertResumeSection({
            data: { sectionType: sectionType as SectionType, content },
          })
        } catch (err) {
          console.error(`Failed to save section ${sectionType}:`, err)
        }
      }

      setSections(newSections)
      setParseStatus('done')
      setTimeout(() => setParseStatus('idle'), 3000)

      toast.success('Resume parsed successfully!', {
        id: toastId,
        description: 'All sections extracted and saved to database.',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse failed'
      setParseError(msg)
      setParseStatus('error')
      toast.error('Parse failed', { id: toastId, description: msg })
    }
  }

  async function handleSaveSection(sectionType: SectionType, content: any) {
    try {
      await upsertResumeSection({
        data: { sectionType, content },
      })
      setSections((prev) => ({ ...prev, [sectionType]: content }))
      setEditingSection(null)
      toast.success(`${sectionType.replace(/_/g, ' ')} saved!`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast.error('Save failed', { description: msg })
    }
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSaveStatus('saving')

    try {
      await saveResume({
        data: {
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          website: website.trim() || undefined,
          rawText: rawText || undefined,
        },
      })

      setLastSaved(new Date().toISOString())
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
      toast.success('Contact info saved!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setSaveStatus('error')
      toast.error('Save failed', { description: msg })
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload/Text Tabs */}
      <div className="space-y-3">
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Upload Resume
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'text'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Resume Text
          </button>
        </div>

        {activeTab === 'upload' && <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Resume</CardTitle>
              <CardDescription>Upload a PDF, DOCX, or TXT file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                onClick={() =>
                  uploadStatus === 'idle' || uploadStatus === 'error' ? fileInputRef.current?.click() : undefined
                }
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                className={[
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors select-none',
                  uploadStatus === 'idle' || uploadStatus === 'error' ? 'cursor-pointer' : 'cursor-default',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : uploadStatus === 'error'
                      ? 'border-destructive/40 bg-destructive/5'
                      : uploadStatus === 'done'
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : uploadStatus !== 'idle'
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-muted/30',
                ].join(' ')}
              >
                {uploadStatus === 'done' ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                ) : uploadStatus === 'error' ? (
                  <AlertCircle className="h-8 w-8 text-destructive" />
                ) : uploadStatus !== 'idle' ? (
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {uploadStatus === 'extracting'
                      ? 'Reading file…'
                      : uploadStatus === 'done'
                        ? 'File ready — click Parse Resume below'
                        : uploadStatus === 'error'
                          ? 'Failed to read file'
                          : 'Click to upload or drag & drop'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploadStatus === 'extracting'
                      ? 'Extracting text from your file…'
                      : uploadStatus === 'done'
                        ? 'File extracted. Ready to parse!'
                        : uploadStatus === 'error'
                          ? uploadError ?? ''
                          : 'PDF, DOCX, or TXT'}
                  </p>
                </div>
                {(uploadStatus === 'idle' || uploadStatus === 'error') && (
                  <div className="flex gap-1.5">
                    {['PDF', 'DOCX', 'TXT'].map((fmt) => (
                      <span key={fmt} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                        {fmt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </CardContent>
          </Card>
        </div>}

        {activeTab === 'text' && (
          <div className="space-y-3">
            <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resume Text</CardTitle>
              <CardDescription>The full text that AI reads to extract sections. Paste or edit directly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste your resume text here, or upload a file above…"
                className="w-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {rawText && (
                <p className="text-xs text-muted-foreground tabular-nums">{rawText.length.toLocaleString()} characters</p>
              )}
            </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Parse Resume Card - Always Visible */}
      {rawText && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Parse Resume</CardTitle>
            <CardDescription>Extract sections from your resume text using AI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {parseStatus === 'done' && '✓ Parsed successfully'}
                {parseStatus === 'error' && parseError && `✗ ${parseError}`}
              </div>
              <Button
                onClick={handleParse}
                disabled={parseStatus === 'parsing' || !rawText.trim()}
                size="lg"
                className="min-w-40"
              >
                {parseStatus === 'parsing' ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    Parsing…
                  </>
                ) : parseStatus === 'done' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Parsed!
                  </>
                ) : (
                  'Parse Resume'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact Information Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Used in the header of generated resumes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveContact} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="fullName">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="phone">
                  Phone
                </label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="linkedin">
                  LinkedIn
                </label>
                <Input
                  id="linkedin"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="website">
                  Website / Portfolio
                </label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yoursite.com"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {lastSaved ? `Last saved ${new Date(lastSaved).toLocaleString()}` : ''}
              </span>
              <Button type="submit" disabled={saveStatus === 'saving' || !fullName.trim()} className="min-w-32">
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    Saving…
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Saved!
                  </>
                ) : (
                  'Save Contact'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Resume Sections - Always Show */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Resume Sections</h3>
        {loadingResumeSections && (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading resume sections…</span>
            </CardContent>
          </Card>
        )}
          {sections.professional_summary !== undefined && (
            <SectionCard
              title="Professional Summary"
              type="professional_summary"
              content={sections.professional_summary}
              isEditing={editingSection === 'professional_summary'}
              onEdit={() => setEditingSection('professional_summary')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('professional_summary', content)}
              renderContent={(content) => <p className="text-sm whitespace-pre-wrap">{content}</p>}
              renderEdit={(content, onChange) => (
                <textarea
                  value={content}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            />
          )}

          {sections.core_competencies !== undefined && (
            <SectionCard
              title="Core Competencies"
              type="core_competencies"
              content={sections.core_competencies}
              isEditing={editingSection === 'core_competencies'}
              onEdit={() => setEditingSection('core_competencies')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('core_competencies', content)}
              renderContent={(items) => (
                <div className="flex flex-wrap gap-2">
                  {items.map((item: string, i: number) => (
                    <span key={i} className="inline-block bg-primary/10 text-primary text-xs font-medium px-2.5 py-1.5 rounded">
                      {item}
                    </span>
                  ))}
                </div>
              )}
              renderEdit={(items, onChange) => (
                <div className="space-y-2">
                  {items.map((item: string, i: number) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={item}
                        onChange={(e) => {
                          const updated = [...items]
                          updated[i] = e.target.value
                          onChange(updated)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = items.filter((_: string, idx: number) => idx !== i)
                          onChange(updated)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...items, ''])}
                  >
                    <Plus className="h-4 w-4" />
                    Add Item
                  </Button>
                </div>
              )}
            />
          )}

          {sections.technical_skills !== undefined && (
            <SectionCard
              title="Technical Skills"
              type="technical_skills"
              content={sections.technical_skills}
              isEditing={editingSection === 'technical_skills'}
              onEdit={() => setEditingSection('technical_skills')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('technical_skills', content)}
              renderContent={(categories) => (
                <div className="space-y-3">
                  {categories.map((cat: any, i: number) => (
                    <div key={i}>
                      <p className="text-sm font-medium mb-1">{cat.category}</p>
                      <p className="text-sm text-muted-foreground">{cat.skills.join(', ')}</p>
                    </div>
                  ))}
                </div>
              )}
              renderEdit={(categories, onChange) => (
                <div className="space-y-4">
                  {categories.map((cat: any, i: number) => (
                    <div key={i} className="space-y-2 p-3 border rounded-md">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-xs font-medium">Category</label>
                          <Input
                            value={cat.category}
                            onChange={(e) => {
                              const updated = [...categories]
                              updated[i].category = e.target.value
                              onChange(updated)
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = categories.filter((_: any, idx: number) => idx !== i)
                            onChange(updated)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Skills (comma-separated)</label>
                        <Input
                          value={cat.skills.join(', ')}
                          onChange={(e) => {
                            const updated = [...categories]
                            updated[i].skills = e.target.value.split(',').map((s: string) => s.trim())
                            onChange(updated)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange([...categories, { category: 'New Category', skills: [] }])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Category
                  </Button>
                </div>
              )}
            />
          )}

          {sections.professional_experience !== undefined && (
            <SectionCard
              title="Professional Experience"
              type="professional_experience"
              content={sections.professional_experience}
              isEditing={editingSection === 'professional_experience'}
              onEdit={() => setEditingSection('professional_experience')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('professional_experience', content)}
              renderContent={(items) => (
                <div className="space-y-4">
                  {items.map((exp: any, i: number) => (
                    <div key={i} className="border-l-2 border-primary/30 pl-4">
                      <p className="font-medium text-sm">{exp.title}</p>
                      <p className="text-sm text-muted-foreground">{exp.company}</p>
                      {exp.dates && <p className="text-xs text-muted-foreground">{exp.dates}</p>}
                      {exp.bullets && exp.bullets.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {exp.bullets.map((bullet: string, j: number) => (
                            <li key={j} className="text-sm text-muted-foreground">
                              • {bullet}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              renderEdit={(items, onChange) => (
                <div className="space-y-4">
                  {items.map((exp: any, i: number) => (
                    <ExperienceEditor
                      key={i}
                      experience={exp}
                      onChange={(updated) => {
                        const newItems = [...items]
                        newItems[i] = updated
                        onChange(newItems)
                      }}
                      onRemove={() => {
                        const newItems = items.filter((_: any, idx: number) => idx !== i)
                        onChange(newItems)
                      }}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange([
                        ...items,
                        { title: '', company: '', dates: '', bullets: [] },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Experience
                  </Button>
                </div>
              )}
            />
          )}

          {sections.education !== undefined && (
            <SectionCard
              title="Education"
              type="education"
              content={sections.education}
              isEditing={editingSection === 'education'}
              onEdit={() => setEditingSection('education')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('education', content)}
              renderContent={(items) => (
                <div className="space-y-3">
                  {items.map((edu: any, i: number) => (
                    <div key={i}>
                      <p className="font-medium text-sm">{edu.degree}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution}</p>
                      {edu.fieldOfStudy && (
                        <p className="text-xs text-muted-foreground">{edu.fieldOfStudy}</p>
                      )}
                      {edu.year && <p className="text-xs text-muted-foreground">{edu.year}</p>}
                    </div>
                  ))}
                </div>
              )}
              renderEdit={(items, onChange) => (
                <div className="space-y-4">
                  {items.map((edu: any, i: number) => (
                    <EducationEditor
                      key={i}
                      education={edu}
                      onChange={(updated) => {
                        const newItems = [...items]
                        newItems[i] = updated
                        onChange(newItems)
                      }}
                      onRemove={() => {
                        const newItems = items.filter((_: any, idx: number) => idx !== i)
                        onChange(newItems)
                      }}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange([...items, { degree: '', institution: '', fieldOfStudy: '', year: '' }])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Education
                  </Button>
                </div>
              )}
            />
          )}

          {sections.personal_projects !== undefined && (
            <SectionCard
              title="Personal Projects"
              type="personal_projects"
              content={sections.personal_projects}
              isEditing={editingSection === 'personal_projects'}
              onEdit={() => setEditingSection('personal_projects')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('personal_projects', content)}
              renderContent={(items) => (
                <div className="space-y-4">
                  {items.map((proj: any, i: number) => (
                    <div key={i}>
                      <p className="font-medium text-sm">{proj.name}</p>
                      <p className="text-sm text-muted-foreground">{proj.description}</p>
                      {proj.technologies && proj.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {proj.technologies.map((tech: string, j: number) => (
                            <span
                              key={j}
                              className="inline-block bg-muted text-muted-foreground text-xs px-2 py-1 rounded"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                      {proj.url && (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline mt-1 block"
                        >
                          {proj.url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              renderEdit={(items, onChange) => (
                <div className="space-y-4">
                  {items.map((proj: any, i: number) => (
                    <ProjectEditor
                      key={i}
                      project={proj}
                      onChange={(updated) => {
                        const newItems = [...items]
                        newItems[i] = updated
                        onChange(newItems)
                      }}
                      onRemove={() => {
                        const newItems = items.filter((_: any, idx: number) => idx !== i)
                        onChange(newItems)
                      }}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange([
                        ...items,
                        {
                          name: '',
                          description: '',
                          technologies: [],
                          url: '',
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Project
                  </Button>
                </div>
              )}
            />
          )}

          {sections.awards !== undefined && (
            <SectionCard
              title="Certifications & Awards"
              type="awards"
              content={sections.awards}
              isEditing={editingSection === 'awards'}
              onEdit={() => setEditingSection('awards')}
              onCancel={() => setEditingSection(null)}
              onSave={(content) => handleSaveSection('awards', content)}
              renderContent={(items) => (
                <div className="flex flex-wrap gap-2">
                  {items.map((award: string, i: number) => (
                    <span key={i} className="inline-block bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium px-2.5 py-1.5 rounded">
                      {award}
                    </span>
                  ))}
                </div>
              )}
              renderEdit={(items, onChange) => (
                <div className="space-y-2">
                  {items.map((award: string, i: number) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={award}
                        onChange={(e) => {
                          const updated = [...items]
                          updated[i] = e.target.value
                          onChange(updated)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = items.filter((_: string, idx: number) => idx !== i)
                          onChange(updated)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...items, ''])}
                  >
                    <Plus className="h-4 w-4" />
                    Add Certification / Award
                  </Button>
                </div>
              )}
            />
          )}
      </div>
    </div>
  )
}

// Section Card Component
interface SectionCardProps {
  title: string
  type: SectionType
  content: any
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (content: any) => void
  renderContent: (content: any) => React.ReactNode
  renderEdit: (content: any, onChange: (value: any) => void) => React.ReactNode
}

function SectionCard({
  title,
  isEditing,
  content,
  onEdit,
  onCancel,
  onSave,
  renderContent,
  renderEdit,
}: SectionCardProps) {
  const [editContent, setEditContent] = useState(content)

  if (isEditing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderEdit(editContent, setEditContent)}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(editContent)}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
          Edit
        </Button>
      </CardHeader>
      <CardContent>{renderContent(content)}</CardContent>
    </Card>
  )
}

// Experience Editor
function ExperienceEditor({
  experience,
  onChange,
  onRemove,
}: {
  experience: ExperienceEntry
  onChange: (exp: ExperienceEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 p-3 border rounded-md">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium">Title</label>
          <Input
            value={experience.title || ''}
            onChange={(e) => onChange({ ...experience, title: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Company</label>
          <Input
            value={experience.company || ''}
            onChange={(e) => onChange({ ...experience, company: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium">Dates (e.g., Jan 2020 - Dec 2021)</label>
        <Input
          value={experience.dates || ''}
          onChange={(e) => onChange({ ...experience, dates: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs font-medium">Bullets (one per line)</label>
        <textarea
          value={(experience.bullets || []).join('\n')}
          onChange={(e) =>
            onChange({
              ...experience,
              bullets: e.target.value.split('\n').filter((b) => b.trim()),
            })
          }
          className="w-full min-h-[100px] rounded-md border border-input px-3 py-2 text-sm font-mono resize-y"
        />
      </div>
      <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
        Remove
      </Button>
    </div>
  )
}

// Education Editor
function EducationEditor({
  education,
  onChange,
  onRemove,
}: {
  education: EducationEntry
  onChange: (edu: EducationEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 p-3 border rounded-md">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium">Degree</label>
          <Input
            value={education.degree || ''}
            onChange={(e) => onChange({ ...education, degree: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Institution</label>
          <Input
            value={education.institution || ''}
            onChange={(e) => onChange({ ...education, institution: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium">Field of Study</label>
          <Input
            value={education.fieldOfStudy || ''}
            onChange={(e) => onChange({ ...education, fieldOfStudy: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Graduation Year</label>
          <Input
            value={education.graduationDate || ''}
            onChange={(e) => onChange({ ...education, graduationDate: e.target.value })}
          />
        </div>
      </div>
      <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
        Remove
      </Button>
    </div>
  )
}

// Project Editor
function ProjectEditor({
  project,
  onChange,
  onRemove,
}: {
  project: PersonalProjectEntry
  onChange: (proj: PersonalProjectEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2 p-3 border rounded-md">
      <div>
        <label className="text-xs font-medium">Project Name</label>
        <Input
          value={project.name || ''}
          onChange={(e) => onChange({ ...project, name: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs font-medium">Description</label>
        <textarea
          value={project.description || ''}
          onChange={(e) => onChange({ ...project, description: e.target.value })}
          className="w-full min-h-[80px] rounded-md border border-input px-3 py-2 text-sm resize-y"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium">Technologies (comma-separated)</label>
          <Input
            value={(project.technologies || []).join(', ')}
            onChange={(e) =>
              onChange({
                ...project,
                technologies: e.target.value.split(',').map((t) => t.trim()),
              })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium">URL</label>
          <Input
            value={project.url || ''}
            onChange={(e) => onChange({ ...project, url: e.target.value })}
          />
        </div>
      </div>
      <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
        Remove
      </Button>
    </div>
  )
}
