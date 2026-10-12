import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync } from 'node:fs';
// Transport fixtures exercise UI/protocol behavior. Authorization is tested in SQL separately.
const host='https://mlsnyxzirlzpgkpdfmma.supabase.co';
const uid='93000000-0000-4000-8000-000000000001',peerId='93000000-0000-4000-8000-000000000002';
const chat='93000000-0000-4000-8000-000000000003',group='93000000-0000-4000-8000-000000000004';
const me={id:uid,name:'Action A',username:'action_a',avatar_url:null,bio:''},peer={...me,id:peerId,name:'Action B',username:'action_b'};
type Row={id:string;conversation_id:string;sender_id:string;body:string;created_at:string;sender:typeof me;attachments:unknown[];reply_to_id?:string;edited_at?:string;deleted_at?:string;forwarded?:boolean;client_nonce?:string;reactions:{user_id:string;emoji:string|null}[]};
async function fixture(page:Page, media=false) {
  const now=Date.now(),rows:Row[]=[
    {id:'93000000-0000-4000-8000-000000000010',conversation_id:chat,sender_id:peerId,body:'Original do contato',created_at:new Date(now-180000).toISOString(),sender:peer,attachments:[],reactions:[]},
    {id:'93000000-0000-4000-8000-000000000011',conversation_id:chat,sender_id:uid,body:'Minha mensagem recente',created_at:new Date(now-60000).toISOString(),sender:me,attachments:[],reactions:[]},
    {id:'93000000-0000-4000-8000-000000000012',conversation_id:chat,sender_id:uid,body:'Texto antigo sem edição',created_at:new Date(now-3600_000).toISOString(),sender:me,attachments:[],reactions:[]},
  ];
  const imageBytes=readFileSync('public/pwa-192.png');let imageFailure=media;
  if(media)rows.push({...rows[0],id:'93000000-0000-4000-8000-000000000013',body:'Imagem para visualizar',attachments:[{id:'image-test',name:'premium.png',path:`${chat}/${peerId}/premium.png`,mime_type:'image/png',size:imageBytes.length}]});
  const hidden=new Set<string>(),requests:Record<string,unknown>[]=[];let sequence=20,failOnce='',loseResponse=false;
  let socket:WebSocketRoute|null=null,subscriptions:{id:number;table:string;event:string}[]=[];
  await page.routeWebSocket('**/realtime/v1/**',ws=>{
    socket=ws;
    ws.onMessage(raw=>{
      const parsed=JSON.parse(String(raw)); const m=Array.isArray(parsed)?{join_ref:parsed[0],ref:parsed[1],topic:parsed[2],event:parsed[3],payload:parsed[4]}:parsed;
      if(m.event==='phx_join') {
        subscriptions=(m.payload.config.postgres_changes??[]).map((x:{table:string;event:string},i:number)=>({...x,id:i+1}));
        ws.send(JSON.stringify([m.ref,m.ref,m.topic,'phx_reply',{status:'ok',response:{postgres_changes:subscriptions}}]));
      } else if(m.event==='heartbeat') ws.send(JSON.stringify([null,m.ref,m.topic,'phx_reply',{status:'ok',response:{}}]));
    });
  });
  const emit=(table:string,type:string,record:unknown)=>{
    const ids=subscriptions.filter(x=>x.table===table&&(x.event===type||x.event==='*')).map(x=>x.id);
    socket?.send(JSON.stringify([null,null,`realtime:digitalx-${uid}`,'postgres_changes',{ids,data:{schema:'public',table,type,commit_timestamp:new Date().toISOString(),columns:[],record,old_record:{},errors:null}}]));
  };
  const view=(m:Row)=>({...m,attachments:m.deleted_at?[]:m.attachments,reply:m.reply_to_id&&!hidden.has(m.reply_to_id)?rows.find(x=>x.id===m.reply_to_id)??null:null});
  const member=(p:typeof me)=>({user_id:p.id,profile:p,role:p.id===uid?'owner':'member',last_read_at:new Date(now+3600_000).toISOString()});
  const conversations=()=>[chat,group].map(id=>({id,title:id===group?'Grupo Actions':null,is_group:id===group,description:'',updated_at:new Date(now).toISOString(),members:[member(me),member(peer)],unread:0,last:rows.filter(m=>m.conversation_id===id&&!hidden.has(m.id)).at(-1)}));
  await page.route(`${host}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=path.split('/').at(-1)!;let json:unknown=null;
    if(path.includes('/storage/v1/object/sign/')) {
      if(req.method()==='POST')return route.fulfill({json:{signedURL:`/object/sign/chat-files/${chat}/${peerId}/premium.png?token=fixture-only`}});
      if(imageFailure){imageFailure=false;return route.abort('failed');}
      return route.fulfill({body:imageBytes,contentType:'image/png',headers:{'Cache-Control':'no-store'}});
    }
    if(path.startsWith('/storage/v1/object/chat-files/'))return route.fulfill({body:imageBytes,contentType:'image/png'});
    if(path.endsWith('/get_onboarding_profile'))json={...me,digitalx_id:'123456789',onboarding_completed_at:new Date(now).toISOString()};
    if(path.endsWith('/get_my_digitalx_id'))json='123456789';
    if(path.endsWith('/profiles'))json=me;
    if(path.endsWith('/user_presence'))json=[];
    if(path.endsWith('/list_conversations'))json=conversations();
    if(path.endsWith('/messages')) {
      let result=rows.filter(x=>!hidden.has(x.id));
      const cid=url.searchParams.get('conversation_id'),ids=url.searchParams.get('id');
      if(cid)result=result.filter(x=>`eq.${x.conversation_id}`===cid);
      if(ids?.startsWith('in.'))result=result.filter(x=>ids.includes(x.id));
      json=[...result].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(view);
    }
    if(path.includes('/rpc/')&&['send_message_v2','edit_message','hide_messages','delete_message_for_all','react_message','forward_messages'].includes(method)) {
      const data=req.postDataJSON();requests.push({method,...data});
      if(failOnce===method){failOnce='';return route.fulfill({status:503,json:{message:'Conexão interrompida. Tente novamente.'}});}
      const m=rows.find(x=>x.id===data.p_message);
      if(method==='send_message_v2') {
        let sent=rows.find(x=>x.client_nonce===data.p_nonce);
        if(!sent){sent={...rows[1],id:`93000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`,conversation_id:data.p_conversation,body:data.p_body,created_at:new Date().toISOString(),reply_to_id:data.p_reply,client_nonce:data.p_nonce,reactions:[],attachments:data.p_attachment?[{...data.p_attachment,id:'attachment-test'}]:[]};rows.push(sent);emit('messages','INSERT',sent);}
        json=sent.id;
        if(loseResponse){loseResponse=false;return route.abort('connectionreset');}
      }
      if(method==='edit_message'){if(m?.sender_id!==uid)return route.fulfill({status:403,json:{message:'Só o autor pode editar esta mensagem'}});m.body=data.p_body;m.edited_at=new Date().toISOString();emit('messages','UPDATE',m);}
      if(method==='react_message'&&m){m.reactions=m.reactions.filter(r=>r.user_id!==uid);m.reactions.push({user_id:uid,emoji:data.p_emoji});emit('message_reactions','UPDATE',{message_id:m.id,user_id:uid,emoji:data.p_emoji});}
      if(method==='hide_messages'){data.p_messages.forEach((id:string)=>hidden.add(id));emit('message_hidden','INSERT',{message_id:data.p_messages[0],user_id:uid});}
      if(method==='delete_message_for_all'&&m){m.body='';m.deleted_at=new Date().toISOString();m.reactions=[];emit('messages','UPDATE',m);}
      if(method==='forward_messages') {json=data.p_messages.map((id:string)=>{const original=rows.find(x=>x.id===id)!;const nonce=data.p_nonce+id;let f=rows.find(x=>x.client_nonce===nonce);if(!f){f={...original,id:`forward-${sequence++}`,conversation_id:data.p_conversation,sender_id:uid,sender:me,forwarded:true,client_nonce:nonce,created_at:new Date().toISOString(),reactions:[]};rows.push(f);}return f.id;});}
    }
    return route.fulfill({json});
  });
  const exp=Math.floor(Date.now()/1000)+3600,encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const session={access_token:`${encode({alg:'HS256'})}.${encode({sub:uid,role:'authenticated',exp})}.fixture_only`,refresh_token:'fixture_only',expires_at:exp,expires_in:3600,token_type:'bearer',user:{...me,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:new Date(now).toISOString()}};
  await page.addInitScript(s=>localStorage.setItem('sb-mlsnyxzirlzpgkpdfmma-auth-token',JSON.stringify(s)),session);
  await page.goto(`/app/chat/${chat}`);
  await expect(page.getByText('Minha mensagem recente',{exact:true})).toBeVisible();
  return {rows,requests,fail:(method:string)=>{failOnce=method;},loseResponse:()=>{loseResponse=true;},external:(body='Editada remotamente por B')=>{rows[0].body=body;rows[0].edited_at=new Date().toISOString();rows[0].reactions=[{user_id:peerId,emoji:'🔥'}];emit('messages','UPDATE',rows[0]);},externalReaction:()=>{rows[1].reactions.push({user_id:peerId,emoji:'😂'});emit('message_reactions','INSERT',{message_id:rows[1].id,user_id:peerId,emoji:'😂'});}};
}
const bubble=(page:Page,text:string)=>page.locator('.interactive-message').filter({has:page.getByText(text,{exact:true}).and(page.locator('p'))});
async function menu(page:Page,text:string){await bubble(page,text).click({button:'right'});await expect(page.getByRole('dialog',{name:'Ações da mensagem',exact:true})).toBeVisible();}

test('fixture-only reply, cancel, locate, edit, reactions, realtime and reload persistence',async({page})=>{
  const transport=await fixture(page);
  await menu(page,'Original do contato');
  await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Responder',exact:true}).click();
  await expect(page.locator('.composer-quote')).toContainText('Action B');
  await page.getByRole('button',{name:'Cancelar resposta'}).click();await expect(page.locator('.composer-quote')).toHaveCount(0);
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Responder',exact:true}).click();
  await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Minha resposta vinculada');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(bubble(page,'Minha resposta vinculada')).toContainText('Original do contato');
  expect(transport.rows.at(-1)!.reply_to_id).toBe(transport.rows[0].id);
  await bubble(page,'Minha resposta vinculada').getByRole('button',{name:'Localizar mensagem original'}).click();
  await expect(page.locator('.message-highlight')).toContainText('Original do contato');
  await menu(page,'Minha mensagem recente');await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByRole('textbox',{name:'Editar texto',exact:true}).fill('Mensagem própria editada');await page.getByRole('button',{name:'Salvar edição',exact:true}).click();
  await expect(bubble(page,'Mensagem própria editada')).toContainText('Editada');
  await menu(page,'Texto antigo sem edição');await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Fechar ações'}).click();
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Reagir 👍',exact:true}).click();
  await expect(bubble(page,'Original do contato').getByRole('group',{name:'Reações recebidas'})).toContainText('👍1');
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Reagir 👍',exact:true}).click();
  await expect(bubble(page,'Original do contato').getByRole('group',{name:'Reações recebidas'})).toHaveCount(0);
  transport.external();await expect(bubble(page,'Editada remotamente por B')).toBeVisible();
  await expect(bubble(page,'Editada remotamente por B').getByRole('group',{name:'Reações recebidas'})).toContainText('🔥1');
  transport.externalReaction();await expect(bubble(page,'Mensagem própria editada').getByRole('group',{name:'Reações recebidas'})).toContainText('😂1');
  await page.reload();await expect(bubble(page,'Editada remotamente por B')).toBeVisible();await expect(bubble(page,'Minha resposta vinculada')).toContainText('Editada remotamente por B');
  const longText='Resposta vinculada com uma mensagem original bastante longa para preservar o botão de cancelar dentro do campo de digitação';
  transport.external(longText);await expect(bubble(page,longText)).toBeVisible();await menu(page,longText);await page.getByRole('button',{name:'Responder',exact:true}).click();
  const quote=await page.locator('.composer-quote').boundingBox(),composerBox=await page.locator('.composer-input').boundingBox(),cancelBox=await page.getByRole('button',{name:'Cancelar resposta'}).boundingBox();
  expect(quote!.x+quote!.width).toBeLessThanOrEqual(composerBox!.x+composerBox!.width);expect(cancelBox!.x+cancelBox!.width).toBeLessThanOrEqual(composerBox!.x+composerBox!.width);
  await page.getByRole('button',{name:'Cancelar resposta'}).click();await expect(page.locator('.composer-quote')).toHaveCount(0);
});

test('fixture-only copy/fallback, selection, forwarding, self hide and global tombstone',async({page})=>{
  const transport=await fixture(page);
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async(v:string)=>{Object.assign(window,{copiedFixture:v});}},configurable:true});});
  await menu(page,'Minha mensagem recente');await page.getByRole('button',{name:'Copiar',exact:true}).click();await expect(page.getByText('Texto copiado.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {copiedFixture:string}).copiedFixture)).toBe('Minha mensagem recente');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('fixture clipboard denied');}},configurable:true});});
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Copiar',exact:true}).click();await expect(page.getByRole('textbox',{name:'Texto para copiar'})).toHaveValue('Original do contato');await page.getByRole('button',{name:'Fechar ações'}).click();
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Selecionar mensagem',exact:true}).click();
  await bubble(page,'Minha mensagem recente').getByRole('button',{name:'Selecionar esta mensagem'}).click();
  await expect(page.getByRole('toolbar',{name:'Mensagens selecionadas'})).toContainText('2');
  await page.getByRole('button',{name:'Encaminhar selecionadas'}).click();await page.getByRole('button',{name:'Grupo Actions Grupo',exact:true}).click();
  transport.fail('forward_messages');await page.getByRole('button',{name:'Confirmar encaminhamento'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Conexão interrompida');
  await page.getByRole('button',{name:'Confirmar encaminhamento'}).click();await expect(page.getByText('Mensagens encaminhadas.',{exact:true})).toBeVisible();
  const forwards=transport.rows.filter(m=>m.conversation_id===group);expect(forwards).toHaveLength(2);expect(forwards.every(m=>m.forwarded)).toBe(true);
  const forwardRequests=transport.requests.filter(r=>r.method==='forward_messages');expect(forwardRequests[0].p_nonce).toBe(forwardRequests[1].p_nonce);
  await menu(page,'Original do contato');await page.getByRole('button',{name:'Apagar',exact:true}).click();await expect(page.getByRole('button',{name:'Apagar para todos',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Apagar para mim',exact:true}).click();
  await expect(page.getByText('Original do contato',{exact:true})).toHaveCount(0);expect(transport.rows[0].deleted_at).toBeUndefined();
  await page.reload();await expect(page.getByText('Original do contato',{exact:true})).toHaveCount(0);
  await menu(page,'Minha mensagem recente');await page.getByRole('button',{name:'Apagar',exact:true}).click();await page.getByRole('button',{name:'Apagar para todos',exact:true}).click();
  await expect(page.getByText('Esta mensagem foi apagada',{exact:true})).toBeVisible();expect(transport.rows[1].deleted_at).toBeTruthy();
});

test('fixture-only optimistic sending, failure retry and lost response reconcile without duplicates',async({page})=>{
  const transport=await fixture(page);
  transport.fail('send_message_v2');const input=page.getByRole('textbox',{name:'Mensagem',exact:true});
  await input.fill('Texto preservado na falha');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(page.locator('.pending-message')).toContainText('Texto preservado na falha');await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(bubble(page,'Texto preservado na falha')).toBeVisible();
  const sent=transport.requests.filter(r=>r.method==='send_message_v2');expect(sent[0].p_nonce).toBe(sent[1].p_nonce);expect(transport.rows.filter(m=>m.body==='Texto preservado na falha')).toHaveLength(1);
  transport.loseResponse();await input.fill('Resposta perdida depois de persistir');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(bubble(page,'Resposta perdida depois de persistir')).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.pending-message')).toHaveCount(0);
  expect(transport.rows.filter(m=>m.body==='Resposta perdida depois de persistir')).toHaveLength(1);
  await expect(page.locator('[aria-label="Mensagem entregue"]')).toHaveCount(0);
});

test('fixture-only private image retry, enlarged viewer, focus, back and exact download bytes',async({page})=>{
  await fixture(page,true);
  await expect(page.getByRole('button',{name:'Carregar novamente',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Carregar novamente',exact:true}).click();
  const thumbnail=page.getByRole('button',{name:'Ampliar premium.png',exact:true});
  await expect(thumbnail).toHaveClass(/loaded/);await thumbnail.click();
  const viewer=page.getByRole('dialog',{name:'Visualizar premium.png',exact:true});await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img')).toBeVisible();
  await viewer.getByRole('button',{name:'Fechar mídia'}).focus();await page.keyboard.press('Shift+Tab');await expect(viewer.getByRole('button',{name:'Baixar arquivo'})).toBeFocused();
  const downloaded=page.waitForEvent('download');await viewer.getByRole('button',{name:'Baixar arquivo'}).click();
  const result=await downloaded;expect(result.suggestedFilename()).toBe('premium.png');
  expect(readFileSync((await result.path())!).equals(readFileSync('public/pwa-192.png'))).toBe(true);
  await page.goBack();await expect(viewer).toHaveCount(0);await expect(page).toHaveURL(new RegExp(`/chat/${chat}$`));
  await thumbnail.click();await expect(viewer).toBeVisible();await viewer.getByRole('button',{name:'Fechar mídia'}).click();await expect(viewer).toHaveCount(0);await expect(page).toHaveURL(new RegExp(`/chat/${chat}$`));
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Anexar arquivo',exact:true}).click();
  await (await chooserPromise).setFiles('public/pwa-192.png');
  const composer=page.getByRole('textbox',{name:'Mensagem',exact:true});await composer.fill('Legenda com anexo selecionado');
  expect((await composer.boundingBox())!.width).toBeGreaterThan(80);await expect(page.getByRole('img',{name:'Prévia do anexo'})).toBeVisible();
  await page.getByRole('button',{name:'Remover anexo',exact:true}).click();await expect(composer).toHaveValue('Legenda com anexo selecionado');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

for(const [width,height] of [[360,800],[375,812],[390,844],[393,852],[430,932]]) {
  test(`fixture-only context menu, long press, swipe reply and viewport ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});
    await page.addInitScript(h=>{
      const viewport=Object.assign(new EventTarget(),{height:h,offsetTop:0,scale:1});
      Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
      Object.assign(window,{setChatKeyboardFixture:()=>{Object.assign(viewport,{height:420,offsetTop:24});viewport.dispatchEvent(new Event('resize'));}});
    },height);
    await fixture(page);
    const original=bubble(page,'Original do contato');
    await original.dispatchEvent('pointerdown',{pointerType:'touch',button:0,clientX:100,clientY:200});await page.waitForTimeout(560);await original.dispatchEvent('pointerup',{pointerType:'touch',button:0,clientX:100,clientY:200});
    await expect(page.getByRole('dialog',{name:'Ações da mensagem',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    const box=await page.getByRole('dialog').boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(height);
    await page.screenshot({path:`evidence/chat-premium/menu-${info.project.name}-${width}.png`});
    await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(new RegExp(`/chat/${chat}$`));
    await original.dispatchEvent('pointerdown',{pointerType:'touch',button:0,clientX:100,clientY:200});await original.dispatchEvent('pointermove',{pointerType:'touch',button:0,clientX:180,clientY:203});await original.dispatchEvent('pointerup',{pointerType:'touch',button:0,clientX:180,clientY:203});
    await expect(page.locator('.composer-quote')).toContainText('Original do contato');await page.getByRole('button',{name:'Cancelar resposta'}).click();
    // Vertical gesture must neither quote nor open an action sheet.
    await original.dispatchEvent('pointerdown',{pointerType:'touch',button:0,clientX:100,clientY:200});await original.dispatchEvent('pointermove',{pointerType:'touch',button:0,clientX:105,clientY:280});await original.dispatchEvent('pointercancel',{pointerType:'touch',button:0});await page.waitForTimeout(530);
    await expect(page.locator('.composer-quote')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
    await original.click({button:'right'});await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Fechar ações'}).click();
    await menu(page,'Original do contato');
    await page.evaluate(()=>(window as unknown as {setChatKeyboardFixture:()=>void}).setChatKeyboardFixture());
    await expect.poll(()=>page.locator('.workspace').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(420);
    const keyboardSheet=await page.getByRole('dialog').boundingBox();
    expect(keyboardSheet!.y).toBeGreaterThanOrEqual(24);expect(keyboardSheet!.y+keyboardSheet!.height).toBeLessThanOrEqual(444);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(false);
    await page.getByRole('button',{name:'Responder',exact:true}).click();
    const keyboardComposer=await page.locator('.composer').boundingBox();expect(keyboardComposer!.y+keyboardComposer!.height).toBeLessThanOrEqual(444);
  });
}
