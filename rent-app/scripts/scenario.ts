// Prints real-data scenarios used to check the demo claims. Run: npx tsx scripts/scenario.ts
import { recommend, type RecommendInput } from "../src/lib/recommend";
import { explain } from "../src/lib/explain";
import { sources } from "../src/lib/sources";

const base: RecommendInput = {
  income: { amountCents: 5_500_000, period: "annual", basis: "gross" }, housingCapCents: 180_000, bedrooms: "1br",
  householdSize: 1, destinationId: "union", commuteMode: "transit", commuteLimitMinutes: 45, commuteDaysPerMonth: 20,
  otherPaidTripsPerMonth: 0, preference: "money", knownMonthlyUtilitiesCents: null,
};
const show = (label: string, i: RecommendInput) => {
  const r = recommend(i, sources);
  console.log(`\n### ${label}`, JSON.stringify(r.counts));
  r.feasible.slice(0, 5).forEach((a) => console.log("  PASS", a.neighbourhoodName, a.rent.zoneLabel, a.rent.benchmarkCents! / 100, a.commute.minutesP50));
  explain(r).forEach((l) => console.log("  >", l));
};
show("55k / $1,800 / 45 min -> Union", base);
show("cap $1,900", { ...base, housingCapCents: 190_000 });
show("limit 60 min", { ...base, commuteLimitMinutes: 60 });
show("UTSC, $1,800 / 45", { ...base, destinationId: "utsc" });
show("UTSC, $1,900 / 45", { ...base, destinationId: "utsc", housingCapCents: 190_000 });
show("UTSC, $1,800 / 60", { ...base, destinationId: "utsc", commuteLimitMinutes: 60 });
