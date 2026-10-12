import { chromium, devices } from "@playwright/test";
const browser = await chromium.launch();
for (const [name, options] of [
  ["desktop", { viewport: { width: 1440, height: 960 } }],
  ["iphone", { ...devices["iPhone 13"] }],
]) {
  const context = await browser.newContext(options),
    page = await context.newPage();
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Explorar prévia visual" }).click();
  if (name === "iphone")
    await page
      .getByRole("button", { name: /DIGITALX Crew.*Bora pro próximo projeto/ })
      .click();
  await page.waitForTimeout(700);
  console.log(
    name,
    await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      doc: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      composer: document
        .querySelector(".composer")
        .getBoundingClientRect()
        .toJSON(),
      chat: document
        .querySelector(".chat-panel")
        .getBoundingClientRect()
        .toJSON(),
      history: document
        .querySelector(".message-history")
        .getBoundingClientRect()
        .toJSON(),
      scroll: [
        document.querySelector(".message-history").scrollTop,
        document.querySelector(".message-history").scrollHeight,
      ],
    })),
  );
  await page.screenshot({
    path: `evidence/${name}-chat-settled.png`,
    fullPage: true,
  });
  await context.close();
}
await browser.close();
