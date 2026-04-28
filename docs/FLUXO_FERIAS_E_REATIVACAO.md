# Fluxo de férias e reativação (USER_DISABLE_LEAVE + USER_ENABLE)

## Cenário

1. **Usuário entra de férias** → senior-event-sync gera evento `USER_DISABLE_LEAVE` em `AD_EVENTS` → imediato-ad-sync desativa a conta no AD.
2. **Usuário volta de férias** → No Sênior (ex.: `r034fun.SITAFA = 1`) → é preciso gerar evento de **reativação** para o AD voltar ao normal.

## Onde disparar a reativação?

| Responsabilidade | Serviço | Motivo |
|------------------|--------|--------|
| **Descobrir** que alguém voltou de férias | **senior-event-sync** | Só ele lê o banco Sênior. O “fato” (SITAFA=1, retorno) está no Sênior. |
| **Executar** a reativação no AD | **imediato-ad-sync** | Ele processa eventos de `AD_EVENTS` e altera o AD. Já existe handler para `USER_ENABLE`. |

**Conclusão:** o **disparo** (criação do evento) é no **senior-event-sync**; a **execução** (reativar no AD) é no **imediato-ad-sync**. Não inverta: o imediato-ad-sync não deve consultar o Sênior.

## Fluxo recomendado

```
Sênior (r034fun / view retorno férias)
        │
        │  senior-event-sync (cron)
        │  Query "retorno de férias" → INSERT AD_EVENTS (USER_ENABLE)
        ▼
  AD_EVENTS (STATUS = PENDING)
        │
        │  imediato-ad-sync (cron)
        │  Processa USER_ENABLE → reativa conta no AD
        ▼
  Active Directory (conta reativada)
```

## Boas práticas

### 1. Um evento, um tipo, uma responsabilidade

- **USER_DISABLE_LEAVE**: “desativar por férias/afastamento” (senior-event-sync cria; imediato-ad-sync desativa).
- **USER_ENABLE**: “reativar conta” (senior-event-sync cria quando detecta retorno; imediato-ad-sync reativa).

Use sempre os tipos cadastrados em `AD_EVENT_TYPES` e ative/desative por `STATUS = 'ACTIVE'`.

### 2. Quem “dispara” é quem tem o dado

- O **disparo** da reativação fica no **senior-event-sync**: query no Sênior que identifica “voltou de férias” (ex.: `SITAFA = 1`) e insere evento `USER_ENABLE` em `AD_EVENTS`.
- O imediato-ad-sync só reage aos eventos da fila; não consulta Sênior.

### 3. Evitar reativar demitido

Na query de **retorno de férias**, exclua explicitamente quem está demitido (ex.: `NOT EXISTS` em tabela/view de desligamentos ou filtro por status). Assim você não gera `USER_ENABLE` para quem já tem `USER_DISABLE_TERMINATION`.

### 4. Evitar duplicidade

O `eventCreatorService` já verifica `hasPendingEventByEmployeeId`: não cria outro evento do mesmo tipo (ex.: `USER_ENABLE`) se já existir um pendente para a mesma matrícula. Não é necessário controle extra na aplicação.

### 5. Filtro “retorno recente”

Na query de retorno, use um critério de “retorno recente” (ex.: data de retorno ou data de atualização nos últimos 7 dias) para não reprocessar todo mundo que já está com `SITAFA = 1` há tempo. Assim você gera evento só para quem **acabou** de voltar.

### 6. Cadastro em AD_EVENT_TYPES

Garanta no banco **ImediatoADSync** que existe um tipo com `EVENT_TYPE_CODE = 'USER_ENABLE'` e `STATUS = 'ACTIVE'`, para o senior-event-sync poder criar o evento e o imediato-ad-sync processá-lo.

## Arquivos no senior-event-sync

- **userVacationStatusQuery.js**: colaboradores **em** férias → evento `USER_DISABLE_LEAVE`.
- **userReturnFromLeaveQuery.js**: colaboradores que **retornaram** de férias (ex.: SITAFA=1) → evento `USER_ENABLE`.

Ajuste a SQL de `userReturnFromLeaveQuery.js` para sua base (nome da tabela/view, colunas, critério de “retorno recente” e exclusão de demitidos).
