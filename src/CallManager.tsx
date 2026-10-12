import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Info,LockKeyhole,Mic,MicOff,MoreHorizontal,Phone,PhoneOff,ShieldAlert,UserPlus,Video,Volume2,X} from 'lucide-react';
import type {Conversation,Profile} from './types';
import {client,check} from './lib/supabase';
import {useAvatarUrl} from './lib/avatar';
import {SecureAudioPeer,type PeerState} from './lib/calls/peer';
import {fingerprint,verificationCode,type AudioSignal} from './lib/calls/security';
import {pinnedFingerprint,pinFingerprint} from './lib/calls/identity';
import './calls.css';
type Call={id:string;conversation_id:string;caller_id:string;callee_id:string;offer:AudioSignal;answer:AudioSignal|null;state:'ringing'|'connecting'|'ended'|'declined';expires_at:string};
export type CallRequest={id:number;conversation:Conversation};
const empty:PeerState={connected:false,dtls:false,channel:false,localVerified:false,remoteVerified:false,audioEnabled:false,muted:false};
const message=(e:unknown)=>e instanceof Error?e.message:'Não foi possível realizar a chamada segura.';
async function rpc<T>(name:string,params:Record<string,unknown>):Promise<T>{const {data,error}=await client().rpc(name,params);check(error);return data as T;}

export default function CallManager({me,conversations,request}:{me:Profile;conversations:Conversation[];request:CallRequest|null}) {
  const [call,setCall]=useState<Call|null>(null),[stage,setStage]=useState(''),[failure,setFailure]=useState(''),[peerProfile,setPeerProfile]=useState<Profile|null>(null);
  const [security,setSecurity]=useState(empty),[code,setCode]=useState(''),[changed,setChanged]=useState(false),[more,setMore]=useState(false),[duration,setDuration]=useState(0),[proof,setProof]=useState<Awaited<ReturnType<SecureAudioPeer['proof']>>|null>(null),[soundBlocked,setSoundBlocked]=useState(false);
  const [levels,setLevels]=useState<number[]>([]),[outputNotice,setOutputNotice]=useState('');
  const current=useRef<Call|null>(null),peer=useRef<SecureAudioPeer|null>(null),audio=useRef<HTMLAudioElement>(null),lastRequest=useRef(0),working=useRef(false),mounted=useRef(true),generation=useRef(0),startedAt=useRef(0),answerApplied=useRef(false),convs=useRef(conversations);
  const verifiedRemote=useRef<{user:string;device:string;fingerprint:string}|null>(null);
  const photo=useAvatarUrl(peerProfile?.avatar_url),selfPhoto=useAvatarUrl(me.avatar_url);
  useEffect(()=>{convs.current=conversations;},[conversations]);
  const setCurrent=(value:Call|null)=>{current.current=value;setCall(value);};
  const finish=(reason='Chamada encerrada.')=>{
    generation.current++;peer.current?.close();peer.current=null;working.current=false;answerApplied.current=false;
    verifiedRemote.current=null;setSecurity(empty);setMore(false);setProof(null);setCode('');setStage('ended');setFailure(reason);
    const id=current.current?.id;setCurrent(null);
    if(id)void rpc('update_secure_audio_call',{p_id:id,p_action:'end'}).catch(()=>{/* local media already stopped */});
  };
  const observe=(value:PeerState)=>{
    if(!mounted.current)return;setSecurity(value);
    if(value.audioEnabled){if(!startedAt.current)startedAt.current=Date.now();setStage('active');}
    else if(value.connected)setStage('verification');
  };
  const prepareCode=async(c:Call)=>{
    if(!c.answer || !peer.current)return;
    const epoch=generation.current;
    const p=peer.current;
    const local=p.pc.localDescription,received=p.pc.remoteDescription;
    if(!local?.sdp || !received?.sdp)throw new Error('Descrições criptográficas indisponíveis.');
    const caller=local.type==='offer';
    if((caller && c.caller_id!==me.id) || (!caller && c.callee_id!==me.id))throw new Error('Identidade da chamada alterada.');
    const remoteMetadata=caller?c.answer:c.offer;
    const own:AudioSignal={type:local.type as 'offer'|'answer',sdp:local.sdp,device:p.device};
    const remote:AudioSignal={type:received.type as 'offer'|'answer',sdp:received.sdp,device:remoteMetadata.device};
    // Bind to the actual local certificate and applied remote description, never a server echo of our SDP.
    const value=await verificationCode(c.id,c.caller_id,c.callee_id,caller?own:remote,caller?remote:own);
    const peerId=c.caller_id===me.id?c.callee_id:c.caller_id;
    const old=await pinnedFingerprint(me.id,peerId,remote.device);
    if(epoch!==generation.current || !peer.current)return;
    verifiedRemote.current={user:peerId,device:remote.device,fingerprint:fingerprint(remote.sdp)};
    setChanged(!!old && old!==fingerprint(remote.sdp));peer.current.setCode(value);setCode(value);
  };
  const begin=async(conversation:Conversation)=>{
    if(working.current || current.current)return;
    working.current=true;const epoch=++generation.current;startedAt.current=0;setDuration(0);setFailure('');setCode('');setChanged(false);setSecurity(empty);setMore(false);setStage('preparing');
    setPeerProfile(conversation.members.find(m=>m.user_id!==me.id)?.profile??null);
    try {
      const p=await SecureAudioPeer.create(me.id,observe,finish);
      if(!mounted.current || epoch!==generation.current){p.close();return;}peer.current=p;
      const offer=await p.describe('offer');
      const c=await rpc<Call>('start_secure_audio_call',{p_conversation:conversation.id,p_offer:offer});
      if(!mounted.current || epoch!==generation.current){p.close();void rpc('update_secure_audio_call',{p_id:c.id,p_action:'end'}).catch(()=>{});return;}
      setCurrent(c);setStage('calling');
    }catch(e){if(epoch===generation.current)finish(message(e));}
    finally{working.current=false;}
  };
  const answer=async()=>{
    const c=current.current;if(!c || working.current)return;
    working.current=true;const epoch=++generation.current;setStage('preparing');
    try {
      const p=await SecureAudioPeer.create(me.id,observe,finish);
      if(!mounted.current || epoch!==generation.current){p.close();return;}peer.current=p;
      await p.receive(c.offer);const description=await p.describe('answer');
      const updated=await rpc<Call>('update_secure_audio_call',{p_id:c.id,p_action:'answer',p_answer:description});
      if(epoch!==generation.current)return;
      setCurrent(updated);answerApplied.current=true;await prepareCode(updated);setStage('connecting');
    }catch(e){if(epoch===generation.current)finish(message(e));}
    finally{working.current=false;}
  };
  const verify=async()=>{
    const c=current.current,p=peer.current,remote=verifiedRemote.current;if(!c?.answer || !p || !remote)return;
    const epoch=generation.current;
    try {
      await pinFingerprint(me.id,remote.user,remote.device,remote.fingerprint);
      if(epoch===generation.current && peer.current===p)p.verify(code);
    }catch(e){finish(message(e));}
  };
  const decline=async()=>{
    const id=current.current?.id;generation.current++;peer.current?.close();peer.current=null;setCurrent(null);setStage('');
    if(id)await rpc('update_secure_audio_call',{p_id:id,p_action:'decline'}).catch(()=>{});
  };
  const chooseOutput=async()=>{
    const devices=navigator.mediaDevices as MediaDevices & {selectAudioOutput?:()=>Promise<MediaDeviceInfo>};
    const element=audio.current as (HTMLAudioElement & {setSinkId?:(id:string)=>Promise<void>})|null;
    if(!devices.selectAudioOutput || !element?.setSinkId){setOutputNotice('Neste navegador, escolha alto-falante ou fone nas opções do dispositivo.');return;}
    try{const selected=await devices.selectAudioOutput();await element.setSinkId(selected.deviceId);setOutputNotice('Saída de áudio selecionada.');}catch{setOutputNotice('Não foi possível trocar a saída de áudio.');}
  };
  // Polling is deliberate: lost notifications cannot leave stale authorization or a missed invite.
  useEffect(()=>{
    mounted.current=true;let stopped=false,polling=false;
    const poll=async()=>{
      if(polling || working.current || (!current.current && document.hidden))return;polling=true;
      try {
        const id=current.current?.id??null;
        const c=await rpc<Call|null>('get_secure_audio_call',{p_id:id});
        if(stopped)return;
        if(id && (!c || c.state==='ended' || c.state==='declined')){finish(c?.state==='declined'?'Chamada recusada.':'Chamada encerrada ou expirada.');return;}
        if(c && !current.current){
          startedAt.current=0;setDuration(0);setSecurity(empty);setCode('');setFailure('');setChanged(false);setMore(false);
          setCurrent(c);setStage('incoming');setPeerProfile(convs.current.find(v=>v.id===c.conversation_id)?.members.find(m=>m.user_id===c.caller_id)?.profile??null);
        }else if(c){
          setCurrent(c);
          if(c.caller_id===me.id && c.answer && peer.current && !answerApplied.current){
            answerApplied.current=true;
            await peer.current.receive(c.answer);await prepareCode(c);
          }
        }
      }catch(e){if(current.current)finish(message(e));}finally{polling=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),2000);
    return()=>{stopped=true;mounted.current=false;generation.current++;clearInterval(timer);peer.current?.close();peer.current=null;
      const id=current.current?.id;if(id)void rpc('update_secure_audio_call',{p_id:id,p_action:'end'}).catch(()=>{});
    };
    // Functions use refs to maintain exactly one peer and never retain stale call authorization.
  },[me.id]);
  useEffect(()=>{if(request && request.id!==lastRequest.current){lastRequest.current=request.id;void begin(request.conversation);}
  },[request]);
  useEffect(()=>{
    if(!peer.current || !call)return;
    const deadline=setTimeout(()=>{if(!peer.current?.state.audioEnabled)finish('A verificação não foi concluída. Chamada encerrada com segurança.');},90_000);
    return()=>clearTimeout(deadline);
  },[call?.id]);
  useEffect(()=>{
    if(!security.audioEnabled)return;
    let stopped=false;
    if(audio.current && peer.current){audio.current.srcObject=peer.current.remoteStream;void audio.current.play().catch(()=>setSoundBlocked(true));}
    const timer=setInterval(()=>{setDuration(Math.floor((Date.now()-startedAt.current)/1000));void peer.current?.proof().then(value=>{if(!stopped)setProof(value);});},1000);
    return()=>{stopped=true;clearInterval(timer);if(audio.current)audio.current.srcObject=null;};
  },[security.audioEnabled]);
  useEffect(()=>{
    if(!security.audioEnabled || !peer.current?.remoteStream.getAudioTracks().length)return;
    const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=128;
    context.createMediaStreamSource(peer.current.remoteStream).connect(analyser);
    void context.resume().catch(()=>{});
    const values=new Uint8Array(analyser.frequencyBinCount);
    const timer=setInterval(()=>{analyser.getByteFrequencyData(values);setLevels(Array.from({length:24},(_,i)=>values[i]/255));},150);
    return()=>{clearInterval(timer);void context.close();};
  },[security.audioEnabled]);
  if(!stage)return null;
  const connected=security.audioEnabled;
  return <section className="secure-call-screen" role="dialog" aria-modal="true" aria-label="Ligação DIGITALX">
    <audio ref={audio} autoPlay playsInline />
    <header className="secure-call-top"><button aria-label="Encerrar e voltar à conversa" onClick={()=>finish()}><ArrowLeft size={24}/></button>
      <span>{connected?<><LockKeyhole size={14}/> Criptografia de ponta a ponta<br/>Dispositivos verificados</>:<><ShieldAlert size={14}/> {stage==='ended'?'Ligação finalizada':'Áudio bloqueado até verificar'}</>}</span>
      <button aria-label="Informações de segurança" onClick={()=>setMore(!more)}><Info size={21}/></button></header>
    <div className="secure-call-person"><div className={`secure-call-photo ${connected?'connected':''}`}>
      {photo?<img src={photo} alt={peerProfile?.name??'Contato'} referrerPolicy="no-referrer"/>:<span>{(peerProfile?.name??'Contato').slice(0,1)}</span>}
    </div><h2>{peerProfile?.name??'Contato'}</h2>
      <p role="status">{stage==='preparing'?'Preparando ligação segura…':stage==='calling'?'Chamando…':stage==='incoming'?'Ligação de áudio recebida':stage==='connecting'?'Conectando…':stage==='active'?`${Math.floor(duration/60).toString().padStart(2,'0')}:${(duration%60).toString().padStart(2,'0')}`:stage==='ended'?failure:'Verifique os dispositivos'}</p>
      {stage==='calling' && <div className="call-dots"><i/><i/><i/><i/></div>}
      {connected && <div className="secure-call-wave" aria-label="Atividade do áudio recebido">{levels.map((level,i)=><i key={i} style={{height:`${3+level*30}px`}}/>)}</div>}
      {connected && <div className="secure-call-self">{selfPhoto?<img src={selfPhoto} alt="Você" referrerPolicy="no-referrer"/>:<span>Você</span>}</div>}
    </div>
    {code && !connected && stage!=='ended' && <div className="call-verification">
      <strong>{changed?'A identidade deste dispositivo mudou.':'Confirme com a outra pessoa'}</strong>
      <p>Compare o código completo pessoalmente ou por outro canal confiável. O microfone só será transmitido após a confirmação dos dois.</p>
      <output aria-label="Código de segurança da ligação">{code}</output>
      <button disabled={!security.dtls || !security.channel || security.localVerified} onClick={()=>void verify()}>{security.localVerified?<><Check size={17}/> Aguardando a outra pessoa</>:'Comparei o código completo'}</button>
    </div>}
    {soundBlocked && connected && <button className="call-enable-sound" onClick={()=>void audio.current?.play().then(()=>setSoundBlocked(false)).catch(()=>{})}>Ativar reprodução do áudio</button>}
    {stage==='ended'?<button className="call-back" onClick={()=>{setStage('');setFailure('');}}>Voltar à conversa</button>:stage==='incoming'?<div className="call-incoming-controls"><button className="call-reject" aria-label="Recusar ligação" onClick={()=>void decline()}><PhoneOff/></button><button className="call-answer" aria-label="Atender ligação" onClick={()=>void answer()}><Phone/></button></div>:<>
      <div className="secure-call-controls">
        <button disabled={!connected} aria-label="Saída de áudio" onClick={()=>void chooseOutput()}><Volume2/><span>Áudio</span></button>
        <button disabled={!connected} aria-label={security.muted?'Ativar microfone':'Silenciar microfone'} onClick={()=>peer.current?.mute()}>{security.muted?<MicOff/>:<Mic/>}<span>Microfone</span></button>
        <button aria-label="Mais opções da ligação" onClick={()=>setMore(!more)}><MoreHorizontal/><span>Mais</span></button>
      </div><button className="secure-call-end" aria-label="Encerrar ligação" onClick={()=>finish()}><PhoneOff size={30}/></button>
    </>}
    {more && <div className="secure-call-options"><header><strong>Mais opções</strong><button aria-label="Fechar opções da ligação" onClick={()=>setMore(false)}><X/></button></header>
      <button disabled><UserPlus/> Adicionar participante <small>E2EE de grupo pendente</small></button>
      <button disabled><Video/> Iniciar vídeo <small>Em preparação</small></button>
      <div><LockKeyhole/><span>{connected?'DTLS conectado • SRTP entre dispositivos':'Verificação obrigatória antes do áudio'}</span></div>
      {proof && <dl><dt>DTLS</dt><dd>{proof.dtlsCipher}</dd><dt>SRTP</dt><dd>{proof.srtpCipher}</dd><dt>Áudio enviado / recebido</dt><dd>{proof.sent} / {proof.received} bytes</dd></dl>}
      <p>Mensagens e arquivos deste chat ainda não possuem E2EE. Servidor e rede conhecem os participantes e horários. Sem gravação automática.</p>
      <button className="call-options-end" onClick={()=>finish()}><PhoneOff/> Finalizar chamada</button>
    </div>}
    {outputNotice && <button className="call-output-notice" onClick={()=>setOutputNotice('')}>{outputNotice}</button>}
  </section>;
}
