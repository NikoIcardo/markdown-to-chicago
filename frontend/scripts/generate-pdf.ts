import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { processMarkdown } from '../src/utils/markdownProcessor.ts'
import { generatePdfWithPuppeteer } from '../src/pdf/generatePdfPuppeteer.ts'

async function main() {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const markdownPath = resolve(currentDir, '..', '..', 'main-content.md')
  const markdown = await readFile(markdownPath, 'utf8')
  const processed = await processMarkdown(markdown)
  const outputPath = resolve(currentDir, '..', '..', 'debug-output.pdf')
  const pdfBuffer = await generatePdfWithPuppeteer(processed, {
    outputPath,
  })
  await writeFile(outputPath, pdfBuffer)
  console.log(`PDF written to ${outputPath} (${pdfBuffer.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
