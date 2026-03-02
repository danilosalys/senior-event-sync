# Prompt: Corrigir pontos de falha do senior-event-sync

Envie o texto abaixo para um agente de IA (Cursor, Copilot, etc.) para que ele implemente todas as correções no projeto **senior-event-sync**.

---

## Contexto

Este é o microserviço **senior-event-sync** (Node.js): sincroniza eventos entre o ERP Sênior e o Active Directory usando a tabela AD_EVENTS. Foi identificada uma análise de pontos de falha. Sua tarefa é **implementar todas as correções** listadas abaixo, mantendo o comportamento atual e a compatibilidade com o restante do sistema.

## Tarefas obrigatórias

Execute as correções na ordem sugerida. Para cada item, altere apenas o necessário e preserve o estilo e a estrutura do código existente.

---

### 1. Reconexão automática aos bancos de dados

**Problema:** As flags `isDatabaseConnected` e `isSeniorDatabaseConnected` são setadas apenas na inicialização. Se a conexão cair depois (rede, timeout, SQL Server reiniciado), o serviço continua achando que está conectado e as operações falham até reinício manual.

**Correção:**
- Em `src/app.js`: criar uma função (ex.: `checkAndReconnectPools`) que verifique se os pools estão realmente conectados (ex.: consulta leve tipo `SELECT 1`) e, em caso de falha, tente reconectar e atualize `isDatabaseConnected` / `isSeniorDatabaseDatabaseConnected`.
- Chamar essa verificação antes de cada execução dos crons (Sênior→AD e AD→Sênior), ou em intervalo periódico (ex.: a cada execução do cron).
- Usar os métodos de `dbConfig` e `seniorDbConfig` para recriar o pool quando necessário (já existe `recreateConnection()` nos configs; use ou adapte para o fluxo de reconexão).

---

### 2. Guard de concorrência em syncEmailADToSenior

**Problema:** `syncEmailADToSenior` não tem proteção contra execução simultânea. Se uma execução durar mais que o intervalo do cron (2 min), outra pode iniciar e duas instâncias processarem os mesmos eventos (race condition).

**Correção:**
- Em `src/controllers/seniorSyncController.js`: adicionar uma variável `isRunningEmailSync` (ou similar) e o mesmo padrão usado em `syncSeniorToAD`: no início da função, se já estiver rodando, logar e retornar; no `finally`, resetar a flag.

---

### 3. Usar maxEventsPerRun na sincronização AD → Sênior

**Problema:** `configManager` define `maxEventsPerRun` (ex.: 100), mas `eventModel.getCompletedEmailEvents()` não limita a quantidade. Com muitos eventos pendentes, uma execução pode carregar todos de uma vez (memória e lentidão).

**Correção:**
- Em `src/models/eventModel.js`: a função `getCompletedEmailEvents` deve aceitar um parâmetro opcional `limit` (número).
- Usar `SELECT TOP (@limit)` na query quando `limit` for informado (SQL Server).
- Em `src/controllers/seniorSyncController.js`: na chamada a `getCompletedEmailEvents`, passar `configManager.getConfig().service.maxEventsPerRun` (ou valor padrão 100 se não existir).

---

### 4. Graceful shutdown aguardando sync em andamento

**Problema:** No `gracefulShutdown`, os pools são fechados e o processo termina sem esperar o cron em execução terminar. Pode interromper no meio de uma escrita (eventos parcialmente criados ou update no Sênior sem marcar SYNCED_TO_SENIOR).

**Correção:**
- Em `src/app.js`: no `gracefulShutdown`, antes de fechar os pools:
  - Parar os agendamentos dos crons (já feito).
  - Aguardar até que nenhuma sincronização esteja em execução (consultar as flags `isRunning` e `isRunningEmailSync` do controller). Expor funções no controller para retornar se está rodando e/ou uma Promise que resolve quando estiver ocioso, ou fazer um loop com timeout (ex.: aguardar até 30 s) verificando as flags a cada 500 ms.
- Só então fechar os pools e chamar `process.exit(0)`.

---

### 5. Evitar duplicidade de eventos (Sênior → AD)

**Problema:** Eventos são criados com USERNAME = null. Não há verificação por SENIOR_EMPLOYEE_ID + tipo de evento antes de inserir. Se não houver constraint no banco, a mesma alteração no Sênior pode gerar vários eventos duplicados.

**Correção:**
- Em `src/models/eventModel.js`: adicionar uma função `hasPendingEventByEmployeeId(seniorEmployeeId, eventTypeCode)` (ou similar) que verifique se já existe evento com status PENDING, PROCESSING ou AWAITING_USERNAME para aquele SENIOR_EMPLOYEE_ID e EVENT_TYPE_CODE (join com AD_EVENT_TYPES pelo código).
- Em `src/services/eventCreatorService.js` (ou no controller, conforme fizer mais sentido): antes de chamar `eventModel.create`, chamar essa verificação; se já existir evento pendente para aquele employee + tipo, não criar novo (logar debug e retornar null ou ignorar).
- Garantir que a assinatura e o uso não quebrem o fluxo atual (eventCreatorService.createEvent continua sendo o ponto de entrada).

---

### 6. Retry com backoff em operações críticas

**Problema:** Nenhuma operação tem retry para falhas transitórias (rede, timeout, deadlock). Uma falha passageira pode fazer o dado ser perdido ou o evento ficar sem ser marcado como sincronizado.

**Correção:**
- Criar um utilitário em `src/utils/retry.js` (ou nome similar): função `withRetry(fn, options)` com opções como `maxRetries` (ex.: 3), `delayMs` (ex.: 1000), `backoff` (ex.: exponencial). Em caso de rejeição da Promise, reexecutar após o delay até esgotar tentativas; se for erro de conexão/timeout (verificar código ou mensagem), considerar como retentável.
- Aplicar retry nas seguintes chamadas (com 2–3 tentativas e delay razoável):
  - `seniorQueryService.executeQuery` (no controller, ao chamar a query do Sênior).
  - `eventModel.create` (no eventCreatorService ou no controller).
  - `seniorUpdateService.updateEmail` e `eventModel.markAsSyncedToSenior` no fluxo AD → Sênior (no controller).
- Não aplicar retry em erros de validação (ex.: EVENT_TYPE_CODE inexistente, matrícula obrigatória). Usar retry apenas para erros que pareçam transitórios (rede, timeout, deadlock, connection closed).

---

### 7. Marcar SYNCED_TO_SENIOR com retry e tratamento explícito

**Problema:** Se `updateEmail` no Sênior tiver sucesso mas `markAsSyncedToSenior` falhar (ex.: conexão AD_Sync cai), o evento nunca é marcado e fica sendo reprocessado.

**Correção:**
- Além do retry já pedido no item 6 para `markAsSyncedToSenior`, em `src/controllers/seniorSyncController.js`: no fluxo AD → Sênior, após `updateEmail` retornar true, tratar explicitamente falha em `markAsSyncedToSenior`: em caso de erro após retries, logar como erro crítico com o ID do evento (para possível correção manual ou reprocessamento futuro). Garantir que o retry envolva apenas a marcação, sem reexecutar o update no Sênior (para não duplicar atualizações).

---

### 8. Configuração e conexão na inicialização

**Problema:** Os pools são criados no require dos configs usando `configManager.getConfig()`. Se a config estiver incompleta ou a descriptografia falhar, o serviço pode subir com credenciais inválidas.

**Correção:**
- Em `src/app.js`, na função `initializeConnections`: se a conexão falhar, considerar falha crítica e não iniciar os crons (ou não marcar o serviço como “iniciado”). Opcional: validar `configManager.getConfig()` antes (ex.: chamar `configManager.validateConfig` se existir) e falhar rápido com mensagem clara.
- Manter o comportamento de “tentar conectar e logar”; a mudança é: em ambiente de produção, se não houver conexão com AD_Sync ou Sênior na subida, fazer `process.exit(1)` após logar o erro, em vez de continuar rodando sem conexão. Se preferir manter compatibilidade com “serviço sobe mesmo sem banco”, adicionar um comentário no código explicando e deixar um aviso em log quando as conexões falharem na inicialização.

*(Escolha uma das duas abordagens e documente no código.)*

---

### 9. Documentar e validar estrutura do Sênior (updateEmail)

**Problema:** `seniorUpdateService.updateEmail` usa tabela/colunas fixas (COLABORADORES, MATRICULA, EMAIL, DATA_ATUALIZACAO). Se o banco Sênior tiver estrutura diferente, todas as atualizações falham.

**Correção:**
- Em `src/services/seniorUpdateService.js`: adicionar comentário no topo da função descrevendo o schema esperado (tabela, colunas, tipo de dado) e que a query deve ser ajustada ao ambiente real.
- Opcional: ler tabela e coluna de config (ex.: `config.seniorDatabase.emailUpdateTable`, `emailUpdateColumn`) com fallback para os valores atuais, para facilitar ajuste sem mudar código. Se implementar config, documentar no README ou em comentário.

---

## Entregáveis

- Código alterado em: `src/app.js`, `src/controllers/seniorSyncController.js`, `src/models/eventModel.js`, `src/services/eventCreatorService.js`, `src/services/seniorUpdateService.js` e, se criado, `src/utils/retry.js`.
- Nenhuma alteração que quebre a API existente ou o contrato com o banco (AD_EVENTS, AD_EVENT_TYPES) além do uso de `maxEventsPerRun` e da nova verificação de duplicidade.
- Comentários breves onde a lógica de negócio mudar (reconexão, retry, guard, shutdown).
- Se criar novo arquivo (`retry.js`), mantê-lo simples e sem dependências extras.

## Ordem sugerida de implementação

1. Guard em `syncEmailADToSenior` (item 2).  
2. `maxEventsPerRun` em `getCompletedEmailEvents` (item 3).  
3. Duplicidade por SENIOR_EMPLOYEE_ID (item 5).  
4. Utilitário de retry e aplicação (itens 6 e 7).  
5. Reconexão (item 1).  
6. Graceful shutdown (item 4).  
7. Inicialização/config (item 8).  
8. Documentação do updateEmail no Sênior (item 9).

Ao final, rode o serviço com `npm start` (ou `npm run dev`) e verifique se não há erros de sintaxe ou require. Não é obrigatório implementar testes automatizados neste prompt; foque em aplicar todas as correções acima.
