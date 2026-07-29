-- ============================================
-- MailFlow Pro — Migration 013: Admin Role
-- ============================================
-- Adiciona coluna is_admin à tabela profiles
-- para sistema de permissões baseado em roles.
-- ============================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Índice para consultas rápidas de admin
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles (is_admin) WHERE is_admin = true;
