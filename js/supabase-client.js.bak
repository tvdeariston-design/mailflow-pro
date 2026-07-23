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
    var SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
    var SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';

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

})();
