import { useCallback, useMemo, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'
import type { ProcessedMarkdown } from './utils/types'
import { processMarkdown } from './utils/markdownProcessor'
import { generatePdf } from './pdf/generatePdf'

type ProcessingState = 'idle' | 'processing' | 'processed' | 'error'

function App() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [originalMarkdown, setOriginalMarkdown] = useState<string>('')
  const [processed, setProcessed] = useState<ProcessedMarkdown | null>(null)
  const [processingState, setProcessingState] = useState<ProcessingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const handleFileSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setProcessingState('processing')
      setErrorMessage(null)
      setProcessed(null)
      setFileName(file.name)

      const text = await file.text()
      setOriginalMarkdown(text)

      const result = await processMarkdown(text)
      setProcessed(result)
      setProcessingState('processed')
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

  const diagnostics = useMemo(() => processed?.diagnostics, [processed])
  const bibliographyEntries = useMemo(() => processed?.bibliographyEntries ?? [], [processed])

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
        <section className="panel">
          <h2>1. Upload Markdown</h2>
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
        </section>

        {processed && (
          <>
            <section className="panel">
              <h2>2. Diagnostics</h2>
              {diagnostics?.warnings?.length ? (
                <ul className="diagnostics diagnostics--warning">
                  {diagnostics.warnings.map((warning, index) => (
                    <li key={`warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p>No warnings detected during processing.</p>
              )}
            </section>

            <section className="panel">
              <h2>3. Bibliography Summary</h2>
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
            </section>

            <section className="panel">
              <h2>4. Preview &amp; Export</h2>
              <div className="actions">
                <button type="button" onClick={handleDownloadMarkdown}>
                  Download Processed Markdown
                </button>
                <button type="button" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}
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
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
