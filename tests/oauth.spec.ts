import { test, expect } from "@playwright/test";

test("cancelled OAuth shows a retry message and clears callback parameters", async ({ page }) => {
  await page.goto("/auth/callback#error=access_denied&error_description=User%20cancelled");
  await expect(page.getByRole("alert")).toContainText("autorização foi cancelada ou expirou");
  await expect(page).toHaveURL("http://localhost:5173/");
  await expect(page.getByRole("button", { name: "Entrar com Google" })).toBeEnabled();
  await expect(page.getByText("PRÉVIA VISUAL · DADOS DEMONSTRATIVOS")).toHaveCount(0);
});

test("Google login requests PKCE and the real application callback, using intercepted network only", async ({ page }) => {
  // Regression check for request construction. This does not authenticate a real user.
  await page.route("**/auth/v1/settings", route => route.fulfill({ json: { external: { google: true } } }));
  await page.route("**/auth/v1/authorize?**", route => route.fulfill({ contentType: "text/html", body: "<p>OAuth request inspected</p>" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize\?/);
  const url = new URL(page.url());
  expect(url.origin).toBe("https://mlsnyxzirlzpgkpdfmma.supabase.co");
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe("http://localhost:5173/auth/callback");
  expect(url.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
  expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
});
