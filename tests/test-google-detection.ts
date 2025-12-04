/**
 * Test script to debug google.com link detection issue
 */

import { processMarkdown } from '../frontend/src/utils/markdownProcessor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testMarkdown = fs.readFileSync(
  path.join(__dirname, 'test-google-link.md'),
  'utf-8'
);

async function runTest() {
  console.log('=== Testing Google.com Link Detection ===\n');
  
  console.log('Input document has:');
  console.log('- 1 existing bibliography entry (example.com)');
  console.log('- 1 new link to google.com');
  console.log('- Expected: google.com should be added to bibliography as entry #1');
  console.log('- Expected: example.com should be renumbered to #2');
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
  
  // Check if google.com was added
  const hasGoogle = result.bibliographyEntries.some(entry => 
    entry.url.includes('google.com')
  );
  
  console.log('=== Verification ===\n');
  console.log(`Google.com added to bibliography: ${hasGoogle ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Expected 2 entries, got ${result.bibliographyEntries.length}: ${result.bibliographyEntries.length === 2 ? '✓ PASS' : '✗ FAIL'}`);
  
  // Show the modified markdown
  console.log('\n=== Modified Markdown ===\n');
  console.log(result.modified);
}

runTest().catch(console.error);
