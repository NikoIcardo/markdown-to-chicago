import fs from 'node:fs/promises'
import { getDocument } from './frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'

async function verifyPdfLinks(pdfPath) {
  const raw = await fs.readFile(pdfPath)
  const loadingTask = getDocument({ data: new Uint8Array(raw) })
  const pdf = await loadingTask.promise

  console.log(`PDF: ${pdfPath}`)
  console.log(`Pages: ${pdf.numPages}`)

  const results = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const annotations = await page.getAnnotations()

    annotations
      .filter((ann) => ann.subtype === 'Link')
      .forEach((ann) => {
        const summary = {
          page: pageIndex,
          dest: ann.dest ?? null,
          url: ann.url ?? null,
          action: ann.action ?? null,
        }
        results.push(summary)
      })
  }

  const gotoLinks = results.filter((ann) => ann.dest || ann.action === 'GoTo')
  console.log(`Found ${results.length} link annotations (${gotoLinks.length} GoTo destinations).`)

  gotoLinks.slice(0, 20).forEach((ann) => {
    console.log(`  Page ${ann.page}: dest=${JSON.stringify(ann.dest)} action=${ann.action ?? 'null'}`)
  })

  const missing = results.filter((ann) => !ann.dest && ann.action !== 'GoTo')
  if (missing.length) {
    console.warn(`WARNING: ${missing.length} link annotations without GoTo destinations.`)
    missing.slice(0, 20).forEach((ann) => {
      console.warn(`  Page ${ann.page}: dest=${JSON.stringify(ann.dest)} action=${ann.action ?? 'null'} url=${ann.url ?? 'null'}`)
    })
  }
}

const pdfPath = process.argv[2] || 'main-content.pdf'

verifyPdfLinks(pdfPath).catch((error) => {
  console.error('Failed to verify PDF links:', error)
  process.exitCode = 1
})
