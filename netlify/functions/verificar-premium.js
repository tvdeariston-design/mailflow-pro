/**
 * MailFlow Pro — Function: Verificar Premium
 *
 * Objetivo:
 *   Validar o estado de acesso premium do utilizador autenticado.
 *   Function server-side que impede bypass via JavaScript no frontend.
 *
 * Lógica:
 *   1. Premium vitalício → sempre true (email administrador)
 *   2. Subscrição Stripe ativa → true
 *   3. Trial de 7 dias não expirado → true
 *   4. Caso contrário → false
 *
 * Inputs:
 *   - Authorization: Bearer <token> (obrigatório)
 *
 * Outputs:
 *   - 200: { premium: bool, reason: string, trial_end?: string, days_remaining?: number }
 *   - 401: Não autenticado
 *   - 500: Erro interno
 *
 * Dependências:
 *   - @supabase/supabase-js
 *   - config.js, logger.js, utils.js
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');
const { createResponse, createErrorResponse } = require('./utils');

// Emails com premium vitalício (hardcoded no servidor — não manipulável pelo frontend)
const PERMANENT_PREMIUM_EMAILS = ['tvdeariston@gmail.com'];

exports.handler = async (event, context) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, '');
    }

    if (event.httpMethod !== 'GET') {
        return createErrorResponse(405, 'Method not allowed');
    }

    // Extrair token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return createErrorResponse(401, 'Não autenticado');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
        logger.error('Variáveis Supabase em falta', 'VerificarPremium');
        return createErrorResponse(500, 'Serviço indisponível');
    }

    // Criar client com token do utilizador
    const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: 'Bearer ' + token } }
    });

    // Verificar utilizador
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return createErrorResponse(401, 'Sessão inválida');
    }

    try {
        // Buscar profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            logger.warn('Profile não encontrado para user: ' + user.id, 'VerificarPremium');
            return createResponse(200, {
                premium: false,
                reason: 'none'
            });
        }

        const email = (profile.email || '').toLowerCase();
        const now = new Date();

        // 1. Premium vitalício (email administrador — hardcoded no servidor)
        if (PERMANENT_PREMIUM_EMAILS.includes(email) || profile.is_permanent_premium) {
            logger.info('Premium vitalício: ' + email, 'VerificarPremium');
            return createResponse(200, {
                premium: true,
                reason: 'permanent'
            });
        }

        // 2. Subscrição Stripe ativa
        if (profile.subscription_status === 'active' && profile.stripe_subscription_id) {
            logger.info('Premium por subscrição: ' + email, 'VerificarPremium');
            return createResponse(200, {
                premium: true,
                reason: 'subscription'
            });
        }

        // 3. Trial de 7 dias
        if (profile.premium_trial_end) {
            const trialEnd = new Date(profile.premium_trial_end);
            const diffMs = trialEnd.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (trialEnd > now) {
                logger.info('Premium por trial: ' + email + ' (restam ' + daysRemaining + ' dias)', 'VerificarPremium');
                return createResponse(200, {
                    premium: true,
                    reason: 'trial',
                    trial_end: profile.premium_trial_end,
                    days_remaining: daysRemaining
                });
            }
        }

        // 4. Sem acesso premium
        logger.info('Sem premium: ' + email, 'VerificarPremium');
        return createResponse(200, {
            premium: false,
            reason: 'expired',
            trial_end: profile.premium_trial_end || null,
            days_remaining: 0
        });

    } catch (error) {
        logger.error('Erro ao verificar premium: ' + error.message, 'VerificarPremium');
        return createErrorResponse(500, 'Erro ao verificar estado premium');
    }
};
