
import { CYRILLIC_TO_LATIN_MAP, ABBREVIATIONS, MF_CLEANUP, MF_MAP } from './utils';

/**
 * Normalizes an article string:
 * - Lowercase
 * - Remove non-alphanumeric (keep only letters and digits)
 * - Map Cyrillic visual matches to Latin (e.g. Cyrillic 'А' -> Latin 'A')
 */
export function normalizeArticle(str: string): string {
  if (!str) return '';
  let res = str.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
  
  // Note: For articles, some people prefer visual matching (A->A, O->O)
  // Here we do a simple transliteration for more robust matching if needed,
  // but for articles "A123" (Cyrillic) and "A123" (Latin) should be identical.
  const visualMap: Record<string, string> = {
    'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x'
  };

  return res.split('').map(char => visualMap[char] || char).join('');
}

/**
 * Normalizes manufacturer name:
 * - Remove legal entity forms
 * - Lowercase
 * - Handle common abbreviations
 */
export function normalizeManufacturer(str: string): string {
  if (!str) return 'прочее';
  let res = str.toLowerCase();
  
  MF_CLEANUP.forEach(regex => {
    res = res.replace(regex, '');
  });
  
  res = res.trim();
  if (!res) return 'прочее';
  return MF_MAP[res] || res;
}

/**
 * Normalizes product name:
 * - Expand abbreviations
 * - Remove extra spaces
 * - Lowercase
 */
export function normalizeName(str: string): string {
  if (!str) return '';
  let res = str.toLowerCase();
  
  Object.entries(ABBREVIATIONS).forEach(([abbr, full]) => {
    // Add regex logic for word boundaries to avoid partial replacement inside words if possible
    const escapedAbbr = abbr.replace('.', '\\.');
    const regex = new RegExp(`\\b${escapedAbbr}`, 'gi');
    res = res.replace(regex, full);
  });
  
  return res.replace(/\s+/g, ' ').trim();
}

/**
 * Tries to extract manufacturer from name if it's explicitly mentioned
 */
export function extractManufacturerFromName(name: string, manufacturers: string[]): string | null {
  const normalizedName = normalizeName(name);
  for (const mf of manufacturers) {
    const nMf = normalizeManufacturer(mf);
    if (nMf.length > 2 && normalizedName.includes(nMf)) {
      return nMf;
    }
  }
  return null;
}
