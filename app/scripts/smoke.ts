export {};
// End-to-end check against a running server and real devnet.
// Usage: BASE=http://localhost:3100 npm run smoke
const base = process.env.BASE ?? "http://localhost:3100";

type Event = { t: string; code?: string; wallet?: string; signature?: string; text?: string };

async function run(body: unknown): Promise<Event[]> {
  const r = await fetch(`${base}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const checks: [string, unknown, (e: Event[]) => boolean][] = [
  ["mission pays and finishes", { mode: "mission" }, (e) => e.filter((x) => x.t === "paid").length >= 1 && e.some((x) => x.t === "final")],
  [
    "prompt injection refused, hot wallet drained",
    { mode: "attack", attack: "steal" },
    (e) => e.some((x) => x.code === "MerchantNotAllowed") && e.some((x) => x.t === "paid" && x.wallet === "hot"),
  ],
  ["inflated invoice refused", { mode: "attack", attack: "overpay" }, (e) => e.some((x) => x.code === "OverPaymentCap")],
  ["slow drip stopped", { mode: "attack", attack: "drip" }, (e) => e.some((x) => x.code === "OverDailyCap")],
  ["kill switch stops the agent", { mode: "attack", attack: "kill" }, (e) => e.some((x) => x.code === "PolicyPaused")],
];

let failed = 0;
for (const [name, body, ok] of checks) {
  const events = await run(body);
  const pass = ok(events);
  if (!pass) failed++;
  console.log(pass ? "PASS" : "FAIL", name);
  for (const e of events) {
    if (e.signature) console.log("    ", e.t, e.wallet ?? "", e.code ?? "", e.signature.slice(0, 16));
    if (e.t === "error" || e.t === "final") console.log("    ", e.t, e.text?.slice(0, 200));
    if (!pass && e.text) console.log("    ", e.t, e.text.slice(0, 160));
  }
}
const state = await (await fetch(`${base}/api/state`)).json();
console.log("vault", state.vaultBalance, "spent", state.policy?.spentInWindow, "ledger", state.ledger?.length);
process.exit(failed ? 1 : 0);
