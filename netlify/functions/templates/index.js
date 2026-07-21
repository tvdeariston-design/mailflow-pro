/**
 * MailFlow Pro - Template Registry
 *
 * Registo centralizado de todos os templates de email.
 * Cada template é independente e exporta uma função render(data).
 *
 * Para adicionar um novo template:
 * 1. Criar ficheiro em templates/<nome>.js
 * 2. Exportar render(data) → { subject, html }
 * 3. Adicionar entrada em TEMPLATES abaixo
 */

const TEMPLATES = {
    welcome: () => require('./welcome'),
    // Adicionar novos templates aqui:
    // 'payment-success': () => require('./payment-success'),
    // 'campaign': () => require('./campaign'),
};

/**
 * Obtém um template pelo nome.
 * Usa lazy loading para não carregar templates não utilizados.
 *
 * @param {string} name - Nome do template
 * @returns {object|null} Template com render(data), ou null se não encontrado
 */
function getTemplate(name) {
    const loader = TEMPLATES[name];
    if (!loader) return null;
    return loader();
}

/**
 * Lista todos os templates disponíveis.
 *
 * @returns {string[]}
 */
function listTemplates() {
    return Object.keys(TEMPLATES);
}

module.exports = { getTemplate, listTemplates };
