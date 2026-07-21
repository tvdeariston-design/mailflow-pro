const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { config, validateConfig } = require('./config');
const logger = require('./logger');
const {
    createResponse,
    createErrorResponse,
    validateRequiredFields,
    validateEmail,
} = require('./utils');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, '');
    }

    if (event.httpMethod !== 'POST') {
        return createErrorResponse(405, 'Method not allowed');
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return createErrorResponse(400, 'JSON inválido');
    }

    const fields = validateRequiredFields(body, ['email']);
    if (!fields.valid) {
        return createErrorResponse(400, 'Campo obrigatório em falta: ' + fields.missing.join(', '));
    }

    const email = body.email.trim();
    if (!validateEmail(email)) {
        return createErrorResponse(400, 'Formato de email inválido');
    }

    const validation = validateConfig(['stripe.secretKey', 'stripe.priceId']);
    if (!validation.valid) {
        logger.error('Variáveis Stripe em falta: ' + validation.missing.join(', '), 'Checkout');
        return createErrorResponse(500, 'Serviço de pagamento indisponível');
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: config.stripe.priceId,
                quantity: 1,
            }],
            mode: 'subscription',
            customer_email: email,
            success_url: config.netlify.successUrl,
            cancel_url: config.netlify.cancelUrl,
        });

        logger.info('Sessão criada - Email: ' + email + ', Session: ' + session.id, 'Checkout');

        return createResponse(200, { id: session.id });

    } catch (error) {
        logger.error('Falha ao criar sessão para ' + email + ': ' + error.message, 'Checkout');
        return createErrorResponse(500, 'Erro ao processar pagamento');
    }
};
