/**
 * MailFlow Pro — Function: Perfil
 *
 * Objetivo:
 *   Ler e atualizar o profile do utilizador autenticado.
 *   Fornece uma API segura para gerir dados do perfil,
 *   isolando o frontend da DB diretamente.
 *
 * Inputs:
 *   - GET: Authorization header (Bearer token)
 *   - PUT: { nome?, empresa?, telefone?, timezone?, locale? }
 *
 * Outputs:
 *   - GET 200: { profile: { id, email, nome, empresa, ... } }
 *   - PUT 200: { profile: { ...atualizado } }
 *   - 400: Campos inválidos
 *   - 401: Não autenticado
 *   - 404: Profile não encontrado
 *   - 500: Erro interno
 *
 * Erros possíveis:
 *   - Token inválido ou expirado
 *   - Profile não existe
 *   - Campos com valores inválidos
 *
 * Dependências:
 *   - @supabase/supabase-js
 *   - config.js
 *   - logger.js
 *   - utils.js
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');
const {
    createResponse,
    createErrorResponse,
    validateStringLength,
} = require('./utils');

exports.handler = async (event, context) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, '');
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
        logger.error('Variáveis Supabase em falta', 'Perfil');
        return createErrorResponse(500, 'Serviço indisponível');
    }

    // Criar client com anon key + token do utilizador
    const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: 'Bearer ' + token } }
    });

    // Verificar utilizador
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return createErrorResponse(401, 'Sessão inválida');
    }

    // GET: Ler profile
    if (event.httpMethod === 'GET') {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error || !data) {
                return createErrorResponse(404, 'Profile não encontrado');
            }

            return createResponse(200, { profile: data });

        } catch (error) {
            logger.error('Erro ao ler profile: ' + error.message, 'Perfil');
            return createErrorResponse(500, 'Erro ao carregar profile');
        }
    }

    // PUT: Atualizar profile
    if (event.httpMethod === 'PUT') {
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            return createErrorResponse(400, 'JSON inválido');
        }

        // Validar campos
        const updates = {};

        if (body.nome !== undefined) {
            const nomeCheck = validateStringLength(body.nome, 1, 200);
            if (!nomeCheck.valid) {
                return createErrorResponse(400, 'Nome inválido');
            }
            updates.nome = body.nome.trim();
        }

        if (body.empresa !== undefined) {
            const empresaCheck = validateStringLength(body.empresa, 0, 200);
            if (!empresaCheck.valid) {
                return createErrorResponse(400, 'Empresa inválida');
            }
            updates.empresa = body.empresa.trim();
        }

        if (body.telefone !== undefined) {
            updates.telefone = body.telefone.trim();
        }

        if (body.timezone !== undefined) {
            updates.timezone = body.timezone;
        }

        if (body.locale !== undefined) {
            updates.locale = body.locale;
        }

        updates.updated_at = new Date().toISOString();

        try {
            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id)
                .select()
                .single();

            if (error) {
                logger.error('Erro ao atualizar profile: ' + error.message, 'Perfil');
                return createErrorResponse(500, 'Erro ao guardar alterações');
            }

            logger.info('Profile atualizado - User: ' + user.id, 'Perfil');
            return createResponse(200, { profile: data });

        } catch (error) {
            logger.error('Erro inesperado ao atualizar profile: ' + error.message, 'Perfil');
            return createErrorResponse(500, 'Erro ao processar alterações');
        }
    }

    return createErrorResponse(405, 'Method not allowed');
};
