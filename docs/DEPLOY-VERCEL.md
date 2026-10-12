# Publicação na Vercel

Importe `charlesoficial/Digitalx-Chatwork` na conta correta. A raiz é `./`, framework Vite, Node 24, `npm ci`, `npm run build`, saída `dist`. `vercel.json` configura fallback de rotas, cabeçalhos de segurança e revalidação do HTML/Service Worker.

Configure somente as variáveis públicas de `.env.example`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave publishable é pública por definição; a segurança depende de Auth/RLS. Não use service_role, Client Secret do Google, chaves LiveKit ou tokens administrativos no frontend. Não copie `.env.local` para o GitHub.

Depois de receber o domínio HTTPS definitivo:

1. Supabase → Authentication → URL Configuration: Site URL = origem HTTPS publicada; adicionar `https://DOMINIO/auth/callback` aos Redirect URLs, preservando localhost e outras URLs válidas.
2. Google Cloud → cliente DIGITALX WEB no projeto existente: preservar o callback `https://mlsnyxzirlzpgkpdfmma.supabase.co/auth/v1/callback`. O login usa esse callback do Supabase, não a rota React. Caso configure origens JavaScript, acrescentar somente a origem HTTPS definitiva.
3. Manter os escopos básicos openid/email/profile. Usuários autorizados devem estar na audiência de teste enquanto o consentimento Google estiver em Testing.
4. Validar login, retorno ao app, perfil, reload/logout e mensagens entre contas reais na origem publicada. Sessões/chaves locais pertencem à origem; o login feito em localhost não autentica o domínio novo.

Antes de anunciar a publicação, conferir HTTP 200 nas rotas profundas, MIME correto dos arquivos JS e do Service Worker, manifest/ícones, CSP, ausência da prévia demonstrativa e cache apenas estático. Instalação PWA e teclado/safe areas ainda exigem Android/iPhone físicos. Chamadas em grupo/vídeo, TURN e E2EE de mensagens/arquivos continuam pendentes; publicação não conclui esses recursos.

Referências: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite), [configuração Vercel](https://vercel.com/docs/project-configuration/vercel-json), [Redirect URLs do Supabase](https://supabase.com/docs/guides/auth/redirect-urls).
