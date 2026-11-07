// Runs a mission or attack and streams each step as one JSON object per line.
import { type AgentEvent, type AttackId, runAttack, runMission } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIMIT = 8;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  hits.set(ip, [...recent, now]);
  return true;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!allowed(ip)) return new Response("Too many runs. Try again in a minute.", { status: 429 });

  const { mode, attack, text } = (await req.json()) as { mode: "mission" | "attack"; attack?: AttackId; text?: string };
  const origin = new URL(req.url).origin;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (mode === "mission") await runMission(origin, emit);
        else await runAttack(origin, attack ?? "steal", text, emit);
      } catch (e) {
        emit({ t: "error", text: (e as Error).message.slice(0, 200) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
