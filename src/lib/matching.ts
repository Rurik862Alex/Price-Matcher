
import fuzzysort from 'fuzzysort';
import { Product, MatchResult } from './types';
import { normalizeArticle, normalizeManufacturer, normalizeName, extractManufacturerFromName } from './normalization';

export interface MasterProcessed {
  masterCached: {
    item: Product;
    normMf: string;
    normName: string;
    normArt: string;
  }[];
  masterByArticle: Map<string, { item: Product; normMf: string }[]>;
  masterByManufacturer: Map<string, { item: Product; normName: string; item_orig: Product }[]>;
  masterManufacturers: string[];
}

export function prepareMasterData(masterItems: Product[]): MasterProcessed {
  const masterCached = masterItems.map(item => ({
    item,
    normMf: normalizeManufacturer(item.manufacturer || ''),
    normName: normalizeName(item.name || ''),
    normArt: normalizeArticle(item.article || '')
  }));
  
  const masterByArticle = new Map<string, { item: Product; normMf: string }[]>();
  const masterByManufacturer = new Map<string, any[]>();
  const masterManufacturers = Array.from(new Set(masterCached.map(i => i.normMf)));
 
  masterCached.forEach(m => {
    // Group by Article
    if (!masterByArticle.has(m.normArt)) {
      masterByArticle.set(m.normArt, []);
    }
    masterByArticle.get(m.normArt)!.push({ item: m.item, normMf: m.normMf });
 
    // Group by Manufacturer
    if (!masterByManufacturer.has(m.normMf)) {
      masterByManufacturer.set(m.normMf, []);
    }
    masterByManufacturer.get(m.normMf)!.push(m);
  });

  return { masterCached, masterByArticle, masterByManufacturer, masterManufacturers };
}

export function matchProducts(
  targetItems: Product[],
  masterData: MasterProcessed
): MatchResult[] {
  const { masterByArticle, masterByManufacturer, masterManufacturers } = masterData;
  
  return targetItems.map((target, index) => {
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
      const p1Match = candidates.find(c => c.normMf === tMf);
      if (p1Match) {
        return { targetItem: target, matchedItem: p1Match.item, priority: 1, score: 100 };
      }
 
      // Priority 2: Simple Article Match
      if (candidates.length > 0) {
        const scoreManufacturer = (c: any) => {
          const cMf = c.normMf;
          if (cMf === tMf) return 100;
          if (cMf.includes(tMf) || tMf.includes(cMf)) return 90;
          
          // Semantic check for manufacturer
          const fuzzyRes = fuzzysort.single(tMf, cMf);
          if (fuzzyRes && fuzzyRes.score > -200) return 80;
          
          if (tMf === 'прочее' || cMf === 'прочее') return 50;
          return 0;
        };
 
        if (candidates.length === 1) {
          const mfScore = scoreManufacturer(candidates[0]);
          if (mfScore >= 50) {
            return { targetItem: target, matchedItem: candidates[0].item, priority: 2, score: 70 + mfScore / 10 };
          }
        } else {
          const candidatesWithScores = candidates.map(c => ({ cached: (c as any), mfScore: scoreManufacturer(c) }));
          candidatesWithScores.sort((a, b) => b.mfScore - a.mfScore);
          
          if (candidatesWithScores[0].mfScore >= 50) {
            return { targetItem: target, matchedItem: candidatesWithScores[0].cached.item, priority: 2, score: 80 + candidatesWithScores[0].mfScore / 10 };
          }
        }
      }
 
      // Priority 3: Fuzzy Name Similarity (within the same manufacturer)
      if (tName.length > 5) {
        const sameMfMaster = masterByManufacturer.get(tMf) || [];
 
        if (sameMfMaster.length > 0) {
          // IMPORTANT: fuzzysort.go on a list of objects is much slower than on a list of strings
          // we use the pre-normalized names for searching if possible, or limited search space
          const searchSpace = sameMfMaster.length > 3000 ? sameMfMaster.slice(0, 3000) : sameMfMaster;
          const results = fuzzysort.go(tName, searchSpace, { 
            key: 'normName', 
            threshold: -800,
            limit: 1 
          });
          
          if (results && results[0]) {
            return { targetItem: target, matchedItem: results[0].obj.item, priority: 3, score: results[0].score };
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
