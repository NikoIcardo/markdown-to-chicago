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
        justify-content: flex-start;
        align-items: center;
        text-align: center;
        gap: 0.5in;
        page-break-after: always;
        padding: 2.5in 1rem 0;
        page: title;
      }
      .title-page__heading {
        font-size: 48px;
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
      .toc-page {
        page-break-after: always;
        page: toc;
      }
      .toc-page h2,
      .toc-page h3,
      .toc-page h4 {
        margin-top: 0;
        text-align: left;
      }
      .toc-list,
      .toc-list ol {
        list-style: decimal;
        padding-left: 1.25rem;
      }
      .toc-list > li {
        margin-bottom: 0.35rem;
      }
      .document-body {
        padding: 0;
        page: content;
      }
      .document-body > *:first-child {
        margin-top: 0;
      }
      h1 {
        font-size: 40px;
        margin-top: 0;
      }
      h2 {
        font-size: 32px;
      }
      h3 {
        font-size: 26px;
      }
      h4 {
        font-size: 20px;
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
      @page {
        margin: 1in;
      }
      @page title {
        margin: 1in;
        @bottom-center { content: none; }
      }
      @page toc {
        margin: 1in;
        @bottom-center { content: none; }
      }
      @page content {
        margin: 1in;
        @bottom-center {
          content: counter(page);
          font-family: 'Times New Roman', serif;
          font-size: 12px;
          color: #4b5563;
        }
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

    await page.evaluate((headings) => {
      const tocHeading =
        document.querySelector('h1#table-of-contents') ||
        document.querySelector('h2#table-of-contents') ||
        document.querySelector('h3#table-of-contents') ||
        document.querySelector('h4#table-of-contents') ||
        document.querySelector('h5#table-of-contents') ||
        document.querySelector('h6#table-of-contents')

      const buildTocList = (items) => {
        const minDepth = items.length ? Math.min(...items.map((item) => item.depth)) : 1
        const root = document.createElement('ol')
        root.className = 'toc-list'
        const stack = [{ depth: minDepth, list: root }]

        items.forEach((item) => {
          if (!item.slug || !item.text) {
            return
          }
          if (item.slug === 'table-of-contents') {
            return
          }

          let currentDepth = item.depth
          if (currentDepth < stack[stack.length - 1].depth) {
            while (stack.length && currentDepth < stack[stack.length - 1].depth) {
              stack.pop()
            }
          } else if (currentDepth > stack[stack.length - 1].depth) {
            while (currentDepth > stack[stack.length - 1].depth) {
              const parentLi = stack[stack.length - 1].list.lastElementChild
              if (!parentLi) {
                break
              }
              const sublist = document.createElement('ol')
              parentLi.appendChild(sublist)
              stack.push({ depth: stack[stack.length - 1].depth + 1, list: sublist })
            }
          }

          const list = stack[stack.length - 1].list
          const li = document.createElement('li')
          const link = document.createElement('a')
          link.href = `#${item.slug}`
          link.textContent = item.text
          li.appendChild(link)
          list.appendChild(li)
        })

        return root
      }

      if (tocHeading) {
        const tocSection = document.createElement('section')
        tocSection.className = 'toc-page'
        tocHeading.parentNode.insertBefore(tocSection, tocHeading)
        tocSection.appendChild(tocHeading)

        let sibling = tocHeading.nextSibling
        while (sibling) {
          const next = sibling.nextSibling
          const isHeading =
            sibling.nodeType === Node.ELEMENT_NODE &&
            /^H[1-6]$/i.test((sibling as HTMLElement).tagName)
          if (isHeading) {
            break
          }
          sibling.parentNode?.removeChild(sibling)
          sibling = next
        }

        const generatedList = buildTocList(headings ?? [])
        tocSection.appendChild(generatedList)

        let sectionSibling = tocSection.nextSibling
        while (sectionSibling) {
          const next = sectionSibling.nextSibling
          const isHeading =
            sectionSibling.nodeType === Node.ELEMENT_NODE &&
            /^H[1-6]$/i.test((sectionSibling as HTMLElement).tagName)
          if (isHeading) {
            break
          }
          sectionSibling.parentNode?.removeChild(sectionSibling)
          sectionSibling = next
        }
      }

      const listItems = Array.from(document.querySelectorAll('li'))
      listItems.forEach((li) => {
        const contentText = li.textContent?.replace(/\s+/g, '') ?? ''
        const hasLink =
          li.querySelector('a[href]') !== null || li.querySelector('img, figure, table, blockquote')
        const hasStrongMeaningful =
          li.querySelector('strong, em, b, i, code, pre, span') !== null &&
          (li.textContent?.trim().length ?? 0) > 0

        if (!hasLink && !hasStrongMeaningful && contentText.length === 0) {
          li.remove()
        }
      })

      const listContainers = Array.from(document.querySelectorAll('ul, ol'))
      listContainers.forEach((list) => {
        const items = Array.from(list.querySelectorAll('li'))
        const hasItems = items.length > 0 && items.some((item) => item.textContent?.trim())
        if (!hasItems) {
          list.remove()
        }
      })

      const blockquotes = Array.from(document.querySelectorAll('blockquote'))
      blockquotes.forEach((quote) => {
        const text = quote.textContent?.trim() ?? ''
        const hasChildren =
          quote.querySelector('p, ul, ol, figure, img, table, a, strong, em, code, blockquote') !==
          null
        if (!text && !hasChildren) {
          quote.remove()
        }
      })

      const internalLinks = Array.from(document.querySelectorAll('a[href^="#"]')) as HTMLAnchorElement[]
      internalLinks.forEach((link) => {
        const rawHref = link.getAttribute('href') ?? ''
        const targetId = rawHref.replace(/^#/, '')
        if (!targetId) {
          return
        }
        if (document.getElementById(targetId)) {
          return
        }

        const target = document.createElement('span')
        target.id = targetId
        target.className = 'anchor-target'

        const container =
          link.closest('h1, h2, h3, h4, h5, h6, p, li, blockquote, figure, section, div') ??
          document.body

        if (container.firstChild) {
          container.insertBefore(target, container.firstChild)
        } else {
          container.appendChild(target)
        }
      })
    }, processed.headings)

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

    const footerTemplate = `
    <style>
      .pdf-footer {
        width: 100%;
        font-size: 11px;
        font-family: 'Times New Roman', serif;
        color: #4b5563;
        text-align: center;
        padding: 0.25in 0;
      }
      .pdf-footer[data-page-number="1"],
      .pdf-footer[data-page-number="2"] {
        display: none;
      }
    </style>
    <div class="pdf-footer"><span class="pageNumber"></span></div>
    `

    const pdfBuffer = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate,
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
