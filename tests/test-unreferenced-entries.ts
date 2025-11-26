/**
 * Test script to verify unreferenced bibliography entries are preserved
 * 
 * Feature 1: Bibliography entries NOT referenced in document text should remain in bibliography
 */

import { processMarkdown } from '../frontend/src/utils/markdownProcessor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testMarkdown = fs.readFileSync(
  path.join(__dirname, 'test-unreferenced-entries.md'),
  'utf-8'
);

async function runTest() {
  console.log('=== Testing Preservation of Unreferenced Bibliography Entries ===\n');
  
  console.log('Input document has:');
  console.log('- 4 bibliography entries');
  console.log('- References to entries [1] and [3] only');
  console.log('- Entries [2] and [4] are NOT referenced but should be preserved');
  console.log('');
  
  const result = await processMarkdown(testMarkdown);
  
  console.log('=== Results ===\n');
  
  console.log('Title:', result.title);
  console.log('Number of bibliography entries:', result.bibliographyEntries.length);
  console.log('');
  
  console.log('Bibliography Entries:');
  result.bibliographyEntries.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.url}`);
    console.log(`      Anchor: ${entry.anchorId}`);
    console.log(`      Citation: ${entry.citation.substring(0, 80)}...`);
  });
  console.log('');
  
  // Check that all entries are preserved
  const unreferencedUrls = [
    'https://example.com/second-source-unreferenced',
    'https://example.com/fourth-source-unreferenced',
  ];
  
  const referencedUrls = [
    'https://example.com/first-source',
    'https://example.com/third-source',
  ];
  
  console.log('=== Verification ===\n');
  
  // Feature 1: Check that unreferenced entries are preserved
  const unreferencedPreserved = unreferencedUrls.every(url => 
    result.bibliographyEntries.some(entry => entry.url.includes(url.replace('https://', '')))
  );
  console.log(`Feature 1 - Unreferenced entries preserved: ${unreferencedPreserved ? '✓ PASS' : '✗ FAIL'}`);
  
  // Also verify referenced entries are there
  const referencedPreserved = referencedUrls.every(url => 
    result.bibliographyEntries.some(entry => entry.url.includes(url.replace('https://', '')))
  );
  console.log(`Referenced entries preserved: ${referencedPreserved ? '✓ PASS' : '✗ FAIL'}`);
  
  // Check total count
  console.log(`Total entries: ${result.bibliographyEntries.length} (expected 4)`);
  
  // Show order of entries (referenced should come first since they appear in document)
  console.log('\n=== Entry Order (by first occurrence in document) ===\n');
  result.bibliographyEntries.forEach((entry, idx) => {
    const isReferenced = referencedUrls.some(url => entry.url.includes(url.replace('https://', '')));
    console.log(`  ${idx + 1}. [${isReferenced ? 'REFERENCED' : 'UNREFERENCED'}] ${entry.url}`);
  });
  
  // Verify that referenced entries come before unreferenced
  // Note: For re-uploaded documents, the entries maintain their original order
  // unless new URLs are added that appear earlier in the document
  const firstSourceIdx = result.bibliographyEntries.findIndex(e => e.url.includes('first-source'));
  const thirdSourceIdx = result.bibliographyEntries.findIndex(e => e.url.includes('third-source'));
  const secondSourceIdx = result.bibliographyEntries.findIndex(e => e.url.includes('second-source-unreferenced'));
  const fourthSourceIdx = result.bibliographyEntries.findIndex(e => e.url.includes('fourth-source-unreferenced'));
  
  // The original order should be maintained (1, 2, 3, 4)
  const maintainsOriginalOrder = firstSourceIdx === 0 && 
                                  secondSourceIdx === 1 &&
                                  thirdSourceIdx === 2 &&
                                  fourthSourceIdx === 3;
  
  console.log(`\nMaintains original order (1,2,3,4): ${maintainsOriginalOrder ? '✓ PASS' : '✗ FAIL'}`);
  console.log('Note: Unreferenced entries stay in their original position');
}

runTest().catch(console.error);
