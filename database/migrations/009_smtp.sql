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

