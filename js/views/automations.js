/**
 * MailFlow Pro — View: Automações
 *
 * CRUD de regras de automação (trigger: novo contacto).
 * Em execução posterior: engine de automações.
 */

var AutomationsView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var state = {
        automations: [],
        total: 0,
        page: 1,
        limit: 20,
        search: '',
        statusFilter: 'all',
        triggerFilter: 'all',
        sortBy: 'created_at',
        sortDir: 'desc',
        campaigns: [],
        loading: false,
        activeTab: 'automations',
        jobs: [],
        jobsTotal: 0,
        jobsPage: 1,
        jobsLimit: 20
    };

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function triggerLabel(trigger) {
        var map = { 'contact_created': 'Novo contacto' };
        return map[trigger] || trigger;
    }

    function delayLabel(minutes) {
        if (!minutes || minutes === 0) return 'Imediato';
        if (minutes < 60) return minutes + ' min';
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return h + 'h' + (m ? ' ' + m + 'min' : '');
    }

    function statusBadge(enabled) {
        return enabled
            ? '<span class="tl-badge tl-badge--green">Ativa</span>'
            : '<span class="tl-badge tl-badge--gray">Inativa</span>';
    }

    function getAPIBase() {
        var cfg = window.MailFlowAPI;
        if (cfg && cfg.email && cfg.email.send !== undefined) {
            return cfg.email.send.replace('/api/email/send', '');
        }
        return '';
    }

    async function getAccessToken() {
        try {
            var session = await MailFlowAuth.getSession();
            if (session && session.access_token) return session.access_token;
        } catch (e) { /* ignore */ }
        return null;
    }

    async function apiCall(method, path, body) {
        var token = await getAccessToken();
        if (!token) { MailFlowToast.error('Sessão expirada.'); return null; }
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        };
        if (body) opts.body = JSON.stringify(body);
        var resp = await fetch(getAPIBase() + path, opts);
        return resp.json();
    }

    // ========================================
    // Fetch
    // ========================================
    async function fetchAutomations() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var query = sb.from('automation_rules')
                .select('*, campaign:campaigns(id,name)', { count: 'exact' })
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (state.search) {
                query = query.ilike('name', '%' + state.search + '%');
            }

            if (state.statusFilter !== 'all') {
                query = query.eq('enabled', state.statusFilter === 'active');
            }

            if (state.triggerFilter !== 'all') {
                query = query.eq('trigger_type', state.triggerFilter);
            }

            var from = (state.page - 1) * state.limit;
            query = query.range(from, from + state.limit - 1);

            var result = await query;
            state.automations = result.data || [];
            state.total = result.count || 0;
            state.loading = false;
            return { data: state.automations, count: state.total };
        } catch (err) {
            console.error('[Automations] Erro ao buscar:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    async function fetchCampaigns() {
        if (!sb || !user) return [];
        try {
            var r = await sb.from('campaigns')
                .select('id,nome')
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .eq('status', 'sent')
                .order('created_at', { ascending: false });
            state.campaigns = r.data || [];
            return state.campaigns;
        } catch { return []; }
    }

    async function fetchJobs() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var from = (state.jobsPage - 1) * state.jobsLimit;
            var query = sb.from('automation_jobs')
                .select('*, automation:automation_rules(id,name), contact:contacts(id,nome,email), campaign:campaigns(id,nome)', { count: 'exact' })
                .eq('automation.user_id', user.id)
                .order('created_at', { ascending: false })
                .range(from, from + state.jobsLimit - 1);
            var result = await query;
            state.jobs = result.data || [];
            state.jobsTotal = result.count || 0;
            state.loading = false;
            return { data: state.jobs, count: state.jobsTotal };
        } catch (err) {
            console.error('[Automations] Erro ao buscar jobs:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    // ========================================
    // Render
    // ========================================
    function buildHTML(automations, total) {
        var isJobsTab = state.activeTab === 'jobs';

        if (isJobsTab) {
            return buildJobsHTML();
        }

        var totalPages = Math.ceil(total / state.limit);
        var count = automations.length;

        var html = '';

        // Header
        html += '' +
            '<div class="tl-view-header">' +
                '<div class="tl-view-header__left">' +
                    '<span class="tl-badge tl-badge--indigo">Automações</span>' +
                    '<h1 class="tl-view-header__title">Automações</h1>' +
                    '<p class="tl-view-header__desc">Automatize o envio de campanhas quando novos contactos são adicionados.</p>' +
                '</div>' +
                '<button class="tl-btn tl-btn--primary" id="at-btn-add">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Nova Automação' +
                '</button>' +
            '</div>';

        // Toolbar
        html += '' +
            '<div class="tl-toolbar">' +
                '<div class="tl-toolbar__search">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                    '<input type="text" id="at-search" placeholder="Pesquisar automação..." value="' + esc(state.search) + '">' +
                '</div>' +
                '<select class="tl-input tl-input--select tl-toolbar__filter" id="at-filter-status">' +
                    '<option value="all"' + (state.statusFilter === 'all' ? ' selected' : '') + '>Todos os estados</option>' +
                    '<option value="active"' + (state.statusFilter === 'active' ? ' selected' : '') + '>Ativas</option>' +
                    '<option value="paused"' + (state.statusFilter === 'paused' ? ' selected' : '') + '>Inativas</option>' +
                '</select>' +
                '<select class="tl-input tl-input--select tl-toolbar__filter" id="at-filter-trigger">' +
                    '<option value="all"' + (state.triggerFilter === 'all' ? ' selected' : '') + '>Todos os triggers</option>' +
                    '<option value="contact_created"' + (state.triggerFilter === 'contact_created' ? ' selected' : '') + '>Novo contacto</option>' +
                '</select>' +
                '<select class="tl-input tl-input--select tl-toolbar__sort" id="at-sort">' +
                    '<option value="created_at-desc"' + (state.sortBy === 'created_at' && state.sortDir === 'desc' ? ' selected' : '') + '>Mais recentes</option>' +
                    '<option value="created_at-asc"' + (state.sortBy === 'created_at' && state.sortDir === 'asc' ? ' selected' : '') + '>Mais antigas</option>' +
                    '<option value="name-asc"' + (state.sortBy === 'name' && state.sortDir === 'asc' ? ' selected' : '') + '>Nome A-Z</option>' +
                    '<option value="name-desc"' + (state.sortBy === 'name' && state.sortDir === 'desc' ? ' selected' : '') + '>Nome Z-A</option>' +
                '</select>' +
                '<span class="tl-toolbar__count">' + total + ' regra' + (total !== 1 ? 's' : '') + '</span>' +
            '</div>';

        // Skeleton or Cards
        if (state.loading) {
            html += renderSkeleton();
        } else if (automations.length === 0) {
            html += renderEmpty();
        } else {
            html += '<div class="tl-cards">';
            automations.forEach(function(a, idx) {
                var campaignName = (a.campaign && a.campaign.nome) ? esc(a.campaign.nome) : '—';
                var lastRun = a.last_run_at ? formatDateTime(a.last_run_at) : '—';
                var runCount = a.run_count || 0;
                html += '' +
                    '<div class="tl-card" style="animation-delay:' + (idx * 0.04) + 's">' +
                        '<div class="tl-card__top-line"></div>' +
                        '<div class="tl-card__header">' +
                            '<div class="tl-card__header-left">' +
                                '<h3 class="tl-card__title">' + esc(a.name) + '</h3>' +
                                statusBadge(a.enabled) +
                            '</div>' +
                            '<span class="tl-badge tl-badge--indigo">' + triggerLabel(a.trigger_type) + '</span>' +
                        '</div>' +
                        '<div class="tl-card__body">' +
                            '<div class="tl-card__row">' +
                                '<div class="tl-card__stat">' +
                                    '<span class="tl-card__stat-label">Campanha</span>' +
                                    '<span class="tl-card__stat-value">' + esc(campaignName) + '</span>' +
                                '</div>' +
                                '<div class="tl-card__stat">' +
                                    '<span class="tl-card__stat-label">Delay</span>' +
                                    '<span class="tl-card__stat-value">' + delayLabel(a.delay_minutes) + '</span>' +
                                '</div>' +
                            '</div>' +
                            '<div class="tl-card__row">' +
                                '<div class="tl-card__stat">' +
                                    '<span class="tl-card__stat-label">Última execução</span>' +
                                    '<span class="tl-card__stat-value">' + lastRun + '</span>' +
                                '</div>' +
                                '<div class="tl-card__stat">' +
                                    '<span class="tl-card__stat-label">Execuções</span>' +
                                    '<span class="tl-card__stat-value">' + runCount + '</span>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="tl-card__actions">' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-edit="' + a.id + '" title="Editar">' +
                                '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                                'Editar' +
                            '</button>' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-toggle="' + a.id + '" data-enabled="' + a.enabled + '" title="' + (a.enabled ? 'Desativar' : 'Ativar') + '">' +
                                (a.enabled
                                    ? '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>'
                                    : '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 18.364a9 9 0 0112.728-12.728M5.636 5.636l12.728 12.728"/></svg>') +
                                (a.enabled ? 'Pausar' : 'Ativar') +
                            '</button>' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm tl-btn--danger" data-delete="' + a.id + '" title="Eliminar">' +
                                '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                                'Eliminar' +
                            '</button>' +
                        '</div>' +
                    '</div>';
            });
            html += '</div>';
        }

        // Pagination
        html += '' +
            '<div class="tl-pagination">' +
                '<span class="tl-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>' +
                '<div class="tl-pagination__btns">' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-page-prev"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-page-next"' + (state.page >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>' +
                '</div>' +
            '</div>';

        // Jobs panel
        if (state.activeTab === 'jobs') {
            html += buildJobsHTML();
        }

        return html;
    }

    function buildJobsHTML() {
        var jobs = state.jobs;
        var total = state.jobsTotal;
        var totalPages = Math.ceil(total / state.jobsLimit);

        var rows = jobs.map(function(j) {
            var automationName = (j.automation && j.automation.name) ? esc(j.automation.name) : '—';
            var contactName = (j.contact && j.contact.nome) ? esc(j.contact.nome) : '—';
            var contactEmail = (j.contact && j.contact.email) ? esc(j.contact.email) : '';
            var campaignName = (j.campaign && j.campaign.nome) ? esc(j.campaign.nome) : '—';
            var jStatusBadge = '';
            if (j.status === 'pending') jStatusBadge = '<span class="tl-badge tl-badge--yellow">Pendente</span>';
            else if (j.status === 'sent') jStatusBadge = '<span class="tl-badge tl-badge--green">Enviado</span>';
            else if (j.status === 'failed') jStatusBadge = '<span class="tl-badge tl-badge--red">Falhou</span>';
            else if (j.status === 'skipped') jStatusBadge = '<span class="tl-badge tl-badge--gray">Ignorado</span>';
            else jStatusBadge = '<span class="tl-badge tl-badge--gray">' + j.status + '</span>';
            var createdAt = j.created_at ? formatDateTime(j.created_at) : '—';
            var duration = j.duration_ms ? (j.duration_ms / 1000).toFixed(1) + 's' : '—';

            return '' +
                '<div class="tl-card" style="animation-delay:0s">' +
                    '<div class="tl-card__top-line"></div>' +
                    '<div class="tl-card__header">' +
                        '<div class="tl-card__header-left">' +
                            '<h3 class="tl-card__title">' + automationName + '</h3>' +
                            jStatusBadge +
                        '</div>' +
                        '<span class="tl-card__time">' + createdAt + '</span>' +
                    '</div>' +
                    '<div class="tl-card__body">' +
                        '<div class="tl-card__row">' +
                            '<div class="tl-card__stat">' +
                                '<span class="tl-card__stat-label">Contacto</span>' +
                                '<span class="tl-card__stat-value">' + contactName + (contactEmail ? ' &lt;' + contactEmail + '&gt;' : '') + '</span>' +
                            '</div>' +
                            '<div class="tl-card__stat">' +
                                '<span class="tl-card__stat-label">Campanha</span>' +
                                '<span class="tl-card__stat-value">' + esc(campaignName) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="tl-card__row">' +
                            '<div class="tl-card__stat">' +
                                '<span class="tl-card__stat-label">Duração</span>' +
                                '<span class="tl-card__stat-value">' + duration + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }).join('');

        var pagination = '' +
            '<div class="tl-pagination">' +
                '<span class="tl-pagination__info">Página ' + state.jobsPage + ' de ' + totalPages + '</span>' +
                '<div class="tl-pagination__btns">' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-jobs-page-prev"' + (state.jobsPage <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-jobs-page-next"' + (state.jobsPage >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>' +
                '</div>' +
            '</div>';

        if (jobs.length === 0) {
            return EmptyStateComponent.render({
                icon: 'automations',
                title: 'Nenhuma execução',
                desc: 'As execuções de automações aparecerão aqui quando contactos forem adicionados.'
            }) + pagination;
        }

        return '<div class="tl-cards">' + rows + '</div>' + pagination;
    }

    function renderEmpty() {
        return EmptyStateComponent.render({
            icon: 'automations',
            title: 'Automatize tarefas repetitivas',
            desc: 'Poupe tempo criando automações que trabalham por si.',
            buttons: [
                { id: 'at-btn-add-empty', label: 'Nova Automação', variant: 'primary', icon: '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' }
            ]
        });
    }

    function renderSkeleton() {
        var cards = '';
        for (var i = 0; i < 4; i++) {
            cards += '' +
                '<div class="tl-card tl-card--skeleton" style="animation-delay:' + (i * 0.06) + 's">' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--lg" style="width:60%"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--short" style="margin-top:8px"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--md"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--short" style="margin-top:12px"></div>' +
                '</div>';
        }
        return '<div class="tl-cards">' + cards + '</div>';
    }

    function renderEditor(automation) {
        var isEdit = !!automation;
        var delays = [
            { value: 0, label: 'Imediato' },
            { value: 5, label: '5 minutos' },
            { value: 30, label: '30 minutos' },
            { value: 60, label: '1 hora' },
            { value: 1440, label: '1 dia' }
        ];

        var delayOptions = delays.map(function(d) {
            return '<option value="' + d.value + '"' + (automation && automation.delay_minutes === d.value ? ' selected' : '') + '>' + d.label + '</option>';
        }).join('');

        var campaignOptions = state.campaigns.map(function(c) {
            return '<option value="' + c.id + '"' + (automation && automation.campaign_id === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('');

        var name = isEdit ? esc(automation.name) : '';
        var enabled = isEdit ? automation.enabled : false;
        var trigger = isEdit ? automation.trigger_type : 'contact_created';
        var delay = isEdit ? automation.delay_minutes : 0;
        var campaign = isEdit ? automation.campaign_id : '';

        return '' +
            '<div class="tl-modal" id="at-modal-editor" role="dialog" aria-modal="true">' +
                '<div class="tl-modal-overlay"></div>' +
                '<div class="tl-modal__content" style="max-width:560px;">' +
                    '<div class="tl-modal__header">' +
                        '<div>' +
                            '<span class="tl-badge tl-badge--indigo">Automação</span>' +
                            '<h3 class="tl-modal__title">' + (isEdit ? 'Editar Automação' : 'Nova Automação') + '</h3>' +
                        '</div>' +
                        '<button class="tl-modal__close" id="at-modal-close" aria-label="Fechar"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
                    '</div>' +
                    '<div class="tl-modal__body">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-name">Nome</label>' +
                            '<input class="tl-input" type="text" id="at-name" value="' + name + '" placeholder="Ex: Boas-vindas para novos contactos" required>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-trigger">Trigger</label>' +
                            '<select class="tl-input tl-input--select" id="at-trigger" disabled>' +
                                '<option value="contact_created"' + (trigger === 'contact_created' ? ' selected' : '') + '>Novo contacto</option>' +
                            '</select>' +
                            '<p class="tl-field__hint">Apenas "Novo contacto" disponível por enquanto.</p>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-delay">Delay</label>' +
                            '<select class="tl-input tl-input--select" id="at-delay">' + delayOptions + '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-campaign">Campanha a enviar</label>' +
                            '<select class="tl-input tl-input--select" id="at-campaign" required>' +
                                '<option value="">Selecione uma campanha...</option>' + campaignOptions +
                            '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Estado</label>' +
                            '<div class="tl-checkbox-wrapper">' +
                                '<input type="checkbox" class="tl-checkbox" id="at-enabled"' + (enabled ? ' checked' : '') + '>' +
                                '<label class="tl-checkbox-label" for="at-enabled">' +
                                    '<span class="tl-checkbox-box">' +
                                        '<svg class="tl-checkbox-check" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                                    '</span>' +
                                    'Ativa' +
                                '</label>' +
                            '</div>' +
                        '</div>' +
                        '<div id="at-editor-status" style="margin-bottom:16px;"></div>' +
                        '<div class="tl-modal__actions">' +
                            '<button class="tl-btn tl-btn--ghost" id="at-btn-cancel">Cancelar</button>' +
                            '<button class="tl-btn tl-btn--primary" id="at-btn-save"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' + (isEdit ? 'Guardar Alterações' : 'Criar Automação') + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    // ========================================
    // Actions
    // ========================================
    async function createAutomation(data) {
        var result = await apiCall('POST', '/api/automations', data);
        if (result && result.success) {
            MailFlowToast.success('Automação criada com sucesso.');
            window.dispatchEvent(new CustomEvent('mailflow:checklist-update'));
            closeModal();
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao criar automação.');
        }
    }

    async function updateAutomation(id, data) {
        var result = await apiCall('PUT', '/api/automations/' + id, data);
        if (result && result.success) {
            MailFlowToast.success('Automação atualizada.');
            closeModal();
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao atualizar automação.');
        }
    }

    async function toggleAutomation(id, enabled) {
        var result = await apiCall('PUT', '/api/automations/' + id, { enabled: enabled });
        if (result && result.success) {
            MailFlowToast.success(enabled ? 'Automação ativada.' : 'Automação desativada.');
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao alterar estado.');
        }
    }

    async function deleteAutomation(id) {
        if (!confirm('Eliminar esta automação?')) return;
        var result = await apiCall('DELETE', '/api/automations/' + id);
        if (result && result.success) {
            MailFlowToast.success('Automação eliminada.');
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao eliminar automação.');
        }
    }

    function openEditor(automation) {
        var modalHtml = renderEditor(automation);
        var wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
        bindEditorEvents(automation);
    }

    function closeModal() {
        var modal = document.getElementById('at-modal-editor');
        if (modal) modal.remove();
    }

    function bindEditorEvents(automation) {
        var isEdit = !!automation;

        var closeBtn = document.getElementById('at-modal-close');
        var cancelBtn = document.getElementById('at-btn-cancel');
        var saveBtn = document.getElementById('at-btn-save');
        var overlay = document.querySelector('#at-modal-editor .tl-modal-overlay');

        [closeBtn, cancelBtn, overlay].forEach(function(el) {
            if (el) el.addEventListener('click', closeModal);
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                var statusEl = document.getElementById('at-editor-status');
                var name = (document.getElementById('at-name').value || '').trim();
                var delay = parseInt(document.getElementById('at-delay').value, 10) || 0;
                var campaign = document.getElementById('at-campaign').value;
                var enabled = document.getElementById('at-enabled').checked;

                if (!name) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:.8125rem;font-weight:500;">Nome é obrigatório.</div>';
                    return;
                }
                if (!campaign) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:.8125rem;font-weight:500;">Selecione uma campanha.</div>';
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A guardar...';

                var data = { name: name, trigger_type: 'contact_created', delay_minutes: delay, campaign_id: campaign, enabled: enabled };

                if (isEdit) {
                    await updateAutomation(automation.id, data);
                } else {
                    await createAutomation(data);
                }

                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' + (isEdit ? 'Guardar Alterações' : 'Criar Automação');
            });
        }
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        var addBtn = document.getElementById('at-btn-add');
        var addEmpty = document.getElementById('at-btn-add-empty');
        var searchInput = document.getElementById('at-search');
        var statusFilter = document.getElementById('at-filter-status');
        var triggerFilter = document.getElementById('at-filter-trigger');
        var sortSelect = document.getElementById('at-sort');
        var prevBtn = document.getElementById('at-page-prev');
        var nextBtn = document.getElementById('at-page-next');
        var prevJobsBtn = document.getElementById('at-jobs-page-prev');
        var nextJobsBtn = document.getElementById('at-jobs-page-next');

        if (addBtn) addBtn.addEventListener('click', function() { openEditor(null); });
        if (addEmpty) addEmpty.addEventListener('click', function() { openEditor(null); });

        if (searchInput) {
            var dt; searchInput.addEventListener('input', function() {
                clearTimeout(dt); var v = this.value;
                dt = setTimeout(function() { state.search = v; state.page = 1; refresh(); }, 300);
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', function() {
                state.statusFilter = this.value;
                state.page = 1;
                refresh();
            });
        }

        if (triggerFilter) {
            triggerFilter.addEventListener('change', function() {
                state.triggerFilter = this.value;
                state.page = 1;
                refresh();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                var parts = this.value.split('-');
                state.sortBy = parts[0];
                state.sortDir = parts[1] || 'desc';
                refresh();
            });
        }

        if (prevBtn) prevBtn.addEventListener('click', function() { state.page--; refresh(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { state.page++; refresh(); });
        if (prevJobsBtn) prevJobsBtn.addEventListener('click', function() { state.jobsPage--; refresh(); });
        if (nextJobsBtn) nextJobsBtn.addEventListener('click', function() { state.jobsPage++; refresh(); });

        // Delegate action buttons
        var cardsContainer = document.querySelector('.tl-cards');
        if (cardsContainer) {
            cardsContainer.addEventListener('click', function(e) {
                var btn = e.target.closest('button');
                if (!btn) return;
                var editId = btn.getAttribute('data-edit');
                var toggleId = btn.getAttribute('data-toggle');
                var deleteId = btn.getAttribute('data-delete');
                var enabled = btn.getAttribute('data-enabled');

                if (editId) { openEditor(state.automations.find(function(a) { return a.id === editId; })); }
                else if (toggleId) { toggleAutomation(toggleId, enabled !== 'true'); }
                else if (deleteId) { deleteAutomation(deleteId); }
            });
        }
    }

    // ========================================
    // Refresh
    // ========================================
    async function refresh() {
        if (!currentContainer) return;
        var result = await fetchAutomations();
        currentContainer.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
    }

    // ========================================
    // Public
    // ========================================
    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:.875rem;">A carregar automações...</div>';

        await fetchCampaigns();

        var automationsResult = await fetchAutomations();
        var jobsResult = await fetchJobs();
        container.innerHTML = buildHTML(automationsResult.data, automationsResult.count);
        bindEvents();
    }

    return { render: render };
})();