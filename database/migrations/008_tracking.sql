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
