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
    fs.appendFile(path.join(__dirname, '../../envios.log'), logEntry, (err) => {
        if (err) console.error("Erro ao escrever no log:", err);
    });
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const { email, nome } = JSON.parse(event.body);

    try {
        await transporter.sendMail({
            from: '"MailFlow Pro" <nao-responder@mailflowpro.com>',
            to: email,
            subject: 'Bem-vindo ao MailFlow Pro',
            html: `<h1>Olá ${nome},</h1><p>A tua automação foi ativada com sucesso.</p>`
        });

        registrarLog(email, true);
        return { statusCode: 200, body: JSON.stringify({ mensagem: 'E-mail enviado e logado!' }) };

    } catch (error) {
        registrarLog(email, false, error.message);
        return { statusCode: 500, body: JSON.stringify({ erro: error.message }) };
    }
};
