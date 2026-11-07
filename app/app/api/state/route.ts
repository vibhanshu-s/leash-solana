// Live policy state and history, read straight from devnet.
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { connection, decodePolicy, policyPda, REFUSALS, vaultPda } from "@/lib/chain";
import { deployment } from "@/lib/engine";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 4000) return NextResponse.json(cache.body);
  const conn = connection();
  const programId = new PublicKey(deployment.programId);
  const owner = new PublicKey(deployment.owner);
  const policy = policyPda(programId, owner, new PublicKey(deployment.agent));

  const [info, vault, attacker, sigs] = await Promise.all([
    conn.getAccountInfo(policy),
    conn.getTokenAccountBalance(vaultPda(programId, policy)),
    conn.getTokenAccountBalance(getAssociatedTokenAddressSync(new PublicKey(deployment.mint), new PublicKey(deployment.attacker))),
    conn.getSignaturesForAddress(policy, { limit: 25 }),
  ]);
  if (!info) return NextResponse.json({ error: "policy not found" }, { status: 503 });

  const ledger = sigs.map((s) => {
    const custom = (s.err as { InstructionError?: [number, { Custom?: number }] } | null)?.InstructionError?.[1]?.Custom;
    return {
      signature: s.signature,
      time: s.blockTime,
      ok: !s.err,
      refusal: custom !== undefined ? (REFUSALS[custom]?.code ?? `Custom${custom}`) : null,
    };
  });

  const body = {
    policyAddress: policy.toBase58(),
    programId: deployment.programId,
    policy: decodePolicy(info.data),
    vaultBalance: vault.value.uiAmount,
    attackerBalance: attacker.value.uiAmount,
    ledger,
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
