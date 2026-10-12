import { test, expect } from "@playwright/test";
test("production PWA protects login, installs manifest and caches only static assets", async ({
  page,
  request,
}) => {
  await page.goto("http://localhost:4173/app/conversations");
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explorar prévia visual" }),
  ).toHaveCount(0);
  const response = await request.get(
    "http://localhost:4173/manifest.webmanifest",
  );
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.name).toBe("DIGITALX");
  expect(manifest.icons).toHaveLength(3);
  expect(
    manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.route("**/private-pwa-check", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ message: "private-test-fixture" }),
    }),
  );
  await page.evaluate(async () => {
    await fetch("/private-pwa-check");
  });
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys())
      for (const req of await (await caches.open(key)).keys())
        urls.push(req.url);
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(
    cached.every(
      (u) =>
        !u.includes("supabase.co") &&
        !u.includes("private-pwa-check") &&
        !u.includes("/auth/"),
    ),
  ).toBe(true);
});
