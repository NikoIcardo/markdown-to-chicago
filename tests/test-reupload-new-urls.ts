/**
 * Test script to verify re-upload functionality with new URLs
 * 
 * Feature 1: Bibliography entries NOT referenced in document text should remain in bibliography
 * Feature 2: NEW URLs added to document text should be:
 *   - Added to bibliography in correct position (based on first occurrence)
 *   - All reference numbers renumbered accordingly
 *   - All existing citation links updated to point to correct entries
 */

import { processMarkdown } from '../frontend/src/utils/markdownProcessor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testMarkdown = fs.readFileSync(
  path.join(__dirname, 'test-reupload-new-urls.md'),
  'utf-8'
);

async function runTest() {
  console.log('=== Testing Re-Upload with New URLs ===\n');
  
  console.log('Input document has:');
  console.log('- 3 existing bibliography entries');
  console.log('- References to entries [1], [2], [3] in the document');
  console.log('- 2 NEW URLs (bare URL and linked URL)');
  console.log('');
  
  const result = await processMarkdown(testMarkdown);
  
  console.log('=== Results ===\n');
  
  console.log('Title:', result.title);
  console.log('Number of bibliography entries:', result.bibliographyEntries.length);
  console.log('');
  
  console.log('Bibliography Entries:');
  result.bibliographyEntries.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. [${entry.isNew ? 'NEW' : 'EXISTING'}] ${entry.url}`);
    console.log(`      Anchor: ${entry.anchorId}`);
  });
  console.log('');
  
  console.log('Metadata Issues (new URLs needing metadata):');
  result.metadataIssues.forEach((issue, idx) => {
    console.log(`  ${idx + 1}. ${issue.url}: ${issue.message}`);
  });
  console.log('');
  
  // Check if existing entries were preserved
  const existingUrls = [
    'https://example.com/first-source',
    'https://example.com/second-source',
    'https://example.com/third-source',
  ];
  
  const newUrls = [
    'https://example.com/new-article',
    'https://example.org/another-new-source',
  ];
  
  console.log('=== Verification ===\n');
  
  // Helper to normalize URL for comparison (strips protocol, trailing slash, and hash)
  const normalizeForComparison = (url: string): string => {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      const normalized = parsed.toString();
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
      return url.trim();
    }
  };
  
  // Feature 1: Check existing entries are preserved
  const existingPreserved = existingUrls.every(url => {
    const normalizedSearch = normalizeForComparison(url);
    return result.bibliographyEntries.some(entry => 
      normalizeForComparison(entry.url) === normalizedSearch
    );
  });
  console.log(`Feature 1 - Existing entries preserved: ${existingPreserved ? '✓ PASS' : '✗ FAIL'}`);
  
  // Feature 2: Check new entries were added
  const newAdded = newUrls.every(url => {
    const normalizedSearch = normalizeForComparison(url);
    return result.bibliographyEntries.some(entry => 
      normalizeForComparison(entry.url) === normalizedSearch
    );
  });
  console.log(`Feature 2 - New entries added: ${newAdded ? '✓ PASS' : '✗ FAIL'}`);
  
  // Check that entries are ordered by first occurrence
  console.log(`Bibliography has ${result.bibliographyEntries.length} entries (expected 5)`);
  
  // Show modified markdown
  console.log('\n=== Modified Markdown ===\n');
  console.log(result.modified);
  
  // Check citation links in the modified document
  console.log('\n=== Citation Links in Modified Document ===\n');
  const citationLinks = result.modified.match(/href="#bib-\d+"/g) || [];
  console.log('Found citation links:', citationLinks);
  
  // Verify that old citations [1], [2], [3] have been updated to [3], [4], [5]
  // Since new URLs appear before existing ones in document order
  console.log('\n=== Checking Citation Renumbering ===\n');
  
  // Check that the modified markdown has the correct citation numbers
  // The existing references section should now have bib-3, bib-4, bib-5 (not bib-1, bib-2, bib-3)
  const existingRefSection = result.modified.match(/## Existing References Section[\s\S]*?(?=##|$)/);
  if (existingRefSection) {
    console.log('Existing References Section:');
    console.log(existingRefSection[0]);
    
    const hasOldBib3 = existingRefSection[0].includes('#bib-3');
    const hasOldBib4 = existingRefSection[0].includes('#bib-4');
    const hasOldBib5 = existingRefSection[0].includes('#bib-5');
    console.log(`Citation renumbering: bib-3=${hasOldBib3}, bib-4=${hasOldBib4}, bib-5=${hasOldBib5}`);
    console.log(`Renumbering verified: ${hasOldBib3 && hasOldBib4 && hasOldBib5 ? '✓ PASS' : '✗ FAIL'}`);
  }
  
  // Also check the "Back to existing references" at the end which should still point to the original first source (now bib-3)
  console.log('\nChecking final citation reference:');
  const newRefSection = result.modified.match(/## New References Section[\s\S]*?(?=##|$)/);
  if (newRefSection) {
    console.log(newRefSection[0]);
  }
}

runTest().catch(console.error);
