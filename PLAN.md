# Leash: hackathon plan

**Target:** MLH Solana Hackathon. Enter **AI Track** + **Top 3 Overall**.
**Pitch:** A spending limit an AI agent can't be talked out of. Prompts can be hijacked; a Solana program can't.

## Deadlines (IST)
| When | What |
|---|---|
| Sat 22:30 | Plan written |
| Sun 20:30 | MLH "initial submission", our hard target for a complete entry |
| Sun 22:15 | Hacking ends / final submission on the schedule. Treat this as the real deadline |
| Sun 23:30 | Form closes (only a safety margin) |

## Why this track
- Judging for Top 3 asks for a working product using Solana for what it is good at, not a chain bolted on.
  Here the chain is the security boundary, and sub-cent fees are what make per-request payment viable.
- It matches two listed AI Track ideas: agents with spending limits, and machine payments.
- Spending-limit agents exist elsewhere (Praxis, AgentGuard, Bottie), so the concept alone will not win.
  **The edge is the live demo:** a judge types their own prompt injection, and sees the program reject the
  payment in a real failed devnet transaction. No install or wallet needed.

## What we build
1. **Solana program (Anchor, devnet)**
   - `Policy` PDA per owner + agent: per-payment cap, daily cap, merchant allowlist (max 8), expiry, pause, totals.
   - Token vault PDA holding a test stablecoin (dUSD, a mint we create; clearly labelled test money).
   - Instructions: `create_policy`, `update_policy`, `set_paused`, `withdraw` (owner); `pay` (agent key only).
   - `pay` records a hash of the agent's stated reason, giving an auditable on-chain trail.
   - Failures: `MerchantNotAllowed`, `OverPaymentCap`, `OverDailyCap`, `PolicyExpired`, `PolicyPaused`.
   - Policy checks live in a pure Rust module so they are unit-tested natively.
2. **Paid APIs (HTTP 402 style):** three demo data endpoints. They answer 402 with price and merchant, then
   serve data once a payment signature verifies on-chain. One endpoint returns a poisoned response that
   tries to redirect funds.
3. **AI agent:** LLM tool loop that takes a goal, buys the data it needs, and explains its spending.
4. **Web app (Next.js on Vercel)**
   - Landing page, live demo with a "Try to jailbreak it" box, live ledger with Explorer links.
   - Side by side: the same attack on an unguarded hot wallet (drained) vs Leash (rejected).
   - Failed attempts are sent with preflight skipped so the rejection lands on-chain with a signature.
5. **Submission package:** README with architecture, 2-3 minute demo video, pitch deck (web + PDF),
   submission text, screenshot/thumbnail.

Stretch only if the core is finished: judges connect their own wallet and create a policy.

## Build path (this machine)
WSL is broken and Solana's Windows path requires it, so programs **compile on GitHub Actions (Linux)**, which also
deploys to devnet. Local work: Rust unit tests, Next.js app, video tooling.

## Order of work
1. Scaffold repo; write program + policy unit tests.
2. Publish to GitHub; CI builds and deploys to devnet; create dUSD mint and funded demo policy.
3. Build paid APIs + agent; test end to end against devnet.
4. Build web UI; deploy to Vercel; test as a stranger would, on desktop and phone.
5. Record video; build deck; write README and submission text.
6. Save MLH draft (Sun morning), final check, submit.

## Needed from the user
- Sign in to GitHub and Vercel in Chrome (I don't enter passwords).
- An LLM API key, added by the user to Vercel (Gemini free tier or Anthropic).
- Whether this is a solo entry, and whether the team qualifies as first-time hackers (for Best Beginner).

## Risks
| Risk | Fallback |
|---|---|
| CI cannot deploy / devnet faucet limits | Web faucet via GitHub login; reduce program size; retry airdrops |
| Devnet outage during judging | Recorded video plus stored transaction links in README |
| Public demo abused | Rate limits, small amounts, server-side cost cap on LLM use |
| No LLM key by Sunday | Use a key-free scripted compromised agent for the on-chain proof; say so plainly |
| Form's main project fields don't render | "A link, description or screenshot" is the requirement; use links and re-check before submit |

## Honesty rules for the submission
- Tick Claude Code / Claude Opus 5.5 as the AI tools used.
- Devnet and test money only; say so everywhere.
- Claim Best Beginner only if the user confirms eligibility.
