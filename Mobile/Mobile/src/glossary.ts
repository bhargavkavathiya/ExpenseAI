/**
 * Acronym expansion helper. Call `expand("AI", "Result")` and on the first
 * occurrence on a given screen you get "Artificial Intelligence (AI)"; after
 * that, plain "AI". Satisfies FR-10.* / acceptance criterion #7.
 *
 * Reset per-screen state on screen focus with `resetScreen(screen)`.
 */

const DICTIONARY: Record<string, string> = {
  AI: "Artificial Intelligence",
  ML: "Machine Learning",
  OCR: "Optical Character Recognition",
  API: "Application Programming Interface",
  GST: "Goods and Services Tax",
  GSTIN: "Goods and Services Tax Identification Number",
  JWT: "JSON Web Token",
  PII: "Personally Identifiable Information",
};

const seenByScreen = new Map<string, Set<string>>();

export function expand(term: string, screen: string): string {
  const full = DICTIONARY[term];
  if (!full) return term;
  const seen = seenByScreen.get(screen) ?? new Set<string>();
  if (seen.has(term)) return term;
  seen.add(term);
  seenByScreen.set(screen, seen);
  return `${full} (${term})`;
}

export function resetScreen(screen: string): void {
  seenByScreen.delete(screen);
}
