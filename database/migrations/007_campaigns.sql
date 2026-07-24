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
