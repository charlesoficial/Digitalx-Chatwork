import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Camera, Check, LoaderCircle } from "lucide-react";
import * as api from "./lib/api";
import { supabase } from "./lib/supabase";
import { useAvatarUrl } from "./lib/avatar";
import type { Profile } from "./types";

const Workspace = lazy(() => import("./Workspace"));
type SetupProfile = Profile & { onboarding_completed_at: string | null };
const message = (e: unknown) => e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.";

export default function AuthenticatedApp({ session, onExit }: { session: Session; onExit: () => void }) {
  const [profile, setProfile] = useState<SetupProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.getOnboardingProfile().then(data => { if (active) { setProfile(data); setError(""); } })
      .catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [attempt]);
  async function exit() {
    const result = await supabase!.auth.signOut();
    if (result.error) { setError(result.error.message); return; }
    onExit();
  }
  if (profile?.onboarding_completed_at) return <Suspense fallback={<SetupLoading />}>
    <Workspace session={session} initialProfile={profile} demo={false} onExit={onExit} />
  </Suspense>;
  if (!profile) return <div className="setup-loading"><img src="/brand.svg" alt="DIGITALX" />
    {error ? <><p role="alert">{error}</p><button className="primary" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Tentar novamente</button><button onClick={exit}>Sair da conta</button></> : <><LoaderCircle className="spin" /><p>Preparando seu perfil…</p></>}
  </div>;
  return <SetupForm profile={profile} onComplete={data => {
    history.replaceState(null, "", "/app/conversations");
    setProfile(data);
  }} onExit={exit} serverError={error} />;
}

function SetupLoading() { return <div className="setup-loading"><img src="/brand.svg" alt="DIGITALX" /><LoaderCircle className="spin" /></div>; }

function SetupForm({ profile, onComplete, onExit, serverError }: { profile: SetupProfile; onComplete: (p: SetupProfile) => void; onExit: () => void; serverError: string }) {
  const [name, setName] = useState(profile.name), [bio, setBio] = useState(profile.bio ?? "");
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; path: string } | null>(null);
  const avatar = useAvatarUrl(profile.avatar_url);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      if (file && uploaded.current?.file !== file) {
        const path = await api.uploadAvatar(profile.id, file);
        uploaded.current = { file, path };
      }
      const result = await api.completeOnboarding(name.trim(), bio, file ? uploaded.current!.path : null);
      if (!result.onboarding_completed_at) throw new Error("O perfil não foi confirmado. Tente novamente.");
      if (file) await api.cleanupAvatar(profile.avatar_url);
      onComplete(result);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <main className="setup-page">
    <section className="setup-content">
      <header className="setup-header"><span>DIGITALX <i>NETWORK</i></span><button onClick={onExit} disabled={busy}>Sair da conta</button></header>
      <form className="setup-form" onSubmit={save} aria-labelledby="setup-title">
        <div className="eyebrow">BEM-VINDO À DIGITALX</div>
        <h1 id="setup-title">Seu perfil</h1>
        <p className="setup-intro">Como você quer aparecer para suas conexões?</p>
        <div className="setup-photo-area">
          <button type="button" className="setup-photo" aria-label="Escolher foto de perfil" disabled={busy} onClick={() => input.current?.click()}>
            {preview || avatar ? <img src={preview ?? avatar!} alt="Foto de perfil" /> : <span>{name.trim().slice(0, 1).toUpperCase() || "D"}</span>}
            <i><Camera size={19} /></i>
          </button>
          <div><button type="button" className="setup-photo-link" disabled={busy} onClick={() => input.current?.click()}>Escolher foto</button><small>JPG, PNG ou WebP · até 5 MB</small>
          {file && <button type="button" className="setup-photo-reset" disabled={busy} onClick={() => { setFile(null); setPreview(null); }}>Usar foto atual</button>}</div>
        </div>
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
          const selected = event.target.files?.[0]; event.target.value = ""; if (!selected) return;
          try { api.validateAvatar(selected); setFile(selected); setError(""); } catch (e) { setError(message(e)); }
        }} />
        <label htmlFor="setup-name">Seu nome <span>{name.length}/80</span></label>
        <input id="setup-name" name="name" autoComplete="name" placeholder="Como podemos chamar você?" maxLength={80} required value={name} disabled={busy} onChange={e => setName(e.target.value)} />
        <label htmlFor="setup-bio">Bio <span>Opcional · {bio.length}/240</span></label>
        <textarea id="setup-bio" name="bio" placeholder="Conte um pouco sobre você…" maxLength={240} rows={3} value={bio} disabled={busy} onChange={e => setBio(e.target.value)} />
        <p className="setup-hint"><Check size={14} /> Você pode editar seu perfil depois.</p>
        {(error || serverError) && <p className="setup-error" role="alert">{error || serverError}</p>}
        <button className="setup-submit" type="submit" disabled={busy || !name.trim()}>{busy ? <><LoaderCircle className="spin" size={18} /> Salvando seu perfil…</> : <>Entrar no DIGITALX <ArrowRight size={19} /></>}</button>
        <p className="setup-id">ID DIGITALX <strong>{profile.digitalx_id}</strong><span>Seu número único permanece o mesmo.</span></p>
      </form>
      <footer className="setup-footer">MAIS QUE MENSAGENS. CONEXÕES REAIS.</footer>
    </section>
  </main>;
}
