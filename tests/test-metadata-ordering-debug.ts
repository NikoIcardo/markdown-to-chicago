import { processMarkdown } from '../frontend/src/utils/markdownProcessor'

// Test case: Re-upload a document with incomplete metadata at position 1
// and add a new URL at position 2 (between position 1 and what was position 2)
async function testMetadataOrdering() {
  // First: Process a document with one URL
  const initialMarkdown = `# Test Document

Check out [Psychological Warfare](https://example.com/propaganda.pdf) for more info.

Also see [Second Source](https://example.com/second) for details.

## Bibliography
1. Psychological Warfare... (PDF). https://example.com/propaganda.pdf. Accessed November 1, 2024.
2. Second Source... https://example.com/second. Accessed November 2, 2024.
`

  console.log('=== STEP 1: Initial processing ===')
  const firstResult = await processMarkdown(initialMarkdown, {})
  console.log('First result metadataIssues count:', firstResult.metadataIssues.length)
  console.log('First result modified markdown (first 500 chars):', firstResult.modified.substring(0, 500))

  // Second: Re-upload with a new URL added at position 2 (after the first citation)
  const reuploadMarkdown = firstResult.modified.replace(
    'Check out [Psychological Warfare](https://example.com/propaganda.pdf) for more info.',
    'Check out [Psychological Warfare](https://example.com/propaganda.pdf) for more info.\n\nAlso check [New Link](https://google.com) which I just added.'
  )

  console.log('\n=== STEP 2: Re-upload with new URL ===')
  console.log('Reupload markdown (first 600 chars):', reuploadMarkdown.substring(0, 600))
  
  const secondResult = await processMarkdown(reuploadMarkdown, {})
  console.log('\nSecond result metadataIssues:')
  secondResult.metadataIssues.forEach((issue, idx) => {
    console.log(`  [${idx}] URL: ${issue.url}`)
    console.log(`      Message: ${issue.message}`)
    console.log(`      _firstOccurrence: ${(issue as any)._firstOccurrence}`)
  })

  console.log('\nExpected order: propaganda.pdf (position 1), then google.com (position 2)')
  console.log('Actual order:', secondResult.metadataIssues.map(i => i.url.split('/').pop()).join(', '))

  // Check if order is correct
  if (secondResult.metadataIssues.length >= 2) {
    const firstIssueUrl = secondResult.metadataIssues[0].url
    const secondIssueUrl = secondResult.metadataIssues[1].url

    if (firstIssueUrl.includes('propaganda.pdf') && secondIssueUrl.includes('google.com')) {
      console.log('\n✅ SUCCESS: Metadata issues are in correct document order!')
    } else {
      console.log('\n❌ FAILURE: Metadata issues are NOT in correct document order!')
      console.log(`   Expected: propaganda.pdf first, google.com second`)
      console.log(`   Got: ${firstIssueUrl} first, ${secondIssueUrl} second`)
    }
  }
}

testMetadataOrdering().catch(console.error)
