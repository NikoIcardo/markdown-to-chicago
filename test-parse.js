const citationText = '1. <a id="bib-1"></a>"https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf." Accessed November 20, 2025. <https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf>.';
const url = 'https://info.publicintelligence.net/GermanPropagandaLeaflets.pdf';

// Simulate parseExistingCitationMetadata
let cleaned = citationText
  .replace(/^\d+\.\s*/, '')
  .replace(/<[^>]+>/g, '') // Strip all HTML tags
  .replace(url, '')
  .replace(/https?:\/\/[^\s<>\]")'}]+/gi, '')
  .trim();

console.log('After cleaning:', cleaned);

// Try to extract title (text in quotes)
const titleMatch = cleaned.match(/"([^"]+)"|'([^']+)'|\*([^*]+)\*|_([^_]+)_/);
if (titleMatch) {
  const title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4])
    .trim()
    .replace(/[.,;:]+$/, '');
  console.log('Extracted title:', title);
  console.log('Title equals URL?', title === url);
}
