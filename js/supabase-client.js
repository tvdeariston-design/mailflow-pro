/**
 * MailFlow Pro — Cliente Supabase (Singleton)
 *
 * Objetivo:
 *   Inicializar e exportar uma única instância do Supabase client.
 *   Todas as páginas e functions partilham este cliente.
 *
 * Inputs:
 *   Variáveis de ambiente: SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * Outputs:
 *   window.supabaseClient — instância global do Supabase
 *
 * Erros possíveis:
 *   - Se as variáveis não estiverem definidas, loga erro no console
 *
 * Dependências:
 *   - @supabase/supabase-js (carregado via CDN ou bundler)
 */

(function() {
    'use strict';

    // ========================================
    // Configuração
    // ========================================
    // Ler das variáveis de ambiente com base no ambiente do node, fallback para window, depois para valores reais
    var SUPABASE_URL = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) ||
                       (typeof window !== 'undefined' && window.SUPABASE_URL) ||
                       'https://cpwdtknrcupxmtrjpxey.supabase.co';
    var SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) ||
                           (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) ||
                           'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg';

    // ========================================
    // Inicialização
    // ========================================
    function init() {
        if (typeof supabase === 'undefined' || !supabase.createClient) {
            console.error('[Supabase] Biblioteca não carregada. Verificar script tag.');
            return null;
        }

        var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        console.log('[Supabase] Cliente inicializado com sucesso.');

        return client;
    }

    // ========================================
    // Export
    // ========================================
    window.supabaseClient = init();

    // Se não inicializou, tentar novamente após 100ms
    if (!window.supabaseClient) {
        setTimeout(function() {
            window.supabaseClient = init();
            if (window.supabaseClient) {
                console.log('[Supabase] Cliente inicializado com delay.');
            } else {
                console.error('[Supabase] Falha ao inicializar. Verificar se o script CDN está a carregar.');
            }
        }, 100);
    }

})();
