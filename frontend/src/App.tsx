import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'
import type {
  ManualMetadataInput,
  MetadataIssue,
  ProcessedMarkdown,
} from './utils/types'
import { processMarkdown } from './utils/markdownProcessor'
import { generatePdf } from './pdf/generatePdf'
import { generateDocx } from './doc/generateDocx'
import { 
  loadPersistedSession, 
  savePersistedSession, 
  clearPersistedSession 
} from './utils/sessionStorage'

// Helper function to save files to output/ directory in dev mode
async function saveFileToRepo(blob: Blob, filename: string) {
  console.log(`[SAVE] Starting save for ${filename}`)
  console.log(`[SAVE] Environment mode:`, import.meta.env.MODE)
  console.log(`[SAVE] Is DEV:`, import.meta.env.DEV)
  
  try {
    // Create a form data to send the file
    const formData = new FormData()
    formData.append('file', blob, filename)
    
    console.log(`[SAVE] Sending request to /api/save-file for ${filename}`)
    
    // Try to save to output directory via the dev server endpoint
    const response = await fetch('/api/save-file', {
      method: 'POST',
      body: formData,
    })
    
    console.log(`[SAVE] Response status: ${response.status}`)
    
    if (!response.ok) {
      console.error(`[SAVE] ❌ Failed to save ${filename}: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error(`[SAVE] Error details:`, errorText)
    } else {
      const result = await response.json()
      console.log(`[SAVE] ✓ Successfully saved ${filename} to output/`, result)
    }
  } catch (error) {
    console.error('[SAVE] ❌ Exception during save:', error)
  }
}

type SectionKey = 'upload' | 'bibliography' | 'preview'

interface AccordionSectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  badge?: React.ReactNode
  collapsedNotice?: React.ReactNode
  children: React.ReactNode
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  isOpen,
  onToggle,
  badge,
  collapsedNotice,
  children,
}) => {
  const showCollapsedNotice = !isOpen && collapsedNotice
  const collapsedStyle = !isOpen
    ? showCollapsedNotice
      ? { paddingTop: '0.75rem', paddingBottom: '0.75rem' }
      : { paddingTop: 0, paddingBottom: 0 }
    : undefined
  return (
    <section className={`panel accordion ${isOpen ? 'accordion--open' : ''}`}>
      <button type="button" className="accordion__header" onClick={onToggle}>
        <span className="accordion__title">{title}</span>
        <span className="accordion__spacer" />
        {badge ? <span className="accordion__badge">{badge}</span> : null}
        <span className="accordion__chevron" aria-hidden="true">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      <div
        className={`accordion__content ${isOpen ? 'accordion__content--open' : 'accordion__content--collapsed'}`}
        aria-hidden={showCollapsedNotice ? false : !isOpen}
        style={collapsedStyle}
      >
        {isOpen ? children : collapsedNotice ?? null}
      </div>
    </section>
  )
}

const initialSectionState: Record<SectionKey, boolean> = {
  upload: true,
  bibliography: false,
  preview: false,
}

type ProcessingState = 'idle' | 'processing' | 'processed' | 'error'

const FONT_OPTIONS = ['Times New Roman', 'Helvetica', 'Courier New'] as const
export type FontOption = typeof FONT_OPTIONS[number]
type Theme = 'light' | 'dark'

const createEmptyManualFormState = () => ({
  url: '',
  title: '',
  authors: '',
  siteName: '',
  accessDate: '',
})

function App() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [originalMarkdown, setOriginalMarkdown] = useState<string>('')
  const [processed, setProcessed] = useState<ProcessedMarkdown | null>(null)
  const [processingState, setProcessingState] = useState<ProcessingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false)
  const [selectedFontFamily, setSelectedFontFamily] = useState<FontOption>('Times New Roman')
  const [bodyFontSize, setBodyFontSize] = useState<number>(12)
  const [expandedSections, setExpandedSections] =
    useState<Record<SectionKey, boolean>>(initialSectionState)
  const [promptForManualMetadata, setPromptForManualMetadata] = useState(true)
  const manualMetadataOverridesRef = useRef<Record<string, ManualMetadataInput>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [manualMetadataQueue, setManualMetadataQueue] = useState<MetadataIssue[]>([])
  const [currentManualIndex, setCurrentManualIndex] = useState(0)
  const [manualMetadataModalOpen, setManualMetadataModalOpen] = useState(false)
  const [showSkipAllConfirmation, setShowSkipAllConfirmation] = useState(false)
  const [manualFormState, setManualFormState] = useState(createEmptyManualFormState)
  const [pendingManualMarkdown, setPendingManualMarkdown] = useState<string | null>(null)
  const [showBibliographyNotice, setShowBibliographyNotice] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const metadataIssuesByUrl = useMemo(() => {
    const map = new Map<string, MetadataIssue>()
    if (!processed?.metadataIssues?.length) {
      return map
    }
    processed.metadataIssues.forEach((issue) => {
      if (issue.url && !map.has(issue.url)) {
        map.set(issue.url, issue)
      }
    })
    return map
  }, [processed])

  // Helper to persist manual metadata immediately (since refs don't trigger useEffect)
  // Use useRef to avoid recreating this function on every render
  const persistManualMetadata = useRef(() => {
    if (!fileName && !originalMarkdown && !processed) {
      return
    }
    savePersistedSession({
      fileName,
      originalMarkdown,
      processed,
      manualMetadataOverrides: manualMetadataOverridesRef.current,
      selectedFontFamily,
      bodyFontSize,
      promptForManualMetadata,
    })
  })
  
  // Update the ref function when dependencies change
  useEffect(() => {
    persistManualMetadata.current = () => {
      if (!fileName && !originalMarkdown && !processed) {
        return
      }
      savePersistedSession({
        fileName,
        originalMarkdown,
        processed,
        manualMetadataOverrides: manualMetadataOverridesRef.current,
        selectedFontFamily,
        bodyFontSize,
        promptForManualMetadata,
      })
    }
  }, [fileName, originalMarkdown, processed, selectedFontFamily, bodyFontSize, promptForManualMetadata])

  // Restore persisted session on mount
  useEffect(() => {
    const persisted = loadPersistedSession()
    if (persisted) {
      console.log('📦 Restoring persisted session from localStorage')
        setFileName(persisted.fileName)
        setOriginalMarkdown(persisted.originalMarkdown)
        setProcessed(persisted.processed)
        manualMetadataOverridesRef.current = persisted.manualMetadataOverrides ?? {}
        setSelectedFontFamily(persisted.selectedFontFamily)
        setBodyFontSize(persisted.bodyFontSize)
        setPromptForManualMetadata(
          typeof persisted.promptForManualMetadata === 'boolean'
            ? persisted.promptForManualMetadata
            : true,
        )
      
      if (persisted.processed) {
        setProcessingState('processed')
      }
    }
  }, [])

  // Persist critical state changes to localStorage (only when they actually change, not during typing)
  useEffect(() => {
    if (!fileName && !originalMarkdown && !processed) {
      return
    }

    savePersistedSession({
      fileName,
      originalMarkdown,
      processed,
      manualMetadataOverrides: manualMetadataOverridesRef.current,
      selectedFontFamily,
      bodyFontSize,
      promptForManualMetadata,
    })
  }, [fileName, originalMarkdown, processed, selectedFontFamily, bodyFontSize, promptForManualMetadata])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (processed) {
      setShowBibliographyNotice(true)
      setExpandedSections((prev) => ({
        ...prev,
        preview: true,
      }))
    } else {
      setShowBibliographyNotice(false)
    }
  }, [processed])

  useEffect(() => {
    if (manualMetadataModalOpen && manualMetadataQueue[currentManualIndex]) {
      const issue = manualMetadataQueue[currentManualIndex]
      setManualFormState({
        url: issue.url,
        title: issue.partialMetadata?.title || '',
        authors: issue.partialMetadata?.authors || '',
        siteName: issue.partialMetadata?.siteName || '',
        accessDate: issue.partialMetadata?.accessDate || '',
      })
    }
  }, [manualMetadataModalOpen, manualMetadataQueue, currentManualIndex])

  const toggleSection = useCallback((section: SectionKey) => {
    setExpandedSections((prev) => {
      const newValue = !prev[section]
      const next = {
        ...prev,
        [section]: newValue,
      }
      if (newValue) {
        if (section === 'bibliography') {
          setShowBibliographyNotice(false)
        }
      }
      return next
    })
  }, [])

  const startManualMetadataCollection = useCallback(
    (issues: MetadataIssue[], markdown: string) => {
      if (!issues.length) {
        return
      }
      setManualMetadataQueue(issues)
      setCurrentManualIndex(0)
      setPendingManualMarkdown(markdown)
      setManualMetadataModalOpen(true)
    },
    [],
  )

  const finalizeManualMetadata = useCallback(async () => {
    if (!pendingManualMarkdown) {
      return
    }
    try {
      setProcessingState('processing')
      const updatedResult = await processMarkdown(pendingManualMarkdown, {
        manualMetadata: manualMetadataOverridesRef.current,
      })
      setProcessed(updatedResult)
      setProcessingState('processed')
      setManualMetadataQueue([])
      setPendingManualMarkdown(null)
    } catch (error) {
      console.error(error)
      setProcessingState('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to apply manual metadata adjustments.',
      )
    } finally {
      setManualMetadataModalOpen(false)
    }
  }, [pendingManualMarkdown])

  const handleManualMetadataForUrl = useCallback(
    (url: string) => {
      if (!originalMarkdown) {
        return
      }
      const issue = metadataIssuesByUrl.get(url)
      if (!issue) {
        return
      }
      startManualMetadataCollection([issue], originalMarkdown)
    },
    [metadataIssuesByUrl, originalMarkdown, startManualMetadataCollection],
  )

  const handleFileSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      // Clear persisted session when uploading a new file
      clearPersistedSession()
      
      manualMetadataOverridesRef.current = {}
      setManualMetadataQueue([])
      setManualMetadataModalOpen(false)
      setExpandedSections({ ...initialSectionState })
      setProcessingState('processing')
      setErrorMessage(null)
      setProcessed(null)
      setFileName(file.name)
      setShowBibliographyNotice(false)

      const text = await file.text()
      setOriginalMarkdown(text)

      // Save the original markdown file to output folder
      try {
        const formData = new FormData()
        formData.append('file', new Blob([text], { type: 'text/markdown' }), file.name)
        await fetch('/api/save-file', {
          method: 'POST',
          body: formData,
        })
      } catch (saveError) {
        console.warn('Could not save markdown to output folder:', saveError)
      }

      const result = await processMarkdown(text, {
        manualMetadata: manualMetadataOverridesRef.current,
      })
      setProcessed(result)
      setProcessingState('processed')

      if (promptForManualMetadata && result.metadataIssues.length) {
        startManualMetadataCollection(result.metadataIssues, text)
      }
    } catch (error) {
      console.error(error)
      setProcessingState('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to process the markdown file.',
      )
    }
  }, [promptForManualMetadata, startManualMetadataCollection])

  useEffect(() => {
    if (
      !promptForManualMetadata ||
      !processed ||
      !processed.metadataIssues.length ||
      manualMetadataModalOpen ||
      manualMetadataQueue.length
    ) {
      return
    }
    startManualMetadataCollection(processed.metadataIssues, processed.original)
  }, [
    promptForManualMetadata,
    processed,
    manualMetadataModalOpen,
    manualMetadataQueue.length,
    startManualMetadataCollection,
  ])

  const handleDownloadMarkdown = useCallback(() => {
    if (!processed) return
    const blob = new Blob([processed.modified], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const downloadFileName = fileName ? fileName.replace(/\.md$/i, '-processed.md') : 'processed.md'
    link.download = downloadFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    
    // In dev mode, also save to output/ for testing
    if (import.meta.env.DEV) {
      saveFileToRepo(blob, downloadFileName)
    }
  }, [processed, fileName])

  const handleDownloadPdf = useCallback(async () => {
    if (!processed) return
    setIsGeneratingPdf(true)
    try {
      const blob = await generatePdf(processed, {
        originalFileName: fileName ?? undefined,
        fontFamily: selectedFontFamily,
        fontSize: bodyFontSize,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const downloadFileName = fileName ? fileName.replace(/\.md$/i, '.pdf') : 'document.pdf'
      link.download = downloadFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      
      // In dev mode, also save to output/ for testing
      if (import.meta.env.DEV) {
        saveFileToRepo(blob, downloadFileName)
      }
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to generate the PDF document.',
      )
    } finally {
      setIsGeneratingPdf(false)
    }
    }, [processed, fileName, selectedFontFamily, bodyFontSize])

  const handleDownloadDocx = useCallback(async () => {
    if (!processed) return
    setIsGeneratingDocx(true)
    try {
      const blob = await generateDocx(processed)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const downloadFileName = fileName ? fileName.replace(/\.md$/i, '.docx') : 'document.docx'
      link.download = downloadFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      
      // In dev mode, also save to output/ for testing
      if (import.meta.env.DEV) {
        saveFileToRepo(blob, downloadFileName)
      }
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to generate the Google Docs file.',
      )
    } finally {
      setIsGeneratingDocx(false)
    }
  }, [processed, fileName])

  const bibliographyEntries = useMemo(() => processed?.bibliographyEntries ?? [], [processed])

  const handleClearDocument = () => {
    clearPersistedSession()
    manualMetadataOverridesRef.current = {}
    setFileName(null)
    setOriginalMarkdown('')
    setProcessed(null)
    setProcessingState('idle')
    setErrorMessage(null)
    setManualMetadataQueue([])
    setCurrentManualIndex(0)
    setManualMetadataModalOpen(false)
    setShowSkipAllConfirmation(false)
    setPendingManualMarkdown(null)
    setShowBibliographyNotice(false)
    setExpandedSections({ ...initialSectionState })
    setManualFormState(createEmptyManualFormState())
    setIsGeneratingPdf(false)
    setIsGeneratingDocx(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Memoize expensive markdown preview to prevent re-renders during form typing
  const markdownPreview = useMemo(() => {
    if (!processed) return null
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed.modified}</ReactMarkdown>
  }, [processed])

  const currentManualIssue = manualMetadataModalOpen
    ? manualMetadataQueue[currentManualIndex]
    : undefined

  return (
    <div className={`app app--${theme}`}>
      <header className="app__header">
        <div className="app__header-content">
          <h1>Markdown to Formatted PDF Converter</h1>
          <p className="app__subtitle">
            Upload a markdown document to automatically generate a bibliography and export a paginated
            PDF with title and table of contents pages.
          </p>
        </div>
        <div className="theme-slider" role="group" aria-label="Interface theme selection">
          <span
            className={`theme-slider__label ${theme === 'light' ? 'theme-slider__label--active' : ''}`}
          >
            Light
          </span>
          <label className="theme-slider__control">
            <input
              type="checkbox"
              role="switch"
              aria-label="Toggle dark theme"
              checked={theme === 'dark'}
              onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')}
            />
            <span className="theme-slider__rail">
              <span className="theme-slider__thumb" />
            </span>
          </label>
          <span
            className={`theme-slider__label ${theme === 'dark' ? 'theme-slider__label--active' : ''}`}
          >
            Dark
          </span>
        </div>
      </header>

      <main className="app__main">
        <AccordionSection
          title="1. Upload Markdown"
          isOpen={expandedSections.upload}
          onToggle={() => toggleSection('upload')}
        >
            <p>Select a markdown file to begin processing.</p>
            <div className="file-input__actions">
              <label className="file-input">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  onChange={handleFileSelection}
                />
                <span>{fileName ?? 'Choose Markdown File'}</span>
              </label>
              {(fileName || originalMarkdown || processed) && (
                <button type="button" className="file-input__clear" onClick={handleClearDocument}>
                  Clear Document
                </button>
              )}
            </div>
          <div className="toggle">
            <label className="toggle__control">
              <input
                type="checkbox"
                checked={promptForManualMetadata}
                onChange={(event) => setPromptForManualMetadata(event.target.checked)}
              />
              <span className="toggle__slider" aria-hidden="true" />
            </label>
            <div className="toggle__text">
              <span className="toggle__title">Prompt for manual citation details</span>
              <span className="toggle__description">
                When enabled, you can manually add metadata for each source (title, authors, etc.).
              </span>
            </div>
          </div>
          {processingState === 'processing' && (
            <div className="status status--processing">Processing markdown…</div>
          )}
          {processingState === 'error' && errorMessage && (
            <div className="status status--error">{errorMessage}</div>
          )}
          {processingState === 'processed' && processed && (
            <div className="status status--success">Document processed successfully.</div>
          )}
        </AccordionSection>

        <AccordionSection
          title="2. Bibliography Summary"
          isOpen={expandedSections.bibliography}
          onToggle={() => toggleSection('bibliography')}
          badge={
            bibliographyEntries.length
              ? <span>{bibliographyEntries.length}</span>
              : undefined
          }
          collapsedNotice={
            processed && showBibliographyNotice
              ? (
                <div className="status status--info">
                  Bibliography entries are ready. To view click the drop down.
                </div>
              )
              : !processed
                ? <p>The bibliography summary will be available after you process a document.</p>
                : null
          }
        >
          {processed ? (
            <>
              {metadataIssuesByUrl.size ? (
                <div className="status status--info">
                  {metadataIssuesByUrl.size}{' '}
                  {metadataIssuesByUrl.size === 1
                    ? 'source is missing citation details.'
                    : 'sources are missing citation details.'}{' '}
                  Use “Add metadata” to fill them in.
                </div>
              ) : null}
              <p>
                {bibliographyEntries.length}{' '}
                {bibliographyEntries.length === 1 ? 'entry located' : 'entries located'}.
              </p>
              <div className="bibliography-list">
                {bibliographyEntries.map((entry) => (
                  <div
                    key={entry.anchorId}
                    className={`bibliography-list__item ${entry.isNew ? 'bibliography-list__item--new' : ''} ${
                      metadataIssuesByUrl.has(entry.url) ? 'bibliography-list__item--needs-metadata' : ''
                    }`}
                  >
                    <span className="bibliography-list__number">{entry.number}.</span>
                    <div className="bibliography-list__content">
                      <span>{entry.citation}</span>
                      {metadataIssuesByUrl.has(entry.url) ? (
                        <div className="bibliography-list__cta">
                          <span className="bibliography-list__warning">Missing metadata</span>
                          <button
                            type="button"
                            className="bibliography-list__action"
                            onClick={() => handleManualMetadataForUrl(entry.url)}
                            disabled={manualMetadataModalOpen}
                          >
                            Add metadata
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>The bibliography summary will be available after you process a document.</p>
          )}
        </AccordionSection>

        <AccordionSection
          title="3. Preview & Export"
          isOpen={expandedSections.preview}
          onToggle={() => toggleSection('preview')}
        >
          {processed ? (
            <>
                <div className="typography-controls">
                  <label className="typography-controls__label">
                    <span>Font Family</span>
                    <select
                      value={selectedFontFamily}
                      onChange={(event) =>
                        setSelectedFontFamily(event.target.value as FontOption)
                      }
                    >
                      {FONT_OPTIONS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="typography-controls__label">
                    <span>Body Font Size (pt)</span>
                    <input
                      type="number"
                      min={8}
                      max={20}
                      value={bodyFontSize}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value)
                        if (!Number.isFinite(nextValue)) {
                          return
                        }
                        const clamped = Math.min(Math.max(Math.round(nextValue), 8), 20)
                        setBodyFontSize(clamped)
                      }}
                    />
                  </label>
                </div>
                <div className="actions">
                <button type="button" onClick={handleDownloadMarkdown}>
                  Download Processed Markdown
                </button>
                <button type="button" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}
                </button>
                <button type="button" onClick={handleDownloadDocx} disabled={isGeneratingDocx}>
                  {isGeneratingDocx ? 'Generating Google Doc…' : 'Download Google Doc'}
                </button>
              </div>
              <div className="preview">
                <div className="preview__column">
                  <h3>Original Markdown</h3>
                  <pre className="preview__code">
                    <code>{originalMarkdown}</code>
                  </pre>
                </div>
                <div className="preview__column">
                  <h3>Processed Markdown Preview</h3>
                  <div className="preview__markdown">
                    {markdownPreview}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p>Upload and process a markdown document to enable previews and exports.</p>
          )}
        </AccordionSection>
      </main>

      {manualMetadataModalOpen && currentManualIssue ? (
        <div className="modal">
          <div className="modal__backdrop" />
          <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="metadata-modal-title">
            <h3 id="metadata-modal-title">Provide Source Details</h3>
            <p>
              Please enter citation details for{' '}
              <a href={currentManualIssue.url} target="_blank" rel="noreferrer">
                {currentManualIssue.url}
              </a>
              .
            </p>
            <p className="modal__hint">{currentManualIssue.message}</p>
            <form
              className="modal__form"
              onSubmit={async (event) => {
                event.preventDefault()
                const issue = manualMetadataQueue[currentManualIndex]
                if (!issue) return
                const authors = manualFormState.authors
                  .split(',')
                  .map((author) => author.trim())
                  .filter(Boolean)
                manualMetadataOverridesRef.current[manualFormState.url] = {
                  url: manualFormState.url,
                  title: manualFormState.title || manualFormState.url,
                  authors,
                  siteName: manualFormState.siteName || undefined,
                  accessDate: manualFormState.accessDate || undefined,
                }
                // Persist manual metadata immediately
                persistManualMetadata.current()
                
                if (currentManualIndex + 1 < manualMetadataQueue.length) {
                  setCurrentManualIndex((index) => index + 1)
                } else {
                  await finalizeManualMetadata()
                }
              }}
            >
              <label className="modal__label">
                Source URL
                <input name="url" value={manualFormState.url} readOnly />
              </label>
              <label className="modal__label">
                Title
                <input
                  name="title"
                  value={manualFormState.title}
                  onChange={(event) =>
                    setManualFormState((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="modal__label">
                Authors <span className="modal__hint-inline">(comma separated)</span>
                <input
                  name="authors"
                  value={manualFormState.authors}
                  onChange={(event) =>
                    setManualFormState((prev) => ({
                      ...prev,
                      authors: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="modal__label">
                Site or Publisher
                <input
                  name="siteName"
                  value={manualFormState.siteName}
                  onChange={(event) =>
                    setManualFormState((prev) => ({
                      ...prev,
                      siteName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="modal__label">
                Accessed Date
                <input
                  name="accessDate"
                  placeholder="e.g. October, 2025 or March 15, 2025"
                  value={manualFormState.accessDate}
                  onChange={(event) =>
                    setManualFormState((prev) => ({
                      ...prev,
                      accessDate: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="modal__actions">
                <button
                  type="button"
                  className="modal__button modal__button--secondary"
                  onClick={async () => {
                    if (currentManualIndex + 1 < manualMetadataQueue.length) {
                      setCurrentManualIndex((index) => index + 1)
                    } else {
                      await finalizeManualMetadata()
                    }
                  }}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="modal__button modal__button--secondary"
                  onClick={() => setShowSkipAllConfirmation(true)}
                >
                  Skip All
                </button>
                <button type="submit" className="modal__button">
                  Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      
      {showSkipAllConfirmation ? (
        <div className="modal">
          <div className="modal__backdrop" />
          <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="skip-all-modal-title">
            <h3 id="skip-all-modal-title">Skip All Reference Editing?</h3>
            <p>
              Are you sure you want to skip editing metadata for all remaining {manualMetadataQueue.length - currentManualIndex} source{manualMetadataQueue.length - currentManualIndex !== 1 ? 's' : ''}?
            </p>
            <p className="modal__hint">
              Sources without metadata will use their URL as the citation.
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="modal__button modal__button--secondary"
                onClick={() => setShowSkipAllConfirmation(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal__button"
                onClick={async () => {
                  setShowSkipAllConfirmation(false)
                  setManualMetadataModalOpen(false)
                  await finalizeManualMetadata()
                }}
              >
                Skip All
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
