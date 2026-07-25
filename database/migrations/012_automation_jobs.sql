-- ============================================
-- Migration 012: Automation Jobs
-- MailFlow Pro — Histórico de execuções de automações
-- ============================================
-- Cria a tabela automation_jobs para rastrear cada execução de automação.
--
-- Executar no: Supabase SQL Editor
-- Dependências: 001_profiles.sql, 007_campaigns.sql, 011_automations.sql
-- ============================================

CREATE TABLE IF NOT EXISTS automation_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id   UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own automation jobs"
    ON automation_jobs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM automation_rules ar
            WHERE ar.id = automation_jobs.automation_id
            AND ar.user_id = auth.uid()
        )
    );

CREATE POLICY "System can insert automation jobs"
    ON automation_jobs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM automation_rules ar
            WHERE ar.id = automation_jobs.automation_id
            AND ar.user_id = auth.uid()
        )
    );

CREATE POLICY "System can update automation jobs"
    ON automation_jobs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM automation_rules ar
            WHERE ar.id = automation_jobs.automation_id
            AND ar.user_id = auth.uid()
        )
    );

-- Índices
CREATE INDEX IF NOT EXISTS idx_automation_jobs_automation_id ON automation_jobs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_contact_id ON automation_jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at DESC);
