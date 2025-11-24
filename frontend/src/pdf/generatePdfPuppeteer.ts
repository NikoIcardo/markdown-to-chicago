import fs from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import puppeteer from 'puppeteer'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkSlug from 'remark-slug'
import remarkAutolinkHeadings from 'remark-autolink-headings'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
// pdfjs-dist is loaded dynamically to avoid SSR issues
import type { ProcessedMarkdown } from '../utils/types.ts'

const FONT_CONFIG = {
  'Times New Roman': {
    css: "'Times New Roman', Times, serif",
    pdf: StandardFonts.TimesRoman,
  },
  Helvetica: {
    css: 'Helvetica, Arial, sans-serif',
    pdf: StandardFonts.Helvetica,
  },
  'Courier New': {
    css: "'Courier New', Courier, monospace",
    pdf: StandardFonts.Courier,
  },
} as const satisfies Record<string, { css: string; pdf: StandardFonts }>

type FontName = keyof typeof FONT_CONFIG

const DEFAULT_FONT: FontName = 'Times New Roman'
const DEFAULT_FONT_SIZE = 12
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 20
const POINT_TO_PX = 96 / 72
const FONT_SIZE_CORRECTION_FACTOR = 1.7

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Find which page contains the specified marker text in a PDF
 * @param pdfData The PDF file as a Uint8Array
 * @param markerText The text marker to search for
 * @returns The 0-indexed page number containing the marker, or -1 if not found
 */
async function findMarkerPageInPdf(pdfData: Uint8Array, markerText: string): Promise<number> {
  try {
    // Dynamic import to avoid SSR transformation issues
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({ data: pdfData })
    const pdf = await loadingTask.promise
    const numPages = pdf.numPages

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: any) => item.str).join(' ')
      
      if (pageText.includes(markerText)) {
        console.log(`✅ Found marker on page ${pageNum} (0-indexed: ${pageNum - 1})`)
        return pageNum - 1 // Return 0-indexed page number
      }
    }
    
    console.warn('⚠️ Marker text not found in any page')
    return -1 // Marker not found
  } catch (error) {
    console.error('Error parsing PDF for marker:', error)
    return -1
  }
}

async function markdownToHtml(markdown: string): Promise<string> {
  // First, strip the YAML frontmatter before converting to HTML
  // The frontmatter is used for title page generation but shouldn't appear in the content body
  const markdownWithoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
  
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSlug)
    .use(remarkAutolinkHeadings, {
      behavior: 'append',
      linkProperties: { ariaHidden: 'true', tabIndex: -1 },
    })
    .use(remarkHtml, { sanitize: false })
    .process(markdownWithoutFrontmatter)
  return String(file)
}

export async function generatePdfWithPuppeteer(
  processed: ProcessedMarkdown,
  options?: { outputPath?: string; fontFamily?: string; fontSize?: number; originalFileName?: string },
): Promise<Buffer> {
  const htmlBody = await markdownToHtml(processed.modified)
  const docTitle = processed.title?.trim() || options?.originalFileName || 'Document'
  const docSubtitle = processed.subtitle?.trim()
  const requestedFontKey = options?.fontFamily as FontName | undefined
  const selectedFontKey =
    requestedFontKey && FONT_CONFIG[requestedFontKey] ? requestedFontKey : DEFAULT_FONT
  const selectedFontConfig = FONT_CONFIG[selectedFontKey]
  const requestedFontSize =
    typeof options?.fontSize === 'number' && Number.isFinite(options.fontSize)
      ? Math.round(options.fontSize)
      : DEFAULT_FONT_SIZE
  const contentFontSizePt = Math.min(
    Math.max(requestedFontSize, MIN_FONT_SIZE),
    MAX_FONT_SIZE,
  )
  const adjustedContentFontSizePt = contentFontSizePt * FONT_SIZE_CORRECTION_FACTOR
  const contentFontSizePx = adjustedContentFontSizePt * POINT_TO_PX
  const contentFontFamily = selectedFontConfig.css
  const headingFontFamily = FONT_CONFIG[DEFAULT_FONT].css

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
          font-size: ${contentFontSizePx}px;
          font-size: ${adjustedContentFontSizePt}pt;
        }
        .title-page {
          min-height: calc(100vh - 2.5in);
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
        .document-body {
          padding: 0;
          font-family: ${contentFontFamily};
          font-size: ${contentFontSizePx}px;
          font-size: ${adjustedContentFontSizePt}pt;
        }
        .document-body > *:first-child {
          margin-top: 0;
        }
        .document-body ol,
        .document-body ul {
          list-style-position: outside;
          padding-left: 3.5em;
          margin: 0 0 1.2em 0;
        }
        .document-body ol li,
        .document-body ul li {
          padding-inline-start: 0.35em;
        }
        .document-body ol li::marker,
        .document-body ul li::marker {
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum';
        }
        h1 {
          font-size: 40px;
          margin-top: 0;
          font-family: ${headingFontFamily};
        }
        h2 {
          font-size: 32px;
          font-family: ${headingFontFamily};
        }
        h3 {
          font-size: 26px;
          font-family: ${headingFontFamily};
        }
        h4 {
          font-size: 20px;
          font-family: ${headingFontFamily};
        }
        .main-heading,
        .first-main-heading {
          margin-top: 0;
        }
        .main-heading-divider,
        .first-main-heading-divider {
          break-before: page;
          display: block;
        }
        .main-heading-break,
        .first-main-heading-break {
          break-before: page;
        }
        a {
          color: #1a56db;
          text-decoration: underline;
        }
        /* Citation links as superscript */
        a.citation-link {
          vertical-align: super;
          font-size: 0.75em;
          line-height: 0;
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
      </section>
      <main class="document-body">
      ${htmlBody}
    </main>
  </body>
</html>`

  // Launch browser - use PUPPETEER_EXECUTABLE_PATH env var if set, otherwise let Puppeteer use its bundled browser
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  
  // Only set executablePath if explicitly configured via environment variable
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  const browser = await puppeteer.launch(launchOptions)

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    await page.evaluate((headings, mainHeadingDepth) => {
      const slugify = (value) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')

      const slugLookup = new Map()
      ;(headings ?? []).forEach((item) => {
        if (!item || !item.slug) {
          return
        }
        const key = slugify(item.text ?? '')
        if (!key) {
          return
        }
        if (!slugLookup.has(key)) {
          slugLookup.set(key, item.slug)
        }
      })

      const tocHeading =
        document.querySelector('h1#table-of-contents') ||
        document.querySelector('h2#table-of-contents') ||
        document.querySelector('h3#table-of-contents') ||
        document.querySelector('h4#table-of-contents') ||
        document.querySelector('h5#table-of-contents') ||
        document.querySelector('h6#table-of-contents')

      if (tocHeading) {
        ;(tocHeading as HTMLElement).style.fontSize = '30px'
        ;(tocHeading as HTMLElement).style.marginBottom = '0.8rem'

        const tocNodes: Node[] = []
        let node = tocHeading.nextSibling
        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/i.test((node as HTMLElement).tagName)) {
            break
          }
          tocNodes.push(node)
          node = node.nextSibling
        }

        const tocLinks: HTMLAnchorElement[] = []
        tocNodes.forEach((tocNode) => {
          if (tocNode.nodeType === Node.ELEMENT_NODE) {
            tocLinks.push(...(tocNode as HTMLElement).querySelectorAll('a'))
          }
        })

        tocLinks.forEach((link) => {
          const text = (link.textContent ?? '').trim()
          if (!text) {
            return
          }
          const normalized = slugify(text)
          if (!normalized) {
            return
          }
          let targetSlug: string | undefined = slugLookup.get(normalized)
          if (!targetSlug) {
            const fallback = Array.from(slugLookup.entries()).find(([key]) =>
              key.startsWith(normalized) || normalized.startsWith(key),
            )
            targetSlug = fallback?.[1]
          }
          if (targetSlug) {
            link.setAttribute('href', `#${targetSlug}`)
          }
        })

        const tocList = tocHeading.nextElementSibling
        if (tocList && ['OL', 'UL'].includes(tocList.tagName)) {
          const tocListElement = tocList as HTMLElement
          tocListElement.style.fontSize = '24px'
          tocListElement.style.lineHeight = '1.6'
          tocListElement.style.paddingLeft = '2.0rem'
          tocListElement.style.breakAfter = 'page'
          tocListElement.style.pageBreakAfter = 'always'
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

      // Bibliography filtering is now handled in markdownProcessor.ts before numbering
      // This ensures citation numbers match the filtered bibliography count
      const bibliographyHeading = document.getElementById('bibliography')

      const desiredDepth = Number(mainHeadingDepth)
      const headingDepths = (headings ?? [])
        .filter((item) => item && item.text && item.slug !== 'table-of-contents')
        .map((item) => Number(item.depth) || 6)
      let fallbackDepth = headingDepths.length > 0 ? Math.min(...headingDepths) : 2
      if (tocHeading) {
        let probe = tocHeading.nextSibling
        while (probe) {
          if (probe.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/i.test((probe as HTMLElement).tagName)) {
            fallbackDepth = Number(((probe as HTMLElement).tagName || '').replace(/[^\d]/g, '')) || fallbackDepth
            break
          }
          probe = probe.nextSibling
        }
      }
      const mainDepth = Number.isFinite(desiredDepth) && desiredDepth > 1 ? desiredDepth : fallbackDepth
      const mainHeadingSelector = `h${mainDepth}`
      const mainHeadingNodes = Array.from(document.querySelectorAll(mainHeadingSelector)).filter(
        (heading) => heading.id !== 'table-of-contents' && !heading.closest('.title-page'),
      )
      const markDivider = (divider: HTMLElement | null, className: string) => {
        if (divider) {
          divider.classList.add(className)
        }
      }
      mainHeadingNodes.forEach((heading, index) => {
        const isFirst = index === 0
        const headingClass = isFirst ? 'first-main-heading' : 'main-heading'
        heading.classList.add(headingClass)

        let previous = heading.previousSibling
        let divider: HTMLElement | null = null
        while (previous) {
          if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName === 'HR') {
            divider = previous as HTMLElement
            break
          }
          if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName !== 'HR') {
            break
          }
          previous = previous.previousSibling
        }
        if (divider) {
          markDivider(divider, isFirst ? 'first-main-heading-divider' : 'main-heading-divider')
        } else {
          heading.classList.add(isFirst ? 'first-main-heading-break' : 'main-heading-break')
        }
      })

        if (bibliographyHeading) {
          const bibliographyElement = bibliographyHeading as HTMLElement
          const alreadyMarkedAsMain =
            bibliographyElement.classList.contains('main-heading') ||
            bibliographyElement.classList.contains('first-main-heading')

          if (!alreadyMarkedAsMain) {
            const referenceHeading =
              mainHeadingNodes.find((node) => node !== bibliographyElement) ?? mainHeadingNodes[0]

            if (referenceHeading instanceof HTMLElement) {
              const referenceStyles = window.getComputedStyle(referenceHeading)
              bibliographyElement.style.fontFamily = referenceStyles.fontFamily
              bibliographyElement.style.fontSize = referenceStyles.fontSize
              bibliographyElement.style.fontWeight = referenceStyles.fontWeight
              bibliographyElement.style.letterSpacing = referenceStyles.letterSpacing
              bibliographyElement.style.textTransform = referenceStyles.textTransform
              bibliographyElement.style.marginTop = referenceStyles.marginTop
              bibliographyElement.style.marginBottom = referenceStyles.marginBottom
              bibliographyElement.style.color = referenceStyles.color
              bibliographyElement.style.textAlign = referenceStyles.textAlign
            }

            bibliographyElement.classList.add(
              mainHeadingNodes.length === 0 ? 'first-main-heading' : 'main-heading',
            )
          }

          bibliographyElement.classList.add(
            bibliographyElement.classList.contains('first-main-heading')
              ? 'first-main-heading-break'
              : 'main-heading-break',
          )

          const isFirstHeading = bibliographyElement.classList.contains('first-main-heading')
          const breakClass = isFirstHeading ? 'first-main-heading-break' : 'main-heading-break'
          const dividerClass = isFirstHeading ? 'first-main-heading-divider' : 'main-heading-divider'

          let previous = bibliographyElement.previousSibling
          let divider: HTMLElement | null = null
          while (previous) {
            if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName === 'HR') {
              divider = previous as HTMLElement
              break
            }
            if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName !== 'HR') {
              break
            }
            previous = previous.previousSibling
          }

          if (!divider) {
            divider = document.createElement('hr')
            if (bibliographyElement.parentElement) {
              bibliographyElement.parentElement.insertBefore(divider, bibliographyElement)
            } else {
              document.body.insertBefore(divider, bibliographyElement)
            }
          }

          if (divider) {
            markDivider(divider, dividerClass)
          }

          bibliographyElement.classList.remove(breakClass)

          let nextSibling = bibliographyElement.nextSibling
          let trailingDivider: HTMLElement | null = null
          while (nextSibling) {
            if (nextSibling.nodeType === Node.TEXT_NODE) {
              if ((nextSibling.textContent ?? '').trim().length === 0) {
                nextSibling = nextSibling.nextSibling
                continue
              }
              break
            }

            if (
              nextSibling.nodeType === Node.ELEMENT_NODE &&
              (nextSibling as HTMLElement).tagName === 'HR'
            ) {
              trailingDivider = nextSibling as HTMLElement
            }
            break
          }

          if (!trailingDivider) {
            trailingDivider = document.createElement('hr')
            const parent = bibliographyElement.parentElement ?? document.body
            if (bibliographyElement.nextSibling) {
              parent.insertBefore(trailingDivider, bibliographyElement.nextSibling)
            } else {
              parent.appendChild(trailingDivider)
            }
          }
        }

        const internalLinks = Array.from(document.querySelectorAll('a[href^="#"]'))
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
    }, processed.headings, processed.mainHeadingDepth)

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

    // Add an invisible text marker before the first main heading
    // This marker will be in the PDF but invisible to readers
    const MARKER_TEXT = '___FIRST_CONTENT_PAGE_MARKER___'
    await page.evaluate((markerText) => {
      const firstMainHeading = document.querySelector('.first-main-heading')
      if (firstMainHeading && firstMainHeading.parentElement) {
        const marker = document.createElement('span')
        marker.textContent = markerText
        marker.style.cssText = 'opacity: 0; position: absolute; font-size: 1px; pointer-events: none;'
        firstMainHeading.parentElement.insertBefore(marker, firstMainHeading)
      }
    }, MARKER_TEXT)

    // Use print media emulation for accurate pagination
    await page.emulateMediaType('print')

    const pdfPath = options?.outputPath
    const debugHtmlPath = resolvePath(process.cwd(), 'debug-output.html')
    const finalHtml = await page.content()
    await fs.writeFile(debugHtmlPath, finalHtml, 'utf8')

    const rawPdf = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: '1in',
        bottom: '1in',
        left: '1in',
        right: '1in',
        },
    })

    // Estimate the first content page index based on TOC length
    // Title page: 1 page (index 0)
    // TOC: Estimate ~30 entries per page (can vary based on title length)
    const tocEntryCount = processed.headings.length
    const estimatedTocPages = Math.max(1, Math.ceil(tocEntryCount / 30))
    const firstContentPageIndex = 1 + estimatedTocPages // title page + TOC pages
    console.log(`📄 TOC has ${tocEntryCount} entries, estimated ${estimatedTocPages} pages. First content page index: ${firstContentPageIndex}`)
    
    const pdfDoc = await PDFDocument.load(rawPdf)
    const font = await pdfDoc.embedFont(selectedFontConfig.pdf)
    const pages = pdfDoc.getPages()
    const totalPages = pages.length
    const color = rgb(0.29, 0.33, 0.39)
    const fontSize = 11
    
    console.log(`📄 Total pages: ${totalPages}, First content starts at page index: ${firstContentPageIndex} (hardcoded for testing)`)

    // Start numbering from the first main heading page
    for (let index = firstContentPageIndex; index < pages.length; index += 1) {
      const page = pages[index]
      const pageNumber = index - firstContentPageIndex + 1
      const text = String(pageNumber)
      const { width, height } = page.getSize()
      const textWidth = font.widthOfTextAtSize(text, fontSize)
      const x = width - 72 - textWidth
      const y = height - 54
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color,
      })
    }

    const pdfBytes = await pdfDoc.save()
    const finalBuffer = Buffer.from(pdfBytes)

    if (pdfPath) {
      await fs.writeFile(pdfPath, finalBuffer)
    }

    return finalBuffer
  } finally {
    await browser.close()
  }
}
