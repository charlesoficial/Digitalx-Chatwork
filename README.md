# DIGITALX

Plataforma WEB + PWA de comunicação em React, TypeScript, Vite, Tailwind, Lucide e Supabase. Interface própria para desktop e celular, com identidade DIGITALX e slogan **Juntos somos mais fortes**.

Produção: https://digitalx-chatwork.vercel.app/

## Executar

```powershell
npm ci
Copy-Item .env.example .env.local
# Preencha somente URL e chave pública publishable do Supabase.
npm run dev
```

Abra http://localhost:5173. Preserve seu `.env.local` nas instalações já configuradas. A prévia demonstrativa existe somente em desenvolvimento; o build publicado exige autenticação e usa os dados reais do Supabase.

## Funcionalidades

- Login Google/Supabase com PKCE, sessão persistente e perfil automático.
- Primeiro login em tela única para foto, nome e bio.
- Conversas individuais/grupos, histórico, mensagens em tempo real, leituras e presença.
- Grupo principal DIGITALX • NETWORK com selo e entrada automática de novos usuários.
- ID DIGITALX permanente: nove dígitos começando por 1, único, gerado no backend; cópia, busca exata com limites e conversa pelo ID.
- Membros e fotos de remetentes do grupo abrem a conversa individual existente.
- Anexos privados, upload/download e visualização; validação e autorização por RLS.
- Perfis, contatos, configurações, status e navegação responsiva.
- Mobile com navegação compacta, retorno preservando filtros/rolagem, chat legível e campo expansível ajustado ao VisualViewport.
- PWA com manifest, ícones, instalação compatível, safe areas e Service Worker apenas para arquivos estáticos.
- Chamadas individuais P2P em tela única com DTLS-SRTP e verificação bilateral; integração nativa testada com áudio sintético. Voz entre contas reais ainda requer dispositivo com microfone e validação específica.

**Pendências:** chamadas em grupo/vídeo, TURN para redes diferentes e E2EE de mensagens/arquivos. Mensagens e anexos atuais usam Auth/RLS/TLS e ainda não possuem E2EE. [Arquitetura e limites](docs/SECURE-COMMUNICATION.md).

## Banco e segurança

Migrations organizadas em `supabase/migrations/`. O projeto Supabase existente é `mlsnyxzirlzpgkpdfmma`; as migrations 001–009 já foram aplicadas nele. **Não reaplique nesse banco.** Para outra instância vazia, revisar o conjunto antes de executar: a migration 005 referencia o grupo principal já existente no projeto original.

RLS, funções autenticadas e Storage privado protegem dados e operações. ID não é credencial de login. [Detalhes do ID](docs/DIGITALX-ID.md).

Nunca incluir Client Secret do Google, service_role ou outras chaves privadas no frontend. `.env.local`, capturas, relatórios e scripts com identidades reais não são versionados. O cofre de continuidade permanece fora deste repositório.

## Testes

```powershell
npm run typecheck
npm run lint
npm test -- --workers=1
```

Última suíte local em 11/10/2026: **73 aprovados / 3 skips intencionais**, build/typecheck/lint aprovados. Testes de interface usam prévia ou rede interceptada; o teste nativo de áudio usa identidades fixture e microfones sintéticos. Os três skips correspondem a essa integração não repetida em Android/iPhone/Edge.

Google, perfis, mensagens, grupos e anexos foram também validados entre duas contas reais no Edge local, separadamente. Login e mensagens em produção também foram conferidos com sessões reais. A missão mobile incluiu cinco viewports, regressões de navegação e simulação de VisualViewport; instalação e teclado em dispositivos físicos permanecem pendentes. Testes SQL genéricos em `supabase/tests/` usam rollback; relatórios e provas ligados às contas reais permanecem locais.

## Deploy

Importar este repositório na Vercel com raiz `./`, framework Vite e Node 24. Configurar as duas variáveis públicas de `.env.example`. `vercel.json` preserva rotas da SPA, cabeçalhos de segurança e cache estático.

[Publicação e Google OAuth](docs/DEPLOY-VERCEL.md) explica os redirects do Supabase e o callback Google. O Client Secret deve ser configurado diretamente no provedor Google do Supabase. O callback Google é `https://mlsnyxzirlzpgkpdfmma.supabase.co/auth/v1/callback`; o retorno à aplicação é `https://DOMINIO/auth/callback`.

No Android, Instalar/Adicionar à tela inicial; no iPhone, Compartilhar → Adicionar à Tela de Início. O site precisa de HTTPS. Instalação e comportamento físico ainda devem ser conferidos nos dispositivos.
