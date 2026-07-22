/**
 * MailFlow Pro — Dashboard Controller
 *
 * Objetivo:
 *   Router SPA e controlador principal do dashboard.
 *   Gerencia navegação, verificação de sessão, e
 *   switching de views. É o entry point do dashboard.
 *
 * Benefício para o cliente:
 *   Navegação instantânea sem reload da página.
 *   Experiência fluida e profissional como apps desktop.
 *
 * Inputs:
 *   - Hash da URL (#/, #/campanhas, etc.)
 *   - Sessão do Supabase
 *
 * Outputs:
 *   - View renderizada no content area
 *   - Sidebar atualizada (active state)
 *   - Header atualizado (título da página)
 *
 * Erros possíveis:
 *   - Redirect para login se sessão inválida
 *   - Fallback para overview se view não encontrada
 *
 * Dependências:
 *   - supabase-client.js
 *   - auth.js
 *   - toast.js
 *   - views/overview.js
 */

(function() {
    'use strict';

    // ========================================
    // Init
    // ========================================

    var currentView = null;
    var user = null;

    var VIEWS = {
        'overview': { title: 'Visão Geral', module: function() { return window.OverviewView; } },
        'campanhas': { title: 'Campanhas', module: null },
        'contactos': { title: 'Contactos', module: null },
        'templates': { title: 'Templates', module: null },
        'analytics': { title: 'Analytics', module: null },
        'config': { title: 'Configurações', module: null }
    };

    // ========================================
    // Helpers
    // ========================================

    function getHash() {
        var hash = window.location.hash.replace('#/', '').split('?')[0];
        return hash || 'overview';
    }

    function setPageTitle(title) {
        var el = document.getElementById('page-title');
        if (el) el.textContent = title;
    }

    function setActiveLink(viewName) {
        var links = document.querySelectorAll('.sidebar__link');
        links.forEach(function(link) {
            link.classList.remove('sidebar__link--active');
            if (link.getAttribute('data-view') === viewName) {
                link.classList.add('sidebar__link--active');
            }
        });
    }

    // ========================================
    // Render
    // ========================================

    async function renderView() {
        var viewName = getHash();
        var viewConfig = VIEWS[viewName];

        if (!viewConfig) {
            viewName = 'overview';
            viewConfig = VIEWS['overview'];
        }

        // Atualizar UI
        setPageTitle(viewConfig.title);
        setActiveLink(viewName);
        document.title = viewConfig.title + ' — MailFlow Pro';

        // Obter content container
        var container = document.getElementById('main-content');
        if (!container) return;

        // Mostrar loading
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:0.875rem;">A carregar...</div>';

        // Carregar view
        var viewModule = viewConfig.module ? viewConfig.module() : null;

        if (viewModule && typeof viewModule.render === 'function') {
            await viewModule.render(container);
        } else {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state__icon empty-state__icon--indigo">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>' +
                    '</div>' +
                    '<h3 class="empty-state__title">' + viewConfig.title + '</h3>' +
                    '<p class="empty-state__desc">Esta funcionalidade será implementada numa fase futura.</p>' +
                '</div>';
        }

        currentView = viewName;
    }

    // ========================================
    // Events
    // ========================================

    function bindEvents() {
        // Hash change
        window.addEventListener('hashchange', function() {
            renderView();
        });

        // Logout
        var logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function() {
                await MailFlowAuth.signOut();
                window.location.href = '/entrar.html';
            });
        }

        // Mobile menu toggle
        var mobileToggle = document.getElementById('mobile-toggle');
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');

        if (mobileToggle && sidebar && overlay) {
            mobileToggle.addEventListener('click', function() {
                sidebar.classList.add('sidebar--open');
                overlay.classList.add('sidebar-overlay--visible');
            });

            overlay.addEventListener('click', function() {
                sidebar.classList.remove('sidebar--open');
                overlay.classList.remove('sidebar-overlay--visible');
            });
        }

        // Sidebar links (mobile: close menu after click)
        var sidebarLinks = document.querySelectorAll('.sidebar__link');
        sidebarLinks.forEach(function(link) {
            link.addEventListener('click', function() {
                if (sidebar) sidebar.classList.remove('sidebar--open');
                if (overlay) overlay.classList.remove('sidebar-overlay--visible');
            });
        });

        // Header action button
        var headerAction = document.getElementById('header-action');
        if (headerAction) {
            headerAction.addEventListener('click', function() {
                window.location.hash = '#/campanhas';
            });
        }
    }

    // ========================================
    // Boot
    // ========================================

    async function boot() {
        // Verificar sessão
        var session = await MailFlowAuth.getSession();
        if (!session) {
            window.location.href = '/entrar.html';
            return;
        }

        user = session.user;

        // Bind events
        bindEvents();

        // Render initial view
        await renderView();
    }

    // Iniciar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
