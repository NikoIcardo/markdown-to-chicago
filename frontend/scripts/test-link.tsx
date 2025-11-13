import { pdf, Document, Page, Text, Link } from '@react-pdf/renderer'
import { writeFile } from 'node:fs/promises'

async function main() {
  const doc = (
    <Document>
      <Page size="A4">
        <Text id="target">Target Heading</Text>
        <Text>Paragraph before link.</Text>
        <Link src="#target">
          <Text>Go to target</Text>
        </Link>
      </Page>
    </Document>
  )

  const instance = pdf(doc)
  const buffer = await instance.toBuffer()
  await writeFile('../test-link.pdf', buffer)
  console.log('Generated test-link.pdf', buffer.length)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
