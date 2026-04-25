
import fuzzysort from 'fuzzysort';
import { Product, MatchResult } from './types';
import { normalizeArticle, normalizeManufacturer, normalizeName, extractManufacturerFromName } from './normalization';

export function matchProducts(
  targetItems: Product[],
  masterItems: Product[]
): MatchResult[] {
  // Pre-process master items for faster lookup
  const masterByArticle = new Map<string, Product[]>();
  const masterByManufacturer = new Map<string, Product[]>();
  
  // Cache normalized manufacturers for master items
  const masterNormalized = masterItems.map(item => ({
    item,
    normMf: normalizeManufacturer(item.manufacturer || ''),
    normName: normalizeName(item.name || ''),
    normArt: normalizeArticle(item.article || '')
  }));

  const masterManufacturers = Array.from(new Set(masterNormalized.map(i => i.normMf)));

  masterNormalized.forEach(m => {
    // Group by Article
    if (!masterByArticle.has(m.normArt)) {
      masterByArticle.set(m.normArt, []);
    }
    masterByArticle.get(m.normArt)!.push(m.item);

    // Group by Manufacturer
    if (!masterByManufacturer.has(m.normMf)) {
      masterByManufacturer.set(m.normMf, []);
    }
    masterByManufacturer.get(m.normMf)!.push(m.item);
  });

  console.log(`Pre-processing done. Unique articles: ${masterByArticle.size}, Unique manufacturers: ${masterByManufacturer.size}`);

  return targetItems.map((target, index) => {
    if (index % 100 === 0) console.log(`Processing... ${index}/${targetItems.length}`);
    try {
      const rawMf = target.manufacturer || '';
      let tMf = normalizeManufacturer(rawMf);
      const tName = normalizeName(target.name || '');

      // If manufacturer is generic, try to extract it from name
      if (tMf === 'прочее' || tMf === '') {
        const extracted = extractManufacturerFromName(tName, masterManufacturers);
        if (extracted) tMf = extracted;
      }

      const tArt = normalizeArticle(target.article || '');
      const candidates = masterByArticle.get(tArt) || [];

      // Priority 1: Exact Article + Exact Manufacturer
      const p1Match = candidates.find(c => normalizeManufacturer(c.manufacturer) === tMf);
      if (p1Match) {
        return { targetItem: target, matchedItem: p1Match, priority: 1, score: 100 };
      }

      // Priority 2: Simple Article Match
      if (candidates.length > 0) {
        if (candidates.length === 1) {
          return { targetItem: target, matchedItem: candidates[0], priority: 2, score: 80 };
        }
        
        const bestByMf = candidates.find(c => {
           const cMf = normalizeManufacturer(c.manufacturer);
           return cMf.includes(tMf) || tMf.includes(cMf);
        });
        if (bestByMf) {
          return { targetItem: target, matchedItem: bestByMf, priority: 2, score: 90 };
        }
      }

      // Priority 3: Fuzzy Name Similarity (within the same manufacturer)
      if (tName.length > 5) {
        const sameMfMaster = masterByManufacturer.get(tMf) || [];

        if (sameMfMaster.length > 0) {
          // Fuzzy search can be slow if sameMfMaster is huge, limit to 5000 for safety
          const searchSpace = sameMfMaster.length > 5000 ? sameMfMaster.slice(0, 5000) : sameMfMaster;
          const results = fuzzysort.go(tName, searchSpace, { 
            key: 'name', 
            threshold: -800, // Stricter threshold to avoid false positives and speed up
            limit: 1 
          });
          
          if (results && results[0]) {
            return { targetItem: target, matchedItem: results[0].obj, priority: 3, score: results[0].score };
          }
        }
      }

      return { targetItem: target, priority: 0, score: 0 };
    } catch (e) {
      console.error('Error matching item at index', index, e);
      return { targetItem: target, priority: 0, score: 0 };
    }
  });
}
