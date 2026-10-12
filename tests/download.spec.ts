import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("fixture-only private download preserves bytes/name and reports denied access", async ({ page }) => {
  // Every Supabase request is intercepted. This verifies UI behavior, not live RLS.
  const host = "https://mlsnyxzirlzpgkpdfmma.supabase.co";
  const id = "40000000-0000-4000-8000-000000000001";
  const chat = "40000000-0000-4000-8000-000000000002";
  const created_at = "2026-10-11T21:00:00Z";
  const profile = { id, name: "Download regression", username: "download-test", bio: "", avatar_url: null };
  const body = "Private document regression\n";
  const attachment = { id: "download-fixture", path: `${chat}/${id}/document`, name: "private-regression.txt", mime_type: "text/plain", size: Buffer.byteLength(body) };
  const message = { id: "message-fixture", conversation_id: chat, sender_id: id, body: "Document", created_at, sender: profile, attachments: [attachment] };
  let denied = false;
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  await page.route(`${host}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/storage/v1/object/")) {
      if (denied) return route.fulfill({ status: 403, json: { statusCode: "403", error: "Forbidden", message: "Download denied by permission" } });
      return route.fulfill({ contentType: "text/plain", body });
    }
    let json: unknown = null;
    if (path.endsWith("/get_onboarding_profile")) json = { ...profile, digitalx_id: "100012345", onboarding_completed_at: "2026-10-11T20:00:00Z" };
    if (path.endsWith("/profiles")) json = profile;
    if (path.endsWith("/messages")) json = [message];
    if (path.endsWith("/user_presence")) json = [];
    if (path.endsWith("/list_conversations")) json = [{ id: chat, title: "DOWNLOAD FIXTURE ONLY", is_group: true, description: "", updated_at: created_at, unread: 0, members: [{ user_id: id, role: "owner", last_read_at: created_at, profile }], last: message }];
    return route.fulfill({ json });
  });
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const fixture = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: expires_at, role: "authenticated" })}.fixture_not_real`, refresh_token: "fixture_only", expires_at, expires_in: 3600, token_type: "bearer", user: { id, aud: "authenticated", role: "authenticated", email: "download@example.invalid", user_metadata: { full_name: profile.name }, app_metadata: {}, created_at } };
  await page.addInitScript(fixture => localStorage.setItem("sb-mlsnyxzirlzpgkpdfmma-auth-token", JSON.stringify(fixture)), fixture);
  await page.goto(`/app/chat/${chat}`);
  const button = page.getByRole("button", { name: "Baixar private-regression.txt", exact: true });
  await expect(button).toBeVisible();
  await expect(page.getByText(`${attachment.size} B · plain`, { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await button.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe(attachment.name);
  expect(await fs.readFile((await file.path())!, "utf8")).toBe(body);
  denied = true;
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("alert")).toContainText("Download denied by permission");
  await expect(button).toBeEnabled();
});
