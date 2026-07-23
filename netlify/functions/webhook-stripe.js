const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { config, validateConfig } = require('./config');
const logger = require('./logger');
const { createResponse, createErrorResponse } = require('./utils');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(200, '');
    }

    if (event.httpMethod !== 'POST') {
        return createErrorResponse(405, 'Method not allowed');
    }

    const validation = validateConfig(['stripe.secretKey', 'stripe.webhookSecret']);
    if (!validation.valid) {
        logger.error('Variáveis Stripe webhook em falta: ' + validation.missing.join(', '), 'Webhook');
        return createErrorResponse(500, 'Webhook não configurado');
    }

    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            config.stripe.webhookSecret
        );
    } catch (err) {
        logger.error('Assinatura webhook inválida: ' + err.message, 'Webhook');
        return createErrorResponse(400, 'Assinatura inválida');
    }

    logger.info('Evento recebido: ' + stripeEvent.type, 'Webhook');

    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const email = session.customer_email;

        if (!email) {
            logger.error('checkout.session.completed sem customer_email. Session: ' + session.id, 'Webhook');
            return createResponse(200, { received: true });
        }

        const nome = email.split('@')[0];
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        logger.info('Pagamento concluído - Email: ' + email + ', Session: ' + session.id, 'Webhook');

        // Guardar dados da subscrição no profile
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, serviceRoleKey);

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        stripe_subscription_id: subscriptionId,
                        stripe_customer_id: customerId,
                        subscription_status: 'active',
                        updated_at: new Date().toISOString()
                    })
                    .eq('email', email);

                if (updateError) {
                    logger.error('Erro ao guardar subscription: ' + updateError.message, 'Webhook');
                } else {
                    logger.info('Subscription guardada no profile: ' + email, 'Webhook');
                }
            }
        } catch (err) {
            logger.error('Erro ao atualizar profile: ' + err.message, 'Webhook');
        }

        // Enviar email de boas-vindas
        try {
            const siteUrl = config.netlify.siteUrl;
            const response = await fetch(siteUrl + '/.netlify/functions/enviar-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, nome })
            });

            const result = await response.json();
            logger.info('Resposta enviar-email: ' + JSON.stringify(result), 'Webhook');
        } catch (err) {
            logger.error('Falha ao chamar enviar-email: ' + err.message, 'Webhook');
        }
    }

    // Cancelamento de subscrição
    if (stripeEvent.type === 'customer.subscription.deleted') {
        const subscription = stripeEvent.data.object;
        const subscriptionId = subscription.id;

        logger.info('Subscrição cancelada: ' + subscriptionId, 'Webhook');

        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, serviceRoleKey);

                const { error } = await supabase
                    .from('profiles')
                    .update({
                        subscription_status: 'canceled',
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (error) {
                    logger.error('Erro ao cancelar subscription: ' + error.message, 'Webhook');
                } else {
                    logger.info('Subscription cancelada no profile: ' + subscriptionId, 'Webhook');
                }
            }
        } catch (err) {
            logger.error('Erro ao atualizar profile: ' + err.message, 'Webhook');
        }
    }

    return createResponse(200, { received: true });
};
