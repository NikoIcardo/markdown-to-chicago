/**
 * Normalizes a URL by removing escape sequences and trailing slashes
 */
export function normalizeUrl(url: string): string {
  try {
    // Remove Markdown escape sequences (e.g., \_, \-, \&, etc.) before parsing
    const unescaped = url
      .trim()
      .replace(/\\([\\_\-*[\](){}#.!+`~|&])/g, '$1')
    const parsed = new URL(unescaped)
    parsed.hash = ''
    const normalised = parsed.toString()
    return normalised.endsWith('/') ? normalised.slice(0, -1) : normalised
  } catch {
    // If URL parsing fails, still remove escape sequences from the raw string
    return url.trim().replace(/\\([\\_\-*[\](){}#.!+`~|&])/g, '$1')
  }
}
