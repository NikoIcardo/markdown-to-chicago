import puppeteer from 'puppeteer'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import type { ProcessedMarkdown } from '../utils/types.ts'

async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(markdown)
  return String(file)
}

export async function generatePdfWithPuppeteer(
  processed: ProcessedMarkdown,
  options?: { outputPath?: string },
): Promise<Buffer> {
  const htmlBody = await markdownToHtml(processed.modified)

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${processed.title || 'Document'}</title>
    <style>
      body {
        font-family: 'Times New Roman', serif;
        line-height: 1.6;
        margin: 1in;
      }
      a {
        color: #1a56db;
        text-decoration: underline;
      }
      h1, h2, h3, h4, h5, h6 {
        scroll-margin-top: 80px;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      @media print {
        a[href^="#"]::after { content: ""; }
      }
    </style>
  </head>
  <body>
    ${htmlBody}
  </body>
</html>`

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdfBuffer = await page.pdf({
    path: options?.outputPath ?? undefined,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  })

  await browser.close()
  return pdfBuffer
}
