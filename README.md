# Senior Event Sync

Microserviço para sincronização de eventos do Sênior com Active Directory.

## Descrição

Este microserviço possui duas responsabilidades principais:

1. **Sincronização Sênior → AD**: Executa queries SQL no banco de dados Sênior, identifica mudanças (cargo, nome, matrícula, demissão, etc.) e cria eventos na tabela `AD_EVENTS` para serem processados pelo `imediato-ad-sync`.

2. **Sincronização AD → Sênior (Email)**: Monitora eventos de email completados no `AD_EVENTS` e atualiza o email correspondente no banco de dados Sênior.

## Arquitetura

- **Microserviço independente** que trabalha em conjunto com `imediato-ad-sync`
- **Queries SQL dinâmicas** carregadas da pasta `src/queries/`
- **Dois cron jobs independentes** para cada direção de sincronização
- **API REST opcional** para monitoramento
- **Processamento assíncrono** via cron jobs

## Fluxo férias e reativação

Para o cenário **entrada em férias** (desativar no AD) e **retorno de férias** (reativar no AD), o disparo da reativação fica no **senior-event-sync** (query que detecta retorno no Sênior, ex.: `r034fun.SITAFA = 1`) e a execução no **imediato-ad-sync** (evento `USER_ENABLE`). Detalhes e boas práticas: **[docs/FLUXO_FERIAS_E_REATIVACAO.md](docs/FLUXO_FERIAS_E_REATIVACAO.md)**.

## Estrutura do Projeto

```
senior-event-sync/
├── src/
│   ├── app.js                    # Aplicação principal
│   ├── api/                      # Rotas REST (status)
│   ├── controllers/              # Controladores (sincronização)
│   ├── services/                 # Serviços de negócio
│   │   ├── seniorQueryService.js      # Executa queries no Sênior
│   │   ├── eventCreatorService.js     # Cria eventos em AD_EVENTS
│   │   ├── seniorUpdateService.js     # Atualiza dados no Sênior
│   │   └── queryLoaderService.js      # Carrega queries SQL
│   ├── models/                   # Modelos de banco
│   ├── queries/                  # Queries SQL do Sênior
│   ├── config/                   # Configurações
│   └── utils/                    # Utilitários
├── scripts/                      # Scripts de instalação
└── logs/                         # Logs do serviço
```

## Instalação

1. Instalar dependências:
```bash
npm install
```

2. Configurar variáveis de ambiente:
```bash
copy .env.example .env
# Editar .env com suas credenciais
```

3. Configurar queries SQL:
   - Editar ou criar arquivos `.js` na pasta `src/queries/`
   - Cada query deve exportar um objeto com `EVENT_TYPE_CODE`, `SQL` e `DESCRIPTION`

4. Instalar como serviço Windows:
```bash
npm run install-service
```

## Configuração

### Variáveis de Ambiente (`.env`)

```env
# Banco de dados AD_Sync (compartilhado)
DB_SERVER=localhost
DB_USER=sa
DB_PASSWORD=
DB_DATABASE=AD_Sync
DB_PORT=1433

# Banco de dados Sênior
SENIOR_DB_SERVER=senior-server
SENIOR_DB_USER=senior_user
SENIOR_DB_PASSWORD=
SENIOR_DB_DATABASE=SeniorDB
SENIOR_DB_PORT=1433

# Cron Jobs
CRON_SENIOR_TO_AD=*/5 * * * *      # A cada 5 minutos
CRON_AD_TO_SENIOR=*/2 * * * *      # A cada 2 minutos

# API
API_PORT=3001
API_ENABLED=true

# Fonte dos tipos de evento (opcional; padrão = banco)
# USE_EVENT_TYPES_FROM_DATABASE=true   → usa AD_EVENT_TYPES (STATUS=ACTIVE) no ImediatoADSync
# USE_EVENT_TYPES_FROM_DATABASE=false  → usa ENABLED_EVENT_TYPES (lista abaixo, separada por vírgula)
# ENABLED_EVENT_TYPES=USER_UPDATE_DISPLAY_NAME,USER_DISABLE_TERMINATION,USER_UPDATE_TITLE,USER_DISABLE_LEAVE

# Opcional
# LOG_LEVEL=info
# CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

#### Quais eventos são processados (fonte: banco ImediatoADSync)

Por padrão, o serviço usa a **tabela `AD_EVENT_TYPES`** do banco **ImediatoADSync**: só são executadas as queries cujo `EVENT_TYPE_CODE` existe na tabela com **`STATUS = 'ACTIVE'`**. Assim você ativa ou desativa tipos de evento direto no banco (ou pela API do imediato-ad-sync), sem alterar .env nem arquivos de query.

- **`USE_EVENT_TYPES_FROM_DATABASE=true`** (padrão): tipos ativos vêm de `AD_EVENT_TYPES` (STATUS='ACTIVE').
- **`USE_EVENT_TYPES_FROM_DATABASE=false`**: usa a lista `ENABLED_EVENT_TYPES` do .env (códigos separados por vírgula); se vazia, todos os tipos com query definida são executados.

**Códigos de tipo** (devem existir em `AD_EVENT_TYPES` e ter uma query em `src/queries/`):

| Código | Descrição |
|--------|-----------|
| `USER_UPDATE_DISPLAY_NAME` | Nome de exibição atualizado |
| `USER_DISABLE_TERMINATION` | Usuários demitidos |
| `USER_UPDATE_TITLE` | Atualização de cargo |
| `USER_UPDATE_DESCRIPTION` | Atualização de matrícula (description) |
| `USER_DISABLE_LEAVE` | Usuários em férias/afastamento (desativar) |
| `USER_ENABLE` | Reativação (ex.: retorno de férias; ver `docs/FLUXO_FERIAS_E_REATIVACAO.md`) |

O endpoint `GET /api/status` retorna `useEventTypesFromDatabase` e, quando true, a lista `activeEventTypesFromDb` com os códigos ativos lidos do banco.

### Queries SQL

Cada query deve ser um arquivo `.js` na pasta `src/queries/` com a seguinte estrutura:

```javascript
module.exports = {
  EVENT_TYPE_CODE: 'USER_UPDATE_TITLE',
  DESCRIPTION: 'Busca mudanças de cargo no Sênior',
  SQL: `
    SELECT 
      c.MATRICULA,
      c.USERNAME,
      c.NOVO_CARGO AS NEW_VALUE
    FROM VW_COLABORADORES_ALTERACOES_CARGO c
    WHERE c.DATA_ALTERACAO >= DATEADD(MINUTE, -10, GETDATE())
      AND c.STATUS = 'PENDENTE'
  `
};
```

**Campos obrigatórios retornados pela query:**
- `USERNAME`: Nome de usuário (sAMAccountName) no AD
- `MATRICULA` ou `SENIOR_MATRICULA`: Matrícula no Sênior (opcional)
- `NEW_VALUE` ou `AD_ATTRIBUTE_VALUE`: Valor a ser atualizado no AD (opcional, depende do tipo de evento)

## Fluxo de Funcionamento

### Sincronização Sênior → AD

1. Cron job executa periodicamente (padrão: a cada 5 minutos)
2. Carrega todas as queries da pasta `src/queries/` (tipos ativos vêm de `AD_EVENT_TYPES`)
3. Para cada query:
   - Executa SQL no banco Sênior
   - Para cada resultado:
     - Verifica se já existe evento pendente (evita duplicidade)
     - Cria evento em `AD_EVENTS` com `STATUS = 'PENDING'`
4. O `imediato-ad-sync` processa os eventos e atualiza o AD

### Sincronização AD → Sênior (Email)

1. Cron job executa periodicamente (padrão: a cada 2 minutos)
2. Busca eventos de email com `STATUS = 'COMPLETED'` e `SYNCED_TO_SENIOR = 0`
3. Para cada evento:
   - Atualiza email no banco Sênior
   - Marca `SYNCED_TO_SENIOR = 1`

## API REST

Se habilitada (`API_ENABLED=true` ou variável não definida), a API expõe:

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | **Health check**: verifica conectividade com os dois bancos. Retorna **200** se ambos ok, **503** se algum indisponível (útil para load balancer/Kubernetes). Corpo: `{ service, status, timestamp, connections: { adSync, senior } }`. |
| GET | `/api/status` | **Status do serviço**: estado das conexões e configuração (crons, porta). Sempre retorna 200; corpo inclui `connections`, `config`. |

Variáveis opcionais:
- **LOG_LEVEL**: `debug`, `info`, `warn` ou `error` (padrão: `info`).
- **CORS_ORIGINS**: origens permitidas separadas por vírgula (ex.: `http://localhost:3000,https://app.empresa.com`).

## Tabelas do Banco de Dados

### AD_EVENTS (compartilhada com imediato-ad-sync)

Tabela compartilhada onde:
- `senior-event-sync` **cria** eventos (Sênior → AD)
- `imediato-ad-sync` **processa** eventos (atualiza AD)
- `senior-event-sync` **monitora** eventos completados (AD → Sênior)

**Campo importante:**
- `SYNCED_TO_SENIOR`: Controla se evento de email já foi sincronizado com Sênior

## Desenvolvimento

### Adicionar nova query SQL

1. Criar arquivo `.js` em `src/queries/`
2. Exportar objeto com `EVENT_TYPE_CODE`, `SQL` e `DESCRIPTION`
3. A query deve retornar `USERNAME` e opcionalmente `MATRICULA` e `NEW_VALUE`
4. Garantir que o `EVENT_TYPE_CODE` existe na tabela `AD_EVENT_TYPES`

### Ajustar atualização no Sênior

Editar `src/services/seniorUpdateService.js` para ajustar a query SQL de atualização conforme a estrutura real das tabelas do Sênior.

## Scripts

- `npm start` - Iniciar aplicação
- `npm run dev` - Modo desenvolvimento (nodemon)
- `npm run install-service` - Instalar como serviço Windows
- `npm run uninstall-service` - Desinstalar serviço
- `npm run encrypt-password` - Criptografar senha
- `npm run decrypt-password` - Descriptografar senha
- `npm run generate-key` - Gerar chave de criptografia

## Logs

Os logs são salvos em `logs/senior-sync-YYYY-MM-DD.log` com horário de Brasília.

## Dependências

- **mssql**: Conexão com SQL Server (AD_Sync e Sênior)
- **node-cron**: Agendamento de tarefas
- **express**: API REST (opcional)
- **crypto-js**: Criptografia de senhas

## Licença

ISC

