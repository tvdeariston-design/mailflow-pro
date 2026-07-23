/**
 * MailFlow Pro — Helpers de Autenticação
 *
 * Objetivo:
 *   Centralizar toda a lógica de auth: signup, login, logout,
 *   sessões, e verificação de estado. Usado por todas as páginas.
 *
 * Inputs:
 *   - Email + password + nome (para registo)
 *   - Email + password (para login)
 *
 * Outputs:
 *   - session válida (access_token + refresh_token)
 *   - user object (id, email, metadata)
 *
 * Erros possíveis:
 *   - Credenciais inválidas (login)
 *   - Email já registado (signup)
 *   - Password fraca (signup)
 *   - Sessão expirada
 *   - Supabase client não disponível
 *
 * Dependências:
 *   - supabase-client.js (deve ser carregado antes)
 */

(function() {
    'use strict';

    // ========================================
    // Init
    // ========================================
    var client = null;

    function getClient() {
        if (!client && window.supabaseClient) {
            client = window.supabaseClient;
        }
        return client;
    }

    // ========================================
    // Helpers
    // ========================================

    /**
     * Registar novo utilizador.
     * Cria conta no Supabase Auth + profile na DB (via trigger).
     *
     * @param {string} email
     * @param {string} password
     * @param {string} nome
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function signUp(email, password, nome) {
        var sb = getClient();
        if (!sb) {
            return { success: false, error: 'Serviço de autenticação indisponível.' };
        }

        try {
            var result = await sb.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { nome: nome }
                }
            });

            if (result.error) {
                var msg = traduzirErro(result.error.message);
                return { success: false, error: msg };
            }

            // Atualizar profile com nome (trigger cria com raw_user_meta_data)
            if (result.data && result.data.user) {
                await sb
                    .from('profiles')
                    .update({ nome: nome, updated_at: new Date().toISOString() })
                    .eq('id', result.data.user.id);
            }

            return { success: true };

        } catch (err) {
            console.error('[Auth] Erro no registo:', err);
            return { success: false, error: 'Erro inesperado. Tente novamente.' };
        }
    }

    /**
     * Iniciar sessão.
     *
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function signIn(email, password) {
        var sb = getClient();
        if (!sb) {
            return { success: false, error: 'Serviço de autenticação indisponível.' };
        }

        try {
            var result = await sb.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (result.error) {
                var msg = traduzirErro(result.error.message);
                return { success: false, error: msg };
            }

            return { success: true };

        } catch (err) {
            console.error('[Auth] Erro no login:', err);
            return { success: false, error: 'Erro inesperado. Tente novamente.' };
        }
    }

    /**
     * Terminar sessão.
     *
     * @returns {Promise<void>}
     */
    async function signOut() {
        var sb = getClient();
        if (!sb) return;

        try {
            await sb.auth.signOut();
        } catch (err) {
            console.error('[Auth] Erro no logout:', err);
        }
    }

    /**
     * Obter sessão atual.
     *
     * @returns {Promise<Object|null>} session object ou null
     */
    async function getSession() {
        var sb = getClient();
        if (!sb) return null;

        try {
            var result = await sb.auth.getSession();
            return result.data.session || null;
        } catch (err) {
            console.error('[Auth] Erro ao obter sessão:', err);
            return null;
        }
    }

    /**
     * Obter utilizador atual.
     *
     * @returns {Promise<Object|null>} user object ou null
     */
    async function getUser() {
        var sb = getClient();
        if (!sb) return null;

        try {
            var result = await sb.auth.getUser();
            return result.data.user || null;
        } catch (err) {
            console.error('[Auth] Erro ao obter utilizador:', err);
            return null;
        }
    }

    /**
     * Verificar se existe sessão válida.
     * Redireciona para login se não houver sessão.
     *
     * @param {string} redirectUrl — URL para redirecionar se não autenticado
     * @returns {Promise<boolean>}
     */
    async function requireAuth(redirectUrl) {
        var session = await getSession();
        if (!session) {
            window.location.href = redirectUrl || '/entrar.html';
            return false;
        }
        return true;
    }

    /**
     * Registar listener para mudanças de estado de auth.
     *
     * @param {Function} callback — chamado com (event, session)
     */
    function onAuthStateChange(callback) {
        var sb = getClient();
        if (!sb) return;

        sb.auth.onAuthStateChange(function(event, session) {
            if (callback) callback(event, session);
        });
    }

    /**
     * Traduzir mensagens de erro do Supabase para português.
     *
     * @param {string} message — mensagem original do Supabase
     * @returns {string} mensagem traduzida
     */
    function traduzirErro(message) {
        var traducoes = {
            'Invalid login credentials': 'Email ou password incorretos.',
            'User already registered': 'Este email já está registado.',
            'Password should be at least 6 characters': 'A password deve ter pelo menos 6 caracteres.',
            'Unable to validate email address: invalid format': 'Formato de email inválido.',
            'Email not confirmed': 'Email não confirmado. Verifique a sua caixa de entrada.',
            'Signup requires a valid password': 'Password inválida.',
            'To signup, please provide your email and password': 'Preencha o email e a password.'
        };

        return traducoes[message] || 'Ocorreu um erro. Tente novamente.';
    }

    // ========================================
    // Export
    // ========================================
    window.MailFlowAuth = {
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        getSession: getSession,
        getUser: getUser,
        requireAuth: requireAuth,
        onAuthStateChange: onAuthStateChange
    };

})();
