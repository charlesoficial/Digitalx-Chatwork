import React, { lazy, Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { ArrowUpRight, WifiOff } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./style.css";
import "./mobile.css";
import { observeViewport } from './lib/viewport';
import PwaUpdate from "./PwaUpdate";
const Workspace = lazy(() => import("./Workspace"));
const AuthenticatedApp = lazy(() => import("./ProfileOnboarding"));
function Root() {
  useEffect(observeViewport, []);
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [demo, setDemo] = useState(
      import.meta.env.DEV && location.pathname.startsWith("/preview"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    if (!supabase) {
      setLoading(false);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", on);
      };
    }
    const auth = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setDemo(false);
        if (!location.pathname.startsWith("/app/"))
          history.replaceState(null, "", "/app/conversations");
      }
      setLoading(false);
    });
    supabase.auth
      .initialize()
      .then(async ({ error: initializationError }) => {
        if (initializationError) {
          setError(
            "Não foi possível concluir o login Google. A autorização foi cancelada ou expirou. Tente entrar novamente.",
          );
          history.replaceState(null, "", "/");
        }
        return supabase!.auth.getSession();
      })
      .then(({ data, error }) => {
        setSession(data.session);
        if (data.session) {
          setDemo(false);
          if (!location.pathname.startsWith("/app/"))
            history.replaceState(null, "", "/app/conversations");
        }
        setLoading(false);
        if (error) setError(error.message);
      })
      .catch((e) => {
        setLoading(false);
        setError(e.message);
      });
    return () => {
      auth.data.subscription.unsubscribe();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  async function login() {
    if (!supabase) {
      setError(
        "Conexão pendente. Configure as variáveis de ambiente do Supabase.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
      );
      if (!response.ok)
        throw new Error(
          "Não foi possível consultar a autenticação. Tente novamente.",
        );
      const settings = await response.json();
      if (!settings.external?.google)
        throw new Error(
          "O login Google ainda precisa ser configurado no Supabase. Consulte as instruções de Google OAuth do projeto.",
        );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível entrar. Tente novamente.",
      );
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="splash">
        <Brand />
        <small>JUNTOS SOMOS MAIS FORTES</small>
        <div className="loading-line" />
      </div>
    );
  return (
    <>
      <PwaUpdate />
      {!online && (
        <div className="offline">
          <WifiOff size={15} /> Sem conexão. Suas mensagens serão enviadas
          quando você tentar novamente online.
        </div>
      )}
      {session || demo ? (
        <Suspense
          fallback={
            <div className="splash">
              <Brand />
            </div>
          }
        >
          {session ? <AuthenticatedApp key={session.user.id} session={session} onExit={() => {
            history.replaceState(null, "", "/"); setDemo(false);
          }} /> : <Workspace
            key="preview"
            session={session}
            demo={!session && demo}
            onExit={() => {
              history.replaceState(null, "", "/");
              setDemo(false);
            }}
          />}
        </Suspense>
      ) : (
        <main className="login-page">
          <section className="login-art">
            <span className="art-index">EST. 2026 / DIGITALX NETWORK</span>
            <div className="art-words">
              IDEIAS.
              <br />
              PESSOAS.
              <br />
              PROJETOS.
              <br />
              <span>RESULTADOS.</span>
            </div>
            <div className="art-bottom">
              CONEXÕES REAIS. POSSIBILIDADES INFINITAS.
              <ArrowUpRight size={28} />
            </div>
          </section>
          <section className="login-content">
            <div className="login-top">
              <span>MAIS QUE MENSAGENS.</span>
              <span>CONEXÕES REAIS.</span>
            </div>
            <div className="login-center">
              <Brand />
              <p className="slogan">JUNTOS SOMOS MAIS FORTES</p>
              <div className="login-welcome">
                <span className="eyebrow">SEU PRÓXIMO PROJETO COMEÇA AQUI</span>
                <h1>
                  Bem-vindo de volta<span>.</span>
                </h1>
                <p>
                  Conecte suas ideias. Encontre sua comunidade.
                  <br />
                  Acesse o DIGITALX com sua conta Google.
                </p>
              </div>
              <button className="google-button" onClick={login} disabled={busy}>
                <span className="google-g" aria-hidden="true">G</span>
                {busy ? "Conectando…" : "Entrar com Google"}
                <ArrowUpRight size={18} />
              </button>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <p className="login-note">Uma conta. Todas as suas conexões.</p>
              {import.meta.env.DEV && (
                <>
                  <button
                    className="demo-link"
                    onClick={() => {
                      history.pushState(null, "", "/preview/conversations");
                      setDemo(true);
                    }}
                  >
                    Explorar prévia visual <ArrowUpRight size={14} />
                  </button>
                  <small className="demo-explainer">
                    Prévia de desenvolvimento com dados demonstrativos.
                  </small>
                </>
              )}
            </div>
            <footer className="login-footer">
              <span>© 2026 DIGITALX</span>
              <span>FEITO PARA CONECTAR.</span>
            </footer>
          </section>
        </main>
      )}
    </>
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <img src="/brand.svg" alt="Símbolo DIGITALX" />
      <strong>DIGITALX</strong>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
