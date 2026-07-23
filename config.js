/**
 * MailFlow Pro - Configuração Centralizada
 *
 * Centraliza todas as variáveis de ambiente e fornece funções
 * de validação lazy (só valida quando a função é realmente chamada).
 *
 * Funciona tanto no Netlify Functions como no Render Web Service.
 */

// URL padrão - funciona tanto Netlify como Render
const SITE_URL_DEFAULT = process.env.RENDER_EXTERNAL_URL 
    ? `https://${process.env.RENDER_EXTERNAL_URL}` 
    : (process.env.URL || 'https://mailflow-pro.netlify.app');

const config = {
    stripe: {
        get secretKey() {
            return process.env.STRIPE_SECRET_KEY || null;
        },
        get priceId() {
            return process.env.STRIPE_PRICE_ID || null;
        },
        get webhookSecret() {
            return process.env.STRIPE_WEBHOOK_SECRET || null;
        },
        get publishableKey() {
            return process.env.STRIPE_PUBLISHABLE_KEY || null;
        },
    },

    email: {
        get user() {
            return process.env.EMAIL_USER || null;
        },
        get pass() {
            return process.env.EMAIL_PASS || null;
        },
    },

    // URLs funcionam tanto Netlify como Render
    app: {
        get siteUrl() {
            return process.env.RENDER_EXTERNAL_URL 
                ? `https://${process.env.RENDER_EXTERNAL_URL}` 
                : (process.env.URL || SITE_URL_DEFAULT);
        },
        get successUrl() {
            return process.env.SUCCESS_URL || `${config.app.siteUrl}/sucesso.html`;
        },
        get cancelUrl() {
            return process.env.CANCEL_URL || config.app.siteUrl;
        },
    },
};

const SITE_URL_DEFAULT = 'https://mailflow-pro.netlify.app';

/**
 * Valida que variáveis essenciais para uma function específica estão definidas.
 * Só deve ser chamado dentro da function que precisa das variáveis.
 *
 * @param {string[]} requiredKeys - Chaves a validar (ex: ['stripe.secretKey', 'stripe.priceId'])
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateConfig(requiredKeys) {
    const missing = [];

    for (const key of requiredKeys) {
        const parts = key.split('.');
        let value = config;

        for (const part of parts) {
            if (value === undefined || value === null) {
                missing.push(key);
                break;
            }
            value = typeof value === 'function' ? value() : value[part];
        }

        if (value === null || value === undefined || value === '') {
            missing.push(key);
        }
    }

    return {
        valid: missing.length === 0,
        missing,
    };
}

module.exports = { config, validateConfig };
