-- ============================================
-- Migration 005: Contacts Table
-- MailFlow Pro — Fase 2: Módulo Contactos
-- ============================================
-- Cria a tabela contacts para armazenar contactos dos utilizadores.
-- Cada utilizador gere a sua própria base de contactos.
--
-- Executar no: Supabase SQL Editor (após 004)
-- Dependências: auth.users
-- ============================================

-- ============================================
-- 1. Tabela contacts
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

-- UNIQUE: cada utilizador só pode ter um contacto por email
ALTER TABLE contacts ADD CONSTRAINT contacts_user_email_unique
    UNIQUE (user_id, email);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_nome ON contacts(user_id, nome);

-- ============================================
-- 2. Row Level Security (RLS)
-- ============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select_own"
    ON contacts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "contacts_insert_own"
    ON contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update_own"
    ON contacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_delete_own"
    ON contacts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3. Trigger: updated_at automático
-- ============================================
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
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Comentários
-- ============================================
COMMENT ON TABLE contacts IS 'Contactos dos utilizadores para email marketing';
COMMENT ON COLUMN contacts.tags IS 'Array de tags para segmentação';
