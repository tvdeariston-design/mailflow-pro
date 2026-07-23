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
 *   - *** NOVO: *** dev-permissions.js para desenvolvimento - bypass de premium
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
        console.log('\n🔐 === SIGNUP FLOW START ===');
        console.log('📤 Input parameters:', { email, password: '[HIDDEN]', nome });
        
        var sb = getClient();
        if (!sb) {
            console.error('[Auth] ❌ CLIENTE SUPABASE NÃO DISPONÍVEL');
            return { success: false, error: 'Serviço de autenticação indisponível.' };
        }

        console.log('[Auth] ✅ Client Supabase obtido:', !!sb);

        try {
            console.log('[Auth] 📡 Chamando sb.auth.signUp()...');
            var result = await sb.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { nome: nome }
                }
            });

            console.log('\n📥 SIGNUP RESPONSE COMPLETO:');
            console.log('   result:', result);
            console.log('   result.error:', result.error);
            console.log('   result.data:', result.data);
            console.log('   result.session:', result.session);
            console.log('   Full result object:', JSON.stringify(result, null, 2));

            if (result.error) {
                console.error('[Auth] ❌ ERRO DE SIGNUP DETECTADO:');
                console.error('   Message:', result.error.message);
                console.error('   Status:', result.error.status);
                console.error('   Name:', result.error.name);
                console.error('   Código completo do erro:', result.error);
                console.error('   📝 Mensagem original SUPABASE NÃO ESCONCHIDA:');
                console.error('      ', result.error.message);
            }

            // Atualizar profile com nome (trigger cria com raw_user_meta_data)
            if (!result.error && result.data && result.data.user) {
                console.log('\n📝 PROCESSANDO USER.PARA PROFILE UPDATE:');
                console.log('   📋 user.id:', result.data.user.id);
                console.log('   📋 user.email:', result.data.user.email);
                console.log('   📋 user.email confirmed:', result.data.user.email_confirmed_at);
                console.log('   📋 user.metadata:', result.data.user.user_metadata);

                console.log('   🚨 EXECUTANDO UPDATE profiles...');
                const { data, error } = await sb
                    .from('profiles')
                    .update({ nome: nome, updated_at: new Date().toISOString() })
                    .eq('id', result.data.user.id);
                    
                console.log('   📋 RESULTADO UPDATE profiles:');
                console.log('      data:', data);
                console.log('      error:', error);
                console.log('      error.message:', error?.message);
                console.log('      error.code:', error?.code);
                console.log('      error.details:', error?.details);
                console.log('      error.hint:', error?.hint);
                console.log('      Full error object:', JSON.stringify(error, null, 2));
                
                if (error) {
                    console.error('[Auth] 💥 ERRO UPDATE profiles:');
                    console.error('   ', error);
                    console.log('[Auth] ✨ CONCLUSÃO: Profile pode ainda não existir (trigger ainda em progresso)');
                } else {
                    console.log('[Auth] ✅ UPDATE profiles bem-sucedido:', data);
                }
            }

            console.log('\n🎯 RESULTADO SIGNUP:');
            console.log('   Success:', result.success);
            console.log('   Tem user.data:', !!(result.data?.user));
            console.log('   Erro presente:', !!result.error);
            console.log('   Session presente:', !!result.session);

            return {
                success: !result.error,
                error: result.error ? traduzirErro(result.error.message) : undefined
            };

        } catch (err) {
            console.error('\n💥 CRASH CATCH SIGNUP:');
            console.error('   Error:', err);
            console.error('   Message:', err.message);
            console.error('   Stack:', err.stack);
            console.error('   📝 ERRO ORIGINAL SUPABASE COMPLETO:');
            console.error('      ', err.message);
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
        console.log('\n🔐 === SIGNIN FLOW START ===');
        console.log('📤 Input parameters:', { email, password: '[HIDDEN]' });
        
        var sb = getClient();
        if (!sb) {
            console.error('[Auth] ❌ CLIENTE SUPABASE NÃO DISPONÍVEL');
            return { success: false, error: 'Serviço de autenticação indisponível.' };
        }

        console.log('[Auth] ✅ Client Supabase obtido:', !!sb);

        try {
            console.log('[Auth] 📡 Chamando sb.auth.signInWithPassword()...');
            var result = await sb.auth.signInWithPassword({
                email: email,
                password: password
            });

            console.log('\n📥 SIGNIN RESPONSE COMPLETO:');
            console.log('   result:', result);
            console.log('   result.error:', result.error);
            console.log('   result.data:', result.data);
            console.log('   result.session:', result.session);
            console.log('   Full result object:', JSON.stringify(result, null, 2));

            if (result.error) {
                console.error('[Auth] ❌ ERRO DE SIGNIN DETECTADO:');
                console.error('   Message:', result.error.message);
                console.error('   Status:', result.error.status);
                console.error('   Name:', result.error.name);
                console.error('   Código completo do erro:', result.error);
                console.error('   📝 Mensagem original SUPABASE NÃO ESCONCHIDA:');
                console.error('      ', result.error.message);
                console.error('   🔍 DETALHES COMPLETOS:', {
                    message: result.error.message,
                    status: result.error.status,
                    name: result.error.name,
                    code: result.error.code,
                    hint: result.error.hint,
                    details: result.error.details,
                    stack: result.error.stack
                });
            }

            console.log('\n🎯 RESULTADO SIGNIN:');
            console.log('   Success:', result.success);
            console.log('   Tem user.data:', !!(result.data?.user));
            console.log('   Erro presente:', !!result.error);
            console.log('   Session presente:', !!result.session);

            if (result.data?.user) {
                console.log('\n👤 USER INFO:');
                console.log('   user.id:', result.data.user.id);
                console.log('   user.email:', result.data.user.email);
                console.log('   user.email_confirmed:', result.data.user.email_confirmed_at);
                console.log('   user.metadata:', result.data.user.user_metadata);
                console.log('   user.created_at:', result.data.user.created_at);
            }

            return {
                success: !result.error,
                error: result.error ? traduzirErro(result.error.message) : undefined
            };

        } catch (err) {
            console.error('\n💥 CRASH CATCH SIGNIN:');
            console.error('   Error:', err);
            console.error('   Message:', err.message);
            console.error('   Stack:', err.stack);
            console.error('   📝 ERRO ORIGINAL SUPABASE COMPLETO:');
            console.error('      ', err.message);
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
     * Verificar se o email atual está em desenvolvimento bypassado.
     * Útil para logs e depuração.
     *
     * @param {Object} user - objeto do utilizador
     * @returns {boolean}
     */
    function isDevBypassEmail(user) {
        if (typeof window.MailFlowDevPermissions !== 'undefined' && 
            typeof window.MailFlowDevPermissions.isDevEmail === 'function') {
            return window.MailFlowDevPermissions.isDevEmail(user);
        }
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
        // *** NOVO: *** Funções de permissão premium para desenvolvimento
        isPremiumUser: isPremiumUser,
        isDevBypassEmail: isDevBypassEmail
    };

})();
