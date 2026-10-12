import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUpRight,
  Bell,
  BadgeCheck,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  UserPlus,
  Download,
  FileText,
  FolderOpen,
  Info,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Phone,
  Mic,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  SquarePen,
  Users,
  Video,
  X,
  Radio,
  LoaderCircle,
  User,
  MonitorSmartphone,
  Trash2,
  CheckCircle2,
  Camera,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  Conversation,
  Message,
  Profile,
  Status,
  Attachment,
} from "./types";
import { client, check, supabase } from "./lib/supabase";
import * as api from "./lib/api";
import { useAvatarUrl } from "./lib/avatar";
import './calls.css';
import { MessageSurface, useChatInteractions } from "./ChatInteractions";
import type { CallRequest } from "./CallManager";
const CallManager = lazy(() => import("./CallManager"));
import { route, move } from "./lib/routes";
import {
  demoConversations,
  demoMessages,
  demoProfile,
  people,
} from "./lib/demo";
type Screen =
  | "Conversas"
  | "Grupos"
  | "Contatos"
  | "Arquivos"
  | "Chamadas"
  | "Status"
  | "Configurações"
  | "Perfil";
const navigation: { name: Screen; icon: LucideIcon }[] = [
  { name: "Conversas", icon: MessageCircle },
  { name: "Grupos", icon: Users },
  { name: "Contatos", icon: User },
  { name: "Arquivos", icon: FolderOpen },
  { name: "Chamadas", icon: Phone },
  { name: "Status", icon: Radio },
  { name: "Configurações", icon: Settings },
];
function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Avatar({
  profile,
  name,
  group = false,
  index = 0,
  size = "normal",
  online = false,
}: {
  profile?: Profile;
  name?: string;
  group?: boolean;
  index?: number;
  size?: string;
  online?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = useAvatarUrl(profile?.avatar_url);
  useEffect(() => setFailed(false), [profile?.avatar_url]);
  return (
    <span className={`avatar avatar-${size} tone-${index % 5}`}>
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : group && index === 0 ? (
        <img src="/brand.svg" className="symbol" alt="" />
      ) : group ? (
        index % 3 === 0 ? (
          <Code2 />
        ) : index % 3 === 1 ? (
          <Users />
        ) : (
          <MessageCircle />
        )
      ) : (
        <span>
          {(profile?.name ?? name ?? "D")
            .split(" ")
            .slice(0, 2)
            .map((n) => n[0])
            .join("")}
        </span>
      )}
      {online && <i className="avatar-presence" aria-label="Online" />}
    </span>
  );
}
function VerifiedBadge() {
  return (
    <BadgeCheck
      className="verified-badge"
      size={17}
      role="img"
      aria-label="Grupo oficial verificado"
    />
  );
}
function MessageText({ body }: { body: string }) {
  return <>{body.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) => {
    if (!/^https?:\/\//i.test(part)) return part;
    // Render only HTTP(S); never interpret message content as HTML.
    const end = part.match(/[.,!?;:]+$/)?.[0] ?? '';
    const href = end ? part.slice(0, -end.length) : part;
    return <span key={i}><a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{href}</a>{end}</span>;
  })}</>;
}
const publicHandle = (p: Profile) => /^[a-f0-9]{32}$/i.test(p.username)
  ? (p.digitalx_id ? `ID ${p.digitalx_id}` : 'Na sua rede DIGITALX') : `@${p.username}`;
const dayKey = (at: string) => new Date(at).toLocaleDateString('pt-BR');
const readByOthers = (conversation: Conversation, message: Message, ownId: string) => {
  const others = conversation.members.filter(member => member.user_id !== ownId);
  return others.length > 0 && others.every(member => new Date(member.last_read_at) >= new Date(message.created_at));
};
const time = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const title = (c: Conversation, p: Profile) =>
  c.is_group
    ? (c.title ?? "Grupo")
    : (c.members.find((m) => m.user_id !== p.id)?.profile.name ??
      c.title ??
      "Conversa");
function FileCard({
  file,
  onError,
  demo = false,
}: {
  file: Attachment;
  onError: (e: unknown) => void;
  demo?: boolean;
}) {
  const [url, setUrl] = useState(""), [downloading, setDownloading] = useState(false);
  const [viewer, setViewer] = useState(''), [mediaFailed, setMediaFailed] = useState(false), [imageLoaded, setImageLoaded] = useState(false), [downloadNotice, setDownloadNotice] = useState('');
  const mediaHistory = useRef(`media-${crypto.randomUUID()}`), viewerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewer) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!history.state?.digitalxMedia) history.pushState({...history.state,digitalxMedia:mediaHistory.current},'',location.href);
    const pop = () => setViewer('');
    const key = (event:KeyboardEvent) => {
      if(event.key==='Escape') closeViewer();
      if(event.key==='Tab') {
        const controls=viewerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),video,audio');
        if(!controls?.length)return;
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    window.addEventListener('popstate',pop); window.addEventListener('keydown',key);
    return () => { window.removeEventListener('popstate',pop); window.removeEventListener('keydown',key); if(previous?.isConnected)previous.focus({preventScroll:true}); };
  },[viewer]);
  function closeViewer(){setViewer('');if(history.state?.digitalxMedia===mediaHistory.current)history.back();}

  useEffect(() => {
    let alive = true;
    if (!demo && file.mime_type.startsWith("image/"))
      api
        .signedFile(file.path)
        .then((u) => {
          if (alive) setUrl(u);
        })
        .catch(() => setMediaFailed(true));
    return () => {
      alive = false;
    };
  }, [file.path, file.mime_type, onError, demo]);
  async function open() {
    if (demo) {
      onError(
        "Anexo demonstrativo. Entre com Google para acessar arquivos reais.",
      );
      return;
    }
    if (/^(image|video|audio)\//.test(file.mime_type)) {
      try { setViewer(await api.signedFile(file.path)); } catch(e) { onError(e); }
      return;
    }
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const u = await api.signedFile(file.path);
      if (popup) popup.location.href = u;
      else window.location.assign(u);
    } catch (e) {
      popup?.close();
      onError(e);
    }
  }
  async function download() {
    if (demo) {
      onError("Anexo demonstrativo. Entre com Google para acessar arquivos reais.");
      return;
    }
    setDownloading(true); setDownloadNotice("");
    try {
      const blob = await api.downloadFile(file.path);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadNotice("Download solicitado ao navegador.");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (e) {
      onError(e);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="file-card">
      {url && !mediaFailed && <button className={`attachment-thumbnail ${imageLoaded?'loaded':''}`} aria-label={`Ampliar ${file.name}`} onClick={()=>void open()}>
        <img className="attachment-image" src={url} alt={file.name} loading="lazy" referrerPolicy="no-referrer" onLoad={()=>setImageLoaded(true)} onError={()=>setMediaFailed(true)}/>
      </button>}
      {mediaFailed && <div className="media-error">Não foi possível carregar a imagem. <button onClick={()=>{setMediaFailed(false);setImageLoaded(false);void api.signedFile(file.path).then(setUrl).catch(()=>setMediaFailed(true));}}>Carregar novamente</button></div>}
      {viewer && <div className="media-viewer" ref={viewerRef} role="dialog" aria-modal="true" aria-label={`Visualizar ${file.name}`} onClick={closeViewer}>
        <header><strong>{file.name}</strong><button aria-label="Fechar mídia" autoFocus onClick={e=>{e.stopPropagation();closeViewer();}}><X size={23}/></button></header>
        <div onClick={e=>e.stopPropagation()}>{file.mime_type.startsWith('image/')?<img src={viewer} alt={file.name} referrerPolicy="no-referrer"/>:file.mime_type.startsWith('video/')?<video src={viewer} controls playsInline/>:<audio src={viewer} controls/>}</div>
        <button className="media-download" disabled={downloading} onClick={e=>{e.stopPropagation();void download();}}><Download size={19}/>Baixar arquivo</button>
      </div>}
      <button onClick={download} disabled={downloading} aria-label={`Baixar ${file.name}`}>
        <span className="file-icon">
          <FileText size={23} />
        </span>
        <span>
          <strong>{file.name}</strong>
          <small>
            {file.size < 1024 ? `${file.size} B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} ·{" "}
            {file.mime_type.split("/")[1]}
          </small>
        </span>
        {downloading ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
      </button>
      {downloading && <small className="download-progress" role="status">Preparando arquivo…</small>}
      {downloadNotice && <small className="download-progress" role="status">{downloadNotice}</small>}
      <button className="file-preview" onClick={open} aria-label={`Visualizar ${file.name}`}>
        <ArrowUpRight size={14} /> Visualizar
      </button>
    </div>
  );
}
export default function Workspace({
  session,
  demo,
  onExit,
  initialProfile,
}: {
  session: Session | null;
  demo: boolean;
  onExit: () => void;
  initialProfile?: Profile;
}) {
  const savedList = history.state?.digitalxList;
  const restoredList = savedList?.user === (session?.user.id ?? demoProfile.id) ? savedList : null;
  const [profile, setProfile] = useState<Profile>(
      initialProfile ?? (demo
        ? demoProfile
        : {
            id: session!.user.id,
            name: session!.user.user_metadata.full_name ?? "Você",
            username: "",
            bio: "",
            avatar_url: session!.user.user_metadata.avatar_url ?? null,
          }),
    ),
    [convs, setConvs] = useState<Conversation[]>(demo ? demoConversations : []),
    [activeId, setActiveId] = useState<string | null>(
      route().chat ?? (demo ? demoConversations[0].id : null),
    ),
    [messages, setMessages] = useState<Message[]>(demo ? demoMessages : []),
    [screen, setScreen] = useState<Screen>(route().screen as Screen),
    [mobileChat, setMobileChat] = useState(Boolean(route().chat)),
    [isMobile, setIsMobile] = useState(() => matchMedia('(max-width: 760px)').matches),
    [drawer, setDrawer] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
      try {
        return localStorage.getItem("digitalx-sidebar-collapsed") === "true";
      } catch {
        return false;
      }
    }),
    [query, setQuery] = useState<string>(typeof restoredList?.query === 'string' ? restoredList.query : ''),
    [idSearch, setIdSearch] = useState(""),
    [idResult, setIdResult] = useState<Profile | null>(null),
    [idNotice, setIdNotice] = useState(""),
    [idSearching, setIdSearching] = useState(false),
    [filter, setFilter] = useState<string>(['Todos','Grupos','Diretos','Não lidas'].includes(restoredList?.filter) ? restoredList.filter : 'Todos'),
    [draft, setDraft] = useState(""),
    [file, setFile] = useState<File | undefined>(),
    [busy, setBusy] = useState(false),
    [callRequest, setCallRequest] = useState<CallRequest | null>(null),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [connection, setConnection] = useState(
      demo ? "Prévia visual" : "Conectando",
    ),
    [modal, setModal] = useState<
      "new" | "group" | "info" | "call" | "status" | "id" | null
    >(null),
    [contactList, setContactList] = useState<Profile[]>(demo ? people : []),
    [selected, setSelected] = useState<string[]>([]),
    [groupName, setGroupName] = useState(""),
    [groupDescription, setGroupDescription] = useState(""),
    [statuses, setStatuses] = useState<Status[]>([]),
    [statusIndex, setStatusIndex] = useState(0),
    [statusUrl, setStatusUrl] = useState(""),
    [statusCaption, setStatusCaption] = useState(""),
    [presence, setPresence] = useState<string[]>([]),
    [older, setOlder] = useState(true),
    [chatSearch, setChatSearch] = useState(false),
    [messageQuery, setMessageQuery] = useState(""),
    [emoji, setEmoji] = useState(false),
    [showJump, setShowJump] = useState(false),
    [installEvent, setInstallEvent] = useState<any>(null),
    [notificationPermission, setNotificationPermission] = useState(
      "Notification" in window ? Notification.permission : "unsupported",
    ),
    [compact, setCompact] = useState(
      localStorage.getItem("digitalx-compact") === "true",
    );
  type PendingSend = { nonce: string; conversation: string; body: string; file?: File; reply?: string | null; state: "sending" | "failed"; problem?: string };
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const [filePreview, setFilePreview] = useState('');
  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setFilePreview(''); return; }
    const url=URL.createObjectURL(file); setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  },[file]);
  const sendLocks = useRef(new Set<string>());
  const messagesRef = useRef(messages);
  const bottom = useRef<HTMLDivElement>(null),
    inputFile = useRef<HTMLInputElement>(null),
    statusInput = useRef<HTMLInputElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    listScroll = useRef<HTMLDivElement>(null),
    listPosition = useRef<number>(Number.isFinite(restoredList?.position) ? restoredList.position : 0),
    layerHistory = useRef(`layer-${crypto.randomUUID()}`),
    composerText = useRef<HTMLTextAreaElement>(null),
    request = useRef(0),
    idLookupRequest = useRef(0),
    nearBottom = useRef(true),
    scrollOnLoad = useRef<string | null>(null),
    activeRef = useRef(activeId),
    screenRef = useRef(screen),
    mobileChatRef = useRef(mobileChat),
    convsRef = useRef(convs),
    selection = convs.find((c) => c.id === activeId),
    me = profile.id;
  useEffect(() => {
    messagesRef.current = messages;
    activeRef.current = activeId;
    screenRef.current = screen;
    mobileChatRef.current = mobileChat;
    convsRef.current = convs;
  }, [activeId, convs, screen, mobileChat, messages]);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const change = () => setIsMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    if (!mobileChat && listScroll.current) listScroll.current.scrollTop = listPosition.current;
  }, [mobileChat, screen]);
  useLayoutEffect(() => {
    const input = composerText.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [draft, mobileChat, screen]);
  const scrollLatest = useCallback((smooth = false) => {
    const el = scroll.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }, []);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) scrollLatest();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobileChat, screen, activeId, scrollLatest, convs.length]);
  const chatVisible = () =>
    document.visibilityState === "visible" &&
    (screenRef.current === "Conversas" || screenRef.current === "Grupos") &&
    (window.matchMedia("(min-width: 761px)").matches || mobileChatRef.current);
  useEffect(() => {
    if (!drawer || !isMobile) return;
    const previous = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLButtonElement>('.mobile-drawer-profile button')?.focus();
    return () => { if (previous?.isConnected) previous.focus({preventScroll:true}); };
  }, [drawer, isMobile]);
  useEffect(() => {
    const pop = () => {
      const r = route();
      const saved = history.state?.digitalxList;
      if (!r.chat && saved?.user === me) {
        setQuery(typeof saved.query === 'string' ? saved.query : '');
        setFilter(['Todos','Grupos','Diretos','Não lidas'].includes(saved.filter) ? saved.filter : 'Todos');
        listPosition.current = Number.isFinite(saved.position) ? saved.position : 0;
      }
      setScreen(r.screen as Screen);
      setMobileChat(Boolean(r.chat));
      if (r.chat) setActiveId(r.chat);
      setDrawer(false);
      setModal(null);
      setEmoji(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Não foi possível concluir. Tente novamente.",
      ),
    [],
  );
  const notify = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }, []);
  const refresh = useCallback(async () => {
    if (demo) return;
    try {
      const rows = await api.conversations(me);
      setConvs(rows);
      if (activeRef.current && !rows.some((c) => c.id === activeRef.current)) {
        request.current++;
        activeRef.current = null;
        setActiveId(null);
        setMessages([]);
        setMobileChat(false);
      }
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [demo, me, fail]);
  const syncMessages = useCallback(async () => {
    const target = activeRef.current;
    if (demo || !target || !navigator.onLine) return;
    const generation = request.current;
    try {
      const [latest, known] = await Promise.all([api.history(target), api.messagesByIds(messagesRef.current.filter(m => m.conversation_id === target).map(m => m.id))]);
      if (target !== activeRef.current || generation !== request.current) return;
      const confirmed = new Set([...latest, ...known].map(m => m.client_nonce).filter(Boolean));
      setPendingSends(previous => previous.filter(p => !confirmed.has(p.nonce)));
      setMessages(() => {
        const unique = new Map(known.filter(m => m.conversation_id === target).map((message) => [message.id, message]));
        latest.forEach((message) => unique.set(message.id, message));
        return [...unique.values()].sort((a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
        );
      });
      if (chatVisible()) {
        await api.markRead(target);
        await refresh();
      }
    } catch (e) {
      fail(e);
    }
  }, [demo, refresh, fail]);
  const interactions = useChatInteractions({me: profile, demo, conversation: activeId, conversations: convs, onSync: async () => { await syncMessages(); await refresh(); }, onNotify: notify, onError: fail, onLocate: locateMessage});
  useEffect(() => { if (interactions.reply) composerText.current?.focus({preventScroll:true}); }, [interactions.reply]);
  async function locateMessage(id: string) {
    let original = messagesRef.current.find(m => m.id === id);
    if (!original && !demo) {
      original = (await api.messagesByIds([id]))[0];
      if (original?.conversation_id === activeRef.current) setMessages(old => [...old.filter(m => m.id !== id), original!].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)));
    }
    if (!original || original.deleted_at || original.conversation_id !== activeRef.current) throw new Error('Mensagem original indisponível.');
    nearBottom.current = false;
    requestAnimationFrame(() => {
      const el = document.getElementById(`message-${id}`), container = scroll.current;
      if (el && container) {
        container.scrollTo({top:container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - 40, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        el.classList.add('message-highlight'); setTimeout(()=>el.classList.remove('message-highlight'),1800);
      }
    });
  }
  useEffect(() => {
    // Android/browser Back dismisses the current sheet/menu before leaving the chat.
    if (isMobile && (modal || drawer || emoji || interactions.overlay || interactions.selectionActive)) {
      if (!history.state?.digitalxLayer) history.pushState({ ...history.state, digitalxLayer: layerHistory.current }, '', location.href);
    } else if (history.state?.digitalxLayer === layerHistory.current) {
      history.back();
    }
  }, [isMobile, modal, drawer, emoji, interactions.overlay, interactions.selectionActive]);
  useEffect(() => {
    if (demo) return;
    api.getProfile(me).then(setProfile).catch(fail);
    void refresh();
  }, [demo, me, refresh, fail]);
  useEffect(() => {
    const install = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);
  useEffect(() => {
    if (demo || !supabase) return;
    const c = supabase
      .channel(`digitalx-${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          void refresh();
          void syncMessages();
          const m = payload.new as Message;
          if (
            m?.sender_id !== me &&
            document.hidden &&
            notificationPermission === "granted"
          ) {
            const conv = convsRef.current.find(
              (c) => c.id === m.conversation_id,
            );
            new Notification("DIGITALX", {
              body: conv
                ? `Nova mensagem em ${title(conv, profile)}`
                : "Você recebeu uma nova mensagem.",
              icon: "/pwa-192.png",
            });
          }
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => { void syncMessages(); void refresh(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, () => void syncMessages())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_reactions" }, () => void syncMessages())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_hidden" }, () => { void syncMessages(); void refresh(); })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_members" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members" },
        () => void refresh(),
      )
      .subscribe((status) => {
        setConnection(
          status === "SUBSCRIBED"
            ? "Conectado"
            : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "Reconectando…"
              : "Conectando",
        );
        if (status === "SUBSCRIBED")
          void refresh().then(syncMessages);
      });
    const heartbeat = async () => {
      if (!navigator.onLine || document.hidden) return;
      const { error } = await client()
        .from("user_presence")
        .upsert({ user_id: me, last_seen_at: new Date().toISOString() });
      if (error) {
        fail(error.message);
        return;
      }
      const { data, error: e } = await client()
        .from("user_presence")
        .select("user_id,last_seen_at")
        .gt("last_seen_at", new Date(Date.now() - 90000).toISOString());
      if (!e) setPresence(data?.map((p) => p.user_id) ?? []);
    };
    void heartbeat();
    const timer = setInterval(() => {
      if (!navigator.onLine || document.hidden) return;
      void heartbeat();
      void refresh().then(syncMessages);
    }, 30000);
    const visible = () => {
      if (!document.hidden) {
        void refresh().then(syncMessages);
        void heartbeat();
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      void supabase!.removeChannel(c);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [demo, me, refresh, syncMessages, fail, notificationPermission, profile.name]);
  useEffect(() => {
    if (!activeId) return;
    const n = ++request.current;
    setOlder(true);
    setDraft("");
    setFile(undefined);
    setMessageQuery("");
    nearBottom.current = true;
    setShowJump(false);
    if (demo) {
      scrollOnLoad.current = activeId;
      setMessages(activeId === "demo-crew" ? demoMessages : []);
      return;
    }
    setBusy(true);
    setMessages([]);
    api
      .history(activeId)
      .then((ms) => {
        if (n === request.current) {
          scrollOnLoad.current = activeId;
          setMessages(ms);
          setOlder(ms.length === 50);
        }
      })
      .catch(fail)
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
  }, [activeId, demo, refresh, fail]);
  useEffect(() => {
    if (!demo && activeId && chatVisible())
      void api.markRead(activeId).then(refresh).catch(fail);
  }, [activeId, mobileChat, screen, demo, refresh, fail]);
  useLayoutEffect(() => {
    // A new history can resize before its scroll event reaches React. Its first
    // layout must reach the latest message even if that event changed nearBottom.
    if (messages.length && scrollOnLoad.current === activeId) {
      scrollOnLoad.current = null;
      nearBottom.current = true;
      setShowJump(false);
      scrollLatest();
    } else if (nearBottom.current)
      scrollLatest();
  }, [messages.length, activeId, mobileChat, scrollLatest]);
  useEffect(() => {
    if (demo) {
      setContactList(people);
      return;
    }
    if (screen === "Contatos" || modal === "new" || modal === "group")
      api.contacts().then(setContactList).catch(fail);
    if (screen === "Status") api.listStatuses().then(setStatuses).catch(fail);
  }, [screen, modal, demo, fail]);
  useEffect(() => {
    if (modal !== "status" || !statuses[statusIndex]) return;
    let alive = true;
    setStatusUrl("");
    api
      .signedFile(statuses[statusIndex].path, "status-files")
      .then((u) => {
        if (alive) setStatusUrl(u);
      })
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [statusIndex, modal, statuses, fail]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModal(null);
        setDrawer(false);
        setEmoji(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function openConversation(c: Conversation) {
    listPosition.current = listScroll.current?.scrollTop ?? listPosition.current;
    if (!route().chat) history.replaceState({...history.state,digitalxList:{user:me,query,filter,position:listPosition.current}},'',location.href);
    move("Conversas", demo, c.id);
    setActiveId(c.id);
    setMobileChat(true);
    setScreen("Conversas");
  }
  function navigate(s: Screen) {
    move(s, demo);
    setScreen(s);
    setDrawer(false);
    setMobileChat(false);
    if (s !== screen) {
      setQuery("");
      setFilter("Todos");
    }
  }
  function closeChat() {
    const from = history.state?.digitalxFrom;
    if (typeof from === 'string' && /\/(conversations|groups)$/.test(from)) {
      history.back();
    } else {
      history.replaceState(null, '', `${demo ? '/preview' : '/app'}/conversations`);
      setScreen('Conversas');
      setMobileChat(false);
    }
  }
  async function transmit(item: PendingSend) {
    if (sendLocks.current.has(item.nonce)) return;
    sendLocks.current.add(item.nonce);
    setPendingSends(old => old.map(p => p.nonce === item.nonce ? {...p, state:'sending', problem:undefined} : p));
    try {
      await api.send(item.conversation, me, item.body, item.file, item.reply, item.nonce);
      if (activeRef.current === item.conversation) {
        const latest = await api.history(item.conversation);
        setMessages(old => {
          const map = new Map(old.map(m=>[m.id,m])); latest.forEach(m=>map.set(m.id,m));
          return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
        });
      }
      setPendingSends(old => old.filter(p => p.nonce !== item.nonce));
      await refresh();
    } catch(e) {
      const problem = e instanceof Error ? e.message : 'Falha no envio. Tente novamente.';
      setPendingSends(old => old.map(p => p.nonce === item.nonce ? {...p,state:'failed',problem} : p));
    } finally { sendLocks.current.delete(item.nonce); }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !file) || busy) return;
    if (demo) { notify('Prévia visual: entre com Google para enviar mensagens reais.'); return; }
    const item: PendingSend = {nonce:crypto.randomUUID(),conversation:activeId!,body:draft.trim(),file,reply:interactions.reply?.id,state:'sending'};
    nearBottom.current = true; setShowJump(false);
    setPendingSends(old=>[...old,item]); setDraft(''); setFile(undefined); interactions.setReply(null);
    requestAnimationFrame(()=>scrollLatest());
    await transmit(item);
  }
  async function newConversation() {
    if (demo) {
      notify("Prévia visual: criar conversas requer uma conta conectada.");
      return;
    }
    if (!selected.length) throw new Error("Selecione pelo menos uma pessoa.");
    await execute(async () => {
      const id = await api.createConversation(
        groupName,
        selected,
        modal === "group",
      );
      await refresh();
      move("Conversas", demo, id);
      setActiveId(id);
      setMobileChat(true);
      setScreen("Conversas");
      setModal(null);
    });
  }
  function openNew(group = false) {
    setSelected([]);
    setGroupName("");
    setModal(group ? "group" : "new");
  }
  function openIdSearch() {
    idLookupRequest.current++;
    setIdSearching(false);
    setIdSearch("");
    setIdResult(null);
    setIdNotice("");
    setModal("id");
  }
  async function searchById(e: FormEvent) {
    e.preventDefault();
    if (idSearching) return;
    setIdResult(null);
    setIdNotice("");
    if (demo) {
      setIdNotice("Entre com Google para buscar um ID real.");
      return;
    }
    if (!api.validDigitalxId(idSearch)) {
      setIdNotice("Informe 9 dígitos começando por 1.");
      return;
    }
    const value = idSearch;
    const lookup = ++idLookupRequest.current;
    setIdSearching(true);
    try {
      const result = await api.findUserById(value);
      if (lookup !== idLookupRequest.current) return;
      setIdResult(result);
      if (!result) setIdNotice("Nenhum usuário encontrado com este ID.");
    } catch (e) {
      if (lookup === idLookupRequest.current)
        setIdNotice(e instanceof Error ? e.message : "Não foi possível buscar. Tente novamente.");
    } finally {
      if (lookup === idLookupRequest.current) setIdSearching(false);
    }
  }
  async function copyDigitalxId() {
    if (!profile.digitalx_id) return;
    try {
      await navigator.clipboard.writeText(profile.digitalx_id);
      notify("ID DIGITALX copiado.");
    } catch {
      fail("Não foi possível copiar. Selecione seu ID para copiar manualmente.");
    }
  }
  async function direct(p: Profile) {
    if (busy) return;
    if (p.id === me) {
      setModal(null);
      navigate("Perfil");
      return;
    }
    if (demo) {
      notify("Entre com Google para conversar com pessoas reais.");
      return;
    }
    await execute(async () => {
      const id = await api.createConversation("", [p.id], false);
      await refresh();
      move("Conversas", demo, id);
      setActiveId(id);
      setScreen("Conversas");
      setMobileChat(true);
      setModal(null);
    });
  }
  function info() {
    if (selection) {
      setGroupName(selection.title ?? "");
      setGroupDescription(selection.description);
      setModal("info");
    }
  }
  async function logout() {
    if (demo) {
      onExit();
      return;
    }
    await execute(async () => {
      await client().from("user_presence").delete().eq("user_id", me);
      const { error } = await client().auth.signOut();
      check(error);
      history.replaceState(null, "", "/");
    });
  }
  async function loadOlder() {
    if (!activeId || !messages[0]) return;
    const h = scroll.current?.scrollHeight ?? 0;
    nearBottom.current = false;
    await execute(async () => {
      const ms = await api.history(activeId, messages[0].created_at);
      setMessages((old) => [...ms, ...old]);
      setOlder(ms.length === 50);
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight - h;
      });
    });
  }
  const filtered = convs.filter(
    (c) =>
      (screen !== "Grupos" || c.is_group) &&
      title(c, profile).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "Todos" ||
        (filter === "Grupos" && c.is_group) ||
        (filter === "Diretos" && !c.is_group) ||
        (filter === "Não lidas" && c.unread > 0)),
  );
  const mine = selection?.members.find((m) => m.user_id === me),
    admin = mine?.role === "owner" || mine?.role === "admin";
  const secondary = screen !== "Conversas" && screen !== "Grupos";
  function toggleSidebar() {
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("digitalx-sidebar-collapsed", String(collapsed));
    } catch {
      // The toggle still works when the browser blocks local preferences.
    }
  }
  return (
    <div
      className={`workspace ${mobileChat ? "chat-open" : ""} ${compact ? "compact" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside id="workspace-sidebar" inert={isMobile ? !drawer : sidebarCollapsed} className={`sidebar ${drawer ? "drawer-open" : ""}`}>
        <button className="side-brand" onClick={() => navigate("Conversas")}>
          <img src="/brand.svg" alt="" />
          <strong>DIGITALX</strong>
        </button>
        <div className="mobile-drawer-profile">
          <Avatar profile={profile} />
          <div>
            <strong>{profile.name}</strong>
            <small>{publicHandle(profile)}</small>
          </div>
          <IconButton label="Fechar menu" onClick={() => setDrawer(false)}>
            <X size={19} />
          </IconButton>
        </div>
        <nav>
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={screen === name ? "nav-active" : ""}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Conversas" && convs.some((c) => c.unread > 0) && <i />}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <p>
            Mais que mensagens,
            <br />
            conexões reais.
          </p>
          <span className="side-version">DIGITALX / V.0.1</span>
          <button className="side-profile" onClick={() => navigate("Perfil")}>
            <Avatar profile={profile} size="small" />
            <span>
              <strong>{profile.name}</strong>
              <small>{demo ? "Prévia visual" : "Minha conta"}</small>
            </span>
            <MoreVertical size={16} />
          </button>
        </div>
      </aside>
      {drawer && (
        <button
          className="drawer-shade"
          aria-label="Fechar menu lateral"
          onClick={() => setDrawer(false)}
        />
      )}
      <section
        inert={isMobile && drawer}
        className={`conversation-panel ${secondary ? "secondary-selected" : ""}`}
      >
        <header className="list-header">
          <div className="list-heading">
            <button
              type="button"
              className="icon-button sidebar-toggle"
              aria-label={sidebarCollapsed ? "Abrir menu lateral" : "Recolher menu lateral"}
              title={sidebarCollapsed ? "Abrir menu lateral" : "Recolher menu lateral"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-sidebar"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <IconButton
              label="Abrir menu"
              className="mobile-only"
              onClick={() => setDrawer(true)}
            >
              <Menu size={22} />
            </IconButton>
            <div>
              <h1>DIGITALX</h1>
              <p>Conectando ideias, pessoas e projetos.</p>
            </div>
            <IconButton
              label="Nova conversa"
              onClick={() => openNew(screen === "Grupos")}
            >
              <SquarePen size={20} />
            </IconButton>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Buscar conversas"
              placeholder="Buscar conversas ou grupos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Limpar busca" onClick={() => setQuery("")}>
                <X size={13} />
              </button>
            )}
          </label>
          <div className="filters">
            {["Todos", "Grupos", "Diretos", "Não lidas"].map((f) => (
              <button
                className={filter === f ? "selected" : ""}
                aria-pressed={filter === f}
                key={f}
                onClick={() => setFilter(f)}
              >
                {f}
                {f === "Grupos" && (
                  <small>{convs.filter((c) => c.is_group).length}</small>
                )}
              </button>
            ))}
          </div>
        </header>
        <div className="conversation-list" ref={listScroll} onScroll={() => { if (!mobileChat) listPosition.current = listScroll.current?.scrollTop ?? 0; }}>
          {loading ? (
            <div className="conversation-skeletons" role="status" aria-label="Carregando conversas">
              {Array.from({length: 5}, (_, i) => <div className="conversation-skeleton" key={i} aria-hidden="true"><i /><span><b /><b /></span></div>)}
            </div>
          ) : filtered.length ? (
            filtered.map((c, i) => (
              <button
                key={c.id}
                className={`conversation-row ${activeId === c.id ? "active" : ""}`}
                onClick={() => openConversation(c)}
              >
                <Avatar
                  group={c.is_group}
                  profile={
                    !c.is_group
                      ? c.members.find((m) => m.user_id !== me)?.profile
                      : undefined
                  }
                  index={i}
                  online={
                    !c.is_group &&
                    presence.includes(
                      c.members.find((m) => m.user_id !== me)?.user_id ?? "",
                    )
                  }
                />
                <div className="conversation-copy">
                  <div>
                    <strong>{title(c, profile)}</strong>
                    {c.is_group && !c.is_main && <Users className="conversation-group-icon" size={14} aria-label="Grupo" />}
                    {c.is_main ? <VerifiedBadge /> : demo && i === 0 && c.is_group && (
                      <CheckCircle2
                        size={12}
                        fill="currentColor"
                        color="white"
                      />
                    )}
                  </div>
                  <p>
                    {c.last?.body ||
                      (c.last?.attachments?.length
                        ? `Anexo: ${c.last.attachments[0].name}`
                        : "Comece uma nova conversa.")}
                  </p>
                </div>
                <div className="conversation-meta">
                  <time>{time(c.last?.created_at ?? c.updated_at)}</time>
                  {c.unread > 0 ? (
                    <span className="unread">{c.unread}</span>
                  ) : c.last?.sender_id === me ? (
                    readByOthers(c, c.last, me)
                      ? <CheckCheck size={13} aria-label="Mensagem lida" /> : <Check size={13} aria-label="Mensagem enviada" />
                  ) : null}
                </div>
              </button>
            ))
          ) : (
            <div className="empty-list">
              <MessageCircle size={30} />
              <strong>
                {query
                  ? "Nenhuma conversa encontrada"
                  : "Suas conexões começam aqui"}
              </strong>
              <p>
                {query
                  ? "Tente outro nome ou filtro."
                  : "Crie uma conversa ou reúna sua equipe em um grupo."}
              </p>
              <button className="button-dark" onClick={() => openNew()}>
                Nova conversa <Plus size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="list-footer">
          <span
            className={`connection ${connection === "Conectado" ? "is-online" : ""}`}
          >
            <i />
            {connection}
          </span>
          <span>{filtered.length} conversas</span>
        </div>
      </section>
      {secondary ? (
        <section className="detail-panel" inert={isMobile && drawer}>
          <header className="detail-header">
            <IconButton
              label="Voltar"
              className="mobile-only"
              onClick={() => { if (history.state?.digitalxFrom?.startsWith(demo ? '/preview/' : '/app/')) history.back(); else navigate('Conversas'); }}
            >
              <ArrowLeft size={21} />
            </IconButton>
            <h2>{screen}</h2>
            <span className="eyebrow">SEU ESPAÇO DIGITALX</span>
          </header>
          <div className="detail-scroll">
            {screen === "Contatos" && (
              <>
                <div className="section-intro">
                  <h2>
                    Conexões que fazem acontecer<span>.</span>
                  </h2>
                  <p>Encontre pessoas e comece uma conversa.</p>
                </div>
                <button className="button-dark add-by-id" onClick={openIdSearch}>
                  <UserPlus size={18} /> Adicionar pelo ID
                </button>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    placeholder="Buscar contato…"
                    aria-label="Buscar contato"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="contact-grid">
                  {contactList
                    .filter(
                      (p) =>
                        p.id !== me &&
                        `${p.name} ${p.username}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                    )
                    .map((p, i) => (
                      <button
                        className="contact-card"
                        key={p.id}
                        onClick={() => direct(p)}
                      >
                        <Avatar profile={p} index={i} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{publicHandle(p)}</small>
                        </span>
                        <MessageCircle size={19} />
                      </button>
                    ))}
                </div>
                {contactList.length < 2 && (
                  <p className="muted">
                    Seus contatos aparecerão quando outras pessoas entrarem no
                    DIGITALX.
                  </p>
                )}
              </>
            )}
            {screen === "Perfil" && (
              <div className="profile-view">
                <Avatar profile={profile} size="large" />
                <label className="profile-photo-change">
                  <Camera size={15} /> Alterar foto
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
                    const photo = event.target.files?.[0]; event.target.value = ""; if (!photo) return;
                    if (demo) { notify("Entre com Google para alterar sua foto."); return; }
                    void execute(async () => {
                      const path = await api.uploadAvatar(me, photo);
                      await api.completeOnboarding(profile.name, profile.bio, path);
                      await api.cleanupAvatar(profile.avatar_url);
                      setProfile(await api.getProfile(me)); notify("Foto de perfil atualizada.");
                    });
                  }} />
                </label>
                {profile.avatar_url?.startsWith("storage://avatars/") && <button className="profile-photo-reset" disabled={busy} onClick={() => void execute(async () => {
                  await api.completeOnboarding(profile.name, profile.bio, null, true);
                  await api.cleanupAvatar(profile.avatar_url);
                  setProfile(await api.getProfile(me)); notify("Foto do Google restaurada.");
                })}>Usar foto do Google</button>}
                <h2>
                  {profile.name} <CheckCircle2 size={18} />
                </h2>
                <p>{publicHandle(profile)}</p>
                <div className="digitalx-id-card">
                  <span>ID DIGITALX</span>
                  <strong>{profile.digitalx_id ?? (demo ? "Disponível após cadastro" : "Carregando…")}</strong>
                  <button type="button" onClick={() => void copyDigitalxId()} disabled={!profile.digitalx_id}>
                    <Copy size={16} /> Copiar ID
                  </button>
                </div>
                <span className="presence-label">
                  <i />
                  {demo ? "Prévia" : connection}
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (demo) {
                      notify("Entre com Google para salvar seu perfil.");
                      return;
                    }
                    const f = new FormData(e.currentTarget);
                    void execute(async () => {
                      await api.updateProfile(
                        me,
                        String(f.get("name")),
                        String(f.get("username")),
                        String(f.get("bio")),
                      );
                      setProfile(await api.getProfile(me));
                      notify("Perfil atualizado.");
                    });
                  }}
                  className="profile-form"
                >
                  <label>
                    Nome
                    <input
                      name="name"
                      required
                      defaultValue={profile.name}
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      name="username"
                      required
                      pattern="[a-z0-9_\.]{3,32}"
                      title="3 a 32 caracteres: letras minúsculas, números, ponto ou underline"
                      defaultValue={profile.username}
                      maxLength={32}
                    />
                  </label>
                  <label>
                    Bio
                    <textarea
                      name="bio"
                      defaultValue={profile.bio}
                      maxLength={240}
                    />
                  </label>
                  <button className="button-dark" disabled={busy}>
                    Salvar perfil <Check size={17} />
                  </button>
                </form>
              </div>
            )}
            {screen === "Arquivos" && (
              <>
                <div className="section-intro">
                  <h2>
                    Tudo que conecta suas ideias<span>.</span>
                  </h2>
                  <p>
                    Arquivos privados das suas conversas. Até 25 MB por envio.
                  </p>
                </div>
                <div className="filters">
                  {["Todos", "Imagens", "Vídeos", "Documentos"].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <Files
                  conversations={convs}
                  demo={demo}
                  filter={filter}
                  fail={fail}
                />
              </>
            )}
            {screen === "Chamadas" && (
              <>
                <div className="section-intro">
                  <h2>
                    Mais perto, mesmo de longe<span>.</span>
                  </h2>
                  <p>Áudio, vídeo e conexões em tempo real.</p>
                </div>
                <div className="pending-card">
                  <Phone size={35} />
                  <h3>{demo ? "Chamadas em preparação" : "Chamadas de áudio"}</h3>
                  <p>
                    {demo ? "Esta prévia não realiza ligações." : "Abra uma conversa individual e toque no telefone. Compare o código de segurança antes de liberar o áudio. Grupos, vídeo e conexões através de TURN ainda estão em preparação."}
                  </p>
                  <span className="status-chip">{demo ? "INFRAESTRUTURA PENDENTE" : "VERIFICAÇÃO OBRIGATÓRIA"}</span>
                </div>
                <CallHistory demo={demo} fail={fail} />
              </>
            )}
            {screen === "Status" && (
              <>
                <div className="section-intro">
                  <h2>
                    Seu momento. Sua comunidade<span>.</span>
                  </h2>
                  <p>
                    Imagens que ficam disponíveis por 24 horas para suas
                    conexões.
                  </p>
                </div>
                <button
                  className="add-status"
                  onClick={() => {
                    if (demo) {
                      notify("Publique um status depois de entrar com Google.");
                      return;
                    }
                    statusInput.current?.click();
                  }}
                >
                  <span className="status-ring">
                    <Avatar profile={profile} />
                    <i>
                      <Plus size={13} />
                    </i>
                  </span>
                  <span>
                    <strong>Meu status</strong>
                    <small>Toque para adicionar uma imagem</small>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  ref={statusInput}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void execute(async () => {
                        await api.publishStatus(me, f, statusCaption);
                        setStatuses(await api.listStatuses());
                        notify("Status publicado. Expira em 24 horas.");
                        e.target.value = "";
                      });
                  }}
                />
                <input
                  className="caption-field"
                  placeholder="Legenda do seu status (opcional)"
                  maxLength={240}
                  value={statusCaption}
                  onChange={(e) => setStatusCaption(e.target.value)}
                />
                <div className="status-list">
                  {statuses.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setStatusIndex(i);
                        setModal("status");
                      }}
                    >
                      <span className="status-ring">
                        <Avatar profile={s.author} />
                      </span>
                      <span>
                        <strong>{s.author.name}</strong>
                        <small>
                          {time(s.created_at)} · expira às {time(s.expires_at)}
                        </small>
                      </span>
                      <ChevronRight size={19} />
                    </button>
                  ))}
                </div>
                {!statuses.length && (
                  <div className="empty-list">
                    <Radio size={30} />
                    <p>
                      Nenhum status recente. Compartilhe o primeiro momento.
                    </p>
                  </div>
                )}
              </>
            )}
            {screen === "Configurações" && (
              <>
                <div className="section-intro">
                  <h2>
                    Do seu jeito<span>.</span>
                  </h2>
                  <p>Seu perfil, suas preferências, suas conexões.</p>
                </div>
                <div className="setting-list">
                  <button onClick={() => navigate("Perfil")}>
                    <User />
                    <span>
                      <strong>Conta</strong>
                      <small>Nome, username e bio</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button
                    onClick={async () => {
                      if (!("Notification" in window)) {
                        notify("Este navegador não oferece notificações.");
                        return;
                      }
                      const p = await Notification.requestPermission();
                      setNotificationPermission(p);
                      notify(
                        p === "granted"
                          ? "Notificações ativadas enquanto o DIGITALX está aberto."
                          : "Permissão de notificações não concedida.",
                      );
                    }}
                  >
                    <Bell />
                    <span>
                      <strong>Notificações</strong>
                      <small>
                        {notificationPermission === "granted"
                          ? "Ativas enquanto a aplicação está aberta"
                          : "Receba alertas em outra aba"}
                      </small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button
                    onClick={() => {
                      setCompact(!compact);
                      localStorage.setItem(
                        "digitalx-compact",
                        String(!compact),
                      );
                    }}
                  >
                    <MonitorSmartphone />
                    <span>
                      <strong>Aparência</strong>
                      <small>
                        {compact
                          ? "Mensagens compactas"
                          : "Espaçamento confortável"}
                      </small>
                    </span>
                    <span className={`toggle ${compact ? "on" : ""}`} />
                  </button>
                  <button
                    onClick={() =>
                      notify(
                        "Conversas protegidas por autenticação e permissões de participantes. Arquivos usam acesso temporário de 60 segundos.",
                      )
                    }
                  >
                    <Shield />
                    <span>
                      <strong>Privacidade</strong>
                      <small>Conversas e arquivos com acesso controlado</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button
                    onClick={async () => {
                      if (installEvent) {
                        await installEvent.prompt();
                        setInstallEvent(null);
                      } else
                        notify(
                          "No celular, use o menu do navegador → Adicionar à tela inicial. No iPhone: Compartilhar → Adicionar à Tela de Início.",
                        );
                    }}
                  >
                    <Download />
                    <span>
                      <strong>Instalar DIGITALX</strong>
                      <small>Adicione à tela inicial</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button onClick={() => void logout()} className="danger">
                    <LogOut />
                    <span>
                      <strong>
                        {demo ? "Sair da prévia" : "Sair da conta"}
                      </strong>
                      <small>Voltar para a tela de login</small>
                    </span>
                    <ChevronRight />
                  </button>
                </div>
                <div className="about-brand">
                  <img src="/brand.svg" alt="" />
                  <strong>DIGITALX</strong>
                  <small>JUNTOS SOMOS MAIS FORTES</small>
                  <span>WEB + PWA · VERSÃO 0.1</span>
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <section inert={isMobile && drawer} className={`chat-panel ${selection?.is_group ? 'group-chat' : 'direct-chat'} ${!selection ? "no-selection" : ""}`}>
          {selection ? (
            <>
              <header className="chat-header">
                <IconButton
                  label="Voltar às conversas"
                  className="mobile-only"
                  onClick={closeChat}
                >
                  <ArrowLeft size={21} />
                </IconButton>
                <button className="chat-identity" onClick={info}>
                  <Avatar
                    group={selection.is_group}
                    profile={
                      !selection.is_group
                        ? selection.members.find((m) => m.user_id !== me)
                            ?.profile
                        : undefined
                    }
                    size="small"
                  />
                  <span>
                    <strong>
                      {title(selection, profile)}{" "}
                      {selection.is_main ? <VerifiedBadge /> : demo && selection.is_group && (
                        <CheckCircle2
                          size={13}
                          fill="currentColor"
                          color="white"
                        />
                      )}
                    </strong>
                    <small>
                      {selection.is_group
                        ? `${selection.members.length} membros`
                        : presence.includes(
                              selection.members.find((m) => m.user_id !== me)
                                ?.user_id ?? "",
                            )
                          ? "Online agora"
                          : "Conversa individual"}
                      {demo && " · prévia visual"}
                    </small>
                  </span>
                </button>
                <div className="chat-actions">
                  <IconButton
                    label="Buscar nesta conversa"
                    onClick={() => setChatSearch(!chatSearch)}
                  >
                    <Search size={20} />
                  </IconButton>
                  <IconButton
                    label="Chamada de vídeo"
                    className="video-call"
                    onClick={() => setModal("call")}
                  >
                    <Video size={21} />
                  </IconButton>
                  <IconButton
                    label="Chamada de áudio"
                    onClick={() => {
                      if (demo || selection.is_group) setModal("call");
                      else setCallRequest({id: Date.now(), conversation: selection});
                    }}
                  >
                    <Phone size={19} />
                  </IconButton>
                  <IconButton label="Informações da conversa" onClick={info}>
                    <MoreVertical size={21} />
                  </IconButton>
                </div>
              </header>
              <div className="mobile-group-band">
                <div className="member-stack">
                  {selection.members.slice(0, 5).map((m, i) => (
                    <Avatar
                      key={m.user_id}
                      profile={m.profile}
                      size="tiny"
                      index={i}
                    />
                  ))}
                  <button aria-label="Ver membros do grupo" onClick={info}>
                    <Plus size={14} />
                  </button>
                </div>
                <span>
                  {selection.is_group
                    ? "Ideias que conectam."
                    : "Uma conexão. Novas possibilidades."}
                </span>
              </div>
              {chatSearch && (
                <label className="search-field chat-search">
                  <Search size={16} />
                  <input
                    aria-label="Buscar mensagens carregadas"
                    autoFocus
                    placeholder="Buscar nas mensagens carregadas…"
                    value={messageQuery}
                    onChange={(e) => setMessageQuery(e.target.value)}
                  />
                  <IconButton label="Fechar busca de mensagens" onClick={() => { setChatSearch(false); setMessageQuery(''); }}><X size={19} /></IconButton>
                </label>
              )}
              {interactions.selectionBar}
              <div
                className="message-history"
                ref={scroll}
                onLoadCapture={() => { if (nearBottom.current) scrollLatest(); }}
                onScroll={() => {
                  const el = scroll.current;
                  if (el) {
                    nearBottom.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 90;
                    setShowJump(!nearBottom.current);
                  }
                }}
              >
                {demo && (
                  <div className="demo-banner">
                    <Info size={13} />
                    <span>PRÉVIA VISUAL · DADOS DEMONSTRATIVOS</span>
                  </div>
                )}
                {!demo && older && messages.length > 0 && (
                  <button
                    className="older-button"
                    onClick={() => void loadOlder()}
                    disabled={busy}
                  >
                    Carregar mensagens anteriores
                  </button>
                )}
                {busy && !messages.length ? (
                  <div className="loading-state">
                    <LoaderCircle className="spin" /> Carregando…
                  </div>
                ) : !messages.length ? (
                  <div className="chat-empty">
                    <img src="/brand.svg" alt="" />
                    <h2>O começo de uma boa ideia.</h2>
                    <p>Envie a primeira mensagem e faça a conexão acontecer.</p>
                  </div>
                ) : (
                  messages
                    .filter((m) =>
                      m.body.toLowerCase().includes(messageQuery.toLowerCase()),
                    )
                    .map((m, i, visible) => {
                      const own = m.sender_id === me,
                        previous = visible[i - 1],
                        newDay = !previous || dayKey(previous.created_at) !== dayKey(m.created_at),
                        grouped = !newDay && previous.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(previous.created_at).getTime() < 300000,
                        read = readByOthers(selection, m, me);
                      return (
                        <div className="message-entry" id={`message-${m.id}`} key={m.id}>
                          {newDay && <div className="date-separator"><span>{new Date(m.created_at).toLocaleDateString('pt-BR', {day:'numeric',month:'long'})}</span></div>}
                        <div className={`message-row ${own ? "outgoing" : "incoming"} ${grouped ? "consecutive" : ""}`}>
                          {!own && (
                            selection.is_group && m.sender?.id ? (
                              <button
                                className="message-avatar-button"
                                aria-label={`Conversar com ${m.sender.name}`}
                                title={`Conversar com ${m.sender.name}`}
                                disabled={busy}
                                onClick={() => void direct(m.sender)}
                              >
                                <Avatar profile={m.sender} size="small" index={i} />
                              </button>
                            ) : <Avatar profile={m.sender} size="small" index={i} />
                          )}
                          <MessageSurface message={m} onMenu={interactions.open} onReply={interactions.respond} onSelect={interactions.toggle} selecting={interactions.selectionActive} selected={interactions.selected.some(x=>x.id===m.id)}>
                            {!own && (
                              <span className="message-author">
                                {m.sender?.name ?? "Membro"}
                              </span>
                            )}
                            {m.forwarded && !m.deleted_at && <span className="message-forwarded"><ArrowUpRight size={12}/> Encaminhada</span>}
                            {!m.deleted_at && interactions.quote(m)}
                            <p className={m.deleted_at ? "message-deleted" : ""}><MessageText body={m.deleted_at ? "Esta mensagem foi apagada" : m.body} /></p>
                            {(m.deleted_at ? [] : m.attachments).map((a) => (
                              <FileCard
                                key={a.id}
                                file={a}
                                demo={demo}
                                onError={demo ? (e) => notify(String(e)) : fail}
                              />
                            ))}
                            <span className="message-time">
                              {m.edited_at && !m.deleted_at && <span>Editada · </span>}{time(m.created_at)}
                              {own &&
                                (read ? (
                                  <CheckCheck size={12} aria-label="Mensagem lida" />
                                ) : (
                                  <Check size={12} aria-label="Mensagem enviada" />
                                ))}
                            </span>
                            {interactions.reactions(m)}
                          </MessageSurface>
                        </div>
                        </div>
                      );
                    })
                )}
                {pendingSends.filter(p=>p.conversation===activeId && !messages.some(m=>m.client_nonce===p.nonce)).map(p=><div className="pending-message" role="status" key={p.nonce}>
                  <p>{p.body || p.file?.name}</p><small>{p.state==='sending'?<><LoaderCircle size={12} className="spin"/>Enviando…</>:'Falha no envio'}</small>
                  {p.state==='failed'&&<><small>{p.problem}</small><button onClick={()=>void transmit(p)}>Tentar novamente</button></>}
                </div>)}
                <div ref={bottom} />
              </div>
              {showJump && (
                <button
                  className="jump-latest"
                  onClick={() => {
                    nearBottom.current = true;
                    scrollLatest(true);
                    setShowJump(false);
                  }}
                >
                  <ArrowDown size={14} /> Mensagens recentes
                </button>
              )}
              <form className="composer" onSubmit={send} aria-busy={busy}>
                <input
                  type="file"
                  hidden
                  ref={inputFile}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      try {
                        api.validateFile(f);
                        setFile(f);
                      } catch (e) {
                        fail(e);
                      }
                    e.target.value = "";
                  }}
                />
                <IconButton
                  label="Anexar arquivo"
                  className="add-file"
                  onClick={() => inputFile.current?.click()}
                >
                  <Plus size={21} />
                </IconButton>
                <div className="composer-input">
                  {interactions.replyPreview}
                  {file && (
                    <div className="selected-file">
                      {filePreview ? <img className="selected-image" src={filePreview} alt="Prévia do anexo"/> : <Paperclip size={14} />}
                      {file.name}
                      <button
                        type="button"
                        aria-label="Remover anexo"
                        onClick={() => setFile(undefined)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={composerText}
                    placeholder="Digite sua mensagem…"
                    aria-label="Mensagem"
                    value={draft}
                    rows={1}
                    maxLength={8000}
                    onChange={(e) => {
                      setDraft(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !isMobile &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send(e);
                      }
                    }}
                  />
                  <IconButton label="Emojis" onClick={() => setEmoji(!emoji)}>
                    <Smile size={20} />
                  </IconButton>
                  <IconButton
                    label="Selecionar anexo"
                    className="paperclip"
                    onClick={() => inputFile.current?.click()}
                  >
                    <Paperclip size={19} />
                  </IconButton>
                  {emoji && (
                    <div className="emoji-picker">
                      {[
                        "😀",
                        "🖤",
                        "🔥",
                        "🚀",
                        "👊",
                        "👍",
                        "✅",
                        "💪",
                        "🎉",
                        "💡",
                        "🙌",
                        "❤️",
                      ].map((e) => (
                        <button
                          type="button"
                          key={e}
                          onClick={() => {
                            setDraft(draft + e);
                            setEmoji(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Enviar mensagem"
                  disabled={busy || (!draft.trim() && !file)}
                >
                  {busy ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="welcome-empty">
              <img src="/brand.svg" alt="" />
              <strong>DIGITALX</strong>
              <span className="slogan">JUNTOS SOMOS MAIS FORTES</span>
              <h2>
                Grandes ideias começam
                <br />
                com uma conversa.
              </h2>
              <p>Escolha uma conexão ou crie algo novo.</p>
              <button className="button-dark" onClick={() => openNew()}>
                Começar conversa <ArrowUpRight size={17} />
              </button>
            </div>
          )}
        </section>
      )}
      <nav className="mobile-bottom" aria-label="Navegação principal" inert={isMobile && drawer}>
        <button
          className={screen === "Conversas" ? "active" : ""}
          onClick={() => navigate("Conversas")}
        >
          <MessageCircle size={20} />
          <span>Conversas</span>
        </button>
        <button
          className={screen === "Grupos" ? "active" : ""}
          onClick={() => navigate("Grupos")}
        >
          <Users size={20} />
          <span>Grupos</span>
        </button>
        <button
          className={screen === "Chamadas" ? "active" : ""}
          onClick={() => navigate("Chamadas")}
        >
          <Phone size={20} />
          <span>Chamadas</span>
        </button>
        <button
          className={screen === "Status" ? "active" : ""}
          onClick={() => navigate("Status")}
        >
          <Radio size={20} />
          <span>Status</span>
        </button>
      </nav>
      {!demo && <Suspense fallback={null}><CallManager me={profile} conversations={convs} request={callRequest} /></Suspense>}
      {error && (
        <div className="error-toast" role="alert">
          <Info size={18} />
          <span>{error}</span>
          <button aria-label="Fechar erro" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {interactions.ui}
      {modal && (
        <div className={`modal-overlay ${modal === "call" ? "pending-call-overlay" : ""}`} onClick={() => setModal(null)}>
          <section
            className={modal === "call" ? "secure-call-screen pending-call-screen" : `modal ${modal === "info" ? "info-modal" : ""} ${modal === "status" ? "status-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "info"
                ? "Informações da conversa"
                : modal === "call"
                  ? "Chamadas"
                  : modal === "status"
                    ? "Visualizar status"
                    : modal === "id"
                      ? "Adicionar pelo ID"
                    : modal === "group"
                      ? "Criar grupo"
                      : "Nova conversa"
            }
            onClick={(e) => e.stopPropagation()}
          >
            {modal !== "call" && <IconButton
              label="Fechar janela"
              className="modal-close"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </IconButton>}
            {modal === "id" && (
              <>
                <span className="eyebrow">UMA NOVA CONEXÃO</span>
                <h2>Adicionar pelo ID</h2>
                <p className="muted">Peça o ID DIGITALX da pessoa para começar uma conversa.</p>
                <form className="id-search-form" onSubmit={(e) => void searchById(e)}>
                  <label htmlFor="digitalx-id-search">ID DIGITALX</label>
                  <input
                    id="digitalx-id-search"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    pattern="1[0-9]{8}"
                    maxLength={9}
                    placeholder="1XXXXXXXX"
                    title="Exatamente 9 dígitos começando por 1"
                    value={idSearch}
                    disabled={idSearching}
                    onChange={(e) => {
                      setIdSearch(e.target.value.replace(/[^0-9]/g, "").slice(0, 9));
                      setIdResult(null);
                      setIdNotice("");
                    }}
                  />
                  <small>9 dígitos, começando por 1. Este ID não é uma senha.</small>
                  <button className="button-dark" disabled={idSearching || !api.validDigitalxId(idSearch)}>
                    {idSearching ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}
                    {idSearching ? "Buscando…" : "Buscar usuário"}
                  </button>
                </form>
                {idNotice && <p role="status" className="id-notice">{idNotice}</p>}
                {idResult && (
                  <div className="id-result">
                    <Avatar profile={idResult} />
                    <div><strong>{idResult.name}</strong><small>ID {idResult.digitalx_id}</small></div>
                    {idResult.id === me ? <span>Seu ID</span> : (
                      <button className="button-dark" disabled={busy} onClick={() => void direct(idResult)}>
                        <MessageCircle size={17} /> Conversar
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {(modal === "new" || modal === "group") && (
              <>
                <span className="eyebrow">UMA NOVA CONEXÃO</span>
                <h2>
                  {modal === "group" ? "Crie seu grupo." : "Vamos conversar."}
                </h2>
                <p className="muted">
                  {modal === "group"
                    ? "Reúna pessoas. Transforme ideias em projetos."
                    : "Selecione uma pessoa para começar."}
                </p>
                <div className="filters">
                  <button
                    className={modal === "new" ? "selected" : ""}
                    onClick={() => {
                      setModal("new");
                      setSelected([]);
                    }}
                  >
                    Individual
                  </button>
                  <button
                    className={modal === "group" ? "selected" : ""}
                    onClick={() => setModal("group")}
                  >
                    Grupo
                  </button>
                </div>
                {modal === "group" && (
                  <label className="field">
                    Nome do grupo
                    <input
                      aria-label="Nome do grupo"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      maxLength={80}
                      placeholder="Ex.: Projetos & Ideias"
                    />
                  </label>
                )}
                <div className="modal-contacts">
                  {contactList
                    .filter((p) => p.id !== me)
                    .map((p, i) => (
                      <button
                        key={p.id}
                        className={selected.includes(p.id) ? "checked" : ""}
                        onClick={() =>
                          setSelected(
                            modal === "new"
                              ? [p.id]
                              : selected.includes(p.id)
                                ? selected.filter((id) => id !== p.id)
                                : [...selected, p.id],
                          )
                        }
                      >
                        <Avatar profile={p} index={i} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>@{p.username}</small>
                        </span>
                        <span className="checkbox">
                          {selected.includes(p.id) && <Check size={15} />}
                        </span>
                      </button>
                    ))}
                  {contactList.filter((p) => p.id !== me).length === 0 && (
                    <p className="muted">
                      Ainda não há outros usuários cadastrados.
                    </p>
                  )}
                </div>
                <button
                  className="button-dark full"
                  disabled={
                    busy ||
                    !selected.length ||
                    (modal === "group" && !groupName.trim())
                  }
                  onClick={() => void newConversation()}
                >
                  {modal === "group" ? "Criar grupo" : "Iniciar conversa"}
                  <ArrowUpRight size={18} />
                </button>
              </>
            )}
            {modal === "info" && selection && (
              <>
                <div className="group-info-top">
                  <Avatar group={selection.is_group} size="large" profile={!selection.is_group ? selection.members.find(member => member.user_id !== me)?.profile : undefined} />
                  <h2>
                    {title(selection, profile)}
                    {selection.is_main && <VerifiedBadge />}
                  </h2>
                  <span>{selection.members.length} membros</span>
                </div>
                <p className="group-description">
                  {selection.description ||
                    "Conectando ideias, pessoas e projetos."}
                </p>
                <button className="button-light mobile-only chat-search-action" onClick={() => { setModal(null); setChatSearch(true); }}><Search size={18} /> Buscar nesta conversa</button>
                {selection.is_group && admin && (
                  <details className="group-edit" open={!isMobile}>
                  <summary><SquarePen size={17} /> Editar informações do grupo</summary>
                  <form
                    className="group-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (demo) {
                        notify("Edição disponível para grupos reais.");
                        return;
                      }
                      void execute(async () => {
                        await api.groupAction(
                          selection.id,
                          "edit",
                          undefined,
                          groupName,
                          groupDescription,
                        );
                        await refresh();
                        notify("Grupo atualizado.");
                      });
                    }}
                  >
                    <label className="field">
                      Nome
                      <input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        required
                        maxLength={80}
                      />
                    </label>
                    <label className="field">
                      Descrição
                      <textarea
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        maxLength={500}
                      />
                    </label>
                    <button className="button-light" disabled={busy}>
                      Salvar informações <Check size={16} />
                    </button>
                  </form>
                  </details>
                )}
                <h3 className="members-heading">
                  Membros <span>{selection.members.length}</span>
                </h3>
                <p className="members-hint">Toque em um membro para conversar.</p>
                <div className="member-list">
                  {selection.members.map((m, i) => (
                    <div key={m.user_id}>
                      <button
                        className="member-open"
                        aria-label={m.user_id === me ? "Ver meu perfil" : `Conversar com ${m.profile.name}`}
                        disabled={busy}
                        onClick={() => void direct(m.profile)}
                      >
                      <Avatar profile={m.profile} size="small" index={i} />
                      <span className="member-details">
                        <strong>{m.profile.name}{m.user_id === me && <em> (você)</em>}</strong>
                        <small>
                          {demo
                            ? "Prévia visual"
                            : presence.includes(m.user_id)
                              ? "Online agora"
                              : "Offline"}
                        </small>
                      </span>
                      {m.role !== "member" && (
                        <span className="role">
                          {m.role === "owner" ? "Criador" : "Admin"}
                        </span>
                      )}
                      {m.user_id !== me && <ChevronRight className="member-chevron" size={16} />}
                      </button>
                      {admin &&
                        m.user_id !== me &&
                        m.role !== "owner" &&
                        (mine?.role === "owner" || m.role !== "admin") && (
                          <IconButton
                            label={`Remover ${m.profile.name}`}
                            disabled={busy}
                            onClick={() => {
                              if (demo) {
                                notify("Remoção disponível para grupos reais.");
                                return;
                              }
                              void execute(async () => {
                                await api.groupAction(
                                  selection.id,
                                  "remove",
                                  m.user_id,
                                );
                                await refresh();
                              });
                            }}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        )}
                    </div>
                  ))}
                </div>
                {selection.is_group && admin && (
                  <AddMember
                    demo={demo}
                    members={selection.members.map((m) => m.user_id)}
                    add={(p) =>
                      void execute(async () => {
                        await api.groupAction(selection.id, "add", p.id);
                        await refresh();
                        notify("Participante adicionado.");
                      })
                    }
                    fail={fail}
                  />
                )}
                <button
                  className="button-light full"
                  onClick={() => {
                    setModal(null);
                    navigate("Arquivos");
                  }}
                >
                  <FolderOpen size={18} /> Ver arquivos das conversas{" "}
                  <ChevronRight size={16} />
                </button>
                {selection.is_group && (
                  <button
                    className="leave-group"
                    disabled={busy}
                    onClick={() => {
                      if (demo) {
                        notify("Saída disponível para grupos reais.");
                        return;
                      }
                      void execute(async () => {
                        await api.groupAction(selection.id, "leave");
                        setModal(null);
                        setActiveId(null);
                        setMobileChat(false);
                        await refresh();
                      });
                    }}
                  >
                    <LogOut size={16} /> Sair do grupo
                  </button>
                )}
              </>
            )}
            {modal === "call" && (
              <>
                <header className="secure-call-top">
                  <button aria-label="Fechar janela" onClick={() => setModal(null)} autoFocus>
                    <ArrowLeft size={23} />
                  </button>
                  <span>Chamadas {selection?.is_group ? "em grupo" : "de vídeo"}<br />Em preparação</span>
                  <span className="pending-call-top-spacer" aria-hidden="true" />
                </header>
                <div className="pending-call-content">
                  <div className="secure-call-person">
                    <div className="secure-call-photo">
                      <Avatar group={selection?.is_group} profile={!selection?.is_group ? selection?.members.find(m => m.user_id !== me)?.profile : undefined} size="large" />
                    </div>
                    <h2>{selection ? title(selection, profile) : "Chamadas DIGITALX"}</h2>
                    {selection?.is_group && <p>{selection.members.length} membros</p>}
                  </div>
                  {selection?.is_group && <div className="pending-call-members" aria-label="Membros do grupo">
                    {selection.members.slice(0, 6).map((m, i) => (
                      <div key={m.user_id}>
                        <Avatar profile={m.profile} index={i} />
                        <strong>{m.profile.name}{m.user_id === me ? " (você)" : ""}</strong>
                      </div>
                    ))}
                    {selection.members.length > 6 && <p className="pending-call-member-count">+{selection.members.length - 6} membros</p>}
                  </div>}
                  <div className="pending-call-notice">
                    <strong>{demo ? "Prévia visual" : "Ainda não disponível"}</strong>
                    <p>{demo ? "Entre com Google para usar as chamadas individuais de áudio." : "Áudio em grupo e vídeo estarão disponíveis quando a proteção de ponta a ponta estiver pronta."} Não há uma chamada ativa.</p>
                  </div>
                </div>
                <footer className="pending-call-footer">
                  <div className="secure-call-controls">
                    <button aria-label="Microfone — infraestrutura pendente" disabled><Mic size={24} /><span>Microfone</span></button>
                    <button aria-label="Câmera — infraestrutura pendente" disabled><Video size={24} /><span>Câmera</span></button>
                  </div>
                  <button className="call-back" onClick={() => setModal(null)}>Voltar à conversa</button>
                </footer>
              </>
            )}
            {modal === "status" && statuses[statusIndex] && (
              <>
                <div className="status-progress">
                  {statuses.map((s, i) => (
                    <span
                      key={s.id}
                      className={i <= statusIndex ? "viewed" : ""}
                    />
                  ))}
                </div>
                <div className="status-author">
                  <Avatar profile={statuses[statusIndex].author} size="small" />
                  <span>
                    <strong>{statuses[statusIndex].author.name}</strong>
                    <small>{time(statuses[statusIndex].created_at)}</small>
                  </span>
                </div>
                {statusUrl ? (
                  <img
                    className="status-photo"
                    src={statusUrl}
                    alt={statuses[statusIndex].caption || "Status"}
                  />
                ) : (
                  <LoaderCircle className="spin" />
                )}
                <p>{statuses[statusIndex].caption}</p>
                <div className="status-nav">
                  <button
                    className="button-light"
                    disabled={statusIndex === 0}
                    onClick={() => setStatusIndex(statusIndex - 1)}
                  >
                    <ArrowLeft size={18} /> Anterior
                  </button>
                  <button
                    className="button-light"
                    disabled={statusIndex >= statuses.length - 1}
                    onClick={() => setStatusIndex(statusIndex + 1)}
                  >
                    Próximo <ChevronRight size={18} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function AddMember({
  demo,
  members,
  add,
  fail,
}: {
  demo: boolean;
  members: string[];
  add: (p: Profile) => void;
  fail: (e: unknown) => void;
}) {
  const [q, setQ] = useState(""),
    [list, setList] = useState<Profile[]>([]);
  useEffect(() => {
    if (demo) return;
    api.contacts(q).then(setList).catch(fail);
  }, [q, demo, fail]);
  return (
    <div className="add-member">
      <label className="search-field">
        <Plus size={16} />
        <input
          aria-label="Adicionar participante"
          placeholder="Buscar participante para adicionar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {q &&
        list
          .filter((p) => !members.includes(p.id))
          .map((p) => (
            <button
              className="button-light full"
              key={p.id}
              onClick={() => {
                add(p);
                setQ("");
              }}
            >
              {p.name}
              <Plus size={16} />
            </button>
          ))}
    </div>
  );
}
function Files({
  conversations,
  demo,
  filter,
  fail,
}: {
  conversations: Conversation[];
  demo: boolean;
  filter: string;
  fail: (e: unknown) => void;
}) {
  const [files, setFiles] = useState<Attachment[]>([]),
    [loading, setLoading] = useState(!demo);
  useEffect(() => {
    if (demo || !conversations.length) {
      setLoading(false);
      return;
    }
    let alive = true;
    client()
      .from("attachments")
      .select("*")
      .in(
        "conversation_id",
        conversations.map((c) => c.id),
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (alive) {
          if (error) fail(error.message);
          else setFiles(data ?? []);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [demo, conversations, fail]);
  const list = files.filter(
    (f) =>
      filter === "Todos" ||
      (filter === "Imagens" && f.mime_type.startsWith("image/")) ||
      (filter === "Vídeos" && f.mime_type.startsWith("video/")) ||
      (filter === "Documentos" && !/^(image|video)\//.test(f.mime_type)),
  );
  return loading ? (
    <div className="loading-state">Carregando arquivos…</div>
  ) : list.length ? (
    <div className="files-grid">
      {list.map((f) => (
        <FileCard key={f.id} file={f} onError={fail} />
      ))}
    </div>
  ) : (
    <div className="empty-list">
      <FolderOpen size={32} />
      <strong>Nenhum arquivo por aqui.</strong>
      <p>Os anexos enviados nas conversas aparecem neste espaço.</p>
    </div>
  );
}
function CallHistory({
  demo,
  fail,
}: {
  demo: boolean;
  fail: (e: unknown) => void;
}) {
  const [calls, setCalls] = useState<
    { id: string; kind: string; state: string; created_at: string }[]
  >([]);
  useEffect(() => {
    if (demo) return;
    client()
      .from("calls")
      .select("id,kind,state,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) fail(error.message);
        else setCalls(data ?? []);
      });
  }, [demo, fail]);
  return (
    <div className="call-history">
      <h3>Histórico de chamadas</h3>
      {calls.length ? (
        calls.map((c) => (
          <div key={c.id}>
            <Phone size={18} />
            <strong>{c.kind === "video" ? "Vídeo" : "Áudio"}</strong>
            <span>
              {c.state} · {time(c.created_at)}
            </span>
          </div>
        ))
      ) : (
        <p className="muted">Nenhuma chamada registrada.</p>
      )}
    </div>
  );
}
