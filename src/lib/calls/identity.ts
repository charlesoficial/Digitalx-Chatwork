// RTCCertificate private key handles remain inside the browser. Never serialize to JSON/logs.
type Device = { id: string; certificate: RTCCertificate };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('digitalx-call-devices',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('identity');
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(new Error('Armazenamento seguro do dispositivo indisponível.'));
  });
}
async function stored<T>(key:string,value?:T):Promise<T|undefined> {
  const db=await database();
  try { return await new Promise((resolve,reject)=>{
    const tx=db.transaction('identity',value===undefined?'readonly':'readwrite');
    const r=value===undefined?tx.objectStore('identity').get(key):tx.objectStore('identity').put(value,key);
    tx.oncomplete=()=>resolve(value===undefined?r.result:value); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  }); } finally { db.close(); }
}
const pending=new Map<string,Promise<Device>>();
export function deviceIdentity(user:string):Promise<Device> {
  if (!pending.has(user)) pending.set(user,(async()=>{
    const previous=await stored<Device>(`own:${user}`);
    if(previous?.certificate && previous.certificate.expires>Date.now()+86_400_000) return previous;
    const algorithm:EcKeyGenParams={name:'ECDSA',namedCurve:'P-256'};
    const certificate=await RTCPeerConnection.generateCertificate(algorithm);
    return (await stored(`own:${user}`,{id:crypto.randomUUID(),certificate}))!;
  })().catch(e=>{pending.delete(user);throw e;}));
  return pending.get(user)!;
}
export async function pinnedFingerprint(user:string,peer:string,device:string) {
  const known=await stored<{device:string;fingerprint:string}>(`latest:${user}:${peer}`);
  return (await stored<string>(`peer:${user}:${peer}:${device}`))??known?.fingerprint;
}
export async function pinFingerprint(user:string,peer:string,device:string,fingerprint:string) {
  await stored(`peer:${user}:${peer}:${device}`,fingerprint);
  await stored(`latest:${user}:${peer}`,{device,fingerprint});
}
