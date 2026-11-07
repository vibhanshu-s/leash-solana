# MLH submission text

**Name:** Leash

**Pitch:** A spending limit an AI agent can't be talked out of, enforced by a Solana program.

**Description:**
Give an AI agent money and one poisoned web page can spend it. Prompt guardrails sit inside the system being attacked, and a key in a hot wallet is all or nothing.

Leash moves the rules into a Solana program. An owner funds a vault and sets a per-payment cap, daily budget, merchant allowlist, expiry and kill switch. The agent's key can only call `pay`, so a hijacked model can ask for anything and still get nothing the rules don't allow.

In the live demo, a Gemini agent buys data from pay-per-request APIs over HTTP 402. Judges can then attack it, including with their own prompt injection, with no wallet or install. When the model resists, the demo says so and then forces the worst case, signing the attacker's payment. The program refuses it in a real failed devnet transaction, while the same attack drains a plain hot wallet.

Solana matters here because the chain is the security boundary, tiny fees make per-request payments viable, and every allowed or refused attempt is public.

Runs on devnet with test tokens only. Not audited.

**Technologies:** Solana, Anchor, Rust, SPL Token, Next.js, TypeScript, Gemini API, Vercel, GitHub Actions

**GitHub:** https://github.com/vibhanshu-s/leash-solana

**Live demo:** https://leash-solana-two.vercel.app

**Other links:**
- Demo video: https://leash-solana-two.vercel.app/leash-demo.mp4
- Pitch deck: https://leash-solana-two.vercel.app/deck
- Deck PDF: https://leash-solana-two.vercel.app/leash-deck.pdf
- Program on devnet: https://explorer.solana.com/address/E5f5368y384TnC3XCFdTEhZnh1mCaHPKsy3zdZYchgtD?cluster=devnet

**Prize categories:**
- Top 3 Overall: Leash uses Solana for what it does best. The program holds funds and enforces rules no prompt can change, tiny fees make per-request agent payments work, and refusals are public on-chain records.
- AI Track Top Prize: AI and Solana each do real work. A Gemini agent decides what data to buy and writes the result, while Solana gives the agent verifiable spending limits, payments and an audit trail that hold even if the model is hijacked.

**AI coding tools:** Claude Code, on Claude Opus 5.5
