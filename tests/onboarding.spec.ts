import { test, expect } from "@playwright/test";

test("fixture-only onboarding guards routes, validates photo, retries save and persists completion", async ({ page }) => {
  const host = "https://mlsnyxzirlzpgkpdfmma.supabase.co";
  const id = "80000000-0000-4000-8000-000000000001";
  let profile = { id, name: "Nome do Google", username: "fixture", bio: "", avatar_url: null as string | null, digitalx_id: "123456789", onboarding_completed_at: null as string | null };
  let failState = true, failSave = true, uploads = 0, saves = 0;
  const expiry = Math.floor(Date.now()/1000)+3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const fixture = { access_token: `${encode({ alg: "HS256" })}.${encode({ sub: id, exp: expiry, role: "authenticated" })}.fixture_only`, refresh_token: "fixture_only", expires_at: expiry, expires_in: 3600, token_type: "bearer", user: { id, aud: "authenticated", role: "authenticated", email: "setup@example.invalid", user_metadata: {}, app_metadata: {}, created_at: "2026-10-11T20:00:00Z" } };
  await page.addInitScript(f => localStorage.setItem("sb-mlsnyxzirlzpgkpdfmma-auth-token", JSON.stringify(f)), fixture);
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  await page.route(`${host}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let json: unknown = null;
    if (path.endsWith("/get_onboarding_profile")) {
      if (failState) return route.fulfill({ status: 503, json: { message: "Perfil indisponível temporariamente" } });
      json = profile;
    }
    if (path.includes("/storage/v1/object/avatars/")) {
      uploads++;
      expect(request.postDataBuffer()?.toString("latin1")).toMatch(/Content-Type: image\/(webp|png)/);
      return route.fulfill({ json: { Key: path.split("/object/")[1] } });
    }
    if (path.includes("/storage/v1/object/sign/avatars/")) return route.fulfill({ json: { signedURL: "/object/sign/avatars/test?token=fixture" } });
    if (path.endsWith("/complete_profile_onboarding")) {
      saves++;
      if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { message: "Falha temporária ao salvar" } }); }
      const body = request.postDataJSON();
      expect(body.p_avatar_path).toMatch(new RegExp(`^${id}/.*\\.(webp|png)$`));
      expect(body.p_name).toBe("Meu nome"); expect(body.p_bio).toBe("Minha bio");
      profile = { ...profile, name: body.p_name, bio: body.p_bio, avatar_url: `storage://avatars/${body.p_avatar_path}`, onboarding_completed_at: "2026-10-11T20:00:00Z" };
      json = profile;
    }
    if (path.endsWith("/profiles")) json = new URL(request.url()).searchParams.has("id") ? profile : [profile];
    if (path.endsWith("/get_my_digitalx_id")) json = profile.digitalx_id;
    if (path.endsWith("/messages") || path.endsWith("/user_presence") || path.endsWith("/list_conversations")) json = [];
    await route.fulfill({ json });
  });
  await page.goto("/app/contacts");
  await expect(page.getByRole("alert")).toContainText("Perfil indisponível");
  await expect(page.locator(".workspace")).toHaveCount(0);
  failState = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Seu perfil" })).toBeVisible();
  await expect(page.getByLabel("Seu nome")).toHaveValue("Nome do Google");
  await page.getByLabel("Seu nome").fill("   ");
  await expect(page.getByRole("button", { name: "Entrar no DIGITALX" })).toBeDisabled();
  await page.getByLabel("Seu nome").fill(" Meu nome ");
  await page.getByLabel("Bio", { exact: false }).fill("Minha bio");
  const photo = page.locator('.setup-form input[type="file"]');
  await photo.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("alert")).toContainText("JPG, PNG ou WebP"); expect(uploads).toBe(0);
  await photo.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5*1024*1024+1) });
  await expect(page.getByRole("alert")).toContainText("até 5 MB"); expect(uploads).toBe(0);
  await photo.setInputFiles("public/pwa-192.png");
  await expect(page.locator('.setup-photo img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `evidence/onboarding-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Entrar no DIGITALX" }).click();
  await expect(page.getByRole("alert")).toContainText("Falha temporária");
  await expect(page.getByLabel("Seu nome")).toHaveValue(" Meu nome ");
  await page.getByRole("button", { name: "Entrar no DIGITALX" }).click();
  await expect(page.getByRole("heading", { name: "Seu perfil" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/conversations$/);
  expect(uploads).toBe(1); expect(saves).toBe(2);
  await page.reload();
  await expect(page.locator('[aria-label="Nova conversa"]:visible').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu perfil" })).toHaveCount(0);
  await page.goto("/app/profile");
  await expect(page.locator(".digitalx-id-card strong")).toHaveText("123456789");
  await expect(page.locator('input[name="name"]')).toHaveValue("Meu nome");
  await expect(page.locator('textarea[name="bio"]')).toHaveValue("Minha bio");
});
