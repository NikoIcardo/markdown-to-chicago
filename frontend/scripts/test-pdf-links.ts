import puppeteer from 'puppeteer'
import { writeFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Puppeteer Link Test</title>
  </head>
  <body>
    <a href="#target">Jump to target</a>
    <div style="height: 1000px"></div>
    <h1 id="target">Target Heading</h1>
  </body>
</html>`

async function run(): Promise<void> {
  const htmlPath = resolvePath(process.cwd(), 'test.html')
  const pdfPath = resolvePath(process.cwd(), 'test.pdf')

  await writeFile(htmlPath, html, 'utf8')

  const browser = await puppeteer.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' })
    await page.pdf({ path: pdfPath, printBackground: true })
  } finally {
    await browser.close()
  }

  console.log('✅ Sanity test complete: open test.pdf and verify clickable link.')
}

run().catch((error) => {
  console.error('❌ Sanity test failed:', error)
  process.exit(1)
})
