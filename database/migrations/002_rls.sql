-- ============================================
-- Migration 002: Row Level Security — Profiles
-- MailFlow Pro — Fase 1: Infraestrutura
-- ============================================
-- Configura RLS na tabela profiles.
-- Cada utilizador só pode ler/atualizar o seu próprio profile.
--
-- Executar no: Supabase SQL Editor (após 001)
-- Dependências: tabela profiles
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Ler: cada user vê apenas o seu profile
CREATE POLICY "profiles_select_own"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Atualizar: cada user edita apenas o seu profile
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Insert: realizado pelo trigger handle_new_user (SECURITY DEFINER)
-- Não precisa de policy de INSERT (bypass via SECURITY DEFINER)
