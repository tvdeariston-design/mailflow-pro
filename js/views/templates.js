/**
 * MailFlow Pro — View: Templates
 *
 * Gestao de templates de email reutilizaveis.
 * CRUD completo com soft delete, duplicar, default, pesquisa e paginacao.
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
