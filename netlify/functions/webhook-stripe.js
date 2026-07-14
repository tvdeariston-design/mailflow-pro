const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function registrarLog(destinatario, sucesso, erro = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Destinatário: ${destinatario} | Sucesso: ${sucesso} | Erro: ${erro || 'Nenhum'}\n`;
    
    fs.appendFileSync(path.join(__dirname, 'envios.log'), logEntry);
}

async function enviarEmailPro(destinatario, assunto, nomeCliente) {
    const htmlTemplate = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px;">
            <h2 style="color: #007bff;">MailFlow Pro</h2>
            <p>Olá <strong>${nomeCliente}</strong>,</p>
            <p>O teu serviço de automação está pronto. Aumenta o alcance dos teus nichos com eficiência.</p>
            <a href="https://mailflow-pro.netlify.app" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Aceder à Plataforma</a>
            <p style="font-size: 12px; color: #777; margin-top: 20px;">MailFlow Pro - Automação inteligente.</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: '"MailFlow Pro" <nao-responder@mailflowpro.com>',
            to: destinatario,
            subject: assunto,
            html: htmlTemplate
        });
        
        registrarLog(destinatario, true);
        console.log("Envio processado e registado.");
    } catch (error) {
        registrarLog(destinatario, false, error.message);
        console.error("Erro no envio, log atualizado.");
    }
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Webhook Error: ${err.message}` }) };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const email = session.customer_email;
        const nomeCliente = email.split('@')[0];

        console.log(`[WEBHOOK] Pagamento concluído - Email: ${email}, Sessão: ${session.id}`);

        await enviarEmailPro(email, "Bem-vindo ao MailFlow Pro!", nomeCliente);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
};
