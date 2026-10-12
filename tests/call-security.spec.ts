import {test,expect} from '@playwright/test';
import {fingerprint,verificationCode,mediaMayFlow,type AudioSignal} from '../src/lib/calls/security';
test('cryptographic call gate rejects missing, mixed or plaintext fingerprints, tampering and unverified audio',async()=>{
  const sdp=(hex:string)=>`v=0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 ${hex}\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${hex}\r\n`;
  const offer:AudioSignal={type:'offer',sdp:sdp('AA'.repeat(32)),device:'device-a'};
  const answer:AudioSignal={type:'answer',sdp:sdp('BB'.repeat(32)),device:'device-b'};
  expect(fingerprint(offer.sdp)).toBe('AA'.repeat(32));
  for(const invalid of ['',sdp('AA'),offer.sdp.replace('UDP/TLS/RTP/SAVPF','RTP/AVP'),offer.sdp.replace(/AA/g,'ZZ'),offer.sdp.replace('m=audio','m=video'),offer.sdp.replace(/a=fingerprint:sha-256 .*\r\n/g,''),offer.sdp+`a=fingerprint:sha-256 ${'CC'.repeat(32)}\r\n`])
    expect(()=>fingerprint(invalid)).toThrow();
  const code=await verificationCode('call-1','a','b',offer,answer);
  expect(code.replaceAll(' ','')).toMatch(/^[A-F0-9]{64}$/);
  expect(await verificationCode('call-1','a','b',offer,answer)).toBe(code);
  expect(await verificationCode('call-2','a','b',offer,answer)).not.toBe(code);
  expect(await verificationCode('call-1','a','b',offer,{...answer,sdp:sdp('CC'.repeat(32))})).not.toBe(code);
  expect(await verificationCode('call-1','a','impostor',offer,answer)).not.toBe(code);
  expect(await verificationCode('call-1','a','b',offer,{...answer,device:'new-device'})).not.toBe(code);
  for(let mask=0;mask<32;mask++) {
    const flags=Array.from({length:5},(_,i)=>Boolean(mask&(1<<i)));
    expect(mediaMayFlow(flags[0],flags[1],flags[2],flags[3],flags[4])).toBe(mask===31);
  }
});
