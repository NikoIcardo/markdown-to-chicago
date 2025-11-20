import { readFileSync } from 'fs'
import { processMarkdown } from '../src/utils/markdownProcessor.ts'

async function main() {
  const markdown = readFileSync('../main-content.md', 'utf-8')
  const result = await processMarkdown(markdown)
  console.log(
    JSON.stringify(
      {
        metadataIssues: result.metadataIssues.length,
        bibliographyEntries: (result.modified.match(/^\d+\. <a id="bib-\d+"><\/a>/gm) || []).length,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
