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

    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        logger.error('Variáveis Supabase em falta', 'CriarConta');
        return createErrorResponse(500, 'Serviço de registo indisponível');
    }

    // Criar cliente com service_role (bypass RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    try {
        // Criar utilizador no Supabase Auth
        const { data, error } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { nome: nome }
        });

        if (error) {
            if (error.message.includes('already registered')) {
                logger.warn('Tentativa de registo com email existente: ' + email, 'CriarConta');
                return createErrorResponse(409, 'Este email já está registado.');
            }
            logger.error('Erro ao criar utilizador: ' + error.message, 'CriarConta');
            return createErrorResponse(500, 'Erro ao criar conta. Tente novamente.');
        }

        // Profile é criado pelo trigger handle_new_user (migration 003)
        // O trigger initialize_premium_trial (migration 004) inicializa trial automaticamente
        // Não fazemos upsert manual - os triggers tratam de tudo
        // Apenas logamos se houver erro no trigger
        logger.info('Conta criada com sucesso - Email: ' + email + ', ID: ' + data.user.id, 'CriarConta');

        return createResponse(201, {
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (error) {
        logger.error('Erro inesperado ao criar conta: ' + error.message, 'CriarConta');
        return createErrorResponse(500, 'Erro ao processar registo');
    }
};
