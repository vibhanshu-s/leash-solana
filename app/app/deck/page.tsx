"use client";

import { useEffect, useState } from "react";
import "./deck.css";

const REPO = "https://github.com/vibhanshu-s/leash-solana";
const PROGRAM = "https://explorer.solana.com/address/E5f5368y384TnC3XCFdTEhZnh1mCaHPKsy3zdZYchgtD?cluster=devnet";

const slides = [
  <section key="title" className="slide title">
    <p className="kicker">Leash · MLH Solana Hackathon · AI Track</p>
    <h1>Prompts can be hijacked. <em>This limit can’t.</em></h1>
    <p className="big">Spending limits for AI agents, enforced by a Solana program.</p>
  </section>,

  <section key="problem" className="slide">
    <p className="kicker">The problem</p>
    <h2>An agent that can pay can be tricked into paying.</h2>
    <div className="cols">
      <div><h3>Guardrails in a prompt</h3><p>They live inside the system being attacked. One poisoned page or API response can talk around them.</p></div>
      <div><h3>A key in a hot wallet</h3><p>All or nothing. Whoever controls the agent controls the whole balance.</p></div>
      <div><h3>Approve every payment</h3><p>Safe, but it stops being an agent. Nobody wants to tap approve on a tenth of a cent.</p></div>
    </div>
  </section>,

  <section key="idea" className="slide">
    <p className="kicker">The idea</p>
    <h2>Move the rules out of the model and into the chain.</h2>
    <div className="flow">
      <div className="box"><b>Owner</b><span>Funds a vault and sets the rules</span></div>
      <i>→</i>
      <div className="box dark"><b>Leash program</b><span>Checks every payment on-chain</span></div>
      <i>→</i>
      <div className="box"><b>Merchant</b><span>Paid only if every rule passes</span></div>
    </div>
    <p className="big">The agent’s key can ask. It can’t change a rule, reach the vault directly, or pay anyone off the list.</p>
  </section>,

  <section key="rules" className="slide">
    <p className="kicker">What is enforced</p>
    <h2>Five rules no prompt can reach.</h2>
    <table>
      <tbody>
        <tr><td>Allowlist</td><td>Only approved merchants</td><td className="code">MerchantNotAllowed</td></tr>
        <tr><td>Per-payment cap</td><td>Stops inflated invoices</td><td className="code">OverPaymentCap</td></tr>
        <tr><td>Daily budget</td><td>Limits the worst day, even if the server is breached</td><td className="code">OverDailyCap</td></tr>
        <tr><td>Expiry</td><td>Authority ends by default</td><td className="code">PolicyExpired</td></tr>
        <tr><td>Kill switch</td><td>Owner pauses from their own key</td><td className="code">PolicyPaused</td></tr>
      </tbody>
    </table>
  </section>,

  <section key="demo" className="slide">
    <p className="kicker">The live demo</p>
    <h2>Same attack, same agent, two wallets.</h2>
    <div className="cols two">
      <div className="receipt"><div className="tag">LEASH POLICY</div><p>20 dUSD to attacker</p><p className="why">MerchantNotAllowed</p><div className="stamp">REFUSED</div></div>
      <div className="receipt"><div className="tag">PLAIN HOT WALLET</div><p>20 dUSD to attacker</p><p className="why">Transfer confirmed</p><div className="stamp filled">STOLEN</div></div>
    </div>
    <p className="big">Judges can write their own attack. No wallet or install, and every result links to the public record.</p>
  </section>,

  <section key="solana" className="slide">
    <p className="kicker">Why Solana</p>
    <h2>This only works where a payment costs almost nothing.</h2>
    <div className="cols">
      <div><h3>Per-request pricing</h3><p>An agent can buy a single API call for cents. Network fees are a tiny fraction of that.</p></div>
      <div><h3>Speed</h3><p>A payment confirms in the middle of the agent’s task, so it can pay and continue in one flow.</p></div>
      <div><h3>Public proof</h3><p>Allowed and refused attempts both land on-chain. Anyone can audit an agent’s spending.</p></div>
    </div>
  </section>,

  <section key="ai" className="slide">
    <p className="kicker">AI and Solana each do real work</p>
    <h2>The model decides. The chain limits the damage.</h2>
    <div className="cols two">
      <div><h3>AI</h3><p>A Gemini agent takes a goal, decides which data is worth buying, pays over HTTP 402, and writes the result.</p></div>
      <div><h3>Solana</h3><p>An Anchor program holds the funds and applies the rules. It records a hash of the agent’s stated reason with each payment.</p></div>
    </div>
  </section>,

  <section key="next" className="slide">
    <p className="kicker">Shipped this weekend, and next</p>
    <h2>Working on devnet today.</h2>
    <div className="cols two">
      <div><h3>Built</h3><p>Deployed program, unit-tested policy logic, paid APIs, Gemini agent, and a public attack demo.</p></div>
      <div><h3>Next</h3><p>A security audit before mainnet, real USDC, an SDK for agent frameworks, and rules per task.</p></div>
    </div>
    <p className="big links">
      <a href="/">Try the demo</a> · <a href={REPO}>Source</a> · <a href={PROGRAM}>Program on devnet</a>
    </p>
  </section>,
];

export default function Deck() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) setI((n) => Math.min(n + 1, slides.length - 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="deck">
      <div className="stage">{slides[i]}</div>
      <div className="all">{slides}</div>
      <div className="controls">
        <button aria-label="Previous slide" disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
        <span>{i + 1} / {slides.length}</span>
        <button aria-label="Next slide" disabled={i === slides.length - 1} onClick={() => setI(i + 1)}>→</button>
      </div>
    </div>
  );
}
