// Creates devnet-only keypairs in the git-ignored .keys folder. Existing keys are kept.
import fs from "node:fs";
import { Keypair } from "@solana/web3.js";

const names = [
  "program",
  "deployer",
  "owner",
  "agent",
  "sandbox-agent",
  "hotwallet",
  "merchant-a",
  "merchant-b",
  "merchant-c",
  "attacker",
];
fs.mkdirSync("../.keys", { recursive: true });
for (const n of names) {
  const p = `../.keys/${n}.json`;
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify([...Keypair.generate().secretKey]));
  const k = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  console.log(n.padEnd(14), k.publicKey.toBase58());
}
