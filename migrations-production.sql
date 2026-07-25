-- ============================================
-- Migration 001: Profiles Table
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    nome            TEXT NOT NULL DEFAULT '',
    empresa         TEXT DEFAULT '',
    telefone        TEXT DEFAULT '',
    avatar_url      TEXT DEFAULT '',
    timezone        TEXT DEFAULT 'Europe/Lisbon',
    locale          TEXT DEFAULT 'pt-PT',
    onboarding_done BOOLEAN DEFAULT false,
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================
-- Migration 002: RLS Profiles
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- Migration 003: Auto-create Profile on Signup
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, nome)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Migration 004: Premium Access System
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_trial_start TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_trial_end TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_permanent_premium BOOLEAN DEFAULT false;

UPDATE profiles
SET is_permanent_premium = true, subscription_status = 'permanent'
WHERE email = 'tvdeariston@gmail.com';

CREATE INDEX IF NOT EXISTS idx_profiles_premium_trial_end ON profiles(premium_trial_end);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_permanent ON profiles(is_permanent_premium);

CREATE OR REPLACE FUNCTION protect_premium_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    IF NEW.is_permanent_premium IS DISTINCT FROM OLD.is_permanent_premium
       OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.premium_trial_start IS DISTINCT FROM OLD.premium_trial_start
       OR NEW.premium_trial_end IS DISTINCT FROM OLD.premium_trial_end THEN
        RAISE EXCEPTION 'Acesso negado: não é possível alterar colunas premium';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_premium_columns ON profiles;
CREATE TRIGGER trg_protect_premium_columns
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION protect_premium_columns();

CREATE OR REPLACE FUNCTION verificar_status_premium(user_id UUID)
RETURNS TABLE(premium BOOLEAN, reason TEXT, trial_end TIMESTAMPTZ, days_remaining INTEGER) AS $$
DECLARE
    profile_rec RECORD;
    now_time TIMESTAMPTZ := now();
    remaining_days INTEGER;
BEGIN
    SELECT * INTO profile_rec FROM profiles WHERE id = user_id;
    IF profile_rec IS NULL THEN
        RETURN QUERY SELECT false, 'none'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;
    IF profile_rec.is_permanent_premium = true THEN
        RETURN QUERY SELECT true, 'permanent'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;
    IF profile_rec.subscription_status = 'active' AND profile_rec.stripe_subscription_id IS NOT NULL THEN
        RETURN QUERY SELECT true, 'subscription'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;
    IF profile_rec.premium_trial_end IS NOT NULL THEN
        remaining_days := floor(EXTRACT(EPOCH FROM (profile_rec.premium_trial_end - now_time)) / 86400)::INTEGER;
        IF profile_rec.premium_trial_end > now_time THEN
            RETURN QUERY SELECT true, 'trial'::TEXT, profile_rec.premium_trial_end, remaining_days;
            RETURN;
        END IF;
    END IF;
    RETURN QUERY SELECT false, 'expired'::TEXT, profile_rec.premium_trial_end, 0::INTEGER;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION verificar_status_premium(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION initialize_premium_trial()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.premium_trial_start IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.email = 'tvdeariston@gmail.com' THEN
        NEW.is_permanent_premium := true;
        NEW.subscription_status := 'permanent';
        RETURN NEW;
    END IF;
    NEW.premium_trial_start := now();
    NEW.premium_trial_end := now() + INTERVAL '7 days';
    NEW.subscription_status := 'trial';
    NEW.is_permanent_premium := false;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_initialize_premium_trial ON profiles;
CREATE TRIGGER trg_initialize_premium_trial
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION initialize_premium_trial();

-- ============================================
-- Migration 005: Contacts Table
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL,
    telefone        TEXT DEFAULT '',
    empresa         TEXT DEFAULT '',
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_user_email_unique') THEN
        ALTER TABLE contacts ADD CONSTRAINT contacts_user_email_unique UNIQUE (user_id, email);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_nome ON contacts(user_id, nome);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
CREATE POLICY "contacts_select_own" ON contacts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
CREATE POLICY "contacts_insert_own" ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_update_own" ON contacts;
CREATE POLICY "contacts_update_own" ON contacts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_delete_own" ON contacts;
CREATE POLICY "contacts_delete_own" ON contacts FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contacts IS 'Contactos dos utilizadores para email marketing';
COMMENT ON COLUMN contacts.tags IS 'Array de tags para segmentação';

-- ============================================
-- Migration 006: Templates Table
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

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_is_default ON templates(user_id, is_default) WHERE is_default = true;

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select_own" ON templates;
CREATE POLICY "templates_select_own" ON templates FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "templates_insert_own" ON templates;
CREATE POLICY "templates_insert_own" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "templates_update_own" ON templates;
CREATE POLICY "templates_update_own" ON templates FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "templates_delete_own" ON templates;
CREATE POLICY "templates_delete_own" ON templates FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates;
CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE templates
        SET is_default = false
        WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_templates_single_default ON templates;
CREATE TRIGGER trg_templates_single_default
    BEFORE INSERT OR UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION enforce_single_default_template();

GRANT SELECT, INSERT, UPDATE, DELETE ON templates TO authenticated;

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

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cr_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cr_contact_id ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_cr_campaign_status ON campaign_recipients(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_unique ON campaign_recipients(campaign_id, contact_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select_own" ON campaigns;
CREATE POLICY "campaigns_select_own" ON campaigns FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "campaigns_insert_own" ON campaigns;
CREATE POLICY "campaigns_insert_own" ON campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_update_own" ON campaigns;
CREATE POLICY "campaigns_update_own" ON campaigns FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "campaigns_delete_own" ON campaigns;
CREATE POLICY "campaigns_delete_own" ON campaigns FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cr_select_own" ON campaign_recipients;
CREATE POLICY "cr_select_own" ON campaign_recipients FOR SELECT USING (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_recipients.campaign_id AND campaigns.user_id = auth.uid()));

DROP POLICY IF EXISTS "cr_insert_own" ON campaign_recipients;
CREATE POLICY "cr_insert_own" ON campaign_recipients FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_recipients.campaign_id AND campaigns.user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cr_updated_at ON campaign_recipients;
CREATE TRIGGER trg_cr_updated_at
    BEFORE UPDATE ON campaign_recipients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_recipients TO authenticated;

COMMENT ON TABLE campaigns IS 'Campanhas de email marketing dos utilizadores';
COMMENT ON TABLE campaign_recipients IS 'Destinatarios de cada campanha (junction M:N com contacts)';
COMMENT ON COLUMN campaigns.status IS 'draft, scheduled, sending, sent, paused, cancelled, failed';
COMMENT ON COLUMN campaigns.progress_percent IS 'Progresso do envio 0-100 (atualizado pelo motor)';
COMMENT ON COLUMN campaigns.total_sent IS 'Emails enviados com sucesso (atualizado pelo motor)';
COMMENT ON COLUMN campaign_recipients.status IS 'pending, sending, sent, delivered, opened, clicked, bounced, complained, unsubscribed, failed, skipped';
COMMENT ON COLUMN campaign_recipients.message_id IS 'ID unico da mensagem para tracking/provider';

-- ============================================
-- Migration 008: Tracking de Campanhas
-- ============================================
ALTER TABLE campaign_recipients
    ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_open_ip TEXT,
    ADD COLUMN IF NOT EXISTS last_click_ip TEXT,
    ADD COLUMN IF NOT EXISTS last_open_user_agent TEXT,
    ADD COLUMN IF NOT EXISTS last_click_user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_cr_opened ON campaign_recipients(campaign_id) WHERE opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cr_clicked ON campaign_recipients(campaign_id) WHERE clicked_at IS NOT NULL;

COMMENT ON COLUMN campaign_recipients.open_count IS 'Numero total de aberturas deste email';
COMMENT ON COLUMN campaign_recipients.click_count IS 'Numero total de cliques neste email';
COMMENT ON COLUMN campaign_recipients.last_open_ip IS 'IP da ultima abertura';
COMMENT ON COLUMN campaign_recipients.last_click_ip IS 'IP do ultimo clique';
COMMENT ON COLUMN campaign_recipients.last_open_user_agent IS 'User-Agent da ultima abertura';
COMMENT ON COLUMN campaign_recipients.last_click_user_agent IS 'User-Agent do ultimo clique';

-- ============================================
-- Migration 009: SMTP Configuration columns
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_host TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_username TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_password TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_from_email TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_from_name TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profiles_smtp_host ON profiles(smtp_host);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_status TEXT DEFAULT 'not_configured'
  CHECK (smtp_status IN ('not_configured', 'configured', 'verified'));
CREATE INDEX IF NOT EXISTS idx_profiles_smtp_status ON profiles(smtp_status);

-- ============================================
-- Migration 010: SMTP Status columns
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_status TEXT DEFAULT 'not_configured';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smtp_verified_at TIMESTAMPTZ DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_smtp_status') THEN
        ALTER TABLE profiles ADD CONSTRAINT chk_smtp_status CHECK (smtp_status IN ('not_configured', 'configured', 'verified'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_smtp_status ON profiles(smtp_status);

-- ============================================
-- Migration 011: Automation Rules
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

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own automation rules" ON automation_rules;
CREATE POLICY "Users can view their own automation rules" ON automation_rules FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own automation rules" ON automation_rules;
CREATE POLICY "Users can insert their own automation rules" ON automation_rules FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own automation rules" ON automation_rules;
CREATE POLICY "Users can update their own automation rules" ON automation_rules FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own automation rules" ON automation_rules;
CREATE POLICY "Users can delete their own automation rules" ON automation_rules FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_campaign_id ON automation_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(enabled);

DROP TRIGGER IF EXISTS set_updated_at ON automation_rules;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration 012: Automation Jobs
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

ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own automation jobs" ON automation_jobs;
CREATE POLICY "Users can view their own automation jobs" ON automation_jobs FOR SELECT USING (EXISTS (SELECT 1 FROM automation_rules ar WHERE ar.id = automation_jobs.automation_id AND ar.user_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert automation jobs" ON automation_jobs;
CREATE POLICY "System can insert automation jobs" ON automation_jobs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM automation_rules ar WHERE ar.id = automation_jobs.automation_id AND ar.user_id = auth.uid()));

DROP POLICY IF EXISTS "System can update automation jobs" ON automation_jobs;
CREATE POLICY "System can update automation jobs" ON automation_jobs FOR UPDATE USING (EXISTS (SELECT 1 FROM automation_rules ar WHERE ar.id = automation_jobs.automation_id AND ar.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_automation_jobs_automation_id ON automation_jobs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_contact_id ON automation_jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at DESC);
