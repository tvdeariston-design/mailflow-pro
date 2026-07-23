/**
 * MailFlow Pro — Function: Criar Conta
 *
 * Objetivo:
 *   Criar novo utilizador no Supabase Auth e o profile na tabela profiles.
 *   Usado quando o frontend precisa de service_role para operações que o anon key
 *   não permite.
 *
 * Inputs:
 *   - email: string (obrigatório)
 *   - password: string (obrigatório)
 *   - nome: string (obrigatório)
 *
 * Outputs:
 *   - 201: { success: true, user: { id, email } }
 *   - 400: Campos em falta ou formato inválido
 *   - 409: Email já registado
 *   - 500: Erro interno
 *
 * Erros possíveis:
 *   - Email já existe no Supabase Auth
 *   - Password fraca
 *   - Variáveis de ambiente em falta
 *   - Erro de conexão com Supabase
 *
 * Dependências:
 *   - config.js (variáveis de ambiente)
 *   - logger.js (logging estruturado)
 *   - utils.js (validação, CORS, responses)
 *   - @supabase/supabase-js (client com service_role)
 */

const { createClient } = require('@supabase/supabase-js');
const { config, validateConfig } = require('./config');
const logger = require('./logger');
const {
    createResponse,
    createErrorResponse,
    validateRequiredFields,
    validateEmail,
} = require('./utils');

exports.handler = async (event, context) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, '');
    }

    if (event.httpMethod !== 'POST') {
        return createErrorResponse(405, 'Method not allowed');
    }

    // Parse body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return createErrorResponse(400, 'JSON inválido');
    }

    // Validar campos obrigatórios
    const fields = validateRequiredFields(body, ['email', 'password', 'nome']);
    if (!fields.valid) {
        return createErrorResponse(400, 'Campo obrigatório em falta: ' + fields.missing.join(', '));
    }

    const email = body.email.trim();
    const password = body.password;
    const nome = body.nome.trim();

    // Validar email
    if (!validateEmail(email)) {
        return createErrorResponse(400, 'Formato de email inválido');
    }

    // Validar password
    if (password.length < 6) {
        return createErrorResponse(400, 'A password deve ter pelo menos 6 caracteres');
    }

    // Validar nome
    if (nome.length < 1 || nome.length > 200) {
        return createErrorResponse(400, 'Nome inválido');
    }

    // ============================================
    // LOGS DE DEBUG DETALHADOS — DIAGNÓSTICO "fetch failed"
    // ============================================
    logger.info('[DEBUG] === INÍCIO CRIAR CONTA ===', 'CriarConta');
    logger.info('[DEBUG] Node version: ' + process.version, 'CriarConta');
    logger.info('[DEBUG] SUPABASE_URL existe: ' + Boolean(process.env.SUPABASE_URL), 'CriarConta');
    logger.info('[DEBUG] SUPABASE_URL (primeiros 30 chars): ' + (process.env.SUPABASE_URL || 'undefined').substring(0, 30), 'CriarConta');
    logger.info('[DEBUG] SUPABASE_SERVICE_ROLE_KEY existe: ' + Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), 'CriarConta');
    logger.info('[DEBUG] SUPABASE_SERVICE_ROLE_KEY length: ' + (process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 'undefined'), 'CriarConta');

    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        logger.error('Variáveis Supabase em falta', 'CriarConta');
        return createErrorResponse(500, 'Serviço de registo indisponível');
    }

    logger.info('[DEBUG] Variáveis OK, a criar cliente Supabase...', 'CriarConta');

    // Criar cliente com service_role (bypass RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    logger.info('[DEBUG] Cliente Supabase criado com sucesso', 'CriarConta');
    logger.info('[DEBUG] A chamar auth.admin.createUser()...', 'CriarConta');

    try {
        // Criar utilizador no Supabase Auth
        const { data, error } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { nome: nome }
        });

        logger.info('[DEBUG] auth.admin.createUser() retornou', 'CriarConta');

        if (error) {
            logger.error('[DEBUG] Erro retornado pelo Supabase:', 'CriarConta');
            logger.error('[DEBUG] error object completo: ' + JSON.stringify(error, Object.getOwnPropertyNames(error)), 'CriarConta');
            if (error.message.includes('already registered')) {
                logger.warn('Tentativa de registo com email existente: ' + email, 'CriarConta');
                return createErrorResponse(409, 'Este email já está registado.');
            }
            logger.error('Erro ao criar utilizador: ' + error.message, 'CriarConta');
            return createErrorResponse(500, 'Erro ao criar conta. Tente novamente.');
        }

        // ============================================
        // Profile: O trigger handle_new_user (migration 003) cria o profile
        // O trigger initialize_premium_trial (migration 004) inicializa o trial
        // Fazemos upsert de fallback apenas dos campos básicos (nome, email)
        // SEM colunas premium - os triggers tratam delas
        // ============================================
        const now = new Date().toISOString();
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: data.user.id,
                email: email,
                nome: nome,
                updated_at: now
            }, { onConflict: 'id' });

        if (profileError) {
            logger.warn('Profile upsert fallback falhou (trigger pode ter funcionado): ' + profileError.message, 'CriarConta');
        }

        logger.info('Conta criada com sucesso - Email: ' + email + ', ID: ' + data.user.id, 'CriarConta');

        return createResponse(201, {
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (error) {
        logger.error('[DEBUG] === ERRO NO CATCH ===', 'CriarConta');
        logger.error('[DEBUG] error.name: ' + error.name, 'CriarConta');
        logger.error('[DEBUG] error.message: ' + error.message, 'CriarConta');
        logger.error('[DEBUG] error.stack: ' + error.stack, 'CriarConta');
        logger.error('[DEBUG] error.cause: ' + JSON.stringify(error.cause, null, 2), 'CriarConta');
        logger.error('[DEBUG] error (JSON.stringify com todas props): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)), 'CriarConta');
        logger.error('Erro inesperado ao criar conta: ' + error.message, 'CriarConta');
        return createErrorResponse(500, 'Erro ao processar registo');
    }
};
