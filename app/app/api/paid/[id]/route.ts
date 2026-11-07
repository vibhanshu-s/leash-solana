// Pay-per-request data API. No account or card: answer 402 with a price, then
// serve the data once a matching payment is confirmed on Solana.
import { NextResponse } from "next/server";
import { APIS, apiData, deployment, verifyPayment } from "@/lib/engine";

const used = new Set<string>();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = APIS.find((a) => a.id === id);
  if (!api) return NextResponse.json({ error: "unknown api" }, { status: 404 });
  const merchant = deployment.merchants[api.merchantIndex];
  const quote = { error: "payment required", price: api.price, currency: "dUSD", merchant, network: "solana-devnet" };

  const sig = req.headers.get("x-payment-signature");
  if (!sig) return NextResponse.json(quote, { status: 402 });
  if (used.has(sig) || !(await verifyPayment(sig, merchant, api.price))) {
    return NextResponse.json({ ...quote, error: "payment not valid" }, { status: 402 });
  }
  used.add(sig);
  return NextResponse.json(await apiData(api.id));
}
