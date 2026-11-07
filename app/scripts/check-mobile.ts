// Checks the live site at phone width: horizontal overflow, and an attack run.
import { chromium } from "playwright";

const SITE = process.env.SITE ?? "https://leash-solana-two.vercel.app";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await page.goto(SITE, { waitUntil: "networkidle" });
console.log("home overflow px:", await overflow());
await page.getByRole("button", { name: "Prompt injection" }).first().tap();
await page.locator(".verdict").waitFor({ timeout: 90_000 });
await page.waitForTimeout(800);
console.log("after attack overflow px:", await overflow());
await page.screenshot({ path: "recordings/mobile.png" });
await page.goto(`${SITE}/deck`, { waitUntil: "networkidle" });
console.log("deck overflow px:", await overflow());
for (const p of ["/leash-demo.mp4", "/leash-deck.pdf", "/leash-poster.png"]) {
  const r = await fetch(SITE + p, { method: "HEAD" });
  console.log(p, r.status);
}
console.log("console errors:", errors.length ? errors.slice(0, 4) : "none");
const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await desk.goto(`${SITE}/deck`, { waitUntil: "networkidle" });
await desk.emulateMedia({ media: "print" });
await desk.screenshot({ path: "recordings/deck-print.png", fullPage: true });
await browser.close();
