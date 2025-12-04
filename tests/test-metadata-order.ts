import { processMarkdown } from '../frontend/src/utils/markdownProcessor'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Metadata Issues Ordering', () => {
  it('should return metadata issues in document order when re-uploading with new URLs', async () => {
    // Read the previously processed document
    const testFilePath = join(__dirname, 'test-metadata-order.md')
    const markdown = readFileSync(testFilePath, 'utf-8')
    
    const result = await processMarkdown(markdown)
    
    // Verify metadataIssues exist
    expect(result.metadataIssues).toBeDefined()
    expect(result.metadataIssues.length).toBeGreaterThan(0)
    
    // Log the metadata issues for inspection
    console.log('Metadata Issues Order:')
    result.metadataIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.url}`)
      console.log(`   Message: ${issue.message}`)
    })
    
    // The first metadataIssue should be for the URL that appears first in the document
    // Based on the test document, GermanPropagandaLeaflets appears at line 48
    // and google.com appears at line 50
    const firstIssueUrl = result.metadataIssues[0].url
    console.log(`\nFirst metadata issue URL: ${firstIssueUrl}`)
    
    // Check if it contains reference to German propaganda (the first incomplete entry)
    const isGermanPropagandaFirst = firstIssueUrl.includes('GermanPropagandaLeaflets')
    console.log(`Is German Propaganda first: ${isGermanPropagandaFirst}`)
    
    // The first issue should NOT be google.com
    const isGoogleFirst = firstIssueUrl.includes('google.com')
    console.log(`Is Google first: ${isGoogleFirst}`)
    
    expect(isGoogleFirst).toBe(false)
  })
})
