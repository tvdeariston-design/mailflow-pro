/**
 * MailFlow Pro — Sistema de Acesso Premium
 *
 * Objetivo:
 *   Verificar acesso premium do utilizador via function server-side.
 *   Validação dupla: frontend (cache) + backend (authoritative).
 *
 * Regras:
 *   1. tvdeariston@gmail.com → Premium vitalício (hardcoded no servidor)
 *   2. Trial de 7 dias a partir do registo
 *   3. Após trial → Premium apenas se subscrição Stripe ativa
 *
 * Segurança:
 *   - A verificação principal é feita no servidor (verificar-premium.js)
 *   - O frontend cacheia o resultado para performance
 *   - O email do administrador está hardcoded no servidor, não no frontend
 *
 * Dependências:
 *   - supabase-client.js (para obter token)
 */

(function() {
    'use strict';

    // ========================================
    // Cache
    // ========================================
    var _cache = null;
    var _cacheTime = 0;
    var CACHE_TTL = 5 * 60 * 1000; // 5 minutos

    // ========================================
    // API URL
    // ========================================
    function getApiUrl() {
        if (typeof window !== 'undefined' && window.location) {
            return window.location.origin;
        }
        return '';
    }

    // ========================================
    // Helpers
    // ========================================

    /**
     * Obter token de autenticação do Supabase.
     */
    function getAuthToken() {
        return new Promise(function(resolve) {
            try {
                if (window.supabaseClient && window.supabaseClient.auth) {
                    window.supabaseClient.auth.getSession().then(function(result) {
                        var session = result.data && result.data.session;
                        resolve(session ? session.access_token : null);
                    }).catch(function() {
                        resolve(null);
                    });
                } else {
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Chamar a function server-side verificar-premium.
     * Esta é a fonte authoritative de premium.
     */
    async function fetchPremiumStatus() {
        var token = await getAuthToken();
        if (!token) {
            return { premium: false, reason: 'not_authenticated' };
        }

        try {
            var response = await fetch(getApiUrl() + '/.netlify/functions/verificar-premium', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });

            if (!response.ok) {
                console.error('[Premium] Erro HTTP:', response.status);
                return { premium: false, reason: 'server_error' };
            }

            var data = await response.json();
            return data;

        } catch (err) {
            console.error('[Premium] Erro de conexão:', err.message);
            return { premium: false, reason: 'network_error' };
        }
    }

    // ========================================
    // Funções Públicas
    // ========================================

    /**
     * Verificar se o utilizador tem acesso premium.
     * Usa cache local + chamada ao servidor.
     *
     * @param {Object|null} user - objeto do utilizador (ignorado, server é authoritative)
     * @returns {Promise<Object>} { premium: boolean, reason: string, ... }
     */
    async function checkPremium(user) {
        var now = Date.now();

        // Usar cache se válido
        if (_cache && (now - _cacheTime) < CACHE_TTL) {
            return _cache;
        }

        // Chamar servidor
        var result = await fetchPremiumStatus();

        // Atualizar cache
        _cache = result;
        _cacheTime = now;

        console.log('[Premium] Estado:', result.premium ? 'PREMIUM (' + result.reason + ')' : 'GRATUITO', result);

        return result;
    }

    /**
     * Verificar se o utilizador tem acesso premium (compatibilidade).
     * Retorna boolean para manter compatibilidade com código existente.
     *
     * @param {Object|null} user - objeto do utilizador
     * @returns {Promise<boolean>}
     */
    async function hasPremiumAccess(user) {
        var result = await checkPremium(user);
        return result.premium === true;
    }

    /**
     * Verificar se o email é do administrador (premium vitalício).
     * Apenas para referência — a verificação real é no servidor.
     *
     * @param {Object} user - objeto do utilizador
     * @returns {boolean}
     */
    function isDevEmail(user) {
        if (!user || !user.email) return false;
        return user.email.toLowerCase() === 'tvdeariston@gmail.com';
    }

    /**
     * Limpar cache (útil após mudanças de estado).
     */
    function clearCache() {
        _cache = null;
        _cacheTime = 0;
    }

    /**
     * Forçar refresh do cache.
     */
    async function refreshPremium(user) {
        clearCache();
        return await checkPremium(user);
    }

    // ========================================
    // Export
    // ========================================
    window.MailFlowDevPermissions = {
        checkPremium: checkPremium,
        hasPremiumAccess: hasPremiumAccess,
        isDevEmail: isDevEmail,
        clearCache: clearCache,
        refreshPremium: refreshPremium
    };

})();
