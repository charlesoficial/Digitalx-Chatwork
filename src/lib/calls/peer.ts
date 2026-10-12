import { deviceIdentity } from './identity';
import { fingerprint,mediaMayFlow,type AudioSignal } from './security';
export type PeerState={connected:boolean;dtls:boolean;channel:boolean;localVerified:boolean;remoteVerified:boolean;audioEnabled:boolean;muted:boolean};
export class SecureAudioPeer {
  pc:RTCPeerConnection;
  stream:MediaStream;
  device:string;
  channel:RTCDataChannel|null=null;
  remoteStream=new MediaStream();
  state:PeerState={connected:false,dtls:false,channel:false,localVerified:false,remoteVerified:false,audioEnabled:false,muted:false};
  code=''; closed=false;
  private onState:(state:PeerState)=>void;
  private onFailure:(message:string)=>void;
  private dtls:RTCDtlsTransport|null=null;
  private pendingMessage:string|null=null;
  private updatingSender=false;
  private disconnectedTimer:ReturnType<typeof setTimeout>|undefined;
  private constructor(pc:RTCPeerConnection,stream:MediaStream,device:string,onState:(s:PeerState)=>void,onFailure:(m:string)=>void) {
    this.pc=pc;this.stream=stream;this.device=device;this.onState=onState;this.onFailure=onFailure;
    // Capture is granted by the user, but no audio track is attached to a sender until verification.
    pc.ontrack=e=>{this.remoteStream.addTrack(e.track);};
    pc.onconnectionstatechange=()=>{
      this.state.connected=pc.connectionState==='connected';
      this.observeDtls();this.publish();
      if(pc.connectionState==='failed') this.fail('Não foi possível conectar com segurança. Verifique a rede/TURN.');
      if(pc.connectionState==='disconnected') this.disconnectedTimer=setTimeout(()=>this.fail('Conexão interrompida. Inicie uma nova chamada segura.'),10_000);
      else clearTimeout(this.disconnectedTimer);
    };
    pc.ondatachannel=e=>this.bindChannel(e.channel);
  }
  static async create(user:string,onState:(s:PeerState)=>void,onFailure:(m:string)=>void) {
    if(!isSecureContext || !navigator.mediaDevices?.getUserMedia || !('RTCPeerConnection' in window)) throw new Error('Este navegador não oferece chamada segura. Use HTTPS e um navegador compatível.');
    const device=await deviceIdentity(user);
    let stream:MediaStream;
    try {stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});}
    catch(e) {
      if(e instanceof DOMException && e.name==='NotFoundError')throw new Error('Nenhum microfone encontrado. Conecte um microfone ou fone para ligar.',{cause:e});
      if(e instanceof DOMException && e.name==='NotAllowedError')throw new Error('Permita o microfone no navegador para iniciar a ligação.',{cause:e});
      if(e instanceof DOMException && e.name==='NotReadableError')throw new Error('O microfone está indisponível ou sendo usado por outro aplicativo.',{cause:e});
      throw new Error('Não foi possível acessar o microfone. Verifique o dispositivo.',{cause:e});
    }
    stream.getTracks().forEach(t=>t.enabled=false);
    try {
      // No implicit STUN service, media server or paid resource. TURN credentials must be ephemeral.
      const pc=new RTCPeerConnection({certificates:[device.certificate],bundlePolicy:'max-bundle',iceServers:[]});
      return new SecureAudioPeer(pc,stream,device.id,onState,onFailure);
    } catch(e) {stream.getTracks().forEach(t=>t.stop());throw e;}
  }
  private bindChannel(channel:RTCDataChannel) {
    if(channel.label!=='digitalx-verification' || this.channel) {channel.close();this.fail('Canal de segurança inesperado.');return;}
    this.channel=channel;
    channel.onopen=()=>{this.state.channel=true;this.observeDtls();this.publish();this.sendVerification();};
    channel.onclose=()=>{this.state.channel=false;this.publish();if(!this.closed)this.fail('Canal de segurança encerrado.');};
    channel.onmessage=e=>{
      if(!this.code && typeof e.data==='string' && e.data.length<=512 && !this.pendingMessage){this.pendingMessage=e.data;return;}
      this.receiveVerification(e.data);
    };
  }
  private receiveVerification(data:unknown) {
      try {
        if(typeof data!=='string' || data.length>512) throw new Error();
        const message=JSON.parse(data);
        if(message.type!=='verified' || !this.code || message.code!==this.code) throw new Error();
        this.state.remoteVerified=true;this.publish();
      }catch{this.fail('A verificação dos dispositivos falhou.');}
  }
  setCode(value:string) {
    this.code=value;
    if(this.pendingMessage){const pending=this.pendingMessage;this.pendingMessage=null;this.receiveVerification(pending);}
  }
  private observeDtls() {
    const transceiver=this.pc.getTransceivers()[0];
    const transport=this.pc.sctp?.transport ?? transceiver?.sender.transport ?? transceiver?.receiver.transport;
    if(transport && transport!==this.dtls) {
      this.dtls=transport;
      transport.onstatechange=()=>{this.state.dtls=transport.state==='connected';this.publish();if(transport.state==='failed')this.fail('Falha na criptografia DTLS.');};
    }
    this.state.dtls=this.dtls?.state==='connected';
  }
  private publish() {
    if(this.closed)return;
    const enabled=mediaMayFlow(this.state.connected,this.state.dtls,this.state.channel,this.state.localVerified,this.state.remoteVerified);
    const sender=this.pc.getTransceivers()[0]?.sender;
    this.stream.getAudioTracks().forEach(t=>t.enabled=enabled && !this.state.muted);
    if(!enabled)this.state.audioEnabled=false;
    if(sender && !this.updatingSender && sender.track!==(enabled?this.stream.getAudioTracks()[0]:null)) {
      this.updatingSender=true;
      void sender.replaceTrack(enabled?this.stream.getAudioTracks()[0]:null).then(()=>{
        this.updatingSender=false;if(this.closed)return;
        this.state.audioEnabled=mediaMayFlow(this.state.connected,this.state.dtls,this.state.channel,this.state.localVerified,this.state.remoteVerified) && !!sender.track;
        this.publish();
      }).catch(()=>this.fail('Não foi possível alterar o áudio com segurança.'));
    }
    this.onState({...this.state});
  }
  private sendVerification() {
    if(this.state.localVerified && this.code && this.channel?.readyState==='open') this.channel.send(JSON.stringify({type:'verified',code:this.code}));
  }
  verify(code:string) {if(code!==this.code || !this.state.dtls || !this.state.channel) throw new Error('Verificação indisponível.');this.state.localVerified=true;this.sendVerification();this.publish();}
  mute() {this.state.muted=!this.state.muted;this.publish();}
  async describe(type:'offer'|'answer'):Promise<AudioSignal> {
    if(type==='offer'){
      this.pc.addTransceiver('audio',{direction:'sendrecv'});
      this.bindChannel(this.pc.createDataChannel('digitalx-verification',{ordered:true}));
    }
    await this.pc.setLocalDescription(type==='offer'?await this.pc.createOffer():await this.pc.createAnswer());
    await new Promise<void>((resolve,reject)=>{
      if(this.pc.iceGatheringState==='complete')return resolve();
      const timeout=setTimeout(()=>{this.pc.removeEventListener('icegatheringstatechange',done);reject(new Error('A negociação de rede expirou.'));},10_000);
      const done=()=>{if(this.pc.iceGatheringState==='complete'){clearTimeout(timeout);this.pc.removeEventListener('icegatheringstatechange',done);resolve();}};
      this.pc.addEventListener('icegatheringstatechange',done);
    });
    const sdp=this.pc.localDescription?.sdp??'';fingerprint(sdp);
    return {type,sdp,device:this.device};
  }
  async receive(signal:AudioSignal) {
    fingerprint(signal.sdp);
    await this.pc.setRemoteDescription({type:signal.type,sdp:signal.sdp});
    if(signal.type==='offer')this.pc.getTransceivers().forEach(t=>{if(t.receiver.track.kind==='audio')t.direction='sendrecv';});
  }
  async proof() {
    const stats=await this.pc.getStats();
    const transport=[...stats.values()].find(s=>s.type==='transport' && s.dtlsState==='connected');
    const outbound=[...stats.values()].find(s=>s.type==='outbound-rtp' && (s.kind==='audio' || s.mediaType==='audio'));
    const inbound=[...stats.values()].find(s=>s.type==='inbound-rtp' && (s.kind==='audio' || s.mediaType==='audio'));
    return {dtls:transport?.dtlsState??'pending',dtlsCipher:transport?.dtlsCipher??'não informado pelo navegador',srtpCipher:transport?.srtpCipher??'não informado pelo navegador',sent:outbound?.bytesSent??0,received:inbound?.bytesReceived??0};
  }
  fail(message:string) {if(this.closed)return;this.close();this.onFailure(message);}
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.disconnectedTimer);this.stream.getTracks().forEach(t=>t.stop());this.channel?.close();this.pc.close();}
}
