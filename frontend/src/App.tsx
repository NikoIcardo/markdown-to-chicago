import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
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

type SectionKey = 'upload' | 'diagnostics' | 'bibliography' | 'preview'

interface AccordionSectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  isOpen,
  onToggle,
  badge,
  children,
}) => (
  <section className={`panel accordion ${isOpen ? 'accordion--open' : ''}`}>
    <button type="button" className="accordion__header" onClick={onToggle}>
      <span className="accordion__title">{title}</span>
      <span className="accordion__spacer" />
      {badge ? <span className="accordion__badge">{badge}</span> : null}
      <span className="accordion__chevron" aria-hidden="true">
        {isOpen ? '−' : '+'}
      </span>
    </button>
    <div className="accordion__content" aria-hidden={!isOpen}>
      {isOpen ? children : null}
    </div>
  </section>
)

const initialSectionState: Record<SectionKey, boolean> = {
  upload: true,
  diagnostics: false,
  bibliography: false,
  preview: false,
}

type ProcessingState = 'idle' | 'processing' | 'processed' | 'error'

function App() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [originalMarkdown, setOriginalMarkdown] = useState<string>('')
  const [processed, setProcessed] = useState<ProcessedMarkdown | null>(null)
  const [processingState, setProcessingState] = useState<ProcessingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false)
  const [expandedSections, setExpandedSections] =
    useState<Record<SectionKey, boolean>>(initialSectionState)
  const [manualMetadataPreference, setManualMetadataPreference] = useState<'ask' | 'skip' | null>(
    null,
  )
  const manualMetadataOverridesRef = useRef<Record<string, ManualMetadataInput>>({})
  const [manualMetadataQueue, setManualMetadataQueue] = useState<MetadataIssue[]>([])
  const [currentManualIndex, setCurrentManualIndex] = useState(0)
  const [manualMetadataModalOpen, setManualMetadataModalOpen] = useState(false)
  const [manualFormState, setManualFormState] = useState({
    url: '',
    title: '',
    authors: '',
    siteName: '',
    accessDate: '',
  })
  const [pendingManualMarkdown, setPendingManualMarkdown] = useState<string | null>(null)

  useEffect(() => {
    if (processed) {
      setExpandedSections((prev) => ({
        ...prev,
        diagnostics: true,
        bibliography: true,
        preview: true,
      }))
    }
  }, [processed])

  useEffect(() => {
    if (manualMetadataModalOpen && manualMetadataQueue[currentManualIndex]) {
      const issue = manualMetadataQueue[currentManualIndex]
      setManualFormState({
        url: issue.url,
        title: '',
        authors: '',
        siteName: '',
        accessDate: '',
      })
    }
  }, [manualMetadataModalOpen, manualMetadataQueue, currentManualIndex])

  const toggleSection = useCallback((section: SectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
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

  const handleFileSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      manualMetadataOverridesRef.current = {}
      setManualMetadataQueue([])
      setManualMetadataModalOpen(false)
      setExpandedSections({ ...initialSectionState })
      setProcessingState('processing')
      setErrorMessage(null)
      setProcessed(null)
      setFileName(file.name)

      const text = await file.text()
      setOriginalMarkdown(text)

      let preference = manualMetadataPreference
      if (preference === null) {
        const wantsManual = window.confirm(
          'If metadata retrieval fails for a source, would you like to provide the citation details manually?',
        )
        preference = wantsManual ? 'ask' : 'skip'
        setManualMetadataPreference(preference)
      }

      const result = await processMarkdown(text, {
        manualMetadata: manualMetadataOverridesRef.current,
      })
      setProcessed(result)
      setProcessingState('processed')

      if (preference === 'ask' && result.metadataIssues.length) {
        startManualMetadataCollection(result.metadataIssues, text)
      }
    } catch (error) {
      console.error(error)
      setProcessingState('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to process the markdown file.',
      )
    }
  }, [])

  const handleDownloadMarkdown = useCallback(() => {
    if (!processed) return
    const blob = new Blob([processed.modified], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName ? fileName.replace(/\.md$/i, '-processed.md') : 'processed.md'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [processed, fileName])

  const handleDownloadPdf = useCallback(async () => {
    if (!processed) return
    setIsGeneratingPdf(true)
    try {
      const blob = await generatePdf(processed, { originalFileName: fileName ?? undefined })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName ? fileName.replace(/\.md$/i, '.pdf') : 'document.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to generate the PDF document.',
      )
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [processed, fileName])

  const handleDownloadDocx = useCallback(async () => {
    if (!processed) return
    setIsGeneratingDocx(true)
    try {
      const blob = await generateDocx(processed)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName ? fileName.replace(/\.md$/i, '.docx') : 'document.docx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to generate the Google Docs file.',
      )
    } finally {
      setIsGeneratingDocx(false)
    }
  }, [processed, fileName])

  const diagnostics = useMemo(() => processed?.diagnostics, [processed])
  const bibliographyEntries = useMemo(() => processed?.bibliographyEntries ?? [], [processed])

  const currentManualIssue = manualMetadataModalOpen
    ? manualMetadataQueue[currentManualIndex]
    : undefined

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Markdown to Formatted PDF Converter</h1>
          <p className="app__subtitle">
            Upload a markdown document to automatically generate a bibliography and export a
            paginated PDF with title and table of contents pages.
          </p>
        </div>
      </header>

      <main className="app__main">
        <AccordionSection
          title="1. Upload Markdown"
          isOpen={expandedSections.upload}
          onToggle={() => toggleSection('upload')}
        >
          <p>Select a markdown file to begin processing.</p>
          <label className="file-input">
            <input type="file" accept=".md,.markdown,text/markdown" onChange={handleFileSelection} />
            <span>{fileName ?? 'Choose Markdown File'}</span>
          </label>
          {processingState === 'processing' && (
            <div className="status status--processing">Processing markdown and fetching sources…</div>
          )}
          {processingState === 'error' && errorMessage && (
            <div className="status status--error">{errorMessage}</div>
          )}
          {processingState === 'processed' && processed && (
            <div className="status status--success">Document processed successfully.</div>
          )}
        </AccordionSection>

        <AccordionSection
          title="2. Diagnostics"
          isOpen={expandedSections.diagnostics}
          onToggle={() => toggleSection('diagnostics')}
          badge={
            diagnostics?.warnings?.length
              ? <span>{diagnostics.warnings.length}</span>
              : undefined
          }
        >
          {processed ? (
            diagnostics?.warnings?.length ? (
              <ul className="diagnostics diagnostics--warning">
                {diagnostics.warnings.map((warning, index) => (
                  <li key={`warning-${index}`}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>No warnings detected during processing.</p>
            )
          ) : (
            <p>Diagnostics will appear here once a document has been processed.</p>
          )}
        </AccordionSection>

        <AccordionSection
          title="3. Bibliography Summary"
          isOpen={expandedSections.bibliography}
          onToggle={() => toggleSection('bibliography')}
          badge={
            bibliographyEntries.length
              ? <span>{bibliographyEntries.length}</span>
              : undefined
          }
        >
          {processed ? (
            <>
              <p>
                {bibliographyEntries.length}{' '}
                {bibliographyEntries.length === 1 ? 'entry located' : 'entries located'}.
              </p>
              <div className="bibliography-list">
                {bibliographyEntries.map((entry) => (
                  <div
                    key={entry.anchorId}
                    className={`bibliography-list__item ${entry.isNew ? 'bibliography-list__item--new' : ''}`}
                  >
                    <span className="bibliography-list__number">{entry.number}.</span>
                    <span>{entry.citation}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>The bibliography summary will be available after you process a document.</p>
          )}
        </AccordionSection>

        <AccordionSection
          title="4. Preview & Export"
          isOpen={expandedSections.preview}
          onToggle={() => toggleSection('preview')}
        >
          {processed ? (
            <>
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed.modified}</ReactMarkdown>
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
              We couldn’t retrieve metadata for{' '}
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
                  placeholder="e.g. March 15, 2025"
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
                <button type="submit" className="modal__button">
                  Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
