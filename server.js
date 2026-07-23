/**
 * MailFlow Pro — Express Server for Render
 * 
 * Servidor Express que expõe as mesmas APIs das Netlify Functions
 * para funcionar como Web Service no Render.
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

const app = express();
const path = require('path');
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
// Servir ficheiros estáticos da raiz do projeto
app.use(express.static(path.join(__dirname)));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================
// Configuração Supabase
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente Supabase para operações admin (service_role)
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ============================================
// Helpers
// ============================================
function createResponse(statusCode, body) {
    return res.status(statusCode).json(body);
}

function createErrorResponse(statusCode, message) {
    return res.status(statusCode).json({ success: false, error: message });
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateRequiredFields(data, fields) {
    const missing = [];
    for (const field of fields) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            missing.push(field);
        }
    }
    return { valid: missing.length === 0, missing };
}

function validateStringLength(value, min, max) {
    if (value === null || value === undefined) return { valid: false, reason: 'missing' };
    const len = value.length;
    if (min > 0 && len < min) return { valid: false, reason: 'too_short' };
    if (max > 0 && len > max) return { valid: false, reason: 'too_long' };
    return { valid: true };
}

function sanitizeHtml(text) {
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#47;');
}

// Logger simples
const logger = {
    info: (msg, ctx) => console.log(`[INFO] ${new Date().toISOString()} [${ctx}] ${msg}`),
    warn: (msg, ctx) => console.warn(`[WARN] ${new Date().toISOString()} [${ctx}] ${msg}`),
    error: (msg, ctx) => console.error(`[ERROR] ${new Date().toISOString()} [${ctx}] ${msg}`),
};

// ============================================
// Middleware de autenticação
// ============================================
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ success: false, error: 'Serviço indisponível' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }

    req.user = user;
    req.supabase = supabase;
    next();
}

// ============================================
// ROTAS
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 1. CRIAR CONTA (equivalente a criar-conta)
// ============================================
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, nome } = req.body;

        // Validações
        const fields = validateRequiredFields(req.body, ['email', 'password', 'nome']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        const cleanNome = nome.trim();

        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'A password deve ter pelo menos 6 caracteres' });
        }

        if (cleanNome.length < 1 || cleanNome.length > 200) {
            return res.status(400).json({ success: false, error: 'Nome inválido' });
        }

        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Serviço de registo indisponível' });
        }

        // Criar utilizador no Supabase Auth
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: password,
            email_confirm: true,
            user_metadata: { nome: cleanNome }
        });

        if (error) {
            if (error.message.includes('already registered')) {
                return res.status(409).json({ success: false, error: 'Este email já está registado.' });
            }
            logger.error('Erro ao criar utilizador: ' + error.message, 'Signup');
            return res.status(500).json({ success: false, error: 'Erro ao criar conta. Tente novamente.' });
        }

        // Profile upsert (fallback)
        const now = new Date().toISOString();
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: data.user.id,
                email: cleanEmail,
                nome: cleanNome,
                updated_at: now
            }, { onConflict: 'id' });

        if (profileError) {
            logger.warn('Profile upsert fallback falhou: ' + profileError.message, 'Signup');
        }

        logger.info('Conta criada com sucesso - Email: ' + cleanEmail + ', ID: ' + data.user.id, 'Signup');

        res.status(201).json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (error) {
        logger.error('Erro inesperado ao criar conta: ' + error.message, 'Signup');
        res.status(500).json({ success: false, error: 'Erro ao processar registo' });
    }
});

// ============================================
// 2. LOGIN (usar Supabase Auth directamente no frontend)
// ============================================
// O frontend usa supabase.auth.signInWithPassword() directamente
// Não precisamos de endpoint aqui

// ============================================
// 3. VERIFICAR PREMIUM (equivalente a verificar-premium)
// ============================================
app.get('/api/premium/status', authMiddleware, async (req, res) => {
    try {
        // Chamar função SQL RPC (source of truth)
        const { data, error } = await req.supabase.rpc('verificar_status_premium', {
            user_id: req.user.id
        });

        if (error) {
            logger.error('Erro RPC verificar_status_premium: ' + error.message, 'PremiumStatus');
            return res.status(500).json({ success: false, error: 'Erro ao verificar estado premium' });
        }

        const result = data && data[0] ? data[0] : {
            premium: false,
            reason: 'none',
            trial_end: null,
            days_remaining: null
        };

        logger.info('Verificação premium: ' + req.user.email + ' -> ' + (result.premium ? 'PREMIUM (' + result.reason + ')' : 'GRATUITO'), 'PremiumStatus');

        res.json(result);

    } catch (error) {
        logger.error('Erro ao verificar premium: ' + error.message, 'PremiumStatus');
        res.status(500).json({ success: false, error: 'Erro ao verificar estado premium' });
    }
});

// ============================================
// 4. PERFIL - GET (equivalente a perfil GET)
// ============================================
app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Profile não encontrado' });
        }

        res.json({ profile: data });

    } catch (error) {
        logger.error('Erro ao ler profile: ' + error.message, 'Profile');
        res.status(500).json({ success: false, error: 'Erro ao carregar profile' });
    }
});

// ============================================
// 5. PERFIL - PUT (equivalente a perfil PUT)
// ============================================
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        const updates = {};

        if (body.nome !== undefined) {
            const nomeCheck = validateStringLength(body.nome, 1, 200);
            if (!nomeCheck.valid) {
                return res.status(400).json({ success: false, error: 'Nome inválido' });
            }
            updates.nome = body.nome.trim();
        }

        if (body.empresa !== undefined) {
            const empresaCheck = validateStringLength(body.empresa, 0, 200);
            if (!empresaCheck.valid) {
                return res.status(400).json({ success: false, error: 'Empresa inválida' });
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

        const { data, error } = await req.supabase
            .from('profiles')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) {
            logger.error('Erro ao atualizar profile: ' + error.message, 'Profile');
            return res.status(500).json({ success: false, error: 'Erro ao guardar alterações' });
        }

        logger.info('Profile atualizado - User: ' + req.user.id, 'Profile');
        res.json({ profile: data });

    } catch (error) {
        logger.error('Erro inesperado ao atualizar profile: ' + error.message, 'Profile');
        res.status(500).json({ success: false, error: 'Erro ao processar alterações' });
    }
});

// ============================================
// 6. CRIAR CHECKOUT STRIPE (equivalente a criar-checkout)
// ============================================
app.post('/api/checkout/create', async (req, res) => {
    try {
        const { email } = req.body;

        const fields = validateRequiredFields(req.body, ['email']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
            logger.error('Variáveis Stripe em falta', 'Checkout');
            return res.status(500).json({ success: false, error: 'Serviço de pagamento indisponível' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_ID,
                quantity: 1,
            }],
            mode: 'subscription',
            customer_email: cleanEmail,
            success_url: process.env.SUCCESS_URL || 'https://mailflow-pro.netlify.app/sucesso.html',
            cancel_url: process.env.CANCEL_URL || 'https://mailflow-pro.netlify.app',
        });

        logger.info('Sessão criada - Email: ' + cleanEmail + ', Session: ' + session.id, 'Checkout');

        res.json({ id: session.id });

    } catch (error) {
        logger.error('Falha ao criar sessão para ' + email + ': ' + error.message, 'Checkout');
        res.status(500).json({ success: false, error: 'Erro ao processar pagamento' });
    }
});

// ============================================
// 7. WEBHOOK STRIPE (equivalente a webhook-stripe)
// ============================================
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        logger.error('Variáveis Stripe webhook em falta', 'Webhook');
        return res.status(500).json({ success: false, error: 'Webhook não configurado' });
    }

    const sig = req.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        logger.error('Assinatura webhook inválida: ' + err.message, 'Webhook');
        return res.status(400).json({ success: false, error: 'Assinatura inválida' });
    }

    logger.info('Evento recebido: ' + stripeEvent.type, 'Webhook');

    // Usar service role para operações admin
    if (!supabaseAdmin) {
        return res.status(500).json({ received: true });
    }

    try {
        // 1. Pagamento concluído (checkout.session.completed)
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const email = session.customer_email;

            if (email) {
                const subscriptionId = session.subscription;
                const customerId = session.customer;

                logger.info('Pagamento concluído - Email: ' + email + ', Session: ' + session.id, 'Webhook');

                const { error: updateError } = await supabaseAdmin
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
        }

        // 2. Pagamento de fatura bem-sucedido (renovação)
        if (stripeEvent.type === 'invoice.payment_succeeded') {
            const invoice = stripeEvent.data.object;
            const subscriptionId = invoice.subscription;
            const customerId = invoice.customer;

            if (subscriptionId) {
                logger.info('Pagamento de fatura bem-sucedido - Subscription: ' + subscriptionId, 'Webhook');

                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_status: 'active',
                        stripe_customer_id: customerId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (updateError) {
                    logger.error('Erro ao atualizar subscription na renovação: ' + updateError.message, 'Webhook');
                } else {
                    logger.info('Subscription renovada no profile: ' + subscriptionId, 'Webhook');
                }
            }
        }

        // 3. Pagamento de fatura falhou
        if (stripeEvent.type === 'invoice.payment_failed') {
            const invoice = stripeEvent.data.object;
            const subscriptionId = invoice.subscription;
            const attemptCount = invoice.attempt_count || 1;

            if (subscriptionId) {
                logger.warn('Pagamento falhou - Subscription: ' + subscriptionId + ', Tentativa: ' + attemptCount, 'Webhook');

                let ourStatus = 'active';
                if (attemptCount >= 3) {
                    ourStatus = 'past_due';
                }

                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_status: ourStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (error) {
                    logger.error('Erro ao atualizar status falha: ' + error.message, 'Webhook');
                } else {
                    logger.info('Status atualizado para ' + ourStatus + ': ' + subscriptionId, 'Webhook');
                }
            }
        }

        // 4. Subscrição atualizada
        if (stripeEvent.type === 'customer.subscription.updated') {
            const subscription = stripeEvent.data.object;
            const subscriptionId = subscription.id;
            const status = subscription.status;
            const customerId = subscription.customer;

            logger.info('Subscrição atualizada - ID: ' + subscriptionId + ', Status: ' + status, 'Webhook');

            let ourStatus;
            switch (status) {
                case 'active': ourStatus = 'active'; break;
                case 'trialing': ourStatus = 'trial'; break;
                case 'past_due': ourStatus = 'past_due'; break;
                case 'canceled': ourStatus = 'canceled'; break;
                case 'unpaid': ourStatus = 'canceled'; break;
                case 'incomplete_expired': ourStatus = 'canceled'; break;
                case 'paused': ourStatus = 'paused'; break;
                default: ourStatus = status;
            }

            const { error } = await supabaseAdmin
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

        // 5. Subscrição cancelada
        if (stripeEvent.type === 'customer.subscription.deleted') {
            const subscription = stripeEvent.data.object;
            const subscriptionId = subscription.id;

            logger.info('Subscrição cancelada: ' + subscriptionId, 'Webhook');

            const { error } = await supabaseAdmin
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
        logger.error('Erro ao processar webhook: ' + err.message, 'Webhook');
    }

    res.json({ received: true });
});

// ============================================
// 8. ENVIAR EMAIL (equivalente a enviar-email)
// ============================================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

app.post('/api/email/send', async (req, res) => {
    try {
        const { email, nome } = req.body;

        const fields = validateRequiredFields(req.body, ['email']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        const nomeRaw = nome || cleanEmail.split('@')[0];
        const nomeCheck = validateStringLength(nomeRaw, 1, 200);
        if (!nomeCheck.valid) {
            return res.status(400).json({ success: false, error: 'Nome inválido' });
        }

        const cleanNome = sanitizeHtml(nomeRaw.trim());

        const subject = 'Bem-vindo ao MailFlow Pro';
        const html = `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px 30px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:24px;">MailFlow Pro</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <h2 style="color:#1f2937;margin:0 0 16px;font-size:20px;">Olá ${cleanNome},</h2>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 16px;">
                                A tua automação de e-mail marketing foi ativada com sucesso.
                            </p>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 24px;">
                                Agora tens acesso a templates profissionais, campanhas segmentadas
                                e relatórios em tempo real.
                            </p>
                            <p style="color:#6b7280;font-size:14px;margin:0;">
                                Email associado: <strong>${cleanEmail}</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f9fafb;padding:20px 30px;text-align:center;">
                            <p style="color:#9ca3af;font-size:12px;margin:0;">
                                © ${new Date().getFullYear()} MailFlow Pro. Todos os direitos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`.trim();

        await transporter.sendMail({
            from: '"MailFlow Pro" <nao-responder@mailflowpro.com>',
            to: cleanEmail,
            subject,
            html,
        });

        logger.info('Email enviado com sucesso', 'Email');
        logger.info('Destinatário: ' + cleanEmail, 'Email');

        res.json({ mensagem: 'E-mail enviado e logado!' });

    } catch (error) {
        logger.error('Falha ao enviar email para ' + email + ': ' + error.message, 'Email');
        res.status(500).json({ success: false, error: 'Erro ao enviar e-mail. Tente novamente mais tarde.' });
    }
});

// ============================================
// Start server
// ============================================
app.listen(PORT, () => {
    logger.info('Servidor iniciado na porta ' + PORT, 'Server');
    logger.info('Health check: http://localhost:' + PORT + '/health', 'Server');
});

module.exports = app;
