#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findLatestPdf() {
  const outputDir = path.join(__dirname, '..', 'output');
  
  try {
    const files = await fs.readdir(outputDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.error('❌ No PDF files found in output directory');
      process.exit(1);
    }
    
    const pdfStats = await Promise.all(
      pdfFiles.map(async (file) => {
        const filePath = path.join(outputDir, file);
        const stats = await fs.stat(filePath);
        return { file, path: filePath, mtime: stats.mtime };
      })
    );
    
    pdfStats.sort((a, b) => b.mtime - a.mtime);
    return pdfStats[0].path;
  } catch (error) {
    console.error('❌ Error finding PDF files:', error.message);
    process.exit(1);
  }
}

async function testPdfCitations(pdfPath) {
  console.log(`\n📄 Testing PDF: ${path.basename(pdfPath)}\n`);
  
  try {
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    
    const bibliographyMatch = text.match(/Bibliography\s*([\s\S]*?)(?:\n\s*\n|$)/i);
    
    if (!bibliographyMatch) {
      console.log('⚠️  No bibliography section found in PDF');
      return { success: true, reason: 'No bibliography to validate' };
    }
    
    const bibliographyText = bibliographyMatch[1];
    
    const bibEntryPattern = /^\s*(\d+)\.\s+/gm;
    const bibNumbers = [];
    let match;
    
    while ((match = bibEntryPattern.exec(bibliographyText)) !== null) {
      bibNumbers.push(parseInt(match[1], 10));
    }
    
    if (bibNumbers.length === 0) {
      console.log('⚠️  No numbered bibliography entries found');
      return { success: true, reason: 'No numbered entries to validate' };
    }
    
    bibNumbers.sort((a, b) => a - b);
    const maxBibNumber = Math.max(...bibNumbers);
    const minBibNumber = Math.min(...bibNumbers);
    
    console.log(`📚 Bibliography Analysis:`);
    console.log(`   - Total entries found: ${bibNumbers.length}`);
    console.log(`   - Number range: ${minBibNumber} to ${maxBibNumber}`);
    
    const citationPattern = /\[(\d+)\]/g;
    const citationNumbers = new Set();
    
    while ((match = citationPattern.exec(text)) !== null) {
      citationNumbers.add(parseInt(match[1], 10));
    }
    
    const citationArray = Array.from(citationNumbers).sort((a, b) => a - b);
    const maxCitation = Math.max(...citationArray);
    
    console.log(`\n🔗 Citation Analysis:`);
    console.log(`   - Unique citations found: ${citationArray.length}`);
    console.log(`   - Citation range: ${Math.min(...citationArray)} to ${maxCitation}`);
    
    const invalidCitations = citationArray.filter(num => num > maxBibNumber);
    
    console.log(`\n📊 Validation Results:`);
    
    if (invalidCitations.length > 0) {
      console.log(`   ❌ FAILED: Found ${invalidCitations.length} citation(s) exceeding bibliography count`);
      console.log(`   - Bibliography max: [${maxBibNumber}]`);
      console.log(`   - Invalid citations: ${invalidCitations.map(n => `[${n}]`).join(', ')}`);
      
      const sampleInvalid = invalidCitations.slice(0, 5);
      console.log(`\n   🔍 Sample invalid citation context(s):`);
      sampleInvalid.forEach(num => {
        const regex = new RegExp(`.{0,50}\\[${num}\\].{0,50}`, 'g');
        const contexts = text.match(regex);
        if (contexts && contexts.length > 0) {
          console.log(`   - [${num}]: "${contexts[0].trim().substring(0, 80)}..."`);
        }
      });
      
      return { 
        success: false, 
        maxBibNumber, 
        maxCitation, 
        invalidCitations 
      };
    }
    
    const missingBibEntries = citationArray.filter(num => !bibNumbers.includes(num));
    
    if (missingBibEntries.length > 0) {
      console.log(`   ⚠️  WARNING: Found ${missingBibEntries.length} citation(s) without bibliography entries`);
      console.log(`   - Missing: ${missingBibEntries.slice(0, 10).map(n => `[${n}]`).join(', ')}${missingBibEntries.length > 10 ? '...' : ''}`);
    }
    
    console.log(`   ✅ PASSED: All citations are within valid range [1-${maxBibNumber}]`);
    console.log(`   - Maximum citation found: [${maxCitation}]`);
    console.log(`   - Maximum bibliography entry: [${maxBibNumber}]`);
    
    return { 
      success: true, 
      maxBibNumber, 
      maxCitation,
      totalCitations: citationArray.length,
      totalBibEntries: bibNumbers.length,
      missingBibEntries
    };
    
  } catch (error) {
    console.error('❌ Error parsing PDF:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 PDF Citation Validator\n');
  console.log('='.repeat(60));
  
  const pdfPath = await findLatestPdf();
  const result = await testPdfCitations(pdfPath);
  
  console.log('\n' + '='.repeat(60));
  
  if (result.success) {
    console.log('\n✅ TEST PASSED\n');
    process.exit(0);
  } else {
    console.log('\n❌ TEST FAILED\n');
    process.exit(1);
  }
}

main();
