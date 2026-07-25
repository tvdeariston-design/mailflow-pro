/**
 * MailFlow Pro — View: Admin Panel
 *
 * Administration panel for platform management.
 * Router, auth check, and section navigation.
 */

var AdminView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var isAdmin = false;

    var SECTIONS = ['dashboard', 'users', 'campaigns', 'templates', 'automations', 'analytics', 'smtp', 'logs', 'system', 'settings'];

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function checkAdmin() {
        try {
            user = await MailFlowAuth.getUser();
            if (!user) { window.location.href = '/entrar.html'; return false; }

            var emailEl = document.getElementById('admin-email');
            var avatarEl = document.getElementById('admin-avatar');
            if (emailEl && user.email) emailEl.textContent = user.email;
            if (avatarEl && user.email) avatarEl.textContent = user.email.charAt(0).toUpperCase();

            if (user.email === 'tvdeariston@gmail.com') { isAdmin = true; return true; }

            if (sb) {
                var token = (await sb.auth.getSession()).data.session?.access_token;
                if (!token) { window.location.href = '/entrar.html'; return false; }
                var resp = await fetch('/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } });
                if (resp.ok) {
                    var data = await resp.json();
                    if (data && data.admin) { isAdmin = true; return true; }
                }
            }

            window.location.href = '/dashboard.html'; return false;
        } catch (e) { window.location.href = '/dashboard.html'; return false; }
    }

    function navigateTo(section) {
        if (SECTIONS.indexOf(section) === -1) section = 'dashboard';

        var links = document.querySelectorAll('.sidebar__link[data-section]');
        links.forEach(function(l) {
            l.classList.remove('sidebar__link--active');
            if (l.getAttribute('data-section') === section) l.classList.add('sidebar__link--active');
        });

        var sections = document.querySelectorAll('.section');
        sections.forEach(function(s) { s.classList.remove('section--active'); });

        var target = document.getElementById('section-' + section);
        if (target) target.classList.add('section--active');

        var titles = { dashboard:'Dashboard', users:'Utilizadores', campaigns:'Campanhas', templates:'Templates', automations:'Automações', analytics:'Analytics', smtp:'SMTP', logs:'Logs', system:'Sistema', settings:'Configurações' };
        var header = document.querySelector('.header__title');
        if (header && titles[section]) header.textContent = titles[section];

        var hash = '#/admin/' + (section === 'dashboard' ? '' : section);
        if (!window.location.hash.match(new RegExp('#/admin(/' + section + '|$)'))) {
            window.location.hash = hash;
        }

        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('sidebar--open');
        if (overlay) overlay.classList.remove('sidebar-overlay--visible');
    }

    function bindNavigation() {
        var links = document.querySelectorAll('.sidebar__link[data-section]');
        links.forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var section = link.getAttribute('data-section');
                navigateTo(section);
            });
        });

        window.addEventListener('hashchange', function() {
            var hash = window.location.hash;
            var section = hash.replace('#/admin/', '').replace('#/admin', '');
            if (!section || section === '') section = 'dashboard';
            navigateTo(section);
        });

        var mobileBtn = document.getElementById('mobile-menu-btn');
        var overlay = document.getElementById('sidebar-overlay');
        var sidebar = document.getElementById('sidebar');

        if (mobileBtn) {
            mobileBtn.addEventListener('click', function() {
                if (sidebar) sidebar.classList.toggle('sidebar--open');
                if (overlay) overlay.classList.toggle('sidebar-overlay--visible');
            });
        }
        if (overlay) {
            overlay.addEventListener('click', function() {
                if (sidebar) sidebar.classList.remove('sidebar--open');
                if (overlay) overlay.classList.remove('sidebar-overlay--visible');
            });
        }

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                if (sidebar) sidebar.classList.remove('sidebar--open');
                if (overlay) overlay.classList.remove('sidebar-overlay--visible');
            }
        });
    }

    function getQueryParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    async function loadDashboard() {
        var container = document.getElementById('admin-content');
        if (!container) return;
        var section = document.getElementById('section-dashboard');
        if (!section) return;

        var kpiGrid = section.querySelector('#kpi-dashboard');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';

            var kpis = [
                { label:'Total Utilizadores', value:'—', change:'loading', cls:'' },
                { label:'Premium', value:'—', change:'loading', cls:'' },
                { label:'Campanhas', value:'—', change:'loading', cls:'' },
                { label:'Emails Enviados', value:'—', change:'loading', cls:'' }
            ];

            try {
                if (sb) {
                    var countResp = await sb.from('auth.users').select('*', { count: 'exact', head: true });
                    var totalUsers = countResp.count || 0;
                    var premiumResp = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'premium');
                    var premiumUsers = premiumResp.count || 0;
                    var campResp = await sb.from('campaigns').select('*', { count: 'exact', head: true });
                    var totalCampaigns = campResp.count || 0;
                    kpis[0].value = totalUsers.toLocaleString();
                    kpis[1].value = premiumUsers.toLocaleString();
                    kpis[2].value = totalCampaigns.toLocaleString();
                    kpis[3].value = '-';
                }
            } catch (e) { /* keep placeholder */ }

            kpis.forEach(function(k) {
                var changeClass = k.change === 'loading' ? 'admin-kpi__change--neutral' : (k.change.indexOf('up') >= 0 ? 'admin-kpi__change--up' : 'admin-kpi__change--down');
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + changeClass + '">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
        }
    }

    async function loadUsers() {
        var section = document.getElementById('section-users');
        if (!section) return;
        var card = section.querySelector('.admin-card');
        if (!card) return;

        var state = {
            data: [],
            filtered: [],
            search: '',
            filterPlan: 'all',
            filterStatus: 'all',
            sortBy: 'created_at',
            sortDir: 'desc',
            page: 1,
            limit: 10,
            loading: true
        };

        function renderSkeleton() {
            var cards = '';
            for (var i = 0; i < 4; i++) {
                cards += '<div class="admin-kpi skeleton-card"></div>';
            }
            return cards;
        }

        function renderEmpty() {
            return '<div class="empty">' +
                '<div class="empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div>' +
                '<p class="empty__title">Nenhum utilizador encontrado</p>' +
                '<p class="empty__desc">Tente alterar os filtros ou a pesquisa.</p>' +
            '</div>';
        }

        function getUserBadge(plan, enabled) {
            if (enabled === false) return '<span class="badge badge--red">Suspenso</span>';
            if (plan === 'premium') return '<span class="badge badge--green">Premium</span>';
            if (plan === 'trial') return '<span class="badge badge--yellow">Trial</span>';
            return '<span class="badge badge--gray">Free</span>';
        }

        function getUserStatus(enabled) {
            return enabled !== false ? 'Ativo' : 'Suspenso';
        }

        function getPlanBadgeClass(plan) {
            if (plan === 'premium') return 'badge--green';
            if (plan === 'trial') return 'badge--yellow';
            return 'badge--gray';
        }

        function applyFilters() {
            var q = state.search.toLowerCase();
            var filtered = state.data.filter(function(u) {
                var name = (u.full_name || u.email || '').toLowerCase();
                var email = (u.email || '').toLowerCase();
                if (q && name.indexOf(q) < 0 && email.indexOf(q) < 0) return false;
                if (state.filterPlan !== 'all' && u.plan !== state.filterPlan) return false;
                if (state.filterStatus !== 'all') {
                    var active = u.enabled !== false;
                    if (state.filterStatus === 'active' && !active) return false;
                    if (state.filterStatus === 'suspended' && active) return false;
                }
                return true;
            });

            filtered.sort(function(a, b) {
                var aVal, bVal;
                switch (state.sortBy) {
                    case 'name': aVal = (a.full_name || a.email || '').toLowerCase(); bVal = (b.full_name || b.email || '').toLowerCase(); break;
                    case 'email': aVal = (a.email || '').toLowerCase(); bVal = (b.email || '').toLowerCase(); break;
                    case 'plan': aVal = (a.plan || 'free'); bVal = (b.plan || 'free'); break;
                    case 'last_login': aVal = a.last_sign_in_at || ''; bVal = b.last_sign_in_at || ''; break;
                    case 'created_at':
                    default: aVal = a.created_at || ''; bVal = b.created_at || ''; break;
                }
                if (state.sortDir === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            });

            state.filtered = filtered;
            state.page = 1;
        }

        function formatLastLogin(dateStr) {
            if (!dateStr) return '—';
            var d = new Date(dateStr);
            var now = new Date();
            var diff = now - d;
            var mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Agora';
            if (mins < 60) return mins + ' min';
            var hours = Math.floor(mins / 60);
            if (hours < 24) return hours + 'h';
            var days = Math.floor(hours / 24);
            if (days < 30) return days + 'd';
            return d.toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' });
        }

        function showUserModal(user) {
            var overlay = document.createElement('div');
            overlay.className = 'tl-modal-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;';

            var modal = document.createElement('div');
            modal.className = 'tl-modal__content';
            modal.style.cssText = 'max-width:520px;width:90%;max-height:85vh;overflow-y:auto;background:white;border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,0.15);animation:tl-modalIn 0.25s ease both;';

            modal.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0;">' +
                '<div><h3 style="font-size:1.125rem;font-weight:700;color:#0f172a;margin:0;">' + esc(user.full_name || user.email || 'Utilizador') + '</h3>' +
                '<span class="badge ' + getPlanBadgeClass(user.plan) + '" style="margin-top:4px;">' + esc(user.plan || 'free') + '</span></div>' +
                '<button class="tl-modal__close" id="um-close" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all 0.2s;">✕</button>' +
            '</div>' +
            '<div style="padding:20px 24px 24px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Email</label><p style="font-size:0.8125rem;margin:4px 0 0;word-break:break-all;">' + esc(user.email || '—') + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Estado</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + getUserStatus(user.enabled) + '</p></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Último login</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + formatLastLogin(user.last_sign_in_at) + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Membro desde</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + (user.created_at ? new Date(user.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</p></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Timezone</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + esc(user.timezone || '—') + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Idioma</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + esc(user.locale || '—') + '</p></div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid #f1f5f9;">' +
                    '<button class="btn btn--primary btn--sm" id="um-edit" data-uid="' + esc(user.id) + '">Editar</button>' +
                    '<button class="btn btn--ghost btn--sm" id="um-toggle" data-uid="' + esc(user.id) + '" data-enabled="' + (user.enabled !== false) + '">' + (user.enabled !== false ? 'Suspender' : 'Reativar') + '</button>' +
                    '<button class="btn btn--danger btn--sm" id="um-delete" data-uid="' + esc(user.id) + '">Eliminar</button>' +
                '</div>' +
            '</div>';

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
            overlay.querySelector('#um-close').addEventListener('click', close);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            overlay.querySelector('#um-edit').addEventListener('click', function() { editUser(user.id); close(); });
            overlay.querySelector('#um-toggle').addEventListener('click', function() { toggleUser(user.id); close(); });
            overlay.querySelector('#um-delete').addEventListener('click', function() { deleteUser(user.id); close(); });
        }

        async function editUser(id) {
            var newName = prompt('Novo nome do utilizador:');
            if (newName === null) return;
            try {
                await sb.from('profiles').update({ full_name: newName.trim() }).eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao editar utilizador:', e); }
        }

        async function toggleUser(id) {
            var user = state.data.find(function(u) { return u.id === id; });
            if (!user) return;
            try {
                await sb.from('profiles').update({ enabled: user.enabled === false }).eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao alterar estado:', e); }
        }

        async function deleteUser(id) {
            if (!confirm('Tem a certeza que deseja eliminar este utilizador? Esta ação é irreversível.')) return;
            try {
                await sb.from('profiles').delete().eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao eliminar utilizador:', e); }
        }

        async function loadUsersData() {
            if (!sb) { state.data = []; return; }
            try {
                var result = await sb.from('profiles').select('*').order('created_at', { ascending: false });
                state.data = result.data || [];
                applyFilters();
            } catch (e) {
                state.data = [];
                state.filtered = [];
            }
        }

        function render() {
            if (!card) return;
            var countEl = section.querySelector('#admin-user-count');

            var filtered = state.filtered;
            var totalPages = Math.ceil(filtered.length / state.limit) || 1;
            var start = (state.page - 1) * state.limit;
            var pageUsers = filtered.slice(start, start + state.limit);
            var totalUsers = state.data.length;
            var premiumCount = state.data.filter(function(u) { return u.plan === 'premium'; }).length;

            if (countEl) countEl.textContent = filtered.length + ' de ' + totalUsers + ' utilizadores';

            var html = '';

            // Premium KPI mini cards
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Total</div><div class="admin-kpi__value">' + totalUsers + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Premium</div><div class="admin-kpi__value" style="color:#10b981;">' + premiumCount + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Trial</div><div class="admin-kpi__value" style="color:#d97706;">' + state.data.filter(function(u){return u.plan==="trial";}).length + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Ativos</div><div class="admin-kpi__value" style="color:#2563eb;">' + state.data.filter(function(u){return u.enabled!==false;}).length + '</div></div>';
            html += '</div>';

            // Cards grid
            html += '<div class="tl-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">';

            if (pageUsers.length === 0) {
                html += renderEmpty();
            } else {
                pageUsers.forEach(function(u, idx) {
                    var plan = u.plan || 'free';
                    var planBadge = getPlanBadgeClass(plan);
                    var statusBadge = u.enabled !== false ? 'badge--green' : 'badge--red';
                    var lastLogin = formatLastLogin(u.last_sign_in_at);
                    var createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—';

                    html += '<div class="tl-card" style="animation-delay:' + (idx * 0.04) + 's">';
                    html += '<div class="tl-card__top-line"></div>';
                    html += '<div class="tl-card__header">';
                    html += '<div class="tl-card__header-left">';
                    html += '<h3 class="tl-card__title">' + esc(u.full_name || u.email || '—') + '</h3>';
                    html += getUserBadge(plan, u.enabled);
                    html += '</div>';
                    html += '<span class="badge ' + planBadge + '" style="font-size:0.625rem;">' + esc(plan) + '</span>';
                    html += '</div>';
                    html += '<div class="tl-card__body">';
                    html += '<div class="tl-card__row">';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Email</span><span class="tl-card__stat-value" style="font-size:0.75rem;word-break:break-all;">' + esc(u.email || '—') + '</span></div>';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Estado</span><span class="tl-card__stat-value"><span class="badge ' + statusBadge + '">' + getUserStatus(u.enabled) + '</span></span></div>';
                    html += '</div>';
                    html += '<div class="tl-card__row">';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Último login</span><span class="tl-card__stat-value">' + lastLogin + '</span></div>';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Membro desde</span><span class="tl-card__stat-value">' + createdAt + '</span></div>';
                    html += '</div>';
                    html += '</div>';
                    html += '<div class="tl-card__actions">';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="view" data-uid="' + esc(u.id) + '">Ver</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="edit" data-uid="' + esc(u.id) + '">Editar</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="toggle" data-uid="' + esc(u.id) + '" data-enabled="' + (u.enabled !== false) + '">' + (u.enabled !== false ? 'Suspender' : 'Reativar') + '</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm tl-btn--danger" data-action="delete" data-uid="' + esc(u.id) + '">Eliminar</button>';
                    html += '</div>';
                    html += '</div>';
                });
            }
            html += '</div>';

            // Pagination
            if (filtered.length > state.limit) {
                var totalPages = Math.ceil(filtered.length / state.limit);
                html += '<div class="tl-pagination" style="margin-top:20px;">';
                html += '<span class="tl-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>';
                html += '<div class="tl-pagination__btns">';
                html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-page="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>';
                html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>';
                html += '</div></div>';
            }

            card.innerHTML = html;

            // Bind card actions
            card.querySelectorAll('button[data-action]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var action = btn.getAttribute('data-action');
                    var uid = btn.getAttribute('data-uid');
                    if (action === 'view') showUserModal(state.data.find(function(u) { return u.id === uid; }));
                    else if (action === 'edit') editUser(uid);
                    else if (action === 'toggle') toggleUser(uid);
                    else if (action === 'delete') deleteUser(uid);
                });
            });

            // Bind pagination
            card.querySelectorAll('[data-page]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var p = parseInt(btn.getAttribute('data-page'), 10);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) {
                        state.page = p;
                        render();
                    }
                });
            });
        }

        function renderToolbar() {
            var searchEl = section.querySelector('#admin-user-search');
            var planFilter = section.querySelector('#admin-user-plan');
            var statusFilter = section.querySelector('#admin-user-status');
            var sortEl = section.querySelector('#admin-user-sort');

            if (searchEl) {
                var dt;
                searchEl.value = state.search;
                searchEl.addEventListener('input', function() {
                    clearTimeout(dt);
                    dt = setTimeout(function() {
                        state.search = searchEl.value;
                        applyFilters();
                        render();
                    }, 200);
                });
            }
            if (planFilter) {
                planFilter.value = state.filterPlan;
                planFilter.addEventListener('change', function() {
                    state.filterPlan = planFilter.value;
                    applyFilters();
                    render();
                });
            }
            if (statusFilter) {
                statusFilter.value = state.filterStatus;
                statusFilter.addEventListener('change', function() {
                    state.filterStatus = statusFilter.value;
                    applyFilters();
                    render();
                });
            }
            if (sortEl) {
                sortEl.value = state.sortBy + '-' + state.sortDir;
                sortEl.addEventListener('change', function() {
                    var parts = sortEl.value.split('-');
                    state.sortBy = parts[0];
                    state.sortDir = parts[1] || 'desc';
                    applyFilters();
                    render();
                });
            }
        }

        async function init() {
            card.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
            '</div>' +
            '<div style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">' +
                '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>' +
                '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>' +
            '</div>';

            await loadUsersData();
            state.loading = false;

            // Recreate toolbar if not exists
            var existingToolbar = section.querySelector('.admin-user-toolbar');
            if (!existingToolbar) {
                var toolbar = document.createElement('div');
                toolbar.className = 'admin-user-toolbar';
                toolbar.style.cssText = 'display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;';
                toolbar.innerHTML =
                    '<div style="position:relative;flex:1;min-width:180px;max-width:300px;">' +
                        '<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#94a3b8;pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                        '<input type="text" id="admin-user-search" placeholder="Pesquisar utilizadores..." style="width:100%;padding:8px 12px 8px 34px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;">' +
                    '</div>' +
                    '<select id="admin-user-plan" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="all">Todos os planos</option><option value="premium">Premium</option><option value="trial">Trial</option><option value="free">Free</option>' +
                    '</select>' +
                    '<select id="admin-user-status" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="all">Todos os estados</option><option value="active">Ativos</option><option value="suspended">Suspensos</option>' +
                    '</select>' +
                    '<select id="admin-user-sort" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="created_at-desc">Mais recentes</option><option value="created_at-asc">Mais antigos</option><option value="name-asc">Nome A-Z</option><option value="name-desc">Nome Z-A</option><option value="plan-asc">Plano</option><option value="last_login-desc">Último login</option>' +
                    '</select>';

                card.parentNode.insertBefore(toolbar, card);
                renderToolbar();
            }

            render();
        }

        // Debounce search
        var searchTimer = null;
        var origInit = init;

        return init();
    }

    async function loadCampaigns() {
        var section = document.getElementById('section-campaigns');
        if (!section) return;
        var table = section.querySelector('#admin-campaigns-table tbody');
        var countEl = section.querySelector('#admin-campaign-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('campaigns').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' campanhas';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma campanha</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(c) {
                    var status = c.status || 'draft';
                    var statusBadge = status === 'sent' ? 'badge--green' : (status === 'active' ? 'badge--indigo' : (status === 'draft' ? 'badge--gray' : 'badge--yellow'));
                    var openRate = c.stats && c.stats.open_rate != null ? c.stats.open_rate + '%' : '—';
                    var clickRate = c.stats && c.stats.click_rate != null ? c.stats.click_rate + '%' : '—';
                    html += '<tr>' +
                        '<td><strong>' + esc(c.name) + '</strong></td>' +
                        '<td>' + esc(c.owner_id || '—') + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + esc(status) + '</span></td>' +
                        '<td>' + (c.stats && c.stats.sent != null ? c.stats.sent : '—') + '</td>' +
                        '<td>' + openRate + '</td>' +
                        '<td>' + clickRate + '</td>' +
                        '<td>' + (c.stats && c.stats.failed != null ? c.stats.failed : '—') + '</td>' +
                        '<td>' + (c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                    '</tr>';
                });
                table.innerHTML = html;
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Erro ao carregar campanhas</p></div></td></tr>';
        }
    }

    async function loadTemplates() {
        var section = document.getElementById('section-templates');
        if (!section) return;
        var table = section.querySelector('#admin-templates-table tbody');
        var countEl = section.querySelector('#admin-template-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="4"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('templates').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' templates';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="4"><div class="empty"><p class="empty__title">Nenhum template</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(t) {
                    html += '<tr>' +
                        '<td><strong>' + esc(t.name) + '</strong></td>' +
                        '<td>' + esc(t.user_id || '—') + '</td>' +
                        '<td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                        '<td><div style="display:flex;gap:4px;"><button class="btn btn--ghost btn--sm" data-action="duplicate" data-id="' + esc(t.id) + '">Duplicar</button><button class="btn btn--danger btn--sm" data-action="delete" data-id="' + esc(t.id) + '">Eliminar</button></div></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    console.log(action + ' template:', id);
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="4"><div class="empty"><p class="empty__title">Erro ao carregar templates</p></div></td></tr>';
        }
    }

    async function loadAutomations() {
        var section = document.getElementById('section-automations');
        if (!section) return;
        var table = section.querySelector('#admin-automations-table tbody');
        var countEl = section.querySelector('#admin-automation-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('automation_rules').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' regras';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma automação</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(a) {
                    var statusBadge = a.enabled ? 'badge--green' : 'badge--gray';
                    var triggerLabel = a.trigger_type === 'contact_created' ? 'Novo contacto' : (a.trigger_type || '—');
                    html += '<tr>' +
                        '<td><strong>' + esc(a.name) + '</strong></td>' +
                        '<td>' + esc(a.user_id || '—') + '</td>' +
                        '<td>' + esc(triggerLabel) + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + (a.enabled ? 'Ativa' : 'Inativa') + '</span></td>' +
                        '<td>—</td><td>—</td><td>—</td>' +
                        '<td><button class="btn btn--ghost btn--sm" data-action="view" data-id="' + esc(a.id) + '">Ver</button></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    console.log(action + ' automation:', id);
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Erro ao carregar automações</p></div></td></tr>';
        }
    }

    async function loadAnalytics() {
        var section = document.getElementById('section-analytics');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-analytics');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';
            var kpis = [
                { label:'Taxa Abertura', value:'—', change:'—' },
                { label:'Taxa Cliques', value:'—', change:'—' },
                { label:'Taxa Conversão', value:'—', change:'—' },
                { label:'Bounce Rate', value:'—', change:'—' }
            ];
            kpis.forEach(function(k) {
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change admin-kpi__change--neutral">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
        }
    }

    async function loadSMTP() {
        var section = document.getElementById('section-smtp');
        if (!section) return;
        var table = section.querySelector('#admin-smtp-table tbody');
        var countEl = section.querySelector('#admin-smtp-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="7"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('profiles').select('smtp_host,smtp_port,smtp_username,smtp_secure,smtp_status').limit(20);
                var data = result.data || [];
                var configs = [];
                data.forEach(function(p) {
                    if (p.smtp_host) configs.push(p);
                });
                if (countEl) countEl.textContent = configs.length + ' configurações';

                if (configs.length === 0) {
                    table.innerHTML = '<tr><td colspan="7"><div class="empty"><p class="empty__title">Nenhuma configuração SMTP</p></div></td></tr>';
                    return;
                }

                var html = '';
                configs.forEach(function(c) {
                    var status = c.smtp_status || 'not_configured';
                    var statusBadge = status === 'verified' ? 'badge--green' : (status === 'configured' ? 'badge--yellow' : 'badge--red');
                    html += '<tr>' +
                        '<td>' + esc(c.smtp_host) + '</td>' +
                        '<td>' + esc(c.smtp_port) + '</td>' +
                        '<td>' + esc(c.smtp_username || '—') + '</td>' +
                        '<td>' + (c.smtp_secure ? 'SSL/TLS' : '—') + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + esc(status) + '</span></td>' +
                        '<td>—</td>' +
                        '<td><button class="btn btn--ghost btn--sm" data-action="test" data-host="' + esc(c.smtp_host) + '">Testar</button><button class="btn btn--danger btn--sm">Eliminar</button></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var host = btn.getAttribute('data-host');
                    if (action === 'test') console.log('Test SMTP:', host);
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="7"><div class="empty"><p class="empty__title">Erro ao carregar SMTP</p></div></td></tr>';
        }
    }

    async function loadLogs() {
        var section = document.getElementById('section-logs');
        if (!section) return;
        var table = section.querySelector('#admin-logs-table tbody');
        var countEl = section.querySelector('#admin-log-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="5"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' entradas';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Nenhum log</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(l) {
                    var type = l.event_type || l.type || 'info';
                    var typeBadge = type === 'login' ? 'badge--indigo' : (type === 'error' ? 'badge--red' : (type === 'webhook' ? 'badge--blue' : 'badge--gray'));
                    html += '<tr>' +
                        '<td>' + (l.created_at ? new Date(l.created_at).toLocaleString('pt-PT') : '—') + '</td>' +
                        '<td><span class="badge ' + typeBadge + '">' + esc(type) + '</span></td>' +
                        '<td>' + esc(l.user_id || '—') + '</td>' +
                        '<td>' + esc(l.description || l.message || '—') + '</td>' +
                        '<td><code style="font-size:0.75rem;color:#64748b;">' + esc(JSON.stringify(l.details || l.metadata || {}).substring(0, 60)) + '</code></td>' +
                    '</tr>';
                });
                table.innerHTML = html;
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Erro ao carregar logs</p></div></td></tr>';
        }
    }

    async function loadSystem() {
        var section = document.getElementById('section-system');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-system');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';
            var kpis = [
                { label:'Versão', value:'1.0.0', change:'Stable' },
                { label:'Uptime', value:'—', change:'—' },
                { label:'Supabase', value:'—', change:'—' },
                { label:'Netlify', value:'—', change:'—' }
            ];
            kpis.forEach(function(k) {
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change admin-kpi__change--neutral">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
        }

        var table = section.querySelector('#admin-system-table tbody');
        if (table && !table.dataset.loaded) {
            table.dataset.loaded = 'true';
            table.innerHTML = '';
            var services = [
                { name:'Supabase', status:'healthy', version:'—', uptime:'—' },
                { name:'Netlify', status:'healthy', version:'—', uptime:'—' },
                { name:'Storage', status:'healthy', version:'—', uptime:'—' },
                { name:'Cron Jobs', status:'healthy', version:'—', uptime:'—' },
                { name:'Background Workers', status:'healthy', version:'—', uptime:'—' }
            ];
            var html = '';
            services.forEach(function(s) {
                var statusBadge = s.status === 'healthy' ? 'badge--green' : 'badge--red';
                html += '<tr>' +
                    '<td><strong>' + esc(s.name) + '</strong></td>' +
                    '<td><span class="badge ' + statusBadge + '">' + esc(s.status) + '</span></td>' +
                    '<td>' + esc(s.version) + '</td>' +
                    '<td>' + esc(s.uptime) + '</td>' +
                    '<td><code style="font-size:0.75rem;">OK</code></td>' +
                '</tr>';
            });
            table.innerHTML = html;
        }
    }

    function loadSettings() {
        var section = document.getElementById('section-settings');
        if (!section) return;
    }

    function loadSection(section) {
        var s = section.replace('#/admin/', '');
        if (s === '') s = 'dashboard';
        switch (s) {
            case 'dashboard': loadDashboard(); break;
            case 'users': loadUsers(); break;
            case 'campaigns': loadCampaigns(); break;
            case 'templates': loadTemplates(); break;
            case 'automations': loadAutomations(); break;
            case 'analytics': loadAnalytics(); break;
            case 'smtp': loadSMTP(); break;
            case 'logs': loadLogs(); break;
            case 'system': loadSystem(); break;
            case 'settings': loadSettings(); break;
            default: loadDashboard();
        }
    }

    async function render(container) {
        currentContainer = container;
        init();

        var admin = await checkAdmin();
        if (!admin) return;

        bindNavigation();
        navigateTo('dashboard');
        loadDashboard();
    }

    return { render: render };
})();