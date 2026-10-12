export type AudioSignal = {type:'offer'|'answer';sdp:string;device:string};
export function fingerprint(sdp:string):string {
  // One certificate for the BUNDLE transport; mixed fingerprints or plaintext profiles fail closed.
  const values=[...sdp.matchAll(/^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)\r?$/gm)].map(m=>m[1].replaceAll(':','').toUpperCase());
  if(!values.length || values.some(v=>v!==values[0] || !/^[A-F0-9]{64}$/.test(v))
    || !sdp.includes('UDP/TLS/RTP/SAVPF') || !sdp.includes('m=audio ') || sdp.includes('m=video ')
    || !sdp.includes('m=application ') || !sdp.includes('a=group:BUNDLE '))
    throw new Error('A negociação não oferece a proteção exigida. Chamada bloqueada.');
  return values[0];
}
export async function verificationCode(call:string,caller:string,callee:string,offer:AudioSignal,answer:AudioSignal) {
  // Full SHA-256 fingerprint comparison; no truncated homemade SAS or server-supplied code.
  const context=JSON.stringify(['DIGITALX-P2P-DTLS-v1',call,caller,callee,offer.device,fingerprint(offer.sdp),answer.device,fingerprint(answer.sdp)]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(context));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{8}/g)!.join(' ');
}
export function mediaMayFlow(connected:boolean,dtls:boolean,channel:boolean,local:boolean,remote:boolean) {
  return connected && dtls && channel && local && remote;
}
