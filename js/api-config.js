/**
 * MailFlow Pro — Configuração Centralizada de API
 *
 * Objetivo:
 *   Único local onde as URLs da API são definidas.
 *   Detecta automaticamente se está a correr no Netlify ou Render.
 *
 * Regras:
 *   - No Render (onrender.com): API está no mesmo domínio → ""
 *   - No Netlify (netlify.app): API está no Render → "https://mailflow-pro.onrender.com"
 *   - Em localhost: API no Render (para testes) → "https://mailflow-pro.onrender.com"
 */

(function() {
    'use strict';

    // ========================================
    // Detectar ambiente
    // ========================================
    var hostname = window.location.hostname;
    var isRender = hostname.includes('onrender.com');
    var isNetlify = hostname.includes('netlify.app');
    var isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Base URL da API
    var API_BASE_URL = '';

    if (isRender) {
        // Mesmo domínio - API servida pelo Express
        API_BASE_URL = '';
    } else {
        // Netlify ou localhost - apontar para Render
        API_BASE_URL = 'https://mailflow-pro.onrender.com';
    }

    // ========================================
    // Endpoints
    // ========================================
    var endpoints = {
        // Auth
        auth: {
            signup: API_BASE_URL + '/api/auth/signup',
        },

        // Profile
        profile: {
            get: API_BASE_URL + '/api/profile',
            update: API_BASE_URL + '/api/profile',
        },

        // Premium
        premium: {
            status: API_BASE_URL + '/api/premium/status',
        },

        // Checkout
        checkout: {
            create: API_BASE_URL + '/api/checkout/create',
        },

        // Email
        email: {
            send: API_BASE_URL + '/api/email/send',
        },

        // Webhook (server-to-server only)
        webhook: {
            stripe: API_BASE_URL + '/api/webhook/stripe',
        },
    };

    // ========================================
    // Export
    // ========================================
    window.MailFlowAPI = endpoints;

    // Debug
    console.log('[API Config] Ambiente:', {
        hostname: hostname,
        isRender: isRender,
        isNetlify: isNetlify,
        isLocalhost: isLocalhost,
        API_BASE_URL: API_BASE_URL
    });

})();
