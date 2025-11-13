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
  const allowedFonts = new Set(['Times New Roman', 'Helvetica', 'Courier New'] as const)
  const fontFamilyEnv = process.env.FONT_FAMILY
  const fontFamily = allowedFonts.has(fontFamilyEnv as any) ? (fontFamilyEnv as string) : 'Times New Roman'
  const parsedFontSize = Number(process.env.FONT_SIZE)
  const fontSize = Number.isFinite(parsedFontSize) ? parsedFontSize : 12
  const pdfBuffer = await generatePdfWithPuppeteer(processed, {
    outputPath,
    fontFamily,
    fontSize,
  })
  await writeFile(outputPath, pdfBuffer)
  console.log(`PDF written to ${outputPath} (${pdfBuffer.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
