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
 *   - dev-permissions.js para desenvolvimento - bypass de premium
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
            console.error('[Auth] ❌ CLIENTE SUPABASE NÃO DISPONÍVEL');
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
                return { success: false, error: traduzirErro(result.error.message) };
            }

            // O trigger handle_new_user cria o profile automaticamente
            // Aguardamos o profile existir antes de tentar atualizar o nome
            if (result.data && result.data.user) {
                var userId = result.data.user.id;
                var maxRetries = 10;
                var retryDelay = 200; // ms
                
                for (var i = 0; i < maxRetries; i++) {
                    var { data: profile, error: profileError } = await sb
                        .from('profiles')
                        .select('id')
                        .eq('id', userId)
                        .single();
                    
                    if (!profileError && profile) {
                        // Profile existe, atualizar nome
                        var { error: updateError } = await sb
                            .from('profiles')
                            .update({ nome: nome, updated_at: new Date().toISOString() })
                            .eq('id', userId);
                        
                        if (updateError) {
                            console.error('[Auth] 💥 ERRO UPDATE profiles:', updateError);
                        }
                        break;
                    }
                    
                    // Aguardar antes da próxima tentativa
                    await new Promise(function(resolve) { setTimeout(resolve, retryDelay); });
                }
            }

            return { success: true };

        } catch (err) {
            console.error('[Auth] 💥 CRASH CATCH SIGNUP:', err);
            return { success: false, error: traduzirErro(err.message) || 'Ocorreu um erro. Tente novamente.' };
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
            console.error('[Auth] ❌ CLIENTE SUPABASE NÃO DISPONÍVEL');
            return { success: false, error: 'Serviço de autenticação indisponível.' };
        }

        try {
            var result = await sb.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (result.error) {
                return { success: false, error: traduzirErro(result.error.message) };
            }

            return { success: true };

        } catch (err) {
            console.error('[Auth] 💥 CRASH CATCH SIGNIN:', err);
            return { success: false, error: traduzirErro(err.message) || 'Ocorreu um erro. Tente novamente.' };
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
     */
    function onAuthStateChange(callback) {
        var sb = getClient();
        if (!sb) return;

        sb.auth.onAuthStateChange((event, session) => {
            console.log('[Auth] Estado auth mudou:', { event, session });
            callback(event, session);
        });
    }

    /**
     * Verificar se o utilizador atual tem acesso premium.
     * Valida via function server-side (verificar-premium.js).
     * Cache local de 5 minutos para performance.
     *
     * @param {Object|null} user - objeto do utilizador (passado a partir de getUser())
     * @returns {Promise<boolean>} true se tiver acesso premium, false caso contrário
     */
    async function isPremiumUser(user) {
        // Verificar via servidor se MailFlowDevPermissions estiver disponível
        if (typeof window.MailFlowDevPermissions !== 'undefined' &&
            typeof window.MailFlowDevPermissions.hasPremiumAccess === 'function') {
            return await window.MailFlowDevPermissions.hasPremiumAccess(user);
        }

        // Fallback: sem servidor, assume gratuito (seguro por omissão)
        return false;
    }

    /**
     * Traduzir mensagens de erro do Supabase para português.
     *
     * @param {string} message - mensagem de erro em inglês
     * @returns {string} mensagem traduzida para português
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
        onAuthStateChange: onAuthStateChange,
        isPremiumUser: isPremiumUser
    };

})();
