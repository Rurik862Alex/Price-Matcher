
export interface Product {
  id?: string;
  article: string;
  name: string;
  manufacturer: string;
  code?: string; // The code we want to find or copy
  [key: string]: any; // To preserve other columns
}

export interface MatchResult {
  targetItem: Product;
  matchedItem?: Product;
  priority: 0 | 1 | 2 | 3; // 0: no match, 1: highest, 3: lowest
  score: number;
}
