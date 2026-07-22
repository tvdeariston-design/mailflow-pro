-- ============================================
-- Migration 003: Triggers — Auto-create Profile
-- MailFlow Pro — Fase 1: Infraestrutura
-- ============================================
-- Quando um utilizador se regista no Supabase Auth,
-- este trigger cria automaticamente o seu profile na
-- tabela profiles. O utilizador nunca precisa de preencher
-- dados manualmente — o profile é criado em segundo plano.
--
-- Benefício: utilizador regista-se e entra no dashboard
-- imediatamente, sem passos adicionais.
--
-- Executar no: Supabase SQL Editor (após 001 e 002)
-- Dependências: tabela profiles, auth.users
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, nome)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nome', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: executa após INSERT em auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
