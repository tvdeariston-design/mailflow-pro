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

    // ============================================
    // 1. Pagamento concluído (checkout.session.completed)
    // ============================================
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

    // ============================================
    // 2. Pagamento de fatura bem-sucedido (renovação)
    // ============================================
    if (stripeEvent.type === 'invoice.payment_succeeded') {
        const invoice = stripeEvent.data.object;
        const subscriptionId = invoice.subscription;
        const customerId = invoice.customer;

        logger.info('Pagamento de fatura bem-sucedido - Subscription: ' + subscriptionId, 'Webhook');

        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, serviceRoleKey);

                // Verificar se subscrição já está ativa
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('subscription_status')
                    .eq('stripe_subscription_id', subscriptionId)
                    .single();

                if (profile && profile.subscription_status !== 'active') {
                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({
                            subscription_status: 'active',
                            stripe_customer_id: customerId,
                            updated_at: new Date().toISOString()
                        })
                        .eq('stripe_subscription_id', subscriptionId);

                    if (updateError) {
                        logger.error('Erro ao ativar subscription: ' + updateError.message, 'Webhook');
                    } else {
                        logger.info('Subscription ativada (renovação): ' + subscriptionId, 'Webhook');
                    }
                }
            }
        } catch (err) {
            logger.error('Erro ao processar renovação: ' + err.message, 'Webhook');
        }
    }

    // ============================================
    // 3. Fatura falhou (pagamento recusado)
    // ============================================
    if (stripeEvent.type === 'invoice.payment_failed') {
        const invoice = stripeEvent.data.object;
        const subscriptionId = invoice.subscription;
        const attemptCount = invoice.attempt_count;

        logger.warn('Pagamento falhou - Subscription: ' + subscriptionId + ', Tentativa: ' + attemptCount, 'Webhook');

        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, serviceRoleKey);

                // Após 3 tentativas falhadas, marcar como past_due
                if (attemptCount >= 3) {
                    const { error } = await supabase
                        .from('profiles')
                        .update({
                            subscription_status: 'past_due',
                            updated_at: new Date().toISOString()
                        })
                        .eq('stripe_subscription_id', subscriptionId);

                    if (error) {
                        logger.error('Erro ao marcar past_due: ' + error.message, 'Webhook');
                    } else {
                        logger.info('Subscription marcada como past_due: ' + subscriptionId, 'Webhook');
                    }
                }
            }
        } catch (err) {
            logger.error('Erro ao processar pagamento falhado: ' + err.message, 'Webhook');
        }
    }

    // ============================================
    // 4. Subscrição atualizada (mudança de status)
    // ============================================
    if (stripeEvent.type === 'customer.subscription.updated') {
        const subscription = stripeEvent.data.object;
        const subscriptionId = subscription.id;
        const status = subscription.status; // active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused
        const customerId = subscription.customer;

        logger.info('Subscrição atualizada - ID: ' + subscriptionId + ', Status: ' + status, 'Webhook');

        // Mapear status do Stripe para nosso sistema
        let ourStatus;
        switch (status) {
            case 'active':
                ourStatus = 'active';
                break;
            case 'trialing':
                ourStatus = 'trial';
                break;
            case 'past_due':
                ourStatus = 'past_due';
                break;
            case 'canceled':
            case 'unpaid':
            case 'incomplete_expired':
                ourStatus = 'canceled';
                break;
            case 'paused':
                ourStatus = 'paused';
                break;
            default:
                ourStatus = status;
        }

        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, serviceRoleKey);

                const { error } = await supabase
                    .from('profiles')
                    .update({
                        subscription_status: ourStatus,
                        stripe_customer_id: customerId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (error) {
                    logger.error('Erro ao atualizar status subscription: ' + error.message, 'Webhook');
                } else {
                    logger.info('Status da subscription atualizado para ' + ourStatus + ': ' + subscriptionId, 'Webhook');
                }
            }
        } catch (err) {
            logger.error('Erro ao processar subscription.updated: ' + err.message, 'Webhook');
        }
    }

    // ============================================
    // 5. Subscrição cancelada (fim do período)
    // ============================================
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
