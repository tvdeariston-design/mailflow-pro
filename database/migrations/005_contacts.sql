-- ============================================
-- Migration 005: Contacts Table
-- MailFlow Pro — Fase 2: Módulo Contactos
-- ============================================
-- Cria a tabela contacts para armazenar contactos dos utilizadores.
-- Cada utilizador gere a sua própria base de contactos.
--
-- Executar no: Supabase SQL Editor (após 004)
-- Dependências: tabela profiles, auth.users
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
    notas           TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(user_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_nome ON contacts(user_id, nome);

-- ============================================
-- 2. Row Level Security (RLS)
-- ============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: utilizador vê apenas os seus contactos
CREATE POLICY "contacts_select_own"
    ON contacts FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT: utilizador cria contactos apenas para si
CREATE POLICY "contacts_insert_own"
    ON contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: utilizador edita apenas os seus contactos
CREATE POLICY "contacts_update_own"
    ON contacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: utilizador apaga apenas os seus contactos
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
-- 4. Função: busca de contactos com paginação
-- ============================================
-- Para uso pelo backend (service_role bypass RLS)
CREATE OR REPLACE FUNCTION get_user_contacts(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_at',
    p_sort_order TEXT DEFAULT 'DESC'
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    nome TEXT,
    email TEXT,
    telefone TEXT,
    empresa TEXT,
    tags TEXT[],
    notas TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
) AS $$
DECLARE
    v_total BIGINT;
    v_sql TEXT;
BEGIN
    -- Contar total (com filtro de pesquisa)
    IF p_search IS NOT NULL AND p_search != '' THEN
        EXECUTE format(
            'SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND (nome ILIKE $2 OR email ILIKE $2 OR empresa ILIKE $2)'
        ) INTO v_total USING p_user_id, '%' || p_search || '%';
    ELSE
        EXECUTE 'SELECT COUNT(*) FROM contacts WHERE user_id = $1' INTO v_total USING p_user_id;
    END IF;

    -- Buscar dados paginados
    v_sql := format(
        'SELECT id, user_id, nome, email, telefone, empresa, tags, notas, created_at, updated_at
         FROM contacts
         WHERE user_id = $1
         %s
         ORDER BY %I %s
         LIMIT $2 OFFSET $3',
        CASE WHEN p_search IS NOT NULL AND p_search != '' 
             THEN 'AND (nome ILIKE $4 OR email ILIKE $4 OR empresa ILIKE $4)'
             ELSE '' END,
        p_sort_by,
        p_sort_order
    );

    IF p_search IS NOT NULL AND p_search != '' THEN
        RETURN QUERY EXECUTE v_sql USING p_user_id, p_limit, p_offset, '%' || p_search || '%';
    ELSE
        RETURN QUERY EXECUTE v_sql USING p_user_id, p_limit, p_offset;
    END IF;

    -- Retornar total_count na última linha (hack para retornar dois result sets)
    -- Em vez disso, usamos uma abordagem diferente: retorna total como coluna extra
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Função melhorada: buscar contactos + total
-- ============================================
CREATE OR REPLACE FUNCTION get_user_contacts_paginated(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_at',
    p_sort_order TEXT DEFAULT 'DESC'
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    nome TEXT,
    email TEXT,
    telefone TEXT,
    empresa TEXT,
    tags TEXT[],
    notas TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_where TEXT;
BEGIN
    v_where := 'user_id = $1';
    
    IF p_search IS NOT NULL AND p_search != '' THEN
        v_where := v_where || ' AND (nome ILIKE $4 OR email ILIKE $4 OR empresa ILIKE $4)';
    END IF;

    RETURN QUERY EXECUTE format(
        'SELECT id, user_id, nome, email, telefone, empresa, tags, notas, created_at, updated_at
         FROM contacts
         WHERE %s
         ORDER BY %I %s
         LIMIT $2 OFFSET $3',
        v_where,
        p_sort_by,
        p_sort_order
    ) USING 
        CASE WHEN p_search IS NOT NULL AND p_search != '' 
             THEN ARRAY[p_user_id, p_limit, p_offset, '%' || p_search || '%']
             ELSE ARRAY[p_user_id, p_limit, p_offset] END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para contar total
CREATE OR REPLACE FUNCTION count_user_contacts(
    p_user_id UUID,
    p_search TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_count BIGINT;
BEGIN
    IF p_search IS NOT NULL AND p_search != '' THEN
        EXECUTE 'SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND (nome ILIKE $2 OR email ILIKE $2 OR empresa ILIKE $2)'
        INTO v_count USING p_user_id, '%' || p_search || '%';
    ELSE
        EXECUTE 'SELECT COUNT(*) FROM contacts WHERE user_id = $1'
        INTO v_count USING p_user_id;
    END IF;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Permissões
-- ============================================
GRANT EXECUTE ON FUNCTION get_user_contacts_paginated(UUID, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_contacts(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated;

-- ============================================
-- 7. Comentários
-- ============================================
COMMENT ON TABLE contacts IS 'Contactos dos utilizadores para email marketing';
COMMENT ON COLUMN contacts.tags IS 'Array de tags para segmentação';
COMMENT ON COLUMN contacts.notas IS 'Notas livres sobre o contacto';
