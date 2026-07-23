/**
 * MailFlow Pro — Clipboard Utility
 *
 * Objetivo:
 *   Centralizar toda a lógica de copiar para a área de transferência.
 *   Fornecer uma interface consistente e confiável em todos os componentes.
 *
 * Inputs:
 *   - textToCopy: string — texto a ser copiado
 *   - options: object — opções de cópia
 *
 * Outputs:
 *   - Promise<boolean> — true se copiado com sucesso, false caso contrário
 *
 * Dependências:
 *   - Nenhuma (usa API nativa do navegador)
 */

var CopyUtils = (function() {
    'use strict';

    // ========================================
    // Configuração
    // ========================================

    var CONFIG = {
        // Fallback para browsers que não suportam navigator.clipboard
        USE_EXEC_COMMAND_FALLBACK: true,

        // Timeout para fallback (em ms)
        EXEC_COMMAND_TIMEOUT: 1000,

        // Classes CSS para animação de feedback visual
        FEEDBACK_CLASSES: {
            SUCCESS: 'copy-btn--success',
            ERROR: 'copy-btn--error'
        },

        // Duração do feedback visual (em ms)
        FEEDBACK_DURATION: 2000
    };

    // ========================================
    // Estado Interno
    // ========================================

    var _activeTimeouts = [];

    // ========================================
    // Utilitários
    // ========================================

    function _clearTimeouts() {
        _activeTimeouts.forEach(clearTimeout);
        _activeTimeouts = [];
    }

    function _setTimeout(callback, delay) {
        var timeoutId = setTimeout(callback, delay);
        _activeTimeouts.push(timeoutId);
        return timeoutId;
    }

    // ========================================
    // Lógica Principal de Cópia
    // ========================================

    async function copyToClipboard(textToCopy, options) {
        options = options || {};

        // Validar entrada
        if (typeof textToCopy !== 'string') {
            throw new Error('O texto a copiar deve ser uma string');
        }

        // Limpar timeouts anteriores
        _clearTimeouts();

        try {
            // Tentar usar a API moderna do Clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                _showVisualFeedback(options, CONFIG.FEEDBACK_CLASSES.SUCCESS);
                return true;
            }

            // Fallback para browsers mais antigos
            if (CONFIG.USE_EXEC_COMMAND_FALLBACK) {
                return _copyWithFallback(textToCopy, options);
            }

            throw new Error('Cópia não suportada neste navegador');

        } catch (err) {
            console.error('[CopyUtils] Erro ao copiar para a área de transferência:', err);
            _showVisualFeedback(options, CONFIG.FEEDBACK_CLASSES.ERROR);
            _logCopyError(err);
            return false;
        }
    }

    function _copyWithFallback(textToCopy, options) {
        return new Promise(function(resolve, reject) {
            // Criar elemento textarea temporário
            var textArea = document.createElement('textarea');

            // Posicionar fora da viewport para evitar rolagem
            textArea.style.position = 'absolute';
            textArea.style.left = '-999999px';
            textArea.style.top = '0';
            textArea.style.width = '2em';
            textArea.style.height = '2em';
            textArea.style.padding = '0';
            textArea.style.border = 'none';
            textArea.style.outline = 'none';
            textArea.style.wordWrap = 'break-word';
            textArea.style.whiteSpace = 'pre-wrap';
            textArea.style.fontSize = '14px';
            textArea.style.fontFamily = 'sans-serif';
            textArea.style.backgroundColor = 'transparent';

            document.body.appendChild(textArea);
            textArea.value = textToCopy;

            function _cleanUp() {
                textArea.removeEventListener('copy', _copyHandler);
                textArea.removeEventListener('error', _errorHandler);
                document.body.removeChild(textArea);
            }

            function _copyHandler(e) {
                e.preventDefault();
                _cleanUp();
                _showVisualFeedback(options, CONFIG.FEEDBACK_CLASSES.SUCCESS);
                resolve(true);
            }

            function _errorHandler(e) {
                console.error('[CopyUtils] Fallback error:', e);
                _cleanUp();
                reject(new Error('Falha na cópia com fallback'));
            }

            function _successCleanup() {
                _cleanUp();
                _setTimeout(function() {
                    if (!textArea.parentNode) return; // Já foi removido
                    _showVisualFeedback(options, CONFIG.FEEDBACK_CLASSES.ERROR);
                    reject(new Error('Cópia não confirmada'));
                }, CONFIG.EXEC_COMMAND_TIMEOUT);
            }

            // Tentar copiar usando document.execCommand
            textArea.focus();
            textArea.select();

            var successful = document.execCommand('copy');

            if (successful) {
                _showVisualFeedback(options, CONFIG.FEEDBACK_CLASSES.SUCCESS);
                _setTimeout(function() {
                    _cleanUp();
                    resolve(true);
                }, 100); // Pequeno delay para garantir que a operação foi concluída
            } else {
                _successCleanup();
            }
        });
    }

    function _showVisualFeedback(options, feedbackClass) {
        var target = options.targetElement;

        if (!target) return;

        // Adicionar classe de feedback visual
        target.classList.add('copy-btn--feedback');

        setTimeout(function() {
            target.classList.remove('copy-btn--feedback', CONFIG.FEEDBACK_CLASSES.SUCCESS, CONFIG.FEEDBACK_CLASSES.ERROR);
        }, CONFIG.FEEDBACK_DURATION);
    }

    function _logCopyError(err) {
        // Apenas logar em desenvolvimento para reduzir ruído em produção
        if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
            console.error('[CopyUtils] Erro detalhado:', err);
        }
    }

    // ========================================
    // Funções Públicas
    // ========================================

    function isSupported() {
        return !!(navigator.clipboard && navigator.clipboard.writeText);
    }

    // ========================================
    // Export
    // ========================================

    return {
        copyToClipboard: copyToClipboard,
        isSupported: isSupported
    };

})();

/**
 * CopyButton — Componente Reutilizável para Botões de Copiar
 *
 * Objetivo:
 *   Proporcionar um botão consistente para copiar texto.
 *   Gerenciar automaticamente feedback visual e estado.
 *
 * Inputs:
 *   - textToCopy: string — texto a ser copiado
 *   - options: object — configurações do botão
 *   - event: object — evento de click (opcional)
 *
 * Outputs:
 *   - Retornar boolean — true se copiado com sucesso
 *
 * Dependências:
 *   - CopyUtils — módulo de cópia centralizado
 *   - MailFlowToast — para notificações
 */

(function() {
    'use strict';

    // ========================================
    // Estilos CSS (inline para evitar estilos externos)
    // ========================================

    var CSS = '
    .copy-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid var(--border-color, #d1d5db);
        border-radius: 6px;
        background: white;
        color: var(--text-color, #374151);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        outline: none;
    }

    .copy-btn:hover {
        border-color: var(--primary-color, #6366f1);
        background: var(--primary-light, #f0f1ff);
        color: var(--primary-color, #6366f1);
    }

    .copy-btn:active {
        transform: scale(0.98);
    }

    .copy-btn--loading {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .copy-btn--feedback {
        animation: copy-btn-pulse 0.3s ease;
    }

    .copy-btn--success {
        border-color: var(--success-color, #10b981);
        background: var(--success-light, #ecfdf5);
        color: var(--success-color, #10b981);
    }

    .copy-btn--error {
        border-color: var(--error-color, #ef4444);
        background: var(--error-light, #fef2f2);
        color: var(--error-color, #ef4444);
    }

    @keyframes copy-btn-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }

    .copy-btn__icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .copy-btn__icon svg {
        width: 100%;
        height: 100%;
    }

    .copy-btn__checkmark {
        display: none;
        width: 16px;
        height: 16px;
    }

    .copy-btn--success .copy-btn__icon {
        display: none;
    }

    .copy-btn--success .copy-btn__checkmark {
        display: flex;
        color: var(--success-color, #10b981);
    }

    .copy-btn--error .copy-btn__icon {
        display: none;
    }

    .copy-btn--error .copy-btn__icon--error {
        display: flex;
        color: var(--error-color, #ef4444);
    }
    ';

    // Injetar estilos no documento se não estiverem presentes
    if (!document.getElementById('copy-btn-styles')) {
        var styleElement = document.createElement('style');
        styleElement.id = 'copy-btn-styles';
        styleElement.textContent = CSS;
        document.head.appendChild(styleElement);
    }

    // ========================================
    // Componente
    // ========================================

    function CopyButton(element, options) {
        this.element = element;
        this.textToCopy = options.textToCopy;
        this.tooltip = options.tooltip || 'Copiar para a área de transferência';
        this.label = options.label || null;
        this.callback = options.callback || null;
        this.isLoading = false;

        this._init();
    }

    CopyButton.prototype._init = function() {
        var self = this;

        // Definir atributos de acessibilidade
        if (this.element.getAttribute('aria-label')) {
            this.element.setAttribute('aria-label', this.tooltip);
        }

        // Adicionar atributo de dados para o texto a copiar
        this.element.dataset.copyText = this.textToCopy;

        // Adicionar classe CSS
        this.element.classList.add('copy-btn');

        // Adicionar evento de clique
        this.element.addEventListener('click', function(e) {
            e.preventDefault();
            self._handleCopy();n        });

        // Adicionar eventos para teclado
        this.element.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                self._handleCopy();n            }
        });
    };

    CopyButton.prototype._handleCopy = function() {
        var self = this;

        if (this.isLoading) return;

        this.isLoading = true;
        this.element.classList.add('copy-btn--loading');
        this._updateIcon('loading');

        var promise;

        try {
            promise = CopyUtils.copyToClipboard(this.textToCopy, {
                targetElement: this.element
            });
        } catch (err) {
            promise = Promise.reject(err);
        }

        promise
            .then(function(success) {
                self._handleCopySuccess();
            })
            .catch(function(err) {
                self._handleCopyError(err);
            })
            .finally(function() {
                self.isLoading = false;
                self.element.classList.remove('copy-btn--loading');
            });
    };

    CopyButton.prototype._handleCopySuccess = function() {
        MailFlowToast.success('Copiado para a área de transferência');

        if (this.callback) {
            try {
                this.callback(true, this.textToCopy);
            } catch (err) {
                console.error('[CopyButton] Erro na callback de sucesso:', err);
            }
        }

        // Atualizar ícone após 2 segundos
        setTimeout(function() {
            this._updateIcon('success');
        }.bind(this), CONFIG.FEEDBACK_DURATION);
    };

    CopyButton.prototype._handleCopyError = function(err) {
        MailFlowToast.error('Erro ao copiar para a área de transferência');

        if (this.callback) {
            try {
                this.callback(false, this.textToCopy, err);
            } catch (err) {
                console.error('[CopyButton] Erro na callback de erro:', err);
            }
        }

        // Alternar ícone de erro por um breve momento
        setTimeout(function() {
            this._updateIcon('error');
        }.bind(this), CONFIG.FEEDBACK_DURATION);
    };

    CopyButton.prototype._updateIcon = function(state) {
        var iconElement = this.element.querySelector('.copy-btn__icon');
        var checkmarkElement = this.element.querySelector('.copy-btn__checkmark');

        if (!iconElement) return;

        // Remover classes de estado anteriores
        this.element.classList.remove('copy-btn--success', 'copy-btn--error');

        switch (state) {
            case 'success':
                this.element.classList.add('copy-btn--success');
                break;
            case 'error':
                this.element.classList.add('copy-btn--error');
                break;
            case 'loading':
                // Manter classe de loading
                break;
            default:
                // Estado normal
                break;
        }
    };

    CopyButton.prototype.updateText = function(newText) {
        this.textToCopy = newText;
        this.element.dataset.copyText = newText;
    };

    // ========================================
    // Export
    // ========================================

    window.CopyButton = CopyButton;

})();

// Configuração global para o componente
var CONFIG = CONFIG || {};
CONFIG.FEEDBACK_DURATION = 2000;