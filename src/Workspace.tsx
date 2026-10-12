import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    let alive = true;
    if (!demo && file.mime_type.startsWith("image/"))
      api
        .signedFile(file.path)
        .then((u) => {
          if (alive) setUrl(u);
        })
        .catch(onError);
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
    setDownloading(true);
    try {
      const blob = await api.downloadFile(file.path);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (e) {
      onError(e);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="file-card">
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            className="attachment-image"
            src={url}
            alt={file.name}
            loading="lazy"
          />
        </a>
      )}
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
    [drawer, setDrawer] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
      try {
        return localStorage.getItem("digitalx-sidebar-collapsed") === "true";
      } catch {
        return false;
      }
    }),
    [query, setQuery] = useState(""),
    [idSearch, setIdSearch] = useState(""),
    [idResult, setIdResult] = useState<Profile | null>(null),
    [idNotice, setIdNotice] = useState(""),
    [idSearching, setIdSearching] = useState(false),
    [filter, setFilter] = useState("Todos"),
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
  const bottom = useRef<HTMLDivElement>(null),
    inputFile = useRef<HTMLInputElement>(null),
    statusInput = useRef<HTMLInputElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    request = useRef(0),
    idLookupRequest = useRef(0),
    nearBottom = useRef(true),
    activeRef = useRef(activeId),
    screenRef = useRef(screen),
    mobileChatRef = useRef(mobileChat),
    convsRef = useRef(convs),
    selection = convs.find((c) => c.id === activeId),
    me = profile.id;
  useEffect(() => {
    activeRef.current = activeId;
    screenRef.current = screen;
    mobileChatRef.current = mobileChat;
    convsRef.current = convs;
  }, [activeId, convs, screen, mobileChat]);
  const chatVisible = () =>
    document.visibilityState === "visible" &&
    (screenRef.current === "Conversas" || screenRef.current === "Grupos") &&
    (window.matchMedia("(min-width: 761px)").matches || mobileChatRef.current);
  useEffect(() => {
    const pop = () => {
      const r = route();
      setScreen(r.screen as Screen);
      setMobileChat(Boolean(r.chat));
      if (r.chat) setActiveId(r.chat);
      setDrawer(false);
      setModal(null);
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
      const latest = await api.history(target);
      if (target !== activeRef.current || generation !== request.current) return;
      setMessages((previous) => {
        const unique = new Map(previous.map((message) => [message.id, message]));
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
      setMessages(activeId === "demo-crew" ? demoMessages : []);
      return;
    }
    setBusy(true);
    setMessages([]);
    api
      .history(activeId)
      .then((ms) => {
        if (n === request.current) {
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
  useEffect(() => {
    if (nearBottom.current)
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId, mobileChat]);
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
    setQuery("");
    setFilter("Todos");
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !file) || busy) return;
    if (demo) {
      notify("Prévia visual: entre com Google para enviar mensagens reais.");
      return;
    }
    const target = activeId!;
    await execute(async () => {
      await api.send(target, me, draft, file);
      if (activeRef.current === target) {
        setDraft("");
        setFile(undefined);
        const history = await api.history(target);
        if (activeRef.current === target) setMessages(history);
        await api.markRead(target);
      }
      await refresh();
    });
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
      <aside id="workspace-sidebar" className={`sidebar ${drawer ? "drawer-open" : ""}`}>
        <button className="side-brand" onClick={() => navigate("Conversas")}>
          <img src="/brand.svg" alt="" />
          <strong>DIGITALX</strong>
        </button>
        <div className="mobile-drawer-profile">
          <Avatar profile={profile} />
          <div>
            <strong>{profile.name}</strong>
            <small>@{profile.username}</small>
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
        <div className="conversation-list">
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" /> Carregando conversas…
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
                  ) : (
                    <CheckCheck size={13} />
                  )}
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
        <section className="detail-panel">
          <header className="detail-header">
            <IconButton
              label="Abrir menu"
              className="mobile-only"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
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
                          <small>@{p.username}</small>
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
                <p>@{profile.username}</p>
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
        <section className={`chat-panel ${!selection ? "no-selection" : ""}`}>
          {selection ? (
            <>
              <header className="chat-header">
                <IconButton
                  label="Voltar às conversas"
                  className="mobile-only"
                  onClick={() => {
                    move("Conversas", demo);
                    setMobileChat(false);
                  }}
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
                    placeholder="Buscar nas mensagens carregadas…"
                    value={messageQuery}
                    onChange={(e) => setMessageQuery(e.target.value)}
                  />
                </label>
              )}
              <div
                className="message-history"
                ref={scroll}
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
                <div className="date-separator">
                  <span>
                    {demo
                      ? "HOJE"
                      : messages[0]
                        ? new Date(messages[0].created_at).toLocaleDateString(
                            "pt-BR",
                            { day: "numeric", month: "long" },
                          )
                        : "HOJE"}
                  </span>
                </div>
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
                    .map((m, i) => {
                      const own = m.sender_id === me,
                        read = selection.members
                          .filter((x) => x.user_id !== me)
                          .every(
                            (x) =>
                              new Date(x.last_read_at) >=
                              new Date(m.created_at),
                          );
                      return (
                        <div
                          className={`message-row ${own ? "outgoing" : "incoming"}`}
                          key={m.id}
                        >
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
                          <article className="message-bubble">
                            {!own && (
                              <span className="message-author">
                                {m.sender?.name ?? "Membro"}
                              </span>
                            )}
                            <p>{m.body}</p>
                            {m.attachments.map((a) => (
                              <FileCard
                                key={a.id}
                                file={a}
                                demo={demo}
                                onError={demo ? (e) => notify(String(e)) : fail}
                              />
                            ))}
                            <span className="message-time">
                              {time(m.created_at)}
                              {own &&
                                (read ? (
                                  <CheckCheck size={12} />
                                ) : (
                                  <Check size={12} />
                                ))}
                            </span>
                          </article>
                        </div>
                      );
                    })
                )}
                <div ref={bottom} />
              </div>
              {showJump && (
                <button
                  className="jump-latest"
                  onClick={() => {
                    nearBottom.current = true;
                    bottom.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "end",
                    });
                    setShowJump(false);
                  }}
                >
                  <ArrowDown size={14} /> Mensagens recentes
                </button>
              )}
              <form className="composer" onSubmit={send}>
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
                  {file && (
                    <div className="selected-file">
                      <Paperclip size={14} />
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
                    placeholder="Digite sua mensagem…"
                    aria-label="Mensagem"
                    value={draft}
                    rows={1}
                    maxLength={8000}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.currentTarget.style.height = "auto";
                      e.currentTarget.style.height =
                        Math.min(e.currentTarget.scrollHeight, 100) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
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
      <nav className="mobile-bottom">
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
          className="mobile-create"
          aria-label="Nova conversa"
          onClick={() => openNew()}
        >
          <Plus size={23} />
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
      {modal && (
        <div className={`modal-overlay ${modal === "call" ? "pending-call-overlay" : ""}`} onClick={() => setModal(null)}>
          <section
            className={modal === "call" ? "secure-call-screen pending-call-screen" : `modal ${modal === "status" ? "status-modal" : ""}`}
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
                  <Avatar group={selection.is_group} size="large" />
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
                {selection.is_group && admin && (
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
