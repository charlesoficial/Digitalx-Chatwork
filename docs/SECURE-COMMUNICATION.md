# Comunicação protegida — implementação e limites

## Estado atual

Ligações **individuais P2P** usam WebRTC nativo, DTLS-SRTP e canal SCTP/DTLS. Não existe SFU na rota dessas chamadas. O navegador gera o certificado ECDSA/P-256; sua chave privada não passa pelo código de sinalização nem pelo Supabase. O backend recebe oferta/resposta SDP, fingerprints públicos, ICE, participantes, estado e horários. Não recebe áudio nem chaves de mídia. Sem gravação, transcrição ou fallback para RTP sem proteção.

**Mensagens, arquivos e status existentes ainda não têm E2EE.** Continuam protegidos por Auth/RLS/Storage privado e transporte TLS. Não apagar, reclassificar ou chamar esse histórico de criptografado de ponta a ponta.

## Verificação obrigatória

Um certificado por conta/dispositivo/origem fica no IndexedDB, como RTCCertificate serializável pelo navegador. Não é exportado como PEM/JSON. Navegador sem suporte ao armazenamento/certificado falha com segurança. Limpeza do site, novo navegador, mudança de origem ou expiração cria uma nova identidade. Logout não transfere a identidade para outra conta.

O código exibido é o SHA-256 **completo**, contextualizado com versão, UUID da chamada, duas identidades de usuário, dispositivos e fingerprints DTLS. Cada lado o calcula localmente. Deve ser comparado **fora do DIGITALX** (pessoalmente ou em canal independente confiável). Não comparar enviando o código pelo próprio chat controlado pelo mesmo servidor. Ambos confirmam; a confirmação do outro lado chega exclusivamente no canal DTLS da conexão, vinculada ao código daquela chamada. Confirmações de outra sessão são rejeitadas.

Antes disso, o áudio local está desabilitado e nenhum track de microfone está associado ao sender. Só depois de conexão, DTLS conectado, canal aberto e duas confirmações, `replaceTrack` associa o microfone. Falhas/fechamento/rede interrompida retiram a mídia; estado não confirmado não mostra selo E2EE. Fingerprint público verificado é fixado localmente; troca conhecida de certificado ou dispositivo sinaliza mudança e exige nova comparação. A aplicação exige comparação em cada ligação, inclusive com identidade já conhecida. Isso é mais trabalhoso que um mensageiro com protocolo completo de confiança entre dispositivos.

## Ameaças e garantias

- Servidor de sinalização malicioso pode negar chamadas, modificar metadados ou tentar substituir SDP. Uma substituição de certificado altera o código; se os usuários compararem o código completo pelo canal independente, a intermediação é detectada antes de liberar a voz. DTLS verifica o certificado apresentado contra o fingerprint negociado. Não confiar apenas no UUID Google ou em RLS para autenticar chaves.
- Remoção de participante revoga autorização na próxima consulta, a cada 2 segundos. Uma falha dessa consulta encerra a chamada; não há renovação insegura de autorização.
- O servidor conhece participantes, horários e dados de ICE. Sem TURN, os pares podem conhecer endereços de rede um do outro. A implementação atual usa ICE host; **redes diferentes/NAT restritivo precisam de STUN/TURN configurado e testado**, com credenciais TURN curtas emitidas apenas a participantes. Nenhum serviço externo implícito foi criado.
- O canal usa a troca de chaves DTLS do navegador. Certificado de identidade não é a chave SRTP da sessão. Não prometer forward secrecy/recuperação pós-comprometimento além do que a suíte DTLS negociada comprova; registrar cifras via getStats, sem exportar segredos. Reiniciar uma ligação refaz o contexto e a verificação; reconexão automática com nova identidade não é permitida.
- Usuário/dispositivo comprometido pode copiar o áudio que recebe. JavaScript malicioso na mesma origem também pode capturar o microfone antes da proteção ou abusar de handles privados. Chaves não extraíveis não resolvem XSS/publicação comprometida. O operador que entrega um bundle malicioso pode quebrar as garantias do cliente web; auditoria independente, revisão/release assinado, hashes de artefatos e transparência de publicação são etapas futuras.
- CSP de produção restringe scripts à própria origem, bloqueia objetos/frames, limita endpoints e workers; estilo inline continua necessário para componentes existentes. Dev não aplica script CSP por causa do HMR. `_headers` é modelo para hospedagens que o suportam; a publicação precisa verificar os cabeçalhos realmente servidos. Sem scripts de terceiros, dependência criptográfica nova ou segredo em cache do Service Worker.

## Backend

Migration 009 cria `secure_audio_calls` com RLS e **sem grants diretos** anon/authenticated. RPCs autenticadas validam a DM de exatamente dois membros, vinculação de autor, estados, expiração e tamanho/formato de SDP. Uma resposta só é aceita do destinatário uma vez. Locks dos dois participantes evitam chamadas simultâneas; limite 6 tentativas/minuto por autor. Não é proteção contra abuso por muitas contas. Ring expira em 60s, verificação no cliente em 90s, sessão no servidor em 2h. Encerramento retira SDP/ICE do registro; timeout sem cliente exige rotina futura de retenção. Identidades privadas não estão nesta tabela.

## Grupo — próximo componente obrigatório

LiveKit SFU com E2EE de aplicação/Encoded Transforms, bloqueando publicação e assinatura de mídia até confirmar proteção nos dispositivos. O [SDK LiveKit](https://docs.livekit.io/transport/encryption/) exige distribuição de chaves; gerar uma chave no servidor e mandá-la com token **não** satisfaz confidencialidade contra o operador.

Integrar um protocolo mantido de grupos e dispositivos, com biblioteca auditada, antes de ativar grupos: avaliar MLS ([OpenMLS/WASM](https://book.openmls.tech/user_manual/wasm.html)) ou stack Matrix com [Rust crypto/WASM](https://matrix-org.github.io/matrix-js-sdk/index.html). Não montar um protocolo próprio de envelopes/chaves compartilhadas. Ainda faltam a prova de integração, distribuição autenticada, confirmação de membros, epochs, rotação na entrada/saída, remoção sem acesso futuro e política sem histórico retroativo. Não basta instalar o SDK. Código existente de token LiveKit permanece **não implantado**, sem UI que inicie mídia; nenhuma infraestrutura paga criada.

## Mensagens, arquivos e áudios gravados

Usar o mesmo protocolo escolhido para identidades/dispositivos e sessões assíncronas, com recuperação por dispositivo verificado e backup que o operador não consiga abrir. DMs e grupos precisam de versões explícitas de evento criptografado; buscas/última mensagem passam a ser locais. Storage recebe ciphertext autenticado; nome/tipo e chave do anexo vão **dentro** do evento E2EE. Voz gravada é arquivo, não sessão WebRTC.

Migração segura: manter histórico legado identificado; iniciar uma época E2EE nova somente quando os membros necessários tiverem dispositivos verificados. Nenhum fallback de envio em claro após habilitar a época. Se desejar migrar histórico antigo, um dispositivo autorizado baixa e reenvia ciphertext em lote com relatório de integridade, sem apagar originais antes de revisão. Isso não desfaz acesso anterior do servidor, backups, URLs assinadas já emitidas nem cópias dos destinatários. Não compartilhar chaves antigas com membros novos/removidos. Esse caminho ainda não foi implementado.

## Validação

Testes de funções: ausência/mistura/fingerprint inválido, RTP em claro, mudança de sessão/usuário/dispositivo e todas as combinações do bloqueio de áudio. Teste nativo Chromium: duas identidades **fixture**, dois contextos, microfones sintéticos, DTLS real, comparação dos códigos e RTP bidirecional após duas confirmações, mute e fim. Não equivale a duas contas Google ou confirmação auditiva humana.

Teste SQL `secure-audio.sql`: autorização/estado/replay/grupo bloqueado/remoção com rollback. Não usa nem exporta JWT de contas reais. Conferir resultados atuais no cérebro do projeto. Aparelhos físicos, Safari/Firefox de chamada, TURN em redes diferentes, captura de tráfego no relay e auditoria independente precisam de validação específica; não inferir esses resultados dos testes de interface.

Referências: [arquitetura WebRTC — RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html), [RTCCertificate/WebRTC — W3C](https://www.w3.org/TR/webrtc/), [LiveKit E2EE](https://docs.livekit.io/transport/encryption/).
