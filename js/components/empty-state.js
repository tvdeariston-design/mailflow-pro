var EmptyStateComponent = (function() {
    'use strict';

    var ICONS = {
        contacts: '' +
            '<svg width="80" height="80" viewBox="0 0 80 80" fill="none">' +
                '<circle cx="40" cy="40" r="38" fill="url(#es-grad-1)" opacity="0.12"/>' +
                '<circle cx="40" cy="40" r="38" stroke="url(#es-grad-1)" stroke-width="1" opacity="0.2"/>' +
                '<path d="M44 46h12a3 3 0 013 3v4M44 46H24a3 3 0 00-3 3v4m23-7a5 5 0 10-8 0m8 0a5 5 0 01-8 0m0 0a7 7 0 00-7 7h22a7 7 0 00-7-7z" stroke="url(#es-grad-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<circle cx="35" cy="32" r="5" stroke="url(#es-grad-1)" stroke-width="2" stroke-linecap="round"/>' +
                '<circle cx="45" cy="32" r="5" stroke="url(#es-grad-1)" stroke-width="2" stroke-linecap="round"/>' +
                '<path d="M48 36l3 2M52 39l3 2" stroke="url(#es-grad-1)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>' +
                '<defs><linearGradient id="es-grad-1" x1="0" y1="0" x2="80" y2="80"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
            '</svg>',

        campaigns: '' +
            '<svg width="80" height="80" viewBox="0 0 80 80" fill="none">' +
                '<circle cx="40" cy="40" r="38" fill="url(#es-grad-2)" opacity="0.12"/>' +
                '<circle cx="40" cy="40" r="38" stroke="url(#es-grad-2)" stroke-width="1" opacity="0.2"/>' +
                '<rect x="18" y="26" width="44" height="30" rx="4" stroke="url(#es-grad-2)" stroke-width="2"/>' +
                '<path d="M18 30l22 14 22-14" stroke="url(#es-grad-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<path d="M48 43l12 7M32 43l-8 7" stroke="url(#es-grad-2)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>' +
                '<circle cx="57" cy="32" r="2" fill="url(#es-grad-2)"/>' +
                '<circle cx="62" cy="36" r="1.5" fill="url(#es-grad-2)"/>' +
                '<defs><linearGradient id="es-grad-2" x1="0" y1="0" x2="80" y2="80"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
            '</svg>',

        templates: '' +
            '<svg width="80" height="80" viewBox="0 0 80 80" fill="none">' +
                '<circle cx="40" cy="40" r="38" fill="url(#es-grad-3)" opacity="0.12"/>' +
                '<circle cx="40" cy="40" r="38" stroke="url(#es-grad-3)" stroke-width="1" opacity="0.2"/>' +
                '<rect x="18" y="24" width="28" height="34" rx="3" stroke="url(#es-grad-3)" stroke-width="2"/>' +
                '<path d="M24 32h16M24 38h12M24 44h8" stroke="url(#es-grad-3)" stroke-width="2" stroke-linecap="round" opacity="0.7"/>' +
                '<rect x="50" y="30" width="16" height="16" rx="3" stroke="url(#es-grad-3)" stroke-width="2"/>' +
                '<circle cx="58" cy="38" r="3" fill="url(#es-grad-3)" opacity="0.4"/>' +
                '<path d="M58 24v6M58 46v6" stroke="url(#es-grad-3)" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' +
                '<path d="M44 58h16" stroke="url(#es-grad-3)" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' +
                '<defs><linearGradient id="es-grad-3" x1="0" y1="0" x2="80" y2="80"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
            '</svg>',

        automations: '' +
            '<svg width="80" height="80" viewBox="0 0 80 80" fill="none">' +
                '<circle cx="40" cy="40" r="38" fill="url(#es-grad-4)" opacity="0.12"/>' +
                '<circle cx="40" cy="40" r="38" stroke="url(#es-grad-4)" stroke-width="1" opacity="0.2"/>' +
                '<circle cx="40" cy="40" r="12" stroke="url(#es-grad-4)" stroke-width="2"/>' +
                '<path d="M40 24V18M40 62v-6" stroke="url(#es-grad-4)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>' +
                '<path d="M56 40h6M18 40h6" stroke="url(#es-grad-4)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>' +
                '<path d="M48.97 31.03l4.24-4.24M26.79 53.21l4.24-4.24" stroke="url(#es-grad-4)" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' +
                '<path d="M48.97 48.97l4.24 4.24M26.79 26.79l4.24 4.24" stroke="url(#es-grad-4)" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>' +
                '<circle cx="40" cy="40" r="4" fill="url(#es-grad-4)" opacity="0.5"/>' +
                '<defs><linearGradient id="es-grad-4" x1="0" y1="0" x2="80" y2="80"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
            '</svg>',

        analytics: '' +
            '<svg width="80" height="80" viewBox="0 0 80 80" fill="none">' +
                '<circle cx="40" cy="40" r="38" fill="url(#es-grad-5)" opacity="0.12"/>' +
                '<circle cx="40" cy="40" r="38" stroke="url(#es-grad-5)" stroke-width="1" opacity="0.2"/>' +
                '<rect x="26" y="44" width="8" height="16" rx="2" stroke="url(#es-grad-5)" stroke-width="2"/>' +
                '<rect x="38" y="34" width="8" height="26" rx="2" stroke="url(#es-grad-5)" stroke-width="2"/>' +
                '<rect x="50" y="24" width="8" height="36" rx="2" stroke="url(#es-grad-5)" stroke-width="2"/>' +
                '<path d="M20 54l8-6 12 4 12-14 8 6" stroke="url(#es-grad-5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<circle cx="64" cy="32" r="2" fill="url(#es-grad-5)"/>' +
                '<circle cx="58" cy="36" r="1.5" fill="url(#es-grad-5)"/>' +
                '<defs><linearGradient id="es-grad-5" x1="0" y1="0" x2="80" y2="80"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
            '</svg>'
    };

    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function render(config) {
        var iconHtml = ICONS[config.icon] || ICONS.contacts;
        var buttonsHtml = '';
        if (config.buttons) {
            config.buttons.forEach(function(btn) {
                var variant = btn.variant || 'primary';
                var attrs = ' class="es-btn es-btn--' + variant + '"';
                if (btn.id) attrs += ' id="' + btn.id + '"';
                if (btn.href) {
                    buttonsHtml += '<a href="' + btn.href + '"' + attrs + '>' +
                        (btn.icon || '') + esc(btn.label) + '</a>';
                } else {
                    buttonsHtml += '<button' + attrs + '>' +
                        (btn.icon || '') + esc(btn.label) + '</button>';
                }
            });
        }
        return '' +
            '<div class="es-card" role="status">' +
                '<div class="es-icon">' + iconHtml + '</div>' +
                '<h3 class="es-title">' + esc(config.title) + '</h3>' +
                '<p class="es-desc">' + esc(config.desc) + '</p>' +
                (buttonsHtml ? '<div class="es-actions">' + buttonsHtml + '</div>' : '') +
            '</div>';
    }

    return { render: render };
})();
