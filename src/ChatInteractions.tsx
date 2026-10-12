import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, CornerUpLeft, Forward, MoreHorizontal, Pencil, Smile, Trash2, X } from 'lucide-react';
import type { Conversation, Message, Profile } from './types';
import * as api from './lib/api';
import './chat-actions.css';

export const reactionEmojis = ['❤️','😂','👍','🔥','😮','😢'];
export const canEdit = (m: Message, me: string) => m.sender_id === me && !m.deleted_at && !m.attachments.length && Date.now()-Date.parse(m.created_at) <= 15*60_000;
export const canDeleteAll = (m: Message, me: string) => m.sender_id === me && !m.deleted_at && Date.now()-Date.parse(m.created_at) <= 48*3600_000;
const summary = (m: Message) => m.deleted_at ? 'Esta mensagem foi apagada' : m.body || m.attachments[0]?.name || 'Mensagem';

export function MessageSurface({message, children, onMenu, onReply, onSelect, selecting, selected}: {
  message: Message; children: ReactNode; onMenu: (m: Message) => void; onReply: (m: Message) => void;
  onSelect: (m: Message) => void; selecting: boolean; selected: boolean;
}) {
  const gesture = useRef<{x:number;y:number;timer:ReturnType<typeof setTimeout>;fired:boolean;cancelled:boolean} | null>(null);
  useEffect(()=>()=>{if(gesture.current)clearTimeout(gesture.current.timer);},[]);
  return <article className={`message-bubble interactive-message ${selected?'message-selected':''}`} tabIndex={0} aria-keyshortcuts="Shift+F10"
    onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();onMenu(message);}}}
    onContextMenu={e=>{e.preventDefault();onMenu(message);}}
    onPointerDown={e=>{
      if(e.pointerType==='mouse' || e.button!==0 || (e.target as Element).closest('button,a,input,textarea'))return;
      const g={x:e.clientX,y:e.clientY,fired:false,cancelled:false,timer:setTimeout(()=>{
        if(!g.cancelled){g.fired=true;onMenu(message);}
      },500)}; gesture.current=g;
    }}
    onPointerMove={e=>{const g=gesture.current;if(g && (Math.abs(e.clientX-g.x)>10 || Math.abs(e.clientY-g.y)>10)){g.cancelled=true;clearTimeout(g.timer);}}}
    onPointerCancel={()=>{if(gesture.current){clearTimeout(gesture.current.timer);gesture.current=null;}}}
    onPointerUp={e=>{const g=gesture.current;if(!g)return;clearTimeout(g.timer);const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(!g.fired && !message.deleted_at && dx>60 && Math.abs(dy)<30 && dx>Math.abs(dy)*2)onReply(message);
    }}
    onClickCapture={e=>{if(gesture.current?.fired){e.preventDefault();e.stopPropagation();gesture.current=null;return;}if(selecting && !(e.target as Element).closest('button,a')){e.preventDefault();e.stopPropagation();onSelect(message);}}}>
    <button className="message-options" aria-label="Ações da mensagem" onClick={()=>onMenu(message)}><MoreHorizontal size={16}/></button>
    {selecting && <button className="message-select-control" aria-label={selected?'Desmarcar mensagem':'Selecionar esta mensagem'} aria-pressed={selected} onClick={()=>onSelect(message)}>{selected?<Check size={14}/>:null}</button>}
    {children}
  </article>;
}

export function useChatInteractions({me,demo,conversation,conversations,onSync,onNotify,onError,onLocate}: {
  me: Profile; demo: boolean; conversation: string | null; conversations: Conversation[];
  onSync:()=>Promise<void>; onNotify:(s:string)=>void; onError:(e:unknown)=>void; onLocate:(id:string)=>Promise<void>;
}) {
  const [target,setTarget]=useState<Message|null>(null),[reply,setReply]=useState<Message|null>(null),[editing,setEditing]=useState<Message|null>(null);
  const [editText,setEditText]=useState(''),[selected,setSelected]=useState<Message[]>([]),[mode,setMode]=useState<'menu'|'react'|'delete'|'forward'|'copy'|null>(null);
  const [forward,setForward]=useState<Message[]>([]),[destination,setDestination]=useState(''),[forwardQuery,setForwardQuery]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[copyText,setCopyText]=useState('');
  const forwardNonce=useRef(''),dialogRef=useRef<HTMLDivElement>(null),previousFocus=useRef<HTMLElement|null>(null),inFlight=useRef(false);
  const overlay=Boolean(mode || editing),selectionActive=selected.length>0;
  function close(){setTarget(null);setMode(null);setEditing(null);setNotice('');}
  function cancelAll(){close();setSelected([]);}
  useEffect(()=>{cancelAll();setReply(null);},[conversation]); // Each quote/selection belongs to one conversation.
  useEffect(()=>{
    if(!overlay)return;
    previousFocus.current=document.activeElement as HTMLElement|null;
    dialogRef.current?.querySelector<HTMLElement>('textarea,button')?.focus({preventScroll:true});
    return()=>{if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});};
  },[overlay,editing?.id,mode]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancelAll();};const pop=()=>cancelAll();window.addEventListener('keydown',key);window.addEventListener('popstate',pop);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('popstate',pop);};},[]);
  async function run(action:()=>Promise<void>,finish=true){
    if(inFlight.current)return;
    if(demo){onNotify('Entre com Google para usar ações em mensagens reais.');return;}
    inFlight.current=true;setBusy(true);setNotice('');
    try{await action();if(finish)close();await onSync();}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível concluir. Tente novamente.');}finally{inFlight.current=false;setBusy(false);}
  }
  function open(m:Message){setTarget(m);setMode('menu');setNotice('');}
  function respond(m:Message){if(m.deleted_at)return;setReply(m);close();}
  function toggle(m:Message){setSelected(old=>old.some(x=>x.id===m.id)?old.filter(x=>x.id!==m.id):old.length<100?[...old,m]:old);close();}
  async function copy(ms:Message[]){
    const value=ms.filter(m=>!m.deleted_at).map(m=>m.body).filter(Boolean).join('\n\n');
    if(!value)return;
    try{await navigator.clipboard.writeText(value);onNotify('Texto copiado.');close();}catch{setCopyText(value);setMode('copy');setNotice('O navegador bloqueou a cópia. Selecione e copie o texto abaixo.');}
  }
  function prepareForward(ms:Message[]){setForward(ms.filter(m=>!m.deleted_at));setDestination('');setForwardQuery('');forwardNonce.current=crypto.randomUUID();setMode('forward');setNotice('');}
  const batch=target?[target]:selected;
  function react(m:Message,value:string){const own=m.reactions?.find(r=>r.user_id===me.id)?.emoji;void run(()=>api.reactMessage(m.id,own===value?null:value));}
  const selectionBar=selectionActive?<div className="selection-toolbar" role="toolbar" aria-label="Mensagens selecionadas">
    <button aria-label="Cancelar seleção" onClick={()=>setSelected([])}><X size={19}/></button><strong>{selected.length}</strong>
    <button aria-label="Copiar selecionadas" disabled={!selected.some(m=>m.body&&!m.deleted_at)} onClick={()=>void copy(selected)}><Copy size={19}/></button>
    <button aria-label="Encaminhar selecionadas" disabled={!selected.some(m=>!m.deleted_at)} onClick={()=>prepareForward(selected)}><Forward size={20}/></button>
    <button aria-label="Apagar selecionadas para mim" onClick={()=>{setTarget(null);setMode('delete');}}><Trash2 size={19}/></button>
  </div>:null;
  const replyPreview=reply?<div className="composer-quote"><CornerUpLeft size={18}/><span><strong>Respondendo a {reply.sender?.name??'Membro'}</strong><small>{summary(reply)}</small></span><button type="button" aria-label="Cancelar resposta" onClick={()=>setReply(null)}><X size={18}/></button></div>:null;
  const ui=overlay?<div className="modal-overlay chat-actions-overlay" onClick={()=>{if(!busy)close();}}>
    <div className="modal chat-actions-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-label={editing?'Editar mensagem':mode==='forward'?'Encaminhar mensagens':mode==='delete'?'Apagar mensagens':mode==='react'?'Reagir à mensagem':'Ações da mensagem'} onClick={e=>e.stopPropagation()}
      onKeyDown={e=>{if(e.key!=='Tab')return;const controls=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}>
      <button className="modal-close icon-button" aria-label="Fechar ações" disabled={busy} onClick={close}><X size={21}/></button>
      <h2>{editing?'Editar mensagem':mode==='forward'?'Encaminhar':mode==='delete'?'Apagar mensagem':mode==='react'?'Reagir':'Mensagem'}</h2>
      {target && (mode==='menu'||mode==='react') && <p className="action-target"><strong>{target.sender?.name??'Membro'}</strong><span>{summary(target)}</span></p>}
      {notice&&<p className="action-notice" role="alert">{notice}</p>}
      {editing?<form onSubmit={e=>{e.preventDefault();void run(async()=>{await api.editMessage(editing.id,editText);onNotify('Mensagem editada.');});}}><p className="muted">Texto pode ser editado nos primeiros 15 minutos.</p><textarea aria-label="Editar texto" value={editText} onChange={e=>setEditText(e.target.value)} maxLength={8000} rows={4}/><div className="action-form-buttons"><button type="button" className="button-light" disabled={busy} onClick={close}>Cancelar</button><button className="button-dark" disabled={busy||!editText.trim()}>Salvar edição</button></div></form>:
      mode==='copy'?<textarea readOnly aria-label="Texto para copiar" value={copyText} rows={5}/>:
      mode==='forward'?<>
        <p className="muted">{forward.length} {forward.length===1?'mensagem':'mensagens'} · o destino receberá uma cópia.</p>
        <input aria-label="Buscar destino" placeholder="Buscar conversa ou grupo…" value={forwardQuery} onChange={e=>setForwardQuery(e.target.value)}/>
        <div className="forward-destinations">{conversations.filter(c=>(c.title??c.members.find(m=>m.user_id!==me.id)?.profile.name??'Conversa').toLowerCase().includes(forwardQuery.toLowerCase())).map(c=>{const name=c.is_group?c.title:c.members.find(m=>m.user_id!==me.id)?.profile.name;return <button key={c.id} aria-pressed={destination===c.id} disabled={busy} onClick={()=>setDestination(c.id)}><span><strong>{name??'Conversa'}</strong><small>{c.is_group?'Grupo':'Conversa individual'}</small></span>{destination===c.id&&<Check size={19}/>}</button>;})}</div>
        {!conversations.length&&<p>Nenhuma conversa disponível.</p>}
        <button className="button-dark forward-confirm" disabled={busy||!destination||!forward.length} onClick={()=>void run(async()=>{await api.forwardMessages(forward.map(m=>m.id),destination,forwardNonce.current);setSelected([]);onNotify('Mensagens encaminhadas.');})}>Confirmar encaminhamento</button>
      </>:mode==='delete'?<>
        <p className="muted">Apagar para mim oculta somente nesta conta. Para todos fica disponível ao autor por 48 horas; cópias já salvas não são removidas.</p>
        <button className="action-row" disabled={busy} onClick={()=>void run(async()=>{await api.hideMessages(batch.map(m=>m.id));setSelected([]);onNotify('Mensagens apagadas para você.');})}><Trash2 size={19}/>Apagar para mim</button>
        {target&&canDeleteAll(target,me.id)&&<button className="action-row action-danger" disabled={busy} onClick={()=>void run(async()=>{await api.deleteForAll(target.id);onNotify('Mensagem apagada para todos.');})}><Trash2 size={19}/>Apagar para todos</button>}
      </>:target?<>
        {!target.deleted_at&&<div className="reaction-picker" role="group" aria-label="Reações">{reactionEmojis.map(e=><button key={e} aria-label={`Reagir ${e}`} aria-pressed={target.reactions?.some(r=>r.user_id===me.id&&r.emoji===e)} disabled={busy} onClick={()=>react(target,e)}>{e}</button>)}</div>}
        {mode!=='react'&&<div className="message-action-list">
          {!target.deleted_at&&<button className="action-row" onClick={()=>respond(target)}><CornerUpLeft size={20}/>Responder</button>}
          {!target.deleted_at&&<button className="action-row" onClick={()=>setMode('react')}><Smile size={20}/>Reagir</button>}
          {!target.deleted_at&&!!target.body&&<button className="action-row" onClick={()=>void copy([target])}><Copy size={19}/>Copiar</button>}
          {!target.deleted_at&&<button className="action-row" onClick={()=>prepareForward([target])}><Forward size={20}/>Encaminhar</button>}
          {canEdit(target,me.id)&&<button className="action-row" onClick={()=>{setEditing(target);setEditText(target.body);setMode(null);}}><Pencil size={19}/>Editar</button>}
          <button className="action-row" onClick={()=>setMode('delete')}><Trash2 size={19}/>Apagar</button>
          <button className="action-row" onClick={()=>toggle(target)}><Check size={20}/>Selecionar mensagem</button>
        </div>}
      </>:null}
      {busy&&<p role="status" className="action-notice">Salvando…</p>}
    </div>
  </div>:null;
  const quote=(m:Message)=>m.reply_to_id?<button className="quoted-message" aria-label="Localizar mensagem original" disabled={!m.reply||Boolean(m.reply.deleted_at)} onClick={()=>void onLocate(m.reply_to_id!).catch(onError)}><strong>{m.reply?.sender?.name??'Mensagem indisponível'}</strong><span>{m.reply?.deleted_at?'Esta mensagem foi apagada':m.reply?.body||'Anexo ou mensagem indisponível'}</span></button>:null;
  const reactions=(m:Message)=>{
    const values=(m.reactions??[]).filter(r=>r.emoji),unique=[...new Set(values.map(r=>r.emoji!))];
    return !m.deleted_at&&unique.length?<div className="message-reactions" role="group" aria-label="Reações recebidas">{unique.map(e=><button key={e} aria-label={`${e} ${values.filter(r=>r.emoji===e).length} reação` } aria-pressed={values.some(r=>r.emoji===e&&r.user_id===me.id)} onClick={()=>{setTarget(m);setMode('react');}}>{e}<small>{values.filter(r=>r.emoji===e).length}</small></button>)}</div>:null;
  };
  return {open,respond,toggle,reply,setReply,selected,selectionActive,overlay,close:cancelAll,replyPreview,selectionBar,ui,quote,reactions};
}
