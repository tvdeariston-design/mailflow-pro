/**
 * MailFlow Pro - Utilitários Partilhados
 *
 * Funções puras, sem efeitos secundários, sem dependências externas.
 * Projetadas para reutilização entre todas as Netlify Functions.
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

/**
 * Verifica se um valor está vazio.
 * Considera vazio: null, undefined, string vazia, string só com espaços,
 * array vazio, objeto vazio.
 * NÃO considera vazio: 0, false, string '0', string 'false'.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Valida se todos os campos obrigatórios estão presentes e não vazios.
 *
 * @param {object} data - Objeto com os dados a validar
 * @param {string[]} fields - Lista de nomes dos campos obrigatórios
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateRequiredFields(data, fields) {
    if (!data || typeof data !== 'object') {
        return { valid: false, missing: fields || [] };
    }

    const missing = [];

    for (const field of fields) {
        if (isEmpty(data[field])) {
            missing.push(field);
        }
    }

    return {
        valid: missing.length === 0,
        missing,
    };
}

/**
 * Valida se uma string é um email válido.
 *
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Valida o comprimento de uma string.
 *
 * @param {string} value - String a validar
 * @param {number} min - Comprimento mínimo (0 = sem mínimo)
 * @param {number} max - Comprimento máximo (0 = sem máximo)
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateStringLength(value, min, max) {
    if (value === null || value === undefined) {
        return { valid: false, reason: 'missing' };
    }

    if (typeof value !== 'string') {
        return { valid: false, reason: 'not_a_string' };
    }

    const len = value.length;

    if (min > 0 && len < min) {
        return { valid: false, reason: 'too_short' };
    }

    if (max > 0 && len > max) {
        return { valid: false, reason: 'too_long' };
    }

    return { valid: true };
}

/**
 * Escapa caracteres perigosos para uso seguro em HTML.
 * Previne XSS básico.
 *
 * Escapa: & < > " ' /
 *
 * @param {string} text
 * @returns {string}
 */
function sanitizeHtml(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#47;');
}

/**
 * Cria uma resposta HTTP padronizada com Content-Type e CORS.
 *
 * @param {number} statusCode
 * @param {object|string} body
 * @returns {{ statusCode: number, headers: object, body: string }}
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

/**
 * Cria uma resposta de erro padronizada.
 * Formato: { success: false, error: "Mensagem" }
 *
 * @param {number} statusCode
 * @param {string} message
 * @returns {{ statusCode: number, headers: object, body: string }}
 */
function createErrorResponse(statusCode, message) {
    return createResponse(statusCode, {
        success: false,
        error: message,
    });
}

module.exports = {
    CORS_HEADERS,
    isEmpty,
    validateRequiredFields,
    validateEmail,
    validateStringLength,
    sanitizeHtml,
    createResponse,
    createErrorResponse,
};
