const citationText = '1. <a id="bib-1"></a>"https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf." Accessed November 20, 2025. <https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf>.';
const url = 'https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf';

// Simulate parseExistingCitationMetadata
let cleaned = citationText
  .replace(/^\d+\.\s*/, '')
  .replace(/<[^>]+>/g, '') // Strip all HTML tags
  .replace(url, '')
  .replace(/https?:\/\/[^\s<>\]")'}]+/gi, '')
  .trim();

console.log('Step 1 - After initial cleaning:', cleaned);

const metadata = {};

// Try to extract title FIRST (text in quotes or italics) before stripping keywords
const titleMatch = cleaned.match(/"([^"]+)"|'([^']+)'|\*([^*]+)\*|_([^_]+)_/);
if (titleMatch) {
  metadata.title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4])
    .trim()
    .replace(/[.,;:]+$/, ''); // Remove trailing punctuation
  console.log('Step 2 - Extracted title from quotes:', metadata.title);
  cleaned = cleaned.replace(titleMatch[0], '').trim();
  console.log('Step 3 - After removing title:', cleaned);
}

// Try to extract date
const datePatterns = [
  /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b)/i,
];

for (const pattern of datePatterns) {
  const dateMatch = cleaned.match(pattern);
  if (dateMatch) {
    metadata.accessDate = dateMatch[1].trim();
    console.log('Step 4 - Extracted date:', metadata.accessDate);
    cleaned = cleaned.replace(dateMatch[0], '').trim();
    break;
  }
}

console.log('\nFinal metadata:', metadata);
console.log('Has title?', metadata.title && metadata.title.length > 0);
console.log('Title !== url?', metadata.title !== url);
