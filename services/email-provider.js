/**
 * MailFlow Pro — Email Provider Service
 *
 * Envio de emails via Resend API (primary) ou SMTP via Nodemailer (fallback).
 *
 * Regras de prioridade:
 *   1. Se RESEND_API_KEY estiver definida → usar Resend
 *   2. Se EMAIL_USER/EMAIL_PASS estiverem definidos → usar SMTP
 *   3. Se nenhum estiver configurado → retornar null (sem transporter)
 *
 * Segurança:
 *   - Nunca expõe RESEND_API_KEY no frontend
 *   - Nunca loga chaves de API ou passwords
 */

const nodemailer = require('nodemailer');

const RESEND_API_KEY = process.env.RESEND_API_KEY || null;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const EMAIL_USER = process.env.EMAIL_USER || null;
const EMAIL_PASS = process.env.EMAIL_PASS || null;

let _smtpTransporter = null;

// ========================================
// Resend Email Sender
// ========================================

/**
 * Enviar email via Resend API.
 * @param {Object} params - { from, to, subject, html, text, replyTo }
 * @returns {Promise<string|null>} messageId ou null em caso de erro
 */
async function sendViaResend(params) {
    if (!RESEND_API_KEY) {
        console.error('[EMAIL PROVIDER] RESEND_API_KEY not configured');
        return null;
    }

    const payload = {
        from: params.from,
        to: params.to,
        subject: params.subject
    };

    if (params.html) {
        payload.html = params.html;
    }

    if (params.text) {
        payload.text = params.text;
    }

    if (params.replyTo) {
        payload.reply_to = params.replyTo;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + RESEND_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[EMAIL PROVIDER] [Resend] Error:', data.message || data.error || response.status);
            return null;
        }

        console.log('[EMAIL PROVIDER] [Resend] Email sent:', data.id);
        return data.id || null;

    } catch (err) {
        console.error('[EMAIL PROVIDER] [Resend] Connection error:', err.message);
        return null;
    }
}

// ========================================
// SMTP Email Sender (fallback)
// ========================================

function getSmtpTransporter() {
    if (_smtpTransporter) return _smtpTransporter;

    if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('[EMAIL PROVIDER] SMTP: EMAIL_USER or EMAIL_PASS not configured');
        return null;
    }

    console.log('[EMAIL PROVIDER] SMTP: Creating transporter (host=' + SMTP_HOST + ', port=' + SMTP_PORT + ')');

    _smtpTransporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        },
        connectionTimeout: 10000,
        socketTimeout: 10000,
        greetingTimeout: 10000
    });

    return _smtpTransporter;
}

async function sendViaSmtp(params) {
    const transporter = getSmtpTransporter();
    if (!transporter) {
        console.error('[EMAIL PROVIDER] SMTP: No transporter available');
        return null;
    }

    const mailOptions = {
        from: params.from,
        to: params.to,
        subject: params.subject,
        replyTo: params.replyTo || undefined
    };

    if (params.html) {
        mailOptions.html = params.html;
    }

    if (params.text) {
        mailOptions.text = params.text;
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[EMAIL PROVIDER] [SMTP] Email sent:', info.messageId);
        return info.messageId || null;
    } catch (err) {
        console.error('[EMAIL PROVIDER] [SMTP] Send error:', err.message);
        return null;
    }
}

// ========================================
// Unified sendEmail
// ========================================

/**
 * Unified email sending function.
 * Uses Resend API when available, falls back to SMTP.
 * @param {Object} params - { from, to, subject, html, text, replyTo }
 * @returns {Promise<string|null>} messageId ou null
 */
async function sendEmail(params) {
    const timestamp = new Date().toISOString();

    // Prefer Resend API when available
    if (RESEND_API_KEY) {
        console.log('[EMAIL PROVIDER] [' + timestamp + '] provider: resend');
        const messageId = await sendViaResend(params);
        console.log('[EMAIL PROVIDER] [' + timestamp + '] provider: resend, status: ' + (messageId ? 'success' : 'error'));
        return messageId;
    }

    // Fallback to SMTP
    if (EMAIL_USER && EMAIL_PASS) {
        console.log('[EMAIL PROVIDER] [' + timestamp + '] provider: smtp');
        const messageId = await sendViaSmtp(params);
        console.log('[EMAIL PROVIDER] [' + timestamp + '] provider: smtp, status: ' + (messageId ? 'success' : 'error'));
        return messageId;
    }

    console.error('[EMAIL PROVIDER] [' + timestamp + '] No email provider configured');
    return null;
}

// ========================================
// Export
// ========================================

module.exports = {
    sendEmail,
    sendViaResend,
    getSmtpTransporter
};