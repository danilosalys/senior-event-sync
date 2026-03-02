-- Script de migração: Adicionar campo SYNCED_TO_SENIOR na tabela AD_EVENTS
-- Senior Event Sync

-- ============================================
-- Adicionar campo SYNCED_TO_SENIOR
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('AD_EVENTS') AND name = 'SYNCED_TO_SENIOR')
BEGIN
    ALTER TABLE AD_EVENTS
    ADD SYNCED_TO_SENIOR BIT DEFAULT 0;
    
    PRINT 'Campo SYNCED_TO_SENIOR adicionado com sucesso à tabela AD_EVENTS!';
END
ELSE
BEGIN
    PRINT 'Campo SYNCED_TO_SENIOR já existe na tabela AD_EVENTS.';
END;

-- ============================================
-- Criar índice para melhor performance
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AD_EVENTS_SYNCED_TO_SENIOR' AND object_id = OBJECT_ID('AD_EVENTS'))
BEGIN
    CREATE INDEX IX_AD_EVENTS_SYNCED_TO_SENIOR 
    ON AD_EVENTS(STATUS, SYNCED_TO_SENIOR) 
    INCLUDE (EVENT_TYPE_ID)
    WHERE STATUS = 'COMPLETED' AND (SYNCED_TO_SENIOR = 0 OR SYNCED_TO_SENIOR IS NULL);
    
    PRINT 'Índice IX_AD_EVENTS_SYNCED_TO_SENIOR criado com sucesso!';
END
ELSE
BEGIN
    PRINT 'Índice IX_AD_EVENTS_SYNCED_TO_SENIOR já existe.';
END;

