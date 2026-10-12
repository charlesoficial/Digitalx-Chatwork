import { test, expect } from "@playwright/test";

test("fixture-only ID copy, exact lookup, minimal result, errors and direct conversation", async ({ page }) => {
  // All Supabase transport is intercepted. Database security has separate SQL tests.
  const host = "https://mlsnyxzirlzpgkpdfmma.supabase.co";
  const id = "70000000-0000-4000-8000-000000000001";
  const peerId = "70000000-0000-4000-8000-000000000002";
  const chat = "70000000-0000-4000-8000-000000000003";
  const own = { id, name: "ID Fixture A", username: "id_fixture_a", bio: "", avatar_url: null };
  const peer = { id: peerId, name: "ID Fixture B", username: "id_fixture_b", bio: "", avatar_url: "/brand.svg" };
  const queries: string[] = [];
  let copied = "";
  let created = false;
  await page.exposeFunction("recordCopiedId", (value: string) => { copied = value; });
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  await page.route(`${host}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    let json: unknown = null;
    if (url.pathname.endsWith("/get_onboarding_profile")) json = { ...own, digitalx_id: "100012345", onboarding_completed_at: "2026-10-11T20:00:00Z" };
    if (url.pathname.endsWith("/profiles")) json = url.searchParams.has("id") ? own : [own, peer];
    if (url.pathname.endsWith("/get_my_digitalx_id")) json = "100012345";
    if (url.pathname.endsWith("/find_user_by_digitalx_id")) {
      const value = request.postDataJSON().p_id;
      queries.push(value);
      json = value === "123456789" ? { user: { id: peerId, name: peer.name, avatar_url: peer.avatar_url, digitalx_id: value } }
        : value === "111111111" ? { error: "rate_limited", retry_after: 60 } : { user: null };
    }
    if (url.pathname.endsWith("/create_conversation")) {
      expect(request.postDataJSON().p_participants).toEqual([peerId]);
      created = true;
      json = chat;
    }
    if (url.pathname.endsWith("/list_conversations")) json = created ? [{ id: chat, title: null, is_group: false, description: "", updated_at: "2026-10-11T20:00:00Z", unread: 0, members: [own, peer].map(profile => ({ user_id: profile.id, role: "member", profile, last_read_at: "2026-10-11T20:00:00Z" })) }] : [];
    if (url.pathname.endsWith("/messages") || url.pathname.endsWith("/user_presence")) json = [];
    await route.fulfill({ json });
  });
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const fixture = { access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp: expiry, role: "authenticated" })}.fixture_only`, refresh_token: "fixture_only", expires_at: expiry, expires_in: 3600, token_type: "bearer", user: { id, aud: "authenticated", role: "authenticated", email: "id-fixture@example.invalid", user_metadata: { full_name: own.name }, app_metadata: {}, created_at: "2026-10-11T20:00:00Z" } };
  await page.addInitScript(({ fixture }) => {
    localStorage.setItem("sb-mlsnyxzirlzpgkpdfmma-auth-token", JSON.stringify(fixture));
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (value: string) => (window as unknown as { recordCopiedId: (value: string) => Promise<void> }).recordCopiedId(value) } });
  }, { fixture });
  await page.goto("/app/profile");
  await expect(page.locator(".digitalx-id-card strong")).toHaveText("100012345");
  await page.getByRole("button", { name: "Copiar ID", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ID DIGITALX copiado");
  expect(copied).toBe("100012345");
  await page.reload();
  await expect(page.locator(".digitalx-id-card strong")).toHaveText("100012345");
  await page.goto("/app/contacts");
  await page.getByRole("button", { name: "Adicionar pelo ID", exact: true }).click();
  const input = page.getByRole("textbox", { name: "ID DIGITALX", exact: true });
  const search = page.getByRole("button", { name: "Buscar usuário", exact: true });
  await input.fill("212345678");
  await expect(search).toBeDisabled();
  await input.fill("12345");
  await expect(search).toBeDisabled();
  await input.fill("abc1234567890");
  await expect(input).toHaveValue("123456");
  await expect(search).toBeDisabled();
  await input.fill("1234567890");
  await expect(input).toHaveValue("123456789");
  expect(queries).toEqual([]);
  await search.click();
  await expect(page.locator(".id-result strong")).toHaveText(peer.name);
  await expect(page.locator(".id-result img")).toBeVisible();
  await expect(page.locator(".id-result")).not.toContainText("example.invalid");
  await input.fill("199999999");
  await search.click();
  await expect(page.locator(".id-notice")).toContainText("Nenhum usuário encontrado");
  await input.fill("111111111");
  await search.click();
  await expect(page.locator(".id-notice")).toContainText("Limite de buscas atingido");
  await expect(page.locator(".id-result")).toHaveCount(0);
  await input.fill("123456789");
  await search.click();
  await page.getByRole("button", { name: "Conversar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".chat-identity strong")).toHaveText(peer.name);
  await expect(page).toHaveURL(new RegExp(chat));
  expect(created).toBe(true);
  expect(queries).toEqual(["123456789", "199999999", "111111111", "123456789"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
