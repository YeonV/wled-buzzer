/**
 * Levenshtein distance between two strings (case-insensitive).
 */
export function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return d[m][n];
}

/**
 * Check if a spoken answer matches any accepted answer.
 * Returns { match: true/false, bestMatch: string|null, distance: number }
 */
export function checkAnswer(spoken, acceptedAnswers, fuzzyMatch = false) {
  if (!spoken?.trim() || !Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) {
    return { match: false, bestMatch: null, distance: Infinity };
  }
  const s = spoken.trim().toLowerCase();
  let bestMatch = null;
  let bestDist = Infinity;

  for (const accepted of acceptedAnswers) {
    const a = accepted.trim().toLowerCase();
    if (s === a) return { match: true, bestMatch: accepted, distance: 0 };
    // Check substring containment (e.g. "Curie" matches "Marie Curie")
    if (a.includes(s) || s.includes(a)) return { match: true, bestMatch: accepted, distance: 0 };
    if (fuzzyMatch) {
      const dist = levenshtein(s, a);
      if (dist < bestDist) { bestDist = dist; bestMatch = accepted; }
    }
  }

  if (fuzzyMatch && bestDist <= 2) {
    return { match: true, bestMatch, distance: bestDist };
  }
  return { match: false, bestMatch, distance: bestDist };
}
