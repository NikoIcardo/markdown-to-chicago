import fs from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import puppeteer from 'puppeteer'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkSlug from 'remark-slug'
import remarkAutolinkHeadings from 'remark-autolink-headings'
import type { ProcessedMarkdown } from '../utils/types.ts'

async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSlug)
    .use(remarkAutolinkHeadings, {
      behavior: 'append',
      linkProperties: { ariaHidden: 'true', tabIndex: -1 },
    })
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

  const debugHtmlPath = resolvePath(process.cwd(), 'debug-output.html')
  await fs.writeFile(debugHtmlPath, html, 'utf8')

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    try {
      await page.waitForSelector('a[href^="#"]', { timeout: 2000 })
    } catch {
      // no internal anchors detected; continue without validation
    }

    const anchors = await page.$$eval('a[href^="#"]', (elements) =>
      Array.from(
        new Set(
          elements
            .map((el) => el.getAttribute('href')?.replace(/^#/, '') || '')
            .filter((href) => href && href.length > 0),
        ),
      ),
    )

    const ids = await page.$$eval('[id]', (elements) =>
      Array.from(new Set(elements.map((el) => el.id).filter((id) => id && id.length > 0))),
    )

    const missing = anchors.filter((anchor) => !ids.includes(anchor))

    if (missing.length > 0) {
      console.warn('⚠️ Some anchors do not match any element IDs:', missing)
    } else if (anchors.length > 0) {
      console.log('✅ All internal anchors have valid matching IDs.')
    } else {
      console.log('ℹ️ No internal anchors detected for validation.')
    }

    const pdfPath = options?.outputPath ?? resolvePath(process.cwd(), 'output.pdf')

    const pdfBuffer = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })

    return pdfBuffer
  } finally {
    await browser.close()
  }
}
