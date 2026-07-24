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
