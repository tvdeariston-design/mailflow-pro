-- ============================================
-- Migration 006: Templates Table
-- MailFlow Pro — Modulo Templates
-- ============================================
-- Cria a tabela templates para armazenar templates de email reutilizaveis.
-- Cada utilizador gere os seus proprios templates.
--
-- Executar no: Supabase SQL Editor (após 005)
-- Dependencias: auth.users, funcao update_updated_at_column() (005)
-- ============================================

-- ============================================
-- 1. Tabela templates
-- ============================================
CREATE TABLE IF NOT EXISTS templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL DEFAULT '',
    subject         TEXT NOT NULL DEFAULT '',
    preheader       TEXT DEFAULT '',
    html            TEXT NOT NULL DEFAULT '',
    text_version    TEXT DEFAULT '',
    is_default      BOOLEAN DEFAULT false,
    thumbnail       TEXT DEFAULT '',
    usage_count     INTEGER DEFAULT 0,
    last_used_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. Indices
-- ============================================
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_is_default ON templates(user_id, is_default)
    WHERE is_default = true;

-- ============================================
-- 3. Row Level Security (RLS)
-- ============================================
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- SELECT: utilizador ve apenas os seus templates ativos
CREATE POLICY "templates_select_own"
    ON templates FOR SELECT
    USING (auth.uid() = user_id AND deleted_at IS NULL);

-- INSERT: utilizador cria templates apenas para si
CREATE POLICY "templates_insert_own"
    ON templates FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: utilizador edita apenas os seus templates
CREATE POLICY "templates_update_own"
    ON templates FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: utilizador elimina apenas os seus templates (soft delete)
CREATE POLICY "templates_delete_own"
    ON templates FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 4. Trigger: updated_at automatico
-- ============================================
CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Trigger: apenas um template default por utilizador
-- ============================================
CREATE OR REPLACE FUNCTION enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE templates
        SET is_default = false
        WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND is_default = true
        AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_templates_single_default
    BEFORE INSERT OR UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_default_template();

-- ============================================
-- 6. Permissoes
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON templates TO authenticated;

-- ============================================
-- 7. Comentarios
-- ============================================
COMMENT ON TABLE templates IS 'Templates de email reutilizaveis para campanhas';
COMMENT ON COLUMN templates.subject IS 'Assunto do email (suporta merge tags)';
COMMENT ON COLUMN templates.preheader IS 'Texto de preview nos clientes de email';
COMMENT ON COLUMN templates.html IS 'Corpo HTML do email';
COMMENT ON COLUMN templates.text_version IS 'Corpo em texto plano (fallback)';
COMMENT ON COLUMN templates.is_default IS 'Template padrao do utilizador (max 1)';
COMMENT ON COLUMN templates.thumbnail IS 'URL ou path da miniatura para galeria';
COMMENT ON COLUMN templates.usage_count IS 'Numero de campanhas que usaram este template';
COMMENT ON COLUMN templates.deleted_at IS 'Soft delete: NULL = ativo, timestamp = eliminado';


-- ============================================
-- Migration 007: Campaigns & Recipients
-- MailFlow Pro — Modulo Campanhas
-- ============================================
-- Cria as tabelas campaigns e campaign_recipients.
-- Gestao de campanhas: criar, editar, eliminar, adicionar contactos.
-- NAO inclui motor de envio (implementado numa fase futura).
--
-- Executar no: Supabase SQL Editor (após 006)
-- Dependencias: auth.users, contacts, templates,
--               funcao update_updated_at_column() (005)
-- ============================================

-- ============================================
-- 1. Tabela campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES auth.users(id),
    nome                TEXT NOT NULL DEFAULT '',
    assunto             TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'draft',
    template_id         UUID REFERENCES templates(id) ON DELETE SET NULL,
    from_name           TEXT DEFAULT '',
    from_email          TEXT DEFAULT '',
    reply_to            TEXT DEFAULT '',
    scheduled_at        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    last_error          TEXT,
    progress_percent    INTEGER DEFAULT 0,
    total_recipients    INTEGER DEFAULT 0,
    total_sent          INTEGER DEFAULT 0,
    total_failed        INTEGER DEFAULT 0,
    total_opened        INTEGER DEFAULT 0,
    total_clicked       INTEGER DEFAULT 0,
    total_bounced       INTEGER DEFAULT 0,
    total_unsubscribed  INTEGER DEFAULT 0,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. Tabela campaign_recipients
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending',
    message_id          TEXT,
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    opened_at           TIMESTAMPTZ,
    clicked_at          TIMESTAMPTZ,
    bounced_at          TIMESTAMPTZ,
    complained_at       TIMESTAMPTZ,
    unsubscribed_at     TIMESTAMPTZ,
    error_message       TEXT,
    retry_count         INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. Indices — campaigns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at)
    WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(user_id, created_at DESC);

-- ============================================
-- 4. Indices — campaign_recipients
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cr_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cr_contact_id ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_cr_campaign_status ON campaign_recipients(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_unique ON campaign_recipients(campaign_id, contact_id);

-- ============================================
-- 5. Row Level Security — campaigns
-- ============================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own"
    ON campaigns FOR SELECT
    USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "campaigns_insert_own"
    ON campaigns FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_update_own"
    ON campaigns FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_delete_own"
    ON campaigns FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 6. Row Level Security — campaign_recipients
-- ============================================
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr_select_own"
    ON campaign_recipients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM campaigns
            WHERE campaigns.id = campaign_recipients.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "cr_insert_own"
    ON campaign_recipients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM campaigns
            WHERE campaigns.id = campaign_recipients.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

-- ============================================
-- 7. Triggers — updated_at
-- ============================================
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cr_updated_at
    BEFORE UPDATE ON campaign_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. Permissoes
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_recipients TO authenticated;

-- ============================================
-- 9. Comentarios
-- ============================================
COMMENT ON TABLE campaigns IS 'Campanhas de email marketing dos utilizadores';
COMMENT ON TABLE campaign_recipients IS 'Destinatarios de cada campanha (junction M:N com contacts)';
COMMENT ON COLUMN campaigns.status IS 'draft, scheduled, sending, sent, paused, cancelled, failed';
COMMENT ON COLUMN campaigns.progress_percent IS 'Progresso do envio 0-100 (atualizado pelo motor)';
COMMENT ON COLUMN campaigns.total_sent IS 'Emails enviados com sucesso (atualizado pelo motor)';
COMMENT ON COLUMN campaign_recipients.status IS 'pending, sending, sent, delivered, opened, clicked, bounced, complained, unsubscribed, failed, skipped';
COMMENT ON COLUMN campaign_recipients.message_id IS 'ID unico da mensagem para tracking/provider';


-- ============================================
-- Migration 008: Tracking de Campanhas
-- MailFlow Pro — Pixel de abertura + Click tracking
-- ============================================
-- Adiciona campos de tracking a campaign_recipients.
-- Os campos opened_at, clicked_at, total_opened, total_clicked
-- ja existem na migration 007. Esta migration adiciona
-- contadores, IPs, e user-agents.
--
-- Executar no: Supabase SQL Editor (após 007)
-- Dependencias: 007_campaigns.sql
-- ============================================

-- ============================================
-- 1. Novos campos em campaign_recipients
-- ============================================
ALTER TABLE campaign_recipients
    ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_open_ip TEXT,
    ADD COLUMN IF NOT EXISTS last_click_ip TEXT,
    ADD COLUMN IF NOT EXISTS last_open_user_agent TEXT,
    ADD COLUMN IF NOT EXISTS last_click_user_agent TEXT;

-- ============================================
-- 2. Indices de tracking
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cr_opened
    ON campaign_recipients(campaign_id)
    WHERE opened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cr_clicked
    ON campaign_recipients(campaign_id)
    WHERE clicked_at IS NOT NULL;

-- ============================================
-- 3. Comentarios
-- ============================================
COMMENT ON COLUMN campaign_recipients.open_count IS 'Numero total de aberturas deste email';
COMMENT ON COLUMN campaign_recipients.click_count IS 'Numero total de cliques neste email';
COMMENT ON COLUMN campaign_recipients.last_open_ip IS 'IP da ultima abertura';
COMMENT ON COLUMN campaign_recipients.last_click_ip IS 'IP do ultimo clique';
COMMENT ON COLUMN campaign_recipients.last_open_user_agent IS 'User-Agent da ultima abertura';
COMMENT ON COLUMN campaign_recipients.last_click_user_agent IS 'User-Agent do ultimo clique';


-- ============================================
-- Migration 009: SMTP Configuration columns
-- MailFlow Pro — Configuração SMTP personalizada
-- ============================================
-- Adiciona colunas para configuração SMTP na tabela profiles.
-- Permite aos utilizadores configurar o seu próprio servidor SMTP.
--
-- Executar no: Supabase SQL Editor
-- Dependências: 001_profiles.sql
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_username TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_password TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_from_email TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_from_name TEXT DEFAULT '';

-- Índice para queries SMTP
CREATE INDEX IF NOT EXISTS idx_profiles_smtp_host ON profiles(smtp_host);

-- SMTP status tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_status TEXT DEFAULT 'not_configured'
  CHECK (smtp_status IN ('not_configured', 'configured', 'verified'));
CREATE INDEX IF NOT EXISTS idx_profiles_smtp_status ON profiles(smtp_status);



-- ============================================
-- Migration 010: SMTP Status columns
-- MailFlow Pro — Estado de verificação SMTP
-- ============================================
-- Adiciona colunas para rastrear o estado da configuração SMTP.
--
-- Executar no: Supabase SQL Editor
-- Dependências: 001_profiles.sql, 009_smtp.sql
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_status TEXT DEFAULT 'not_configured';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_verified_at TIMESTAMPTZ DEFAULT NULL;

-- Valores válidos para smtp_status:
-- 'not_configured' - Não configurado (campos obrigatórios em falta)
-- 'configured'     - Configurado mas não testado
-- 'verified'       - Ligação verificada com sucesso

-- Constraint para validar valores
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_smtp_status'
    ) THEN
        ALTER TABLE profiles ADD CONSTRAINT chk_smtp_status 
        CHECK (smtp_status IN ('not_configured', 'configured', 'verified'));
    END IF;
END $$;

-- Índice para queries por status
CREATE INDEX IF NOT EXISTS idx_profiles_smtp_status ON profiles(smtp_status);


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
