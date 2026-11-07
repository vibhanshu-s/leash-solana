// One-time devnet setup: test mint, token accounts, two policies, funded vaults.
// Run after the program is deployed. Safe to rerun: existing accounts are skipped.
import fs from "node:fs";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";
import { DECIMALS, connection, createPolicyIx, policyPda, sendAndConfirm, toUnits, vaultPda } from "../lib/chain";

const load = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`../.keys/${n}.json`, "utf8"))));

const owner = load("owner");
const agent = load("agent");
const sandboxAgent = load("sandbox-agent");
const hot = load("hotwallet");
const attacker = load("attacker");
const deployer = load("deployer");
const programId = load("program").publicKey;
const merchants = ["merchant-a", "merchant-b", "merchant-c"].map(load);
const conn = connection();

async function topUp(to: PublicKey, lamports: number) {
  if ((await conn.getBalance(to)) >= lamports / 2) return;
  await sendAndConfirmTransaction(
    conn,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: to, lamports })),
    [deployer],
  );
}

const prior = JSON.parse(fs.readFileSync("lib/deployment.json", "utf8"));
for (const k of [owner, agent, sandboxAgent, hot]) await topUp(k.publicKey, 150_000_000);

const mint = prior.mint ? new PublicKey(prior.mint) : await createMint(conn, owner, owner.publicKey, null, DECIMALS);
const ata = async (who: PublicKey) => (await getOrCreateAssociatedTokenAccount(conn, owner, mint, who)).address;
for (const who of [attacker.publicKey, ...merchants.map((m) => m.publicKey)]) await ata(who);
const hotToken = await ata(hot.publicKey);

const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 86_400);
const allow = merchants.map((m) => m.publicKey);

// Main policy: research mission plus allowlist and cap attacks.
// Sandbox policy: low daily cap for the drip attack and kill-switch demo.
const policies: [Keypair, number, number, number][] = [
  [agent, 1, 5, 20],
  [sandboxAgent, 0.4, 1, 5],
];
for (const [a, perPaymentCap, dailyCap, fund] of policies) {
  const policy = policyPda(programId, owner.publicKey, a.publicKey);
  if (await conn.getAccountInfo(policy)) continue;
  const r = await sendAndConfirm(
    conn,
    [
      createPolicyIx(programId, owner.publicKey, a.publicKey, mint, {
        perPaymentCap: toUnits(perPaymentCap),
        dailyCap: toUnits(dailyCap),
        expiresAt,
        merchants: allow,
      }),
    ],
    [owner],
  );
  if (!r.ok) throw new Error(`create_policy failed: ${r.code} ${r.text} ${r.signature}`);
  await mintTo(conn, owner, mint, vaultPda(programId, policy), owner, toUnits(fund));
}
if (!prior.mint) await mintTo(conn, owner, mint, hotToken, owner, toUnits(20));

const deployment = {
  programId: programId.toBase58(),
  mint: mint.toBase58(),
  owner: owner.publicKey.toBase58(),
  agent: agent.publicKey.toBase58(),
  sandboxAgent: sandboxAgent.publicKey.toBase58(),
  hotWallet: hot.publicKey.toBase58(),
  attacker: attacker.publicKey.toBase58(),
  merchants: merchants.map((m) => m.publicKey.toBase58()),
};
fs.writeFileSync("lib/deployment.json", JSON.stringify(deployment, null, 2) + "\n");
console.log(deployment);

const env = { AGENT_KEY: agent, SANDBOX_AGENT_KEY: sandboxAgent, OWNER_KEY: owner, HOT_WALLET_KEY: hot };
fs.writeFileSync(
  "../.keys/vercel.env",
  Object.entries(env)
    .map(([k, v]) => `${k}=${bs58.encode(v.secretKey)}`)
    .join("\n") + "\n",
);
console.log("Server keys written to .keys/vercel.env");
