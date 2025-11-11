import { format } from 'date-fns'
import type { SourceMetadata } from './types'

let pdfjsModulePromise:
  | Promise<{
      getDocument: typeof import('pdfjs-dist')['getDocument']
      GlobalWorkerOptions: typeof import('pdfjs-dist')['GlobalWorkerOptions']
    }>
  | null = null

async function loadPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
      if (worker?.default) {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      }
      return {
        getDocument: pdfjs.getDocument,
        GlobalWorkerOptions: pdfjs.GlobalWorkerOptions,
      }
    })()
  }
  return pdfjsModulePromise
}

type HtmlMetaName =
  | 'author'
  | 'byl'
  | 'byline'
  | 'dc.creator'
  | 'article:author'
  | 'parsely-author'

const AUTHOR_META_NAMES: HtmlMetaName[] = [
  'author',
  'byl',
  'byline',
  'dc.creator',
  'article:author',
  'parsely-author',
]

function extractAuthorsFromHtml(doc: Document): string[] {
  const authors = new Set<string>()

  AUTHOR_META_NAMES.forEach((name) => {
    const selector = name.includes(':')
      ? `meta[property="${name}"]`
      : `meta[name="${name}"]`
    doc.querySelectorAll(selector).forEach((meta) => {
      const content = meta.getAttribute('content')?.trim()
      if (content) {
        content.split(/,|and/).map((a) => a.trim()).forEach((author) => {
          if (author) {
            authors.add(author)
          }
        })
      }
    })
  })

  return Array.from(authors)
}

function extractSiteName(doc: Document, url: URL): string | undefined {
  const ogSiteName = doc
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute('content')
    ?.trim()
  if (ogSiteName) return ogSiteName

  const metaSite = doc
    .querySelector('meta[name="application-name"]')
    ?.getAttribute('content')
    ?.trim()
  if (metaSite) return metaSite

  return url.hostname.replace(/^www\./, '')
}

function extractTitleFromHtml(doc: Document): string | undefined {
  const ogTitle = doc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content')
    ?.trim()
  if (ogTitle) return ogTitle

  const twitter = doc
    .querySelector('meta[name="twitter:title"]')
    ?.getAttribute('content')
    ?.trim()
  if (twitter) return twitter

  const docTitle = doc.querySelector('title')?.textContent?.trim()
  if (docTitle) return docTitle

  return undefined
}

async function extractPdfMetadata(arrayBuffer: ArrayBuffer) {
  const { getDocument } = await loadPdfJs()

  const loadingTask = getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
  })

  const pdf = await loadingTask.promise
  const { info, metadata } = await pdf.getMetadata().catch(() => ({
    info: {},
    metadata: null,
  }))

  await pdf.destroy()

  const title =
    metadata?.get('dc:title') ||
    metadata?.get('pdf:title') ||
    (info as any).Title ||
    undefined

  const authorRaw =
    metadata?.get('dc:creator') ||
    metadata?.get('pdf:author') ||
    (info as any).Author ||
    undefined

  const authors = authorRaw
    ? authorRaw
        .split(/,|and/)
        .map((a: string) => a.trim())
        .filter(Boolean)
    : []

  return { title, authors }
}

export async function fetchSourceMetadata(urlString: string): Promise<SourceMetadata> {
  const accessDate = format(new Date(), 'MMMM d, yyyy')
  let url: URL

  try {
    url = new URL(urlString)
  } catch {
    return {
      url: urlString,
      title: urlString,
      authors: [],
      siteName: undefined,
      isPdf: false,
      accessDate,
      retrievalError: 'Invalid URL',
    }
  }

  try {
    const response = await fetch(url.toString(), {
      mode: 'cors',
    })

    const contentType = response.headers.get('content-type') || ''

    if (/application\/pdf/.test(contentType)) {
      const buffer = await response.arrayBuffer()
      const pdfMetadata = await extractPdfMetadata(buffer)

      return {
        url: url.toString(),
        title: pdfMetadata.title || url.toString(),
        authors: pdfMetadata.authors,
        siteName: url.hostname.replace(/^www\./, ''),
        isPdf: true,
        accessDate,
      }
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')

    const title = extractTitleFromHtml(doc) || url.toString()
    const authors = extractAuthorsFromHtml(doc)
    const siteName = extractSiteName(doc, url)

    return {
      url: url.toString(),
      title,
      authors,
      siteName,
      isPdf: false,
      accessDate,
    }
  } catch (error) {
    return {
      url: url.toString(),
      title: url.toString(),
      authors: [],
      siteName: url.hostname.replace(/^www\./, ''),
      isPdf: false,
      accessDate,
      retrievalError:
        error instanceof Error ? error.message : 'Unknown error fetching metadata',
    }
  }
}
