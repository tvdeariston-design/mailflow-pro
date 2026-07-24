/**
 * MailFlow Pro — View: Templates
 *
 * Gestao de templates de email reutilizaveis.
 * CRUD completo com soft delete, duplicar, default, pesquisa, paginacao,
 * preview (Desktop/Mobile/Text) e envio de teste.
 */

var TemplatesView = (function() {
    'use strict';

    // ========================================
    // State
    // ========================================
    var sb = null;
    var user = null;
    var currentContainer = null;
    var state = {
        templates: [],
        total: 0,
        page: 1,
        limit: 20,
        search: '',
        loading: false
    };

    function init() {
        sb = window.supabaseClient;
    }

    // ========================================
    // Helpers
    // ========================================
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function getAPIBase() {
        var cfg = window.MailFlowAPI;
        if (cfg && cfg.email && cfg.email.send !== undefined) {
            var url = cfg.email.send;
            return url.replace('/api/email/send', '');
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

    async function fetchTemplates() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var query = sb
                .from('templates')
                .select('*', { count: 'exact' })
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (state.search) {
                query = query.or('nome.ilike.%' + state.search + '%,subject.ilike.%' + state.search + '%');
            }

            var from = (state.page - 1) * state.limit;
            var to = from + state.limit - 1;
            query = query.range(from, to);

            var result = await query;
            state.templates = result.data || [];
            state.total = result.count || 0;
            state.loading = false;
            return { data: state.templates, count: state.total };
        } catch (err) {
            console.error('[Templates] Erro ao buscar:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    // ========================================
    // Render
    // ========================================
    async function render(container) {
        init();
        currentContainer = container;
        user = await MailFlowAuth.getUser();
        if (!user) return;

        state.page = 1;
        state.search = '';

        var result = await fetchTemplates();
        container.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
    }

    function buildHTML(templates, total) {
        return renderToolbar(total) +
            (templates.length === 0 && !state.search ? renderEmpty() : renderGrid(templates, total));
    }

    function renderToolbar(total) {
        var totalPages = Math.ceil(total / state.limit);
        return '' +
            '<div class="tl-toolbar">' +
                '<div class="tl-toolbar__left">' +
                    '<h2 class="tl-toolbar__title">Templates <span class="tl-toolbar__count">(' + total + ')</span></h2>' +
                '</div>' +
                '<div class="tl-toolbar__right">' +
                    '<div class="tl-search">' +
                        '<svg class="tl-search__icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                        '<input type="text" class="tl-search__input" id="tl-search" placeholder="Pesquisar template..." value="' + esc(state.search) + '">' +
                    '</div>' +
                    '<button class="tl-btn tl-btn--primary" id="tl-btn-add">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                        'Novo Template' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function renderGrid(templates, total) {
        var totalPages = Math.ceil(total / state.limit);

        var cards = templates.map(function(t) {
            var defaultBadge = t.is_default ? '<span class="tl-badge tl-badge--green">Predefinido</span>' : '';
            var usageBadge = t.usage_count > 0 ? '<span class="tl-badge tl-badge--gray">Usado ' + t.usage_count + 'x</span>' : '';

            return '' +
                '<div class="tl-card">' +
                    '<div class="tl-card__header">' +
                        '<div class="tl-card__title">' + esc(t.nome || 'Sem Nome') + '</div>' +
                        '<div class="tl-card__badges">' + defaultBadge + usageBadge + '</div>' +
                    '</div>' +
                    '<div class="tl-card__subject">' + esc(t.subject || 'Sem assunto') + '</div>' +
                    '<div class="tl-card__preview">' + esc((t.html || '').substring(0, 120)) + (t.html && t.html.length > 120 ? '...' : '') + '</div>' +
                    '<div class="tl-card__footer">' +
                        '<div class="tl-card__meta">' +
                            '<span>' + formatDate(t.created_at) + '</span>' +
                            (t.last_used_at ? '<span>Usado: ' + formatDate(t.last_used_at) + '</span>' : '') +
                        '</div>' +
                        '<div class="tl-card__actions">' +
                            '<button class="tl-action tl-action--preview" data-id="' + t.id + '" title="Pre-visualizar">' +
                                '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>' +
                            '</button>' +
                            '<button class="tl-action tl-action--testsend" data-id="' + t.id + '" title="Enviar teste">' +
                                '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' +
                            '</button>' +
                            '<button class="tl-action tl-action--default" data-id="' + t.id + '" title="' + (t.is_default ? 'Ja e predefinido' : 'Definir como predefinido') + '" ' + (t.is_default ? 'disabled' : '') + '>' +
                                '<svg width="15" height="15" fill="' + (t.is_default ? 'currentColor' : 'none') + '" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>' +
                            '</button>' +
                            '<button class="tl-action tl-action--edit" data-id="' + t.id + '" title="Editar">' +
                                '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                            '</button>' +
                            '<button class="tl-action tl-action--duplicate" data-id="' + t.id + '" title="Duplicar">' +
                                '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>' +
                            '</button>' +
                            '<button class="tl-action tl-action--delete" data-id="' + t.id + '" title="Eliminar">' +
                                '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }).join('');

        var pagination = '';
        if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? ' disabled' : '';
            var nextDisabled = state.page >= totalPages ? ' disabled' : '';
            pagination = '' +
                '<div class="tl-pagination">' +
                    '<span class="tl-pagination__info">Pagina ' + state.page + ' de ' + totalPages + '</span>' +
                    '<div class="tl-pagination__btns">' +
                        '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="tl-page-prev"' + prevDisabled + '>&larr; Anterior</button>' +
                        '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="tl-page-next"' + nextDisabled + '>Proxima &rarr;</button>' +
                    '</div>' +
                '</div>';
        }

        return '<div class="tl-grid">' + cards + '</div>' + pagination;
    }

    function renderEmpty() {
        return '' +
            '<div class="tl-empty">' +
                '<div class="tl-empty__icon">' +
                    '<svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>' +
                '</div>' +
                '<h3 class="tl-empty__title">Ainda nao tem templates</h3>' +
                '<p class="tl-empty__desc">Crie o seu primeiro template para reutilizar em campanhas.</p>' +
                '<button class="tl-btn tl-btn--primary" id="tl-btn-add-empty">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Criar Primeiro Template' +
                '</button>' +
            '</div>';
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        var addBtn = document.getElementById('tl-btn-add');
        if (addBtn) addBtn.addEventListener('click', function() { showTemplateModal(null); });

        var addEmptyBtn = document.getElementById('tl-btn-add-empty');
        if (addEmptyBtn) addEmptyBtn.addEventListener('click', function() { showTemplateModal(null); });

        var searchInput = document.getElementById('tl-search');
        if (searchInput) {
            var debounceTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                var val = this.value;
                debounceTimer = setTimeout(function() {
                    state.search = val;
                    state.page = 1;
                    refresh();
                }, 300);
            });
        }

        var prevBtn = document.getElementById('tl-page-prev');
        if (prevBtn) prevBtn.addEventListener('click', function() { state.page--; refresh(); });

        var nextBtn = document.getElementById('tl-page-next');
        if (nextBtn) nextBtn.addEventListener('click', function() { state.page++; refresh(); });

        document.querySelectorAll('.tl-action--preview').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var template = state.templates.find(function(t) { return t.id === id; });
                if (template) showPreviewModal(template);
            });
        });

        document.querySelectorAll('.tl-action--testsend').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var template = state.templates.find(function(t) { return t.id === id; });
                if (template) showTestSendModal(template);
            });
        });

        document.querySelectorAll('.tl-action--default').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                setDefault(id);
            });
        });

        document.querySelectorAll('.tl-action--edit').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var template = state.templates.find(function(t) { return t.id === id; });
                if (template) showTemplateModal(template);
            });
        });

        document.querySelectorAll('.tl-action--duplicate').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                duplicateTemplate(id);
            });
        });

        document.querySelectorAll('.tl-action--delete').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var template = state.templates.find(function(t) { return t.id === id; });
                if (template && confirm('Eliminar template "' + (template.nome) + '"?\nEsta acao nao pode ser desfeita.')) {
                    deleteTemplate(id);
                }
            });
        });
    }

    // ========================================
    // CRUD
    // ========================================
    async function setDefault(id) {
        if (!sb || !user) return;
        try {
            var { error } = await sb.from('templates').update({ is_default: true }).eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            MailFlowToast.success('Template definido como predefinido.');
            refresh();
        } catch (err) {
            console.error('[Templates] Erro ao definir default:', err);
            MailFlowToast.error('Erro ao definir template predefinido.');
        }
    }

    async function duplicateTemplate(id) {
        if (!sb || !user) return;
        try {
            var { data: original, error: fetchErr } = await sb.from('templates').select('*').eq('id', id).eq('user_id', user.id).single();
            if (fetchErr || !original) throw fetchErr || new Error('Template nao encontrado');

            var { error } = await sb.from('templates').insert({
                user_id: user.id,
                nome: '(Copia) ' + original.nome,
                subject: original.subject,
                preheader: original.preheader,
                html: original.html,
                text_version: original.text_version,
                is_default: false
            });

            if (error) throw error;
            MailFlowToast.success('Template duplicado.');
            refresh();
        } catch (err) {
            console.error('[Templates] Erro ao duplicar:', err);
            MailFlowToast.error('Erro ao duplicar template.');
        }
    }

    async function deleteTemplate(id) {
        if (!sb || !user) return;
        try {
            var { error } = await sb.from('templates').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            MailFlowToast.success('Template eliminado.');
            refresh();
        } catch (err) {
            console.error('[Templates] Erro ao eliminar:', err);
            MailFlowToast.error('Erro ao eliminar template.');
        }
    }

    async function saveTemplate(data, existingId) {
        if (!sb || !user) return false;

        var payload = {
            nome: (data.nome || '').trim(),
            subject: (data.subject || '').trim(),
            preheader: (data.preheader || '').trim(),
            html: data.html || '',
            text_version: (data.text_version || '').trim()
        };

        if (!payload.nome) { MailFlowToast.error('Nome e obrigatorio.'); return false; }
        if (!payload.subject) { MailFlowToast.error('Assunto e obrigatorio.'); return false; }
        if (!payload.html) { MailFlowToast.error('Corpo HTML e obrigatorio.'); return false; }

        try {
            var result;
            if (existingId) {
                result = await sb.from('templates').update(payload).eq('id', existingId).eq('user_id', user.id);
            } else {
                result = await sb.from('templates').insert({ user_id: user.id, ...payload });
            }
            if (result.error) throw result.error;
            MailFlowToast.success(existingId ? 'Template atualizado.' : 'Template criado.');
            return true;
        } catch (err) {
            console.error('[Templates] Erro ao guardar:', err);
            MailFlowToast.error('Erro ao guardar template.');
            return false;
        }
    }

    // ========================================
    // Modal: Create / Edit Template
    // ========================================
    function showTemplateModal(template) {
        var isEdit = !!template;
        var title = isEdit ? 'Editar Template' : 'Novo Template';

        var html = '' +
            '<div class="tl-modal-overlay" id="tl-modal-overlay">' +
                '<div class="tl-modal tl-modal--lg">' +
                    '<div class="tl-modal__header">' +
                        '<h3 class="tl-modal__title">' + title + '</h3>' +
                        '<button class="tl-modal__close" id="tl-modal-close">' +
                            '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="tl-modal__body">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Nome *</label>' +
                            '<input type="text" class="tl-input" id="tl-f-name" placeholder="Ex: Boas-vindas" value="' + esc(template ? template.nome : '') + '">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Assunto *</label>' +
                            '<input type="text" class="tl-input" id="tl-f-subject" placeholder="Ex: Bem-vindo, {{nome}}!" value="' + esc(template ? template.subject : '') + '">' +
                            '<span class="tl-field__hint">Suporta merge tags: {{nome}}, {{email}}, {{empresa}}</span>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Preheader</label>' +
                            '<input type="text" class="tl-input" id="tl-f-preheader" placeholder="Texto de preview no email (max 100 chars)" value="' + esc(template ? template.preheader : '') + '" maxlength="100">' +
                            '<span class="tl-field__hint">Texto exibido apos o assunto nos clientes de email</span>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Corpo HTML *</label>' +
                            '<textarea class="tl-textarea tl-textarea--code" id="tl-f-html" rows="12" placeholder="<h1>Ola {{nome}}</h1>...">' + esc(template ? template.html : '') + '</textarea>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Corpo Texto</label>' +
                            '<textarea class="tl-textarea" id="tl-f-text" rows="4" placeholder="Versao em texto plano (fallback)">' + esc(template ? template.text_version : '') + '</textarea>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-modal__footer">' +
                        '<button class="tl-btn tl-btn--ghost" id="tl-modal-cancel">Cancelar</button>' +
                        '<button class="tl-btn tl-btn--primary" id="tl-modal-save">' +
                            (isEdit ? 'Guardar Alteracoes' : 'Criar Template') +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('tl-modal-overlay');
        var closeBtn = document.getElementById('tl-modal-close');
        var cancelBtn = document.getElementById('tl-modal-cancel');
        var saveBtn = document.getElementById('tl-modal-save');

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        saveBtn.addEventListener('click', async function() {
            var data = {
                nome: document.getElementById('tl-f-name').value,
                subject: document.getElementById('tl-f-subject').value,
                preheader: document.getElementById('tl-f-preheader').value,
                html: document.getElementById('tl-f-html').value,
                text_version: document.getElementById('tl-f-text').value
            };

            this.disabled = true;
            this.textContent = 'A guardar...';

            var ok = await saveTemplate(data, isEdit ? template.id : null);
            if (ok) {
                closeModal();
                refresh();
            } else {
                this.disabled = false;
                this.textContent = isEdit ? 'Guardar Alteracoes' : 'Criar Template';
            }
        });
    }

    // ========================================
    // Modal: Preview
    // ========================================
    function showPreviewModal(template) {
        var html = '' +
            '<div class="tl-modal-overlay" id="tl-preview-overlay">' +
                '<div class="tl-modal tl-modal--xl">' +
                    '<div class="tl-modal__header">' +
                        '<h3 class="tl-modal__title">Pre-visualizar: ' + esc(template.nome) + '</h3>' +
                        '<button class="tl-modal__close" id="tl-preview-close">' +
                            '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="tl-modal__body">' +
                        '<div class="tl-preview-meta">' +
                            '<div class="tl-preview-meta__row">' +
                                '<span class="tl-preview-meta__label">Assunto:</span>' +
                                '<span class="tl-preview-meta__value" id="tl-preview-subject">' + esc(template.subject || 'Sem assunto') + '</span>' +
                            '</div>' +
                            (template.preheader ? '<div class="tl-preview-meta__row"><span class="tl-preview-meta__label">Preheader:</span><span class="tl-preview-meta__value">' + esc(template.preheader) + '</span></div>' : '') +
                        '</div>' +
                        '<div class="tl-preview-tabs">' +
                            '<button class="tl-preview-tab tl-preview-tab--active" data-view="desktop">Desktop</button>' +
                            '<button class="tl-preview-tab" data-view="mobile">Mobile</button>' +
                            '<button class="tl-preview-tab" data-view="text">Texto</button>' +
                        '</div>' +
                        '<div class="tl-preview-container" id="tl-preview-container">' +
                            '<div class="tl-preview-loading">A carregar preview...</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-modal__footer">' +
                        '<button class="tl-btn tl-btn--ghost" id="tl-preview-cancel">Fechar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('tl-preview-overlay');
        var closeBtn = document.getElementById('tl-preview-close');
        var cancelBtn = document.getElementById('tl-preview-cancel');

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        var currentView = 'desktop';

        function renderPreviewView(view, data) {
            var container = document.getElementById('tl-preview-container');
            if (!container) return;
            currentView = view;

            document.querySelectorAll('.tl-preview-tab').forEach(function(tab) {
                tab.classList.toggle('tl-preview-tab--active', tab.getAttribute('data-view') === view);
            });

            if (view === 'desktop') {
                container.innerHTML = '<div class="tl-preview-frame tl-preview-frame--desktop">' +
                    '<div class="tl-preview-subject-bar">' +
                        '<div class="tl-preview-subject-from">De: ' + esc(template.from_name || 'MailFlow Pro') + ' &lt;' + esc(template.from_email || 'noreply@mailflowpro.com') + '&gt;</div>' +
                        '<div class="tl-preview-subject-line"><strong>' + esc(data.subject) + '</strong></div>' +
                        (data.preheader ? '<div class="tl-preview-subject-preheader">' + esc(data.preheader) + '</div>' : '') +
                    '</div>' +
                    '<iframe class="tl-preview-iframe" srcdoc="' + esc(data.html).replace(/"/g, '&quot;') + '" sandbox="allow-same-origin"></iframe>' +
                '</div>';
            } else if (view === 'mobile') {
                container.innerHTML = '<div class="tl-preview-frame tl-preview-frame--mobile">' +
                    '<div class="tl-preview-mobile-notch"></div>' +
                    '<div class="tl-preview-subject-bar">' +
                        '<div class="tl-preview-subject-from">De: ' + esc(template.from_name || 'MailFlow Pro') + '</div>' +
                        '<div class="tl-preview-subject-line"><strong>' + esc(data.subject) + '</strong></div>' +
                        (data.preheader ? '<div class="tl-preview-subject-preheader">' + esc(data.preheader) + '</div>' : '') +
                    '</div>' +
                    '<iframe class="tl-preview-iframe" srcdoc="' + esc(data.html).replace(/"/g, '&quot;') + '" sandbox="allow-same-origin"></iframe>' +
                '</div>';
            } else if (view === 'text') {
                var textContent = data.text || data.html || '';
                textContent = textContent.replace(/<[^>]*>/g, '');
                textContent = textContent.replace(/&nbsp;/g, ' ');
                textContent = textContent.replace(/&amp;/g, '&');
                textContent = textContent.replace(/&lt;/g, '<');
                textContent = textContent.replace(/&gt;/g, '>');
                container.innerHTML = '<div class="tl-preview-text">' +
                    '<pre>' + esc(textContent) + '</pre>' +
                '</div>';
            }
        }

        async function loadPreview() {
            var container = document.getElementById('tl-preview-container');
            if (!container) return;

            var token = await getAccessToken();
            if (!token) {
                container.innerHTML = '<div class="tl-preview-error">Sessao expirada. Faca login novamente.</div>';
                return;
            }

            var apiBase = getAPIBase();
            try {
                var response = await fetch(apiBase + '/api/templates/preview', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        html: template.html || '',
                        text: template.text_version || '',
                        subject: template.subject || '',
                        preheader: template.preheader || ''
                    })
                });

                if (!response.ok) {
                    throw new Error('Erro ao carregar preview');
                }

                var data = await response.json();
                renderPreviewView('desktop', data);

                document.querySelectorAll('.tl-preview-tab').forEach(function(tab) {
                    tab.addEventListener('click', function() {
                        var view = this.getAttribute('data-view');
                        renderPreviewView(view, data);
                    });
                });
            } catch (err) {
                console.error('[Templates] Erro preview:', err);
                container.innerHTML = '<div class="tl-preview-error">Erro ao carregar preview: ' + esc(err.message) + '</div>';
            }
        }

        loadPreview();
    }

    // ========================================
    // Modal: Test Send
    // ========================================
    function showTestSendModal(template) {
        var html = '' +
            '<div class="tl-modal-overlay" id="tl-testsend-overlay">' +
                '<div class="tl-modal">' +
                    '<div class="tl-modal__header">' +
                        '<h3 class="tl-modal__title">Enviar Teste</h3>' +
                        '<button class="tl-modal__close" id="tl-testsend-close">' +
                            '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="tl-modal__body">' +
                        '<p style="color:#6b7280;font-size:0.8125rem;margin-bottom:16px;">Envie um email de teste com o template <strong>' + esc(template.nome) + '</strong> para verificar como aparece.</p>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Email de destino *</label>' +
                            '<input type="email" class="tl-input" id="tl-testsend-email" placeholder="exemplo@email.com">' +
                            '<span class="tl-field__hint">Sera enviado um unico email de teste para este endereco</span>' +
                        '</div>' +
                        '<div id="tl-testsend-status" style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:0.8125rem;"></div>' +
                    '</div>' +
                    '<div class="tl-modal__footer">' +
                        '<button class="tl-btn tl-btn--ghost" id="tl-testsend-cancel">Cancelar</button>' +
                        '<button class="tl-btn tl-btn--primary" id="tl-testsend-send">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' +
                            ' Enviar Teste' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('tl-testsend-overlay');
        var closeBtn = document.getElementById('tl-testsend-close');
        var cancelBtn = document.getElementById('tl-testsend-cancel');
        var sendBtn = document.getElementById('tl-testsend-send');

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        sendBtn.addEventListener('click', async function() {
            var emailInput = document.getElementById('tl-testsend-email');
            var statusEl = document.getElementById('tl-testsend-status');
            var email = (emailInput.value || '').trim();

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                emailInput.style.borderColor = '#ef4444';
                emailInput.focus();
                return;
            }

            emailInput.style.borderColor = '';
            this.disabled = true;
            this.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="tl-spin"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> A enviar...';

            var token = await getAccessToken();
            if (!token) {
                statusEl.style.display = 'block';
                statusEl.style.background = '#fef2f2';
                statusEl.style.color = '#991b1b';
                statusEl.textContent = 'Sessao expirada. Faca login novamente.';
                this.disabled = false;
                this.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Enviar Teste';
                return;
            }

            var apiBase = getAPIBase();
            try {
                var response = await fetch(apiBase + '/api/templates/test-send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        email: email,
                        subject: template.subject || '',
                        preheader: template.preheader || '',
                        html: template.html || '',
                        text: template.text_version || ''
                    })
                });

                var result = await response.json();

                if (response.ok && result.success) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = '#f0fdf4';
                    statusEl.style.color = '#166534';
                    statusEl.textContent = 'Email de teste enviado para ' + email + '. Verifique a caixa de entrada.';
                    MailFlowToast.success('Email de teste enviado!');
                    emailInput.value = '';
                } else {
                    statusEl.style.display = 'block';
                    statusEl.style.background = '#fef2f2';
                    statusEl.style.color = '#991b1b';
                    statusEl.textContent = 'Erro: ' + (result.error || 'Falha ao enviar email de teste.');
                }
            } catch (err) {
                console.error('[Templates] Erro test-send:', err);
                statusEl.style.display = 'block';
                statusEl.style.background = '#fef2f2';
                statusEl.style.color = '#991b1b';
                statusEl.textContent = 'Erro de ligacao. Tente novamente.';
            }

            this.disabled = false;
            this.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Enviar Teste';
        });
    }

    // ========================================
    // Refresh
    // ========================================
    async function refresh() {
        if (!currentContainer) return;
        var result = await fetchTemplates();
        currentContainer.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
    }

    return { render: render };
})();
