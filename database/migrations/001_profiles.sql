-- ============================================
-- Migration 001: Profiles Table
-- MailFlow Pro — Fase 1: Infraestrutura
-- ============================================
-- Cria a tabela profiles (1:1 com auth.users).
-- Dados públicos do utilizador, separados do Supabase Auth.
--
-- Executar no: Supabase SQL Editor
-- Dependências: auth.users (Supabase Auth)
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

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

