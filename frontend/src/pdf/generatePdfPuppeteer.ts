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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
  const docTitle = processed.title?.trim() || options?.originalFileName || 'Document'
  const docSubtitle = processed.subtitle?.trim()
  const generatedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const originalFileName = options?.originalFileName

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(docTitle)}</title>
    <style>
      body {
        font-family: 'Times New Roman', serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
      }
      .title-page {
        min-height: calc(100vh - 2in);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        gap: 0.5in;
        page-break-after: always;
        padding: 0 1rem;
      }
      .title-page__heading {
        font-size: 42px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .title-page__subtitle {
        font-size: 20px;
        max-width: 6.5in;
      }
      .title-page__meta {
        font-size: 14px;
        color: #4b5563;
      }
      .document-body {
        padding: 0;
      }
      .document-body > *:first-child {
        margin-top: 0;
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
      .anchor-target {
        display: block;
        height: 0;
      }
      @media print {
        a[href^="#"]::after { content: ""; }
      }
    </style>
  </head>
  <body>
    <section class="title-page">
      <h1 class="title-page__heading">${escapeHtml(docTitle)}</h1>
      ${docSubtitle ? `<p class="title-page__subtitle">${escapeHtml(docSubtitle)}</p>` : ''}
      <p class="title-page__meta">
        Generated ${escapeHtml(generatedDate)}${originalFileName ? ` • Source: ${escapeHtml(originalFileName)}` : ''}
      </p>
    </section>
    <main class="document-body">
      ${htmlBody}
    </main>
  </body>
</html>`

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    await page.evaluate(() => {
      const anchorTargets = Array.from(
        document.querySelectorAll('a[id]'),
      ) as HTMLAnchorElement[]
      anchorTargets.forEach((anchor) => {
        const isEmpty =
          anchor.childElementCount === 0 &&
          (anchor.textContent === null || anchor.textContent.trim().length === 0)
        if (!isEmpty) {
          return
        }

        const { id } = anchor
        if (!id) {
          return
        }

        const existing = document.getElementById(id)
        if (existing && existing !== anchor) {
          anchor.remove()
          return
        }

        const span = document.createElement('span')
        span.id = id
        span.className = 'anchor-target'

        if (anchor.parentElement) {
          anchor.parentElement.insertBefore(span, anchor)
          anchor.remove()
        } else {
          document.body.insertBefore(span, document.body.firstChild)
          anchor.remove()
        }
      })
    })

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
    const debugHtmlPath = resolvePath(process.cwd(), 'debug-output.html')
    const finalHtml = await page.content()
    await fs.writeFile(debugHtmlPath, finalHtml, 'utf8')

    const pdfBuffer = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '1in',
        bottom: '1in',
        left: '1in',
        right: '1in',
      },
    })

    return pdfBuffer
  } finally {
    await browser.close()
  }
}
