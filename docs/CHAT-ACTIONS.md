# Ações do chat

Mobile: segurar uma mensagem abre ações; deslizar para a direita prepara resposta. Desktop: botão direito, botão contextual ou Shift+F10. Rolagem vertical cancela o gesto. Menus, seleção e mídia respondem ao Voltar/Escape, mantêm foco e respeitam VisualViewport/safe areas.

- Respostas referenciam a mensagem original na mesma conversa; RLS também protege a referência. Originais apagados mostram aviso, inacessíveis mostram indisponibilidade.
- Uma reação por usuário/mensagem, entre seis emojis. Reagir novamente remove a própria reação; alterações chegam por Realtime.
- Edição somente do autor, de texto sem anexo, por 15 minutos. Apagar para todos somente pelo autor por 48 horas; mantém identificação/referências e substitui o conteúdo por aviso.
- Apagar para mim cria marcador privado; não exclui a mensagem dos outros participantes. Seleção/encaminhamento até 100 mensagens, somente entre conversas autorizadas.
- Encaminhamento copia os registros e mantém acesso ao arquivo privado através da conversa de destino. Apagar o original não destrói arquivos utilizados por cópias autorizadas. Conteúdo já copiado ou baixado não pode ser revogado.
- Envio e encaminhamento usam nonce, UNIQUE e locks no PostgreSQL para reconciliar tentativas sem duplicar. A UI diferencia envio pendente, falha, persistência e leitura; não afirma entrega sem confirmação. Tentativas pendentes são voláteis. Upload abandonado pode deixar objeto privado sem mensagem; limpeza desses objetos requer rotina futura.

Migrations 010–015 são aditivas e já aplicadas na instância existente. Chamadas antigas de envio e relacionamento público do remetente permanecem compatíveis com PWAs anteriores. A resposta usa relacionamento recursivo explícito com privilégios do invocador. Requisições Supabase usam `cache: no-store`; Service Worker continua limitado aos assets estáticos. Mensagens/arquivos ainda não possuem E2EE.

Validação: Playwright com rede interceptada cobre ações, erros, retry, Realtime, reload, mídia, teclado simulado e cinco viewports em Chromium, Edge e WebKit. `supabase/tests/chat-actions.sql` valida RLS/RPCs com três identidades temporárias dentro de transação revertida, incluindo negativas de autoria, associação, referências, arquivos e acesso anônimo. Não equivale a login Google real.

Separadamente, duas contas Google autorizadas validaram respostas, edição, reações, seleção/cópia, encaminhamento em lote, grupo novo e as duas exclusões de mensagens descartáveis autorizadas. Downloads reais PNG e TXT tiveram bytes/SHA-256 conferidos. Capturas e provas reais permanecem locais e não são versionadas. Teclado, instalação e gestos em aparelhos físicos continuam pendentes.
