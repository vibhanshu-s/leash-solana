import { createHash } from "node:crypto";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

export const DECIMALS = 6;
export const toUnits = (dusd: number) => BigInt(Math.round(dusd * 10 ** DECIMALS));
export const toDusd = (units: bigint | number) => Number(units) / 10 ** DECIMALS;

export const connection = (url = process.env.RPC_URL || "https://api.devnet.solana.com") =>
  new Connection(url, "confirmed");

export const keypairFrom = (b58: string) => Keypair.fromSecretKey(bs58.decode(b58.trim()));

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};

export const policyPda = (programId: PublicKey, owner: PublicKey, agent: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("policy"), owner.toBuffer(), agent.toBuffer()], programId)[0];
export const vaultPda = (programId: PublicKey, policy: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), policy.toBuffer()], programId)[0];

export type PolicyArgs = { perPaymentCap: bigint; dailyCap: bigint; expiresAt: bigint; merchants: PublicKey[] };

const encodeArgs = (a: PolicyArgs) => {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(a.merchants.length);
  return Buffer.concat([
    u64(a.perPaymentCap),
    u64(a.dailyCap),
    i64(a.expiresAt),
    len,
    ...a.merchants.map((m) => m.toBuffer()),
  ]);
};

export function createPolicyIx(
  programId: PublicKey,
  owner: PublicKey,
  agent: PublicKey,
  mint: PublicKey,
  args: PolicyArgs,
) {
  const policy = policyPda(programId, owner, agent);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: agent, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: policy, isSigner: false, isWritable: true },
      { pubkey: vaultPda(programId, policy), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("create_policy"), encodeArgs(args)]),
  });
}

export function setPausedIx(programId: PublicKey, owner: PublicKey, policy: PublicKey, paused: boolean) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: policy, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([disc("set_paused"), Buffer.from([paused ? 1 : 0])]),
  });
}

export function payIx(
  programId: PublicKey,
  agent: PublicKey,
  policy: PublicKey,
  vault: PublicKey,
  merchantToken: PublicKey,
  amount: bigint,
  reasonHash: Buffer,
) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: agent, isSigner: true, isWritable: false },
      { pubkey: policy, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: merchantToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("pay"), u64(amount), reasonHash]),
  });
}

export const reasonHash = (reason: string) => createHash("sha256").update(reason).digest();

export type PolicyState = {
  owner: string;
  agent: string;
  mint: string;
  vault: string;
  perPaymentCap: number;
  dailyCap: number;
  spentInWindow: number;
  windowStart: number;
  expiresAt: number;
  totalSpent: number;
  paymentCount: number;
  paused: boolean;
  merchants: string[];
};

export function decodePolicy(data: Buffer): PolicyState {
  let o = 8;
  const key = () => {
    const k = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return k.toBase58();
  };
  const u = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const i = () => {
    const v = data.readBigInt64LE(o);
    o += 8;
    return Number(v);
  };
  const owner = key();
  const agent = key();
  const mint = key();
  const vault = key();
  const perPaymentCap = toDusd(u());
  const dailyCap = toDusd(u());
  const spentInWindow = toDusd(u());
  const windowStart = i();
  const expiresAt = i();
  const totalSpent = toDusd(u());
  const paymentCount = Number(u());
  const paused = data[o++] === 1;
  o++; // bump
  const n = data.readUInt32LE(o);
  o += 4;
  const merchants = Array.from({ length: n }, key);
  return {
    owner,
    agent,
    mint,
    vault,
    perPaymentCap,
    dailyCap,
    spentInWindow,
    windowStart,
    expiresAt,
    totalSpent,
    paymentCount,
    paused,
    merchants,
  };
}

// Anchor numbers custom errors from 6000, in declaration order.
export const REFUSALS: Record<number, { code: string; text: string }> = {
  6000: { code: "PolicyPaused", text: "The owner paused this agent" },
  6001: { code: "PolicyExpired", text: "The policy has expired" },
  6002: { code: "ZeroAmount", text: "Amount must be above zero" },
  6003: { code: "MerchantNotAllowed", text: "Merchant is not on the allowlist" },
  6004: { code: "OverPaymentCap", text: "Amount is over the per-payment cap" },
  6005: { code: "OverDailyCap", text: "Amount would pass the daily cap" },
};

export type SendResult =
  | { ok: true; signature: string }
  | { ok: false; signature: string; code: string; text: string };

/**
 * Sends without preflight so a refused payment still lands as a real failed
 * transaction with a signature anyone can inspect, instead of a local error.
 */
export async function sendAndConfirm(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<SendResult> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signers[0].publicKey, blockhash, lastValidBlockHeight });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }), ...ixs);
  tx.sign(...signers);
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
  const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (!res.value.err) return { ok: true, signature };
  const custom = (res.value.err as { InstructionError?: [number, { Custom?: number }] }).InstructionError?.[1]
    ?.Custom;
  const refusal = custom !== undefined ? REFUSALS[custom] : undefined;
  return {
    ok: false,
    signature,
    code: refusal?.code ?? `Custom${custom ?? ""}`,
    text: refusal?.text ?? JSON.stringify(res.value.err),
  };
}
