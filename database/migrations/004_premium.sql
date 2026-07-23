-- ============================================
-- Migration 004: Premium Access System
-- MailFlow Pro — Sistema de Acesso Premium
-- ============================================
-- Adiciona colunas para gerir acesso premium:
--   - Trial de 7 dias para novos utilizadores
--   - Premium vitalício para emails administradores
--   - Subscrição Stripe para acesso após trial
--
-- Executar no: Supabase SQL Editor (após 001, 002, 003)
-- Dependências: tabela profiles
--
-- SEGURANÇA:
--   As colunas premium SÃO atualizadas por:
--     - service_role (criar-conta.js, webhook-stripe.js) — bypass RLS
--   NÃO são atualizadas por:
--     - utilizadores normais (RLS + trigger protegem)
-- ============================================

-- ============================================
-- 1. Colunas premium
-- ============================================
-- ADD COLUMN IF NOT EXISTS é idempotente:
--   - Seguro para executar múltiplas vezes
--   - Não remove nem altera dados existentes
--   - Colunas novas ficam NULL (ou com DEFAULT) nas rows existentes

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_trial_start TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_trial_end TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_permanent_premium BOOLEAN DEFAULT false;

-- ============================================
-- 2. Premium vitalício para o administrador
-- ============================================
-- Afeta APENAS linhas com email = 'tvdeariston@gmail.com'
-- Se o email não existir na tabela, 0 linhas são afetadas

UPDATE profiles
SET
    is_permanent_premium = true,
    subscription_status = 'permanent'
WHERE email = 'tvdeariston@gmail.com';
-- ============================================
-- 3. Índices para queries frequentes
-- ============================================
-- CREATE INDEX IF NOT EXISTS é idempotente

CREATE INDEX IF NOT EXISTS idx_profiles_premium_trial_end ON profiles(premium_trial_end);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_permanent ON profiles(is_permanent_premium);

-- ============================================
-- 4. Trigger: proteger colunas premium
-- ============================================
-- Impede que utilizadores normais alterem colunas premium.
-- Apenas service_role (bypass RLS) pode alterar.
--
-- NOTA: PostgreSQL NÃO suporta CREATE OR REPLACE TRIGGER.
-- Usamos DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- Verificação de role:
--   Supabase usa PostgREST que define o PostgreSQL role
--   baseado na API key: anon -> 'anon', auth -> 'authenticated',
--   service_role -> 'service_role'.
--   current_setting('role') retorna este valor.

CREATE OR REPLACE FUNCTION protect_premium_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Permitir apenas se a conexão é service_role (bypass RLS)
    IF current_setting('role') = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Utilizador normal: bloquear alterações às colunas premium
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
    FOR EACH ROW
    EXECUTE FUNCTION protect_premium_columns();

-- ============================================
-- 5. Função: verificar_status_premium
-- ============================================
-- Verifica o estado premium de um utilizador.
-- Usado por Netlify Functions para validação server-side.
--
-- Retorna:
--   - premium (boolean)
--   - reason (text): 'permanent', 'trial', 'subscription', 'expired', 'none'
--   - trial_end (timestamptz, nullable)
--   - days_remaining (integer, nullable)

CREATE OR REPLACE FUNCTION verificar_status_premium(user_id UUID)
RETURNS TABLE(
    premium BOOLEAN,
    reason TEXT,
    trial_end TIMESTAMPTZ,
    days_remaining INTEGER
) AS $$
DECLARE
    profile_rec RECORD;
    now_time TIMESTAMPTZ := now();
    remaining_days INTEGER;
BEGIN
    -- Buscar profile
    SELECT * INTO profile_rec
    FROM profiles
    WHERE id = user_id;

    -- Profile não encontrado
    IF profile_rec IS NULL THEN
        RETURN QUERY SELECT false, 'none'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;

    -- 1. Premium vitalício (administrador)
    IF profile_rec.is_permanent_premium = true THEN
        RETURN QUERY SELECT true, 'permanent'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;

    -- 2. Subscrição Stripe ativa
    IF profile_rec.subscription_status = 'active'
       AND profile_rec.stripe_subscription_id IS NOT NULL THEN
        RETURN QUERY SELECT true, 'subscription'::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER;
        RETURN;
    END IF;

    -- 3. Trial de 7 dias
    IF profile_rec.premium_trial_end IS NOT NULL THEN
        remaining_days := floor(EXTRACT(EPOCH FROM (profile_rec.premium_trial_end - now_time)) / 86400)::INTEGER;

        IF profile_rec.premium_trial_end > now_time THEN
            RETURN QUERY SELECT true, 'trial'::TEXT, profile_rec.premium_trial_end, remaining_days;
            RETURN;
        END IF;
    END IF;

    -- 4. Sem acesso premium
    RETURN QUERY SELECT false, 'expired'::TEXT, profile_rec.premium_trial_end, 0::INTEGER;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Permissões
-- ============================================
GRANT EXECUTE ON FUNCTION verificar_status_premium(UUID) TO authenticated;

-- ============================================
-- 7. Trigger: inicializar trial para novos utilizadores
-- ============================================
-- Quando um novo utilizador é criado (via trigger handle_new_user da migration 003),
-- as colunas premium ficam NULL. Este trigger BEFORE INSERT inicializa o trial
-- de 7 dias automaticamente para novos utilizadores (exceto admin permanente).

CREATE OR REPLACE FUNCTION initialize_premium_trial()
RETURNS TRIGGER AS $$
BEGIN
    -- Se já veio do criar-conta.js (service_role) com valores definidos, não sobrescrever
    IF NEW.premium_trial_start IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Admin permanente: não precisa de trial
    IF NEW.email = 'tvdeariston@gmail.com' THEN
        NEW.is_permanent_premium := true;
        NEW.subscription_status := 'permanent';
        RETURN NEW;
    END IF;

    -- Novo utilizador normal: iniciar trial de 7 dias
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
    FOR EACH ROW
    EXECUTE FUNCTION initialize_premium_trial();

-- ============================================
-- 8. RLS Policy para leitura de colunas premium (opcional mas recomendado)
-- ============================================
-- Embora o trigger proteja UPDATE, garantir que utilizadores autenticados
-- podem ler as próprias colunas premium (para UI mostrar trial/subscrição).
-- A policy "profiles_select_own" da migration 002 já permite SELECT no próprio profile.
-- Nenhuma policy adicional necessária para SELECT.
-- ============================================
