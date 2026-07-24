-- ============================================
-- Migration 011: Automation Rules
-- MailFlow Pro — Módulo Automações
-- ============================================
-- Cria a tabela automation_rules para automações baseadas em triggers.
--
-- Executar no: Supabase SQL Editor
-- Dependências: 001_profiles.sql, 007_campaigns.sql
-- ============================================

CREATE TABLE IF NOT EXISTS automation_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    enabled         BOOLEAN DEFAULT false,
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('contact_created')),
    delay_minutes   INTEGER NOT NULL DEFAULT 0,
    campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own automation rules"
    ON automation_rules FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own automation rules"
    ON automation_rules FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation rules"
    ON automation_rules FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own automation rules"
    ON automation_rules FOR DELETE
    USING (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_campaign_id ON automation_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(enabled);

-- Trigger updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON automation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
