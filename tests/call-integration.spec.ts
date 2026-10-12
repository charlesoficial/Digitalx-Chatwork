import {test,expect,chromium,type BrowserContext} from '@playwright/test';
test('native Chromium DTLS/SRTP call uses two fixture accounts, requires both confirmations and carries bidirectional RTP',async({browserName},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop','Native fake-microphone test runs once; does not assert Safari or physical device compatibility.');
  test.setTimeout(65_000);
  expect(browserName).toBe('chromium');
  const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const host='https://mlsnyxzirlzpgkpdfmma.supabase.co',at=new Date().toISOString();
  const a={id:'92000000-0000-4000-8000-000000000001',name:'Fixture A',username:'a_fixture',avatar_url:'/brand.svg',bio:''};
  const b={...a,id:'92000000-0000-4000-8000-000000000002',name:'Fixture B',username:'b_fixture'};
  const dm='92000000-0000-4000-8000-000000000003';
  const conversation={id:dm,title:null,is_group:false,description:'',updated_at:at,unread:0,members:[a,b].map(profile=>({user_id:profile.id,profile,role:'member',last_read_at:at}))};
  let call:Record<string,unknown>|null=null;
  // A malicious signaling service lies about each client's OWN fingerprint in its echo.
  // This must not affect the locally computed verification code or trust pin.
  const forgedEcho=(signal:unknown)=>{
    const value=signal as {sdp:string};
    return value?.sdp?{...value,sdp:value.sdp.replace(/^a=fingerprint:sha-256 .*$/gm,`a=fingerprint:sha-256 ${Array(32).fill('CD').join(':')}`)}:signal;
  };
  const response=(value:Record<string,unknown>|null,user:string)=>value?{...value,...(user===a.id?{offer:forgedEcho(value.offer)}:{answer:forgedEcho(value.answer)})}:null;
  const configure=async(context:BrowserContext,user:typeof a)=>{
    await context.routeWebSocket('**/realtime/v1/**',ws=>ws.close());
    await context.route(`${host}/**`,async route=>{
      const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON()??{};
      let json:unknown=null;
      if(path.endsWith('/get_onboarding_profile'))json={...user,digitalx_id:'123456789',onboarding_completed_at:at};
      if(path.endsWith('/profiles'))json=new URL(req.url()).searchParams.has('id')?user:[a,b];
      if(path.endsWith('/get_my_digitalx_id'))json='123456789';
      if(path.endsWith('/list_conversations'))json=[conversation];
      if(path.endsWith('/messages')||path.endsWith('/user_presence'))json=[];
      if(path.endsWith('/start_secure_audio_call')){
        expect(user.id).toBe(a.id);expect(body.p_conversation).toBe(dm);
        expect(body.p_offer.type).toBe('offer');
        expect(Object.keys(body.p_offer).sort()).toEqual(['device','sdp','type']);
        call={id:'92000000-0000-4000-8000-000000000004',conversation_id:dm,caller_id:a.id,callee_id:b.id,offer:body.p_offer,answer:null,state:'ringing',expires_at:new Date(Date.now()+60_000).toISOString()};json=response(call,user.id);
      }
      if(path.endsWith('/get_secure_audio_call'))json=body.p_id?response(call,user.id):(user.id===b.id && call?.state==='ringing'?call:null);
      if(path.endsWith('/update_secure_audio_call')){
        if(body.p_action==='answer'){expect(user.id).toBe(b.id);call={...call,answer:body.p_answer,state:'connecting'};}
        else call={...call,state:'ended',offer:{type:'expired'},answer:null};
        json=response(call,user.id);
      }
      await route.fulfill({json});
    });
    const exp=Math.floor(Date.now()/1000)+3600,encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
    const fixture={access_token:`${encode({alg:'HS256'})}.${encode({sub:user.id,role:'authenticated',exp})}.fixture_only`,refresh_token:'fixture_only',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id:user.id,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:at}};
    await context.addInitScript(f=>localStorage.setItem('sb-mlsnyxzirlzpgkpdfmma-auth-token',JSON.stringify(f)),fixture);
  };
  try {
    const ca=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844}}),cb=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844}});
    await configure(ca,a);await configure(cb,b);
    const pa=await ca.newPage(),pb=await cb.newPage();
    const base=testInfo.project.use.baseURL!;
    await pa.goto(`${base}/app/chat/${dm}`);await pb.goto(`${base}/app/chat/${dm}`);
    await pa.getByRole('button',{name:'Chamada de áudio',exact:true}).click();
    await expect(pb.getByRole('button',{name:'Atender ligação',exact:true})).toBeVisible({timeout:20_000});
    await pb.getByRole('button',{name:'Atender ligação',exact:true}).click();
    const qa=pa.getByRole('button',{name:'Comparei o código completo',exact:true}),qb=pb.getByRole('button',{name:'Comparei o código completo',exact:true});
    await expect(qa).toBeEnabled({timeout:20_000});await expect(qb).toBeEnabled({timeout:20_000});
    const code=await pa.getByLabel('Código de segurança da ligação').innerText();
    expect(await pb.getByLabel('Código de segurança da ligação').innerText()).toBe(code);
    await expect(pa.getByRole('dialog')).not.toContainText('Dispositivos verificados');
    await qa.click();await expect(pb.getByRole('dialog')).not.toContainText('Dispositivos verificados');
    await expect(pa.getByRole('button',{name:'Silenciar microfone',exact:true})).toBeDisabled();
    await qb.click();
    await expect(pa.getByRole('dialog')).toContainText('Dispositivos verificados');await expect(pb.getByRole('dialog')).toContainText('Dispositivos verificados');
    await pa.screenshot({path:'evidence/call-native-fixture-mobile-active.png'});
    await pa.getByRole('button',{name:'Mais opções da ligação',exact:true}).click();await pb.getByRole('button',{name:'Mais opções da ligação',exact:true}).click();
    await testInfo.attach('native-call-state-before-media',{body:JSON.stringify({a:await pa.getByRole('dialog').innerText(),b:await pb.getByRole('dialog').innerText(),offerDirections:JSON.stringify(call?.offer).match(/a=(sendrecv|recvonly|sendonly|inactive)/g),answerDirections:JSON.stringify(call?.answer).match(/a=(sendrecv|recvonly|sendonly|inactive)/g)}),contentType:'application/json'});
    await expect.poll(async()=>{
      const text=await pa.locator('.secure-call-options dd').last().innerText();return text.match(/\d+/g)?.map(Number).every(n=>n>0);
    }).toBe(true);
    await expect.poll(async()=>{
      const text=await pb.locator('.secure-call-options dd').last().innerText();return text.match(/\d+/g)?.map(Number).every(n=>n>0);
    }).toBe(true);
    await pa.screenshot({path:'evidence/call-native-fixture-mobile.png'});
    await pa.getByRole('button',{name:'Fechar opções da ligação',exact:true}).click();
    await pa.getByRole('button',{name:'Silenciar microfone',exact:true}).click();await expect(pa.getByRole('button',{name:'Ativar microfone',exact:true})).toBeEnabled();
    await pa.getByRole('button',{name:'Encerrar ligação',exact:true}).click();
    await expect(pb.getByRole('dialog')).toContainText('Ligação finalizada',{timeout:8000});
    await expect.poll(()=>call?.answer).toBeNull();
    expect(await pa.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  } finally{await browser.close();}
});
