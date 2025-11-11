export interface SourceMetadata {
  url: string
  title: string
  authors: string[]
  siteName?: string
  isPdf: boolean
  accessDate: string
  retrievalError?: string
}

export interface BibliographyEntry {
  number: number
  url: string
  citation: string
  anchorId: string
  isNew: boolean
}

export interface ProcessingDiagnostics {
  warnings: string[]
  errors: string[]
}

export interface ProcessedMarkdown {
  original: string
  modified: string
  title: string
  mainHeadingDepth: number
  headings: HeadingInfo[]
  bibliographyEntries: BibliographyEntry[]
  diagnostics: ProcessingDiagnostics
}

export interface HeadingInfo {
  depth: number
  text: string
  slug: string
}

export interface ReferenceOccurrence {
  url: string
  number: number
}
