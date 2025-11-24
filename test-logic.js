// Simulate the logic
const entry = {
  url: 'https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf',
  citation: '1. <a id="bib-1"></a>"https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf." Accessed November 20, 2025. <https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf>.'
};

// Parse metadata (simplified version)
let cleaned = entry.citation
  .replace(/^\d+\.\s*/, '')
  .replace(/<[^>]+>/g, '')
  .replace(entry.url, '')
  .replace(/https?:\/\/[^\s<>\]")'}]+/gi, '')
  .trim();

const parsedMetadata = {};

// Extract title from quotes
const titleMatch = cleaned.match(/"([^"]+)"/);
if (titleMatch) {
  parsedMetadata.title = titleMatch[1].trim().replace(/[.,;:]+$/, '');
}

// Extract date
const dateMatch = cleaned.match(/(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b)/i);
if (dateMatch) {
  parsedMetadata.accessDate = dateMatch[1];
}

console.log('Parsed metadata:', parsedMetadata);
console.log('');

// Check completeness
const hasTitle = parsedMetadata.title && parsedMetadata.title !== entry.url;
const hasAuthors = parsedMetadata.authors && parsedMetadata.authors.length > 0;
const hasSiteName = parsedMetadata.siteName && parsedMetadata.siteName.length > 0;
const hasAccessDate = parsedMetadata.accessDate && parsedMetadata.accessDate.length > 0;

console.log('hasTitle:', hasTitle, '(title:', parsedMetadata.title, ')');
console.log('hasAuthors:', hasAuthors);
console.log('hasSiteName:', hasSiteName);
console.log('hasAccessDate:', hasAccessDate);

const isIncomplete = !hasTitle || (!hasAuthors && !hasSiteName) || !hasAccessDate;
console.log('');
console.log('isIncomplete:', isIncomplete);
console.log('Should add to metadataIssues:', isIncomplete);
