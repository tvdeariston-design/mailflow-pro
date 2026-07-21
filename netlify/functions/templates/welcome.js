/**
 * Template: Email de Boas-Vindas
 *
 * Enviado após pagamento concluído (checkout.session.completed).
 * Template independente, reutilizável e testável.
 */

const { sanitizeHtml } = require('../utils');

/**
 * Gera o email de boas-vindas.
 *
 * @param {object} data
 * @param {string} data.nome - Nome do utilizador
 * @param {string} data.email - Email do utilizador
 * @returns {{ subject: string, html: string }}
 */
function render(data) {
    const nome = sanitizeHtml(data.nome || data.email?.split('@')[0] || 'Cliente');
    const email = sanitizeHtml(data.email || '');

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
                            <h2 style="color:#1f2937;margin:0 0 16px;font-size:20px;">Olá ${nome},</h2>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 16px;">
                                A tua automação de e-mail marketing foi ativada com sucesso.
                            </p>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 24px;">
                                Agora tens acesso a templates profissionais, campanhas segmentadas
                                e relatórios em tempo real.
                            </p>
                            <p style="color:#6b7280;font-size:14px;margin:0;">
                                Email associado: <strong>${email}</strong>
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

    return { subject, html };
}

module.exports = { render };
