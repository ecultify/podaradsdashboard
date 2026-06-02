// lib/budget-config.ts — total budgets and the client billing multiplier.
//
// Reported ad spend (from Meta / the Google sheet) is the raw platform spend.
// What's billed against the budget is that spend × SPEND_MULTIPLIER. Balance is
// the budget minus the billed amount. All values in INR.
//
// Override via env if you don't want to edit code (e.g. on Vercel):
//   META_BUDGET_INR, GOOGLE_BUDGET_INR, SPEND_MULTIPLIER

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Total Meta budget in INR. */
export const META_BUDGET_INR = numEnv('META_BUDGET_INR', 156250.003);

/** Total Google Ads budget in INR. */
export const GOOGLE_BUDGET_INR = numEnv('GOOGLE_BUDGET_INR', 66964.287);

/** Multiplier applied to raw platform spend to get the billed amount. */
export const SPEND_MULTIPLIER = numEnv('SPEND_MULTIPLIER', 4.5);

/** Computes billed spend + remaining balance for a given budget.
 *  Pass `multiplier` to override the global (e.g. 1 to bill raw spend). */
export function computeBudget(rawSpend: number, budget: number, multiplier: number = SPEND_MULTIPLIER) {
  const billedSpend = rawSpend * multiplier;
  return {
    budget,
    billedSpend,
    balance: budget - billedSpend,
  };
}
