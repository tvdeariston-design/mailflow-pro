/**
 * MailFlow Pro — Function: Verificar Premium
 *
 * Objetivo:
 *   Validar o estado de acesso premium do utilizador autenticado.
 *   Function server-side que impede bypass via JavaScript no frontend.
 *
 * Lógica:
 *   Chama a função SQL RPC verificar_status_premium (migration 004)
 *   que é a fonte authoritative de verdade.
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
        // Chamar função SQL RPC (source of truth - migration 004)
        const { data, error } = await supabase.rpc('verificar_status_premium', {
            user_id: user.id
        });

        if (error) {
            logger.error('Erro RPC verificar_status_premium: ' + error.message, 'VerificarPremium');
            return createErrorResponse(500, 'Erro ao verificar estado premium');
        }

        // RPC retorna array com uma linha
        const result = data && data[0] ? data[0] : {
            premium: false,
            reason: 'none',
            trial_end: null,
            days_remaining: null
        };

        // Log para auditoria
        logger.info('Verificação premium: ' + user.email + ' -> ' + (result.premium ? 'PREMIUM (' + result.reason + ')' : 'GRATUITO'), 'VerificarPremium');

        return createResponse(200, result);

    } catch (error) {
        logger.error('Erro ao verificar premium: ' + error.message, 'VerificarPremium');
        return createErrorResponse(500, 'Erro ao verificar estado premium');
    }
};
