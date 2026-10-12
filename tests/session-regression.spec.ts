import { test, expect } from "@playwright/test";

test("fixture-only session leaves preview, recovers missed messages and clears on logout", async ({ page, context }) => {
  // All Supabase HTTP/WebSocket traffic is intercepted. This is UI regression
  // evidence only, never proof of Google login, RLS or live delivery.
  const host = "https://mlsnyxzirlzpgkpdfmma.supabase.co";
  const id = "30000000-0000-4000-8000-000000000001";
  const chat = "30000000-0000-4000-8000-000000000002";
  const profile = { id, name: "Regression account", username: "regression", bio: "", avatar_url: null };
  const first = { id: "30000000-0000-4000-8000-000000000003", conversation_id: chat, sender_id: id, body: "Before disconnect", created_at: "2026-10-11T20:00:00Z", sender: profile, attachments: [] };
  let messages = [first];
  let readCalls = 0;
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  await page.route(`${host}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = null;
    if (path.endsWith("/get_onboarding_profile")) json = { ...profile, digitalx_id: "100012345", onboarding_completed_at: "2026-10-11T20:00:00Z" };
    if (path.endsWith("/mark_read")) readCalls++;
    if (path.endsWith("/profiles")) json = profile;
    if (path.endsWith("/messages")) json = [...messages].reverse();
    if (path.endsWith("/user_presence")) json = [];
    if (path.endsWith("/list_conversations")) json = [{ id: chat, title: "REGRESSION ONLY", is_group: true, description: "", updated_at: first.created_at, unread: 0, members: [{ user_id: id, role: "owner", last_read_at: first.created_at, profile }], last: messages.at(-1) }];
    return route.fulfill({ json });
  });
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const fixture = { access_token: `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: id, exp: expiry, role: "authenticated" })}.fixture_not_a_real_signature`, refresh_token: "fixture_only", expires_at: expiry, expires_in: 3600, token_type: "bearer", user: { id, aud: "authenticated", role: "authenticated", email: "regression@example.invalid", user_metadata: { full_name: profile.name }, app_metadata: {}, created_at: first.created_at } };
  await page.addInitScript(({ fixture }) => {
    if (!sessionStorage.getItem("digitalx-regression-seeded")) {
      localStorage.setItem("sb-mlsnyxzirlzpgkpdfmma-auth-token", JSON.stringify(fixture));
      sessionStorage.setItem("digitalx-regression-seeded", "true");
    }
  }, { fixture });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/preview/conversations");
  await expect(page).toHaveURL("http://localhost:5173/app/conversations");
  await expect(page.getByRole("button", { name: /REGRESSION ONLY/ })).toBeVisible();
  await expect(page.getByText("PRÉVIA VISUAL · DADOS DEMONSTRATIVOS")).toHaveCount(0);
  await page.getByRole("button", { name: /REGRESSION ONLY/ }).click();
  await expect(page.locator(".message-bubble").getByText(first.body, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  messages = [...messages, { ...first, id: "30000000-0000-4000-8000-000000000004", body: "Missed while disconnected", created_at: "2026-10-11T20:01:00Z" }];
  await context.setOffline(false);
  await expect(page.locator(".message-bubble").getByText("Missed while disconnected", { exact: true })).toBeVisible();
  await expect(page.locator(".message-bubble").getByText(first.body, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  await page.waitForTimeout(100);
  const readsBefore = readCalls;
  await context.setOffline(true);
  messages = [...messages, { ...first, id: "30000000-0000-4000-8000-000000000005", body: "Unread outside the chat", created_at: "2026-10-11T20:02:00Z" }];
  await context.setOffline(false);
  await expect.poll(() => page.locator(".offline").count()).toBe(0);
  await page.waitForTimeout(350);
  expect(readCalls).toBe(readsBefore);
  await page.getByRole("button", { name: /Sair da conta/ }).click();
  await expect(page.getByRole("button", { name: "Entrar com Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: /REGRESSION ONLY/ })).toHaveCount(0);
});
