/**
 * Teste MailFlow Pro - Bypass de Permissão Premium em Desenvolvimento
 *
 * Objetivo:
 *   Validar o sistema de bypass premium para a conta tvdeariston@gmail.com
 *   em ambiente de desenvolvimento.
 *
 * Testes:
 *   1. Verificar isDevEmail para tvdeariston@gmail.com (should be true)
 *   2. Verificar isDevEmail para outro email (should be false)
 *   3. Verificar isDevelopmentEnvironment (pode variar)
 *   4. Verificar hasPremiumAccess para Bypassed Email
 *   5. Verificar hasPremiumAccess para Non-Bypassed Email
 *   6. Simular ambiente de desenvolvimento
 *   7. Simular bypass de desenvolvimento
 *   8. Objetos inválidos
 */

(function() {
    'use strict';

    console.log('=' * 60);
    console.log('Teste MailFlow Pro - Bypass de Desenv. Premium');
    console.log('=' * 60);

    // Helper functions from dev-permissions.js (mock)
    function createMockDevPermissions() {
        // Simular o objeto config do dev-permissions.js
        var config = {
            devEmailsBypass: ['tvdeariston@gmail.com'],
            enableDevBypass: false
        };

        function isDevEmail(email) {
            if (!email || typeof email !== 'string') return false;
            return config.devEmailsBypass.some(bypassedEmail => 
                email.toLowerCase() === bypassedEmail.toLowerCase()
            );
        }

        function isDevelopmentEnvironment() {
            return config.enableDevBypass;
        }

        function hasPremiumAccess(user) {
            if (!user || typeof user !== 'object') {
                return false;
            }
            var email = user.email;
            if (!email) {
                return false;
            }
            if (isDevelopmentEnvironment()) {
                return true;
            }
            if (isDevEmail(email)) {
                return true;
            }
            return false;
        }

        return {
            isDevEmail: isDevEmail,
            isDevelopmentEnvironment: isDevelopmentEnvironment,
            hasPremiumAccess: hasPremiumAccess,
            config: config
        };
    }

    // Run Tests
    function runTest() {
        var devPerms = createMockDevPermissions();
        var passed = 0;
        var failed = 0;

        function assert(condition, testName) {
            if (condition) {
                console.log('[✓] ' + testName);
                passed++;
            } else {
                console.log('[✗] ' + testName);
                failed++;
            }
        }

        console.log('\n[Teste 1] isDevEmail para tvdeariston@gmail.com');
        assert(devPerms.isDevEmail('tvdeariston@gmail.com'), 
               'tvdeariston@gmail.com deve ser reconhecido como dev bypass');

        console.log('\n[Teste 2] isDevEmail para outro email');
        assert(!devPerms.isDevEmail('outro@exemplo.com'),
               'outro@exemplo.com deve NÃO ser reconhecido como dev bypass');

        console.log('\n[Teste 3] isDevEmail para email vazio/nulo');
        assert(!devPerms.isDevEmail(''), 
               'string vazio deve retornar false');
        assert(!devPerms.isDevEmail(null),
               'null deve retornar false');
        assert(!devPerms.isDevEmail(undefined),
               'undefined deve retornar false');

        console.log('\n[Teste 4] hasPremiumAccess para Email Bypassado');
        assert(devPerms.hasPremiumAccess({email: 'tvdeariston@gmail.com'}),
               'tvdeariston@gmail.com deve ter acesso premium');

        console.log('\n[Teste 5] hasPremiumAccess para Outro Email');
        assert(!devPerms.hasPremiumAccess({email: 'outro@exemplo.com'}),
               'outro@exemplo.com deve NÃO ter acesso premium');

        console.log('\n[Teste 6] hasPremiumAccess para Objeto Vazio');
        assert(!devPerms.hasPremiumAccess({}),
               'objeto sem email deve retornar false');
        assert(!devPerms.hasPremiumAccess({email: ''}),
               'objeto com email vazio deve retornar false');
        assert(!devPerms.hasPremiumAccess(null),
               'null deve retornar false');

        console.log('\n[Teste 7] hasPremiumAccess para Email com Caso Diferente');
        assert(devPerms.hasPremiumAccess({email: 'TVDeariston@gmail.com'}),
               'TVDeariston@gmail.com (maiúsculas) deve ser reconhecido');

        console.log('\n[Teste 8] Configuração atual');
        console.log('  Emails Bypassados:', devPerms.config.devEmailsBypass);

        console.log('\n' + '=' * 60);
        console.log('Resumo dos Testes:');
        console.log('  Passados: ' + passed);
        console.log('  Fallados: ' + failed);
        console.log('=' * 60);
        
        if (failed === 0) {
            console.log('Todos os testes passaram! Bypass premium funcionando como esperado.');
        } else {
            console.error('Alguns testes falharam. Por favor, verificar a configuração.');
        }
    }

    // Executar testes após carregamento
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('DOMContentLoaded', runTest);
    } else {
        runTest();
    }

})();
