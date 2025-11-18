import { readFileSync, writeFileSync } from 'fs';
import { processMarkdown } from './frontend/src/utils/markdownProcessor.ts';

async function test() {
  console.log('Testing bibliography duplication fix...\n');

  // Read original file
  const originalContent = readFileSync('output/main-content.md', 'utf-8');
  console.log('Step 1: Processing original file...');
  
  // First processing
  const result1 = await processMarkdown(originalContent, new Map(), false);
  const count1 = (result1.processedMarkdown.match(/^\d+\. <a id="bib-\d+"><\/a>/gm) || []).length;
  console.log(`  First process: ${count1} bibliography entries`);
  
  // Save first processed file
  writeFileSync('output/test-first-process.md', result1.processedMarkdown);
  
  // Second processing (simulating re-upload)
  console.log('\nStep 2: Re-processing the output...');
  const result2 = await processMarkdown(result1.processedMarkdown, new Map(), false);
  const count2 = (result2.processedMarkdown.match(/^\d+\. <a id="bib-\d+"><\/a>/gm) || []).length;
  console.log(`  Second process: ${count2} bibliography entries`);
  
  // Save second processed file
  writeFileSync('output/test-second-process.md', result2.processedMarkdown);
  
  // Check for duplicates
  console.log(`\n${count1 === count2 ? '✓ SUCCESS' : '✗ FAILURE'}: Bibliography counts ${count1 === count2 ? 'match' : 'differ'}`);
  if (count1 !== count2) {
    console.log(`  Difference: ${Math.abs(count1 - count2)} entries`);
  }
  
  // Check for duplicate anchor IDs
  const anchors2 = result2.processedMarkdown.match(/<a id="bib-\d+"><\/a>/g) || [];
  const uniqueAnchors = new Set(anchors2);
  console.log(`\n${anchors2.length === uniqueAnchors.size ? '✓ SUCCESS' : '✗ FAILURE'}: ${anchors2.length === uniqueAnchors.size ? 'No' : 'Found'} duplicate anchor IDs`);
  if (anchors2.length !== uniqueAnchors.size) {
    console.log(`  Total anchors: ${anchors2.length}, Unique: ${uniqueAnchors.size}`);
  }
}

test().catch(console.error);
