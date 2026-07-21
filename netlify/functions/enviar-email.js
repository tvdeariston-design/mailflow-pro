const nodemailer = require('nodemailer');
const { config } = require('./config');
const logger = require('./logger');
const {
    createResponse,
    createErrorResponse,
    validateRequiredFields,
    validateEmail,
    validateStringLength,
    sanitizeHtml,
} = require('./utils');
const { getTemplate } = require('./templates/index');

const FROM_ADDRESS = '"MailFlow Pro" <nao-responder@mailflowpro.com>';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

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

    const nomeRaw = body.nome || email.split('@')[0];
    const nomeCheck = validateStringLength(nomeRaw, 1, 200);
    if (!nomeCheck.valid) {
        return createErrorResponse(400, 'Nome inválido: ' + nomeCheck.reason);
    }

    const nome = sanitizeHtml(nomeRaw.trim());

    try {
        const template = getTemplate('welcome');
        const { subject, html } = template.render({ nome, email });

        await transporter.sendMail({
            from: FROM_ADDRESS,
            to: email,
            subject,
            html,
        });

        logger.info('Email enviado com sucesso', 'Email');
        logger.info('Destinatário: ' + email, 'Email');

        return createResponse(200, { mensagem: 'E-mail enviado e logado!' });

    } catch (error) {
        logger.error('Falha ao enviar email para ' + email + ': ' + error.message, 'Email');
        return createErrorResponse(500, 'Erro ao enviar e-mail. Tente novamente mais tarde.');
    }
};
