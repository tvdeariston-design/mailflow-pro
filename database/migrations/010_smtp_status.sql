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
