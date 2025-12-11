/**
 * Minimal test to verify google.com link detection
 */

import { processMarkdown } from '../frontend/src/utils/markdownProcessor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testMarkdown = fs.readFileSync(
  path.join(__dirname, 'test-minimal-reupload.md'),
  'utf-8'
);

async function runTest() {
  console.log('=== Minimal Test: Google.com Link Detection ===\n');
  
  console.log('Input:');
  console.log('- Previously processed document (has bib anchors)');
  console.log('- 1 existing entry (example.com)');
  console.log('- 1 new link added: [new link](https://google.com)');
  console.log('');
  
  const result = await processMarkdown(testMarkdown);
  
  console.log('=== Results ===\n');
  console.log('Bibliography entries:', result.bibliographyEntries.length);
  
  result.bibliographyEntries.forEach((entry, idx) => {
    console.log(`${idx + 1}. [${entry.isNew ? 'NEW' : 'EXISTING'}] ${entry.url}`);
  });
  
  const hasGoogle = result.bibliographyEntries.some(e => e.url.includes('google.com'));
  const hasExample = result.bibliographyEntries.some(e => e.url.includes('example.com'));
  
  console.log('');
  console.log('=== Verification ===');
  console.log(`Google.com detected: ${hasGoogle ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Example.com preserved: ${hasExample ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Total entries: ${result.bibliographyEntries.length} (expected 2)`);
  
  if (hasGoogle && result.bibliographyEntries.length === 2) {
    console.log('\n✓✓✓ TEST PASSED ✓✓✓');
  } else {
    console.log('\n✗✗✗ TEST FAILED ✗✗✗');
    process.exit(1);
  }
}

runTest().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
