import { test, expect, type Page } from '@playwright/test';

// Isolated transport fixtures: these tests prove UX, not live Google/RLS/delivery.
const host = 'https://mlsnyxzirlzpgkpdfmma.supabase.co';
const me = {id:'91000000-0000-4000-8000-000000000001',name:'Mobile A',username:'mobile_a',bio:'',avatar_url:null};
const peer = {...me,id:'91000000-0000-4000-8000-000000000002',name:'Mobile B',username:'mobile_b'};
const chat = '91000000-0000-4000-8000-000000000003';
async function fixture(page: Page) {
  let sends = 0;
  const messages = Array.from({length:40}, (_,i)=>({id:`mobile-message-${i}`,conversation_id:chat,sender_id:i<36?peer.id:me.id,sender:i<36?peer:me,body:i===0?'Leia https://example.com/path. javascript:alert(1)':i===1?'Texto muito longo '+ 'x'.repeat(300):`Histórico de teste ${i}`,created_at:new Date(Date.UTC(2026,9,i<20?10:11,10,i%20)).toISOString(),attachments:[] as unknown[]}));
  const member = (profile:typeof me,role:string)=>({user_id:profile.id,profile,role,last_read_at:'2026-10-11T12:00:00Z'});
  const conv = {id:chat,title:null,is_group:false,description:'',members:[member(me,'owner'),member(peer,'member')],unread:0,updated_at:messages.at(-1)!.created_at,last:messages.at(-1)};
  const group = {...conv,id:'91000000-0000-4000-8000-000000000004',is_group:true,title:'MOBILE GROUP FIXTURE'};
  const conversations = [conv,group,...Array.from({length:35},(_,i)=>({...conv,id:`mobile-chat-${i}`,title:`Conexão ${i}`,members:[member(me,'owner'),member({...peer,name:`Conexão ${i}`},'member')]}))];
  await page.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
  await page.route(`${host}/**`, async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    let json: unknown=null;
    if(path.endsWith('/get_onboarding_profile')) json={...me,digitalx_id:'123456789',onboarding_completed_at:'2026-10-11T12:00:00Z'};
    if(path.endsWith('/get_my_digitalx_id')) json='123456789';
    if(path.endsWith('/profiles')) json=url.searchParams.has('id')?me:[me,peer];
    if(path.endsWith('/list_conversations')) json=conversations;
    if(path.endsWith('/user_presence')) json=[];
    if(path.endsWith('/messages')) json=[...messages].reverse();
    if(path.endsWith('/send_message')) {
      sends++;
      const data=request.postDataJSON();
      messages.push({...messages.at(-1)!,id:`sent-${sends}`,body:data.p_body,created_at:'2026-10-11T13:00:00Z',attachments:data.p_attachment?[{...data.p_attachment,id:`file-${sends}`}]:[]});
    }
    if(path.includes('/storage/v1/object/')) json={Key:'fixture-only'};
    await route.fulfill({json});
  });
  const exp=Math.floor(Date.now()/1000)+3600;
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const session={access_token:`${encode({alg:'HS256'})}.${encode({sub:me.id,role:'authenticated',exp})}.fixture_only`,refresh_token:'fixture_only',expires_at:exp,expires_in:3600,token_type:'bearer',user:{...me,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:'2026-10-11T12:00:00Z'}};
  await page.addInitScript(session=>localStorage.setItem('sb-mlsnyxzirlzpgkpdfmma-auth-token',JSON.stringify(session)),session);
  return {sends:()=>sends,receive:()=>messages.push({...messages[0],id:'received-new',body:'Nova mensagem enquanto você lê o histórico',created_at:'2026-10-11T13:01:00Z'})};
}
for(const [width,height] of [[360,800],[375,812],[390,844],[393,852],[430,932]]) {
  test(`fixture-only mobile layout ${width}x${height}: list, chat, navigation and readable controls`,async({page},info)=>{
    await page.setViewportSize({width,height});
    await fixture(page);
    await page.goto('/app/conversations');
    const search=page.getByRole('textbox',{name:'Buscar conversas',exact:true});
    await expect(search).toBeVisible();
    await expect(page.locator('.mobile-bottom button')).toHaveCount(4);
    await page.screenshot({path:`evidence/mobile-ux/after-${info.project.name}-list-${width}.png`});
    await search.fill('Mobile B');
    await page.getByRole('button',{name:'Diretos',exact:true}).click();
    await page.getByRole('button',{name:/Mobile B Histórico/}).click();
    await expect(page.locator('.message-bubble').last()).toBeInViewport();
    await expect(page.locator('.mobile-bottom')).toBeHidden();
    await expect(page.locator('.mobile-group-band')).toBeHidden();
    await expect(page.getByRole('button',{name:'Chamada de vídeo',exact:true})).toBeHidden();
    for(const name of ['Voltar às conversas','Chamada de áudio','Informações da conversa','Anexar arquivo','Enviar mensagem']) {
      const box=await page.getByRole('button',{name,exact:true}).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('.message-bubble p').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('15px');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
    await page.screenshot({path:`evidence/mobile-ux/after-${info.project.name}-chat-${width}.png`});
    await page.getByRole('button',{name:'Informações da conversa',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/chat/${chat}$`));
    await page.getByRole('button',{name:'Voltar às conversas',exact:true}).click();
    await expect(search).toHaveValue('Mobile B');
    await expect(page.getByRole('button',{name:'Diretos',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.goForward();
    await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeVisible();
  });
}

test('fixture-only mobile keyboard, multiline/send/upload, old history and secondary navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const transport=await fixture(page);
  // Model visualViewport resize/offset without pretending to open a physical keyboard.
  await page.addInitScript(()=>{
    const viewport=new EventTarget() as EventTarget & {height:number;offsetTop:number;scale:number};
    Object.assign(viewport,{height:844,offsetTop:0,scale:1});
    Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
    Object.assign(window,{setKeyboardFixture:(height:number,top=0,scale=1)=>{Object.assign(viewport,{height,offsetTop:top,scale});viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));}});
  });
  await page.goto('/app/conversations');
  const list=page.locator('.conversation-list');
  await list.evaluate(e=>{e.scrollTop=400;});
  const before=await list.evaluate(e=>e.scrollTop);
  await page.getByRole('button',{name:/Conexão 7 Histórico/}).click();
  await expect(page.locator('.message-bubble').last()).toBeInViewport();
  await page.getByRole('button',{name:'Voltar às conversas',exact:true}).click();
  await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(before);
  await page.getByRole('textbox',{name:'Buscar conversas',exact:true}).fill('Mobile B');
  await page.getByRole('button',{name:/Mobile B Histórico/}).click();
  const history=page.locator('.message-history');
  await expect(page.locator('.message-bubble').last()).toBeInViewport();
  await history.evaluate(e=>{e.scrollTop=150;});
  await expect(page.getByRole('button',{name:'Mensagens recentes'})).toBeVisible();
  transport.receive(); await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Nova mensagem enquanto você lê o histórico',{exact:true})).toBeAttached();
  expect(await history.evaluate(e=>e.scrollTop)).toBeLessThan(200);
  const input=page.getByRole('textbox',{name:'Mensagem',exact:true});
  await input.fill('Primeira linha'); await input.press('End'); await input.press('Enter'); await input.pressSequentially('Segunda linha');
  await expect(input).toHaveValue('Primeira linha\nSegunda linha'); expect(transport.sends()).toBe(0);
  await page.evaluate(()=> (window as unknown as {setKeyboardFixture:(h:number,top?:number,scale?:number)=>void}).setKeyboardFixture(420,24));
  await expect.poll(()=>page.locator('.workspace').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(420);
  const composer=await page.locator('.composer').boundingBox();
  expect(composer!.y+composer!.height).toBeLessThanOrEqual(445);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
  expect(await history.evaluate(e=>e.scrollTop)).toBeLessThan(200);
  await page.evaluate(()=> (window as unknown as {setKeyboardFixture:(h:number,top:number,scale:number)=>void}).setKeyboardFixture(210,24,2));
  await page.waitForTimeout(80);
  expect(await page.locator('.workspace').evaluate(e=>e.getBoundingClientRect().height)).toBe(420);
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(input).toHaveValue(''); expect(transport.sends()).toBe(1);
  await expect(page.getByText('Primeira linha\nSegunda linha',{exact:true})).toBeInViewport();
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(26);
  await page.locator('.composer input[type=file]').setInputFiles({name:'mobile-fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Fixture upload only')});
  await expect(page.getByRole('button',{name:'Remover anexo'})).toBeVisible();
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(page.getByRole('button',{name:'Baixar mobile-fixture.txt'})).toBeVisible();
  expect(transport.sends()).toBe(2);
  await page.evaluate(()=> (window as unknown as {setKeyboardFixture:(h:number)=>void}).setKeyboardFixture(844));
  await expect.poll(()=>page.locator('.workspace').evaluate(e=>e.getBoundingClientRect().height)).toBe(844);
  await history.evaluate(e=>{e.scrollTop=0;});
  await expect(page.getByRole('link',{name:'https://example.com/path'})).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.locator('.message-bubble a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('.date-separator')).toHaveCount(2);
  expect(await page.locator('.consecutive').count()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Voltar às conversas',exact:true}).click();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.goBack(); await expect(page.locator('.drawer-shade')).toHaveCount(0);
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Contatos',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar contato'}).fill('Mobile B');
  await expect(page.getByRole('button',{name:/Mobile B @mobile_b/})).toBeVisible();
  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Configurações',exact:true}).click();
  await page.getByRole('button',{name:/^Conta Nome/}).click();
  await expect(page.locator('.digitalx-id-card')).toContainText('123456789');
  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.locator('.mobile-bottom').getByRole('button',{name:'Conversas',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar conversas',exact:true}).fill('Mobile B');
  await page.getByRole('button',{name:'Diretos',exact:true}).click();
  await page.locator('.mobile-bottom').getByRole('button',{name:'Grupos',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Buscar conversas',exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'Todos',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^MOBILE GROUP FIXTURE/}).click();
  await page.getByRole('button',{name:'Informações da conversa',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Conversar com Mobile B',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'Nome',exact:true})).toBeHidden();
  await page.getByText('Editar informações do grupo',{exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'Nome',exact:true})).toBeVisible();
});
