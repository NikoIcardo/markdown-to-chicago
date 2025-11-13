import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { processMarkdown } from '../src/utils/markdownProcessor.ts'
import { generatePdf } from '../src/pdf/generatePdf.tsx'

async function main() {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const markdownPath = resolve(currentDir, '..', '..', 'main-content.md')
  const markdown = await readFile(markdownPath, 'utf8')
  const processed = await processMarkdown(markdown)
  const blob = await generatePdf(processed, { originalFileName: 'main-content.md' })
  const arrayBuffer = await blob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const outputPath = resolve(currentDir, '..', '..', 'debug-output.pdf')
  await writeFile(outputPath, buffer)
  console.log(`PDF written to ${outputPath} (${buffer.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
