/**
 * Test script to verify missing citation links are added
 * 
 * Feature 1: When a bibliography URL appears in the document without a citation link,
 *            the system should ADD the citation link
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
  console.log('=== Testing Addition of Missing Citation Links ===\n');
  
  console.log('Input document has:');
  console.log('- 4 bibliography entries');
  console.log('- Citation links for entries [1] and [3]');
  console.log('- URLs for entries [2] and [4] appear in document WITHOUT citations');
  console.log('- Expected: Citations [2] and [4] should be ADDED to those URLs');
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
  });
  console.log('');
  
  // Check that citation links were added
  console.log('=== Verification ===\n');
  
  // Check if the modified markdown contains the new citation links
  const hasBib2Citation = result.modified.includes('href="#bib-2"') || result.modified.includes('[2]');
  const hasBib4Citation = result.modified.includes('href="#bib-4"') || result.modified.includes('[4]');
  
  console.log(`Feature 1 - Citation for entry [2] added: ${hasBib2Citation ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Feature 1 - Citation for entry [4] added: ${hasBib4Citation ? '✓ PASS' : '✗ FAIL'}`);
  
  // Show the modified markdown for the missing citations section
  console.log('\n=== Modified Markdown (Missing Citations Section) ===\n');
  const missingSection = result.modified.match(/## Missing Citations Section[\s\S]*?(?=##|$)/);
  if (missingSection) {
    console.log(missingSection[0]);
  }
  
  // Show all citation links found in the modified document
  console.log('\n=== All Citation Links in Modified Document ===\n');
  const allCitations = result.modified.match(/href="#bib-\d+"/g) || [];
  console.log('Found citation links:', allCitations);
  
  // Check total count
  console.log(`\nTotal bibliography entries: ${result.bibliographyEntries.length} (expected 4)`);
  
  // Show full modified markdown
  console.log('\n=== Full Modified Markdown ===\n');
  console.log(result.modified);
}

runTest().catch(console.error);
