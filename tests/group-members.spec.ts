import { test, expect } from "@playwright/test";

test("fixture-only member and message photo open private chat, self opens profile and admin action stays separate", async ({ page }) => {
  // UI transport fixture; real account reuse is validated separately in the Edge sessions.
  const host = 'https://mlsnyxzirlzpgkpdfmma.supabase.co';
  const ownId = '82000000-0000-4000-8000-000000000001';
  const peerId = '82000000-0000-4000-8000-000000000002';
  const groupId = '82000000-0000-4000-8000-000000000003';
  const dmId = '82000000-0000-4000-8000-000000000004';
  const own = { id: ownId, name: 'Member A', username: 'member_a', avatar_url: null, bio: '' };
  const peer = { id: peerId, name: 'Member B', username: 'member_b', avatar_url: '/brand.svg', bio: '' };
  const at = '2026-10-11T20:00:00Z';
  const members = [own, peer].map((profile,i) => ({ user_id: profile.id, profile, role: i ? 'admin' : 'owner', last_read_at: at }));
  const group = { id: groupId, title: 'GROUP FIXTURE', is_group: true, description: '', updated_at: at, members, unread: 0 };
  const dm = { ...group, id: dmId, title: null, is_group: false };
  let denied = true, requests = 0, removals = 0;
  await page.routeWebSocket('**/realtime/v1/**', ws => ws.close());
  await page.route(`${host}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    let json: unknown = null;
    if (url.pathname.endsWith('/get_onboarding_profile')) json = { ...own, digitalx_id: '123456789', onboarding_completed_at: at };
    if (url.pathname.endsWith('/profiles')) json = url.searchParams.has('id') ? own : [own,peer];
    if (url.pathname.endsWith('/get_my_digitalx_id')) json = '123456789';
    if (url.pathname.endsWith('/list_conversations')) json = [group,dm];
    if (url.pathname.endsWith('/user_presence')) json = [];
    if (url.pathname.endsWith('/messages')) json = [{ id: 'saved-message', conversation_id: url.searchParams.get('conversation_id') === `eq.${dmId}` ? dmId : groupId, sender_id: peerId, sender: peer, body: 'Previously saved private message', created_at: at, attachments: [] }];
    if (url.pathname.endsWith('/create_conversation')) {
      requests++;
      expect(req.postDataJSON()).toEqual({ p_title: '', p_participants: [peerId], p_group: false });
      if (denied) return route.fulfill({ status: 403, json: { message: 'Private chat temporarily unavailable' } });
      json = dmId;
    }
    if (url.pathname.endsWith('/manage_group')) {
      expect(req.postDataJSON()).toMatchObject({ p_conversation: groupId, p_action: 'remove', p_user: peerId });
      removals++; group.members = members.filter(m => m.user_id !== peerId);
    }
    await route.fulfill({ json });
  });
  const exp = Math.floor(Date.now()/1000)+3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const fixture = { access_token: `${encode({alg:'HS256'})}.${encode({sub:ownId,role:'authenticated',exp})}.fixture_only`, refresh_token: 'fixture_only', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: { id: ownId, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, created_at: at } };
  await page.addInitScript(f => localStorage.setItem('sb-mlsnyxzirlzpgkpdfmma-auth-token',JSON.stringify(f)),fixture);
  await page.goto(`/app/chat/${groupId}`);
  await page.getByRole('button',{name:'Informações da conversa',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'Ver meu perfil',exact:true})).toContainText('(você)');
  await dialog.getByRole('button',{name:'Conversar com Member B',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Private chat temporarily unavailable');
  await expect(dialog).toBeVisible();
  denied = false;
  await dialog.getByRole('button',{name:'Conversar com Member B',exact:true}).press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(dmId));
  await expect(page.locator('.chat-identity strong')).toHaveText('Member B');
  await expect(page.locator('.message-bubble')).toContainText('Previously saved private message');
  expect(requests).toBe(2);
  await expect(page.locator('.message-avatar-button')).toHaveCount(0);
  await page.goto(`/app/chat/${groupId}`);
  const messagePhoto = page.locator('.message-avatar-button');
  await expect(messagePhoto).toHaveAccessibleName('Conversar com Member B');
  await messagePhoto.locator('img').click();
  await expect(page).toHaveURL(new RegExp(dmId));
  await expect(page.locator('.chat-identity strong')).toHaveText('Member B');
  await expect(page.locator('.message-bubble')).toContainText('Previously saved private message');
  expect(requests).toBe(3);
  await page.goto(`/app/chat/${groupId}`);
  await page.getByRole('button',{name:'Informações da conversa',exact:true}).click();
  await dialog.getByRole('button',{name:'Ver meu perfil',exact:true}).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.locator('.digitalx-id-card strong')).toHaveText('123456789');
  expect(requests).toBe(3);
  await page.goto(`/app/chat/${groupId}`);
  await page.getByRole('button',{name:'Informações da conversa',exact:true}).click();
  await dialog.getByRole('button',{name:'Remover Member B',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Conversar com Member B',exact:true})).toHaveCount(0);
  expect(removals).toBe(1); expect(requests).toBe(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
