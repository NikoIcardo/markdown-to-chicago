import type { ProcessedMarkdown } from '../utils/types'

interface GeneratePdfOptions {
  originalFileName?: string
  fontFamily?: string
  fontSize?: number
}

export async function generatePdf(
  processed: ProcessedMarkdown,
  options?: GeneratePdfOptions,
): Promise<Blob> {
  const response = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      processed,
      options,
    }),
  })

  if (!response.ok) {
    let message = 'Failed to generate PDF'
    try {
      const errorText = await response.text()
      if (errorText) {
        message = errorText
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return response.blob()
}
