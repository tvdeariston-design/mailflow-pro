/**
 * MailFlow Pro - Logger Centralizado
 *
 * Wrapper leve para console.log/warn/error com timestamps ISO
 * e contexto opcional. Adequado para Netlify Functions.
 *
 * Não escreve ficheiros. Não usa fs. Sem dependências externas.
 */

function formatMessage(level, message, context) {
    const timestamp = new Date().toISOString();
    const prefix = context ? `[${context}]` : '';
    return `[${timestamp}] [${level}] ${prefix} ${message}`;
}

const logger = {
    info(message, context) {
        console.log(formatMessage('INFO', message, context));
    },

    warn(message, context) {
        console.warn(formatMessage('WARN', message, context));
    },

    error(message, context) {
        console.error(formatMessage('ERROR', message, context));
    },
};

module.exports = logger;
