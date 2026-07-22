/**
 * MailFlow Pro — Sistema de Notificações (Toast)
 *
 * Objetivo:
 *   Mostrar feedback imediato ao utilizador após ações
 *   (sucesso, erro, info). Melhora a experiência ao dar
 *   confirmação visual de que algo aconteceu.
 *
 * Inputs:
 *   - message: texto da notificação
 *   - type: 'success' | 'error' | 'info'
 *   - duration: tempo em ms (default 4000)
 *
 * Outputs:
 *   - Toast visual no canto inferior direito
 *
 * Erros possíveis:
 *   - Nenhum (fallback silencioso)
 *
 * Dependências:
 *   - Nenhuma
 */

(function() {
    'use strict';

    // ========================================
    // Init
    // ========================================
    var container = null;

    function ensureContainer() {
        if (container) return container;
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
        return container;
    }

    // ========================================
    // Helpers
    // ========================================
    var ICONS = {
        success: '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        error: '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        info: '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    // ========================================
    // Render
    // ========================================
    function show(message, type, duration) {
        type = type || 'info';
        duration = duration || 4000;

        var root = ensureContainer();

        var toast = document.createElement('div');
        toast.className = 'toast toast--' + type;
        toast.setAttribute('role', 'alert');

        toast.innerHTML =
            '<span class="toast__icon">' + (ICONS[type] || ICONS.info) + '</span>' +
            '<span class="toast__message">' + message + '</span>' +
            '<button class="toast__close" aria-label="Fechar">&times;</button>';

        toast.querySelector('.toast__close').addEventListener('click', function() {
            removeToast(toast);
        });

        root.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(function() {
            toast.classList.add('toast--visible');
        });

        // Auto-remove
        if (duration > 0) {
            setTimeout(function() {
                removeToast(toast);
            }, duration);
        }
    }

    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.remove('toast--visible');
        toast.classList.add('toast--hiding');
        setTimeout(function() {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // ========================================
    // Export
    // ========================================
    window.MailFlowToast = {
        success: function(msg, dur) { show(msg, 'success', dur); },
        error: function(msg, dur) { show(msg, 'error', dur); },
        info: function(msg, dur) { show(msg, 'info', dur); }
    };

})();
