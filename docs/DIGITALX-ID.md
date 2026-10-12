# ID DIGITALX

Implementado pela migration `202610110006_digitalx_id.sql`, aplicada no projeto `mlsnyxzirlzpgkpdfmma`. Não reaplicar.

Cada perfil recebe automaticamente um número em texto no formato `1XXXXXXXX`. O UUID continua sendo a identidade de autenticação; o número público serve para encontrar pessoas. O próprio usuário lê seu ID por RPC, copia no perfil e pesquisa outra pessoa em Contatos → Adicionar pelo ID.

Geração por `extensions.gen_random_bytes(4)` com rejeição de valores que causariam viés. A tabela interna reserva o número com chave única; `ON CONFLICT DO NOTHING` trata disputas simultâneas e o gerador tenta outro número. O perfil também tem UNIQUE, NOT NULL, CHECK e trigger que rejeita alterações. Usuários atuais receberam backfill. O gerador e o alocador não possuem execução concedida ao frontend.

O diretório geral conserva somente seus campos públicos anteriores, sem permissão SELECT/UPDATE no novo ID. A RPC de busca exige sessão e número completo, retorna somente UUID, nome, avatar e o número informado. RLS e revogações protegem registro e contador. Limites por conta: 10/minuto e 60/hora, inclusive buscas sem resultado; o contador usa UPSERT atômico. Não é proteção contra uma rede de múltiplas contas abusivas; o ID nunca autoriza login ou acesso às mensagens.

Testes no PostgreSQL com rollback: geração de cadastro, backfill, imutabilidade, colisão forçada, privilégios, formato e quotas. Duas sessões SQL simultâneas criaram 50 usuários cada e passaram; nenhuma conta de teste permanece. Testes HTTP anônimos: 4/4 acessos negados. Os testes Playwright usam interceptação explícita; não são prova de RLS ou login Google.

Contas reais Charles e Studio: IDs diferentes, cópia real, busca cruzada com nome/avatar e abertura da mesma conversa individual existente. O número permaneceu após atualizar a página, alteração/restauração de bio e logout/novo Google login. Evidências em `evidence/id-real-*.jpg`, `id-concurrency-*.jpg` e `id-public-boundary.json`. Emulação mobile não equivale a teclado ou aparelho físico.
