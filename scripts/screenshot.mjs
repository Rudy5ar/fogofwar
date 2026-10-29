// Usage: node scripts/screenshot.mjs <url> <out.png> [mobile]
import { chromium, devices } from "playwright";

const [url, out, mode] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext(mode === "mobile" ? devices["iPhone 15"] : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`saved ${out}`);
