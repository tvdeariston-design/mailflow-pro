/**
 * MailFlow Pro — View: Templates (Premium)
 *
 * Gestao de templates de email reutilizaveis.
 * CRUD completo com soft delete, duplicar, default, pesquisa, paginacao,
 * preview (Desktop/Mobile/Text) e envio de teste.
 *
 * UI Premium: Glass cards, backdrop blur, hover glow, indigo accents,
 * skeleton loading, modern toolbar, premium empty state.
 *
 * Dependencias:
 *   - supabase-client.js
 *   - auth.js
 *   - toast.js
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
        loading: false,
        category: 'all',
        sort: 'newest'
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

    function formatShortDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    }

    function truncate(str, len) {
        if (!str) return '';
        if (str.length <= len) return str;
        return str.substring(0, len) + '...';
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

    // ========================================
    // Data
    // ========================================
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
                var safe = state.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
                query = query.or('nome.ilike.%' + safe + '%,subject.ilike.%' + safe + '%');
            }

            if (state.category !== 'all') {
                query = query.or('nome.ilike.%' + state.category + '%,subject.ilike.%' + state.category + '%');
            }

            if (state.sort === 'oldest') {
                query = sb.from('templates').select('*', { count: 'exact' }).eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: true });
                if (state.search) {
                    var safe2 = state.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
                    query = query.or('nome.ilike.%' + safe2 + '%,subject.ilike.%' + safe2 + '%');
                }
                if (state.category !== 'all') {
                    query = query.or('nome.ilike.%' + state.category + '%,subject.ilike.%' + state.category + '%');
                }
            } else if (state.sort === 'name-asc') {
                query = sb.from('templates').select('*', { count: 'exact' }).eq('user_id', user.id).is('deleted_at', null).order('nome', { ascending: true });
                if (state.search) {
                    var safe3 = state.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
                    query = query.or('nome.ilike.%' + safe3 + '%,subject.ilike.%' + safe3 + '%');
                }
                if (state.category !== 'all') {
                    query = query.or('nome.ilike.%' + state.category + '%,subject.ilike.%' + state.category + '%');
                }
            } else if (state.sort === 'name-desc') {
                query = sb.from('templates').select('*', { count: 'exact' }).eq('user_id', user.id).is('deleted_at', null).order('nome', { ascending: false });
                if (state.search) {
                    var safe4 = state.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
                    query = query.or('nome.ilike.%' + safe4 + '%,subject.ilike.%' + safe4 + '%');
                }
                if (state.category !== 'all') {
                    query = query.or('nome.ilike.%' + state.category + '%,subject.ilike.%' + state.category + '%');
                }
            } else if (state.sort === 'most-used') {
                query = sb.from('templates').select('*', { count: 'exact' }).eq('user_id', user.id).is('deleted_at', null).order('usage_count', { ascending: false });
                if (state.search) {
                    var safe5 = state.search.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, ' ');
                    query = query.or('nome.ilike.%' + safe5 + '%,subject.ilike.%' + safe5 + '%');
                }
                if (state.category !== 'all') {
                    query = query.or('nome.ilike.%' + state.category + '%,subject.ilike.%' + state.category + '%');
                }
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
        state.category = 'all';
        state.sort = 'newest';

        var result = await fetchTemplates();
        container.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
    }

    function buildHTML(templates, total) {
        if (state.loading) {
            return renderToolbar(total) + renderSkeleton();
        }
        return renderToolbar(total) +
            (templates.length === 0 && !state.search ? renderEmpty() : renderGrid(templates, total));
    }

    // ========================================
    // Skeleton Loading
    // ========================================
    function renderSkeleton() {
        var cards = '';
        for (var i = 0; i < 6; i++) {
            cards += '' +
                '<div class="tl-card tl-card--skeleton">' +
                    '<div class="tl-skeleton tl-skeleton--title"></div>' +
                    '<div class="tl-skeleton tl-skeleton--text"></div>' +
                    '<div class="tl-skeleton tl-skeleton--text tl-skeleton--short"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line"></div>' +
                '</div>';
        }
        return '<div class="tl-grid">' + cards + '</div>';
    }

    // ========================================
    // Toolbar Premium
    // ========================================
    function renderToolbar(total) {
        return '' +
            '<div class="tl-toolbar">' +
                '<div class="tl-toolbar__left">' +
                    '<h2 class="tl-toolbar__title">Templates</h2>' +
                    '<span class="tl-toolbar__count">(' + total + ')</span>' +
                '</div>' +
                '<div class="tl-toolbar__right">' +
                    '<div class="tl-filters">' +
                        '<select class="tl-select" id="tl-filter-category">' +
                            '<option value="all">Todos</option>' +
                            '<option value="marketing">Marketing</option>' +
                            '<option value="newsletter">Newsletter</option>' +
                            '<option value="promocao">Promocao</option>' +
                            '<option value="boas-vindas">Boas-vindas</option>' +
                            '<option value="automacao">Automação</option>' +
                            '<option value="personalizado">Personalizado</option>' +
                        '</select>' +
                        '<select class="tl-select" id="tl-sort">' +
                            '<option value="newest">Mais recentes</option>' +
                            '<option value="oldest">Mais antigos</option>' +
                            '<option value="name-asc">Nome A-Z</option>' +
                            '<option value="name-desc">Nome Z-A</option>' +
                            '<option value="most-used">Mais utilizados</option>' +
                        '</select>' +
                    '</div>' +
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

    // ========================================
    // Grid Premium
    // ========================================
    function renderGrid(templates, total) {
        var cards = templates.map(function(t) {
            var defaultBadge = t.is_default ? '<span class="tl-badge tl-badge--indigo">Padrao</span>' : '';
            var usageBadge = t.usage_count > 0 ? '<span class="tl-badge tl-badge--gray">' + t.usage_count + ' uso' + (t.usage_count !== 1 ? 's' : '') + '</span>' : '';

            var categoryLabel = getCategoryLabel(t);
            var categoryBadge = categoryLabel ? '<span class="tl-badge tl-badge--blue">' + esc(categoryLabel) + '</span>' : '';

            return '' +
                '<div class="tl-card" data-id="' + t.id + '">' +
                    '<div class="tl-card__glow"></div>' +
                    '<div class="tl-card__header">' +
                        '<div class="tl-card__title">' + esc(t.nome || 'Sem Nome') + '</div>' +
                        '<div class="tl-card__badges">' + defaultBadge + usageBadge + categoryBadge + '</div>' +
                    '</div>' +
                    '<div class="tl-card__subject">' + esc(truncate(t.subject || 'Sem assunto', 80)) + '</div>' +
                    '<div class="tl-card__preview">' + esc(truncate(stripHtml(t.html || ''), 100)) + '</div>' +
                    '<div class="tl-card__footer">' +
                        '<div class="tl-card__meta">' +
                            '<span class="tl-card__date">' + formatDate(t.updated_at || t.created_at) + '</span>' +
                            (t.last_used_at ? '<span class="tl-card__used">Usado: ' + formatShortDate(t.last_used_at) + '</span>' : '') +
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

        var totalPages = Math.ceil(total / state.limit);
        var pagination = '';
        if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? ' disabled' : '';
            var nextDisabled = state.page >= totalPages ? ' disabled' : '';
            pagination = '' +
                '<div class="tl-pagination">' +
                    '<span class="tl-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>' +
                    '<div class="tl-pagination__btns">' +
                        '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="tl-page-prev"' + prevDisabled + '>&larr; Anterior</button>' +
                        '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="tl-page-next"' + nextDisabled + '>Próxima &rarr;</button>' +
                    '</div>' +
                '</div>';
        }

        return '<div class="tl-grid">' + cards + '</div>' + pagination;
    }

    function getCategoryLabel(template) {
        var name = (template.nome || '').toLowerCase();
        var subject = (template.subject || '').toLowerCase();
        var html = (template.html || '').toLowerCase();
        var combined = name + ' ' + subject + ' ' + html;

        if (/boas.vindas|bienvenue|welcome|ola|olá/.test(combined)) return 'boas-vindas';
        if (/promocao|promoção|desconto|coupon|oferta/.test(combined)) return 'promocao';
        if (/newsletter|newsletter|bulletin|atualização|atualizacao/.test(combined)) return 'newsletter';
        if (/automacao|automação|workflow|trigger|gatilho|sequencia|sequência/.test(combined)) return 'automacao';
        if (/marketing|venda|vendas|proposta|campanha|email marketing/.test(combined)) return 'marketing';
        return null;
    }

    function stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function sanitizePreview(html) {
        if (!html) return '';
        // Remove <script> tags and content
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // Remove event handler attributes (onclick, onerror, onload, etc.)
        html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^"'\s>]+)/gi, '');
        // Remove javascript: URLs in href and src attributes
        html = html.replace(/\s+(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '');
        // Remove <iframe>, <object>, <embed> tags
        html = html.replace(/<(iframe|object|embed)\b[^>]*>/gi, '');
        html = html.replace(/<\/(iframe|object|embed)>/gi, '');
        return html;
    }

    // ========================================
    // Empty State Premium
    // ========================================
    function renderEmpty() {
        return '' +
            '<div class="tl-empty">' +
                '<div class="tl-empty__illustration">' +
                    '<svg width="80" height="80" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="tl-empty__icon">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>' +
                    '</svg>' +
                    '<div class="tl-empty__orb tl-empty__orb--1"></div>' +
                    '<div class="tl-empty__orb tl-empty__orb--2"></div>' +
                '</div>' +
                '<h3 class="tl-empty__title">Ainda não tem templates</h3>' +
                '<p class="tl-empty__desc">Crie o seu primeiro template e comece a enviar campanhas profissionais em segundos.</p>' +
                '<button class="tl-btn tl-btn--primary tl-empty__cta" id="tl-btn-add-empty">' +
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

        var filterCategory = document.getElementById('tl-filter-category');
        if (filterCategory) {
            filterCategory.addEventListener('change', function() {
                state.category = this.value;
                state.page = 1;
                refresh();
            });
        }

        var sortSelect = document.getElementById('tl-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                state.sort = this.value;
                state.page = 1;
                refresh();
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
    // CRUD — PRESERVED EXACTLY
    // ========================================
    async function setDefault(id) {
        if (!sb || !user) return;
        try {
            var { error: resetErr } = await sb.from('templates').update({ is_default: false }).eq('is_default', true).eq('user_id', user.id);
            if (resetErr) throw resetErr;
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
                result = await sb.from('templates').insert({ user_id: user.id, is_default: false, ...payload });
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
    // Modal Premium — Create / Edit
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
                        '<div class="tl-editor-layout">' +
                            '<div class="tl-editor-main">' +
                                '<div class="tl-field">' +
                                    '<label class="tl-label">Corpo HTML *</label>' +
                                    '<textarea class="tl-textarea tl-textarea--code" id="tl-f-html" rows="14" placeholder="<h1>Ola {{nome}}</h1>...">' + esc(template ? template.html : '') + '</textarea>' +
                                '</div>' +
                            '</div>' +
                            '<div class="tl-editor-sidebar">' +
                                '<div class="tl-field">' +
                                    '<label class="tl-label">Visualizacao</label>' +
                                    '<div class="tl-preview-mini" id="tl-editor-preview">' +
                                        '<iframe class="tl-preview-mini__iframe" id="tl-editor-preview-frame" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;min-height:80px;"></iframe>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="tl-field">' +
                                    '<label class="tl-label">Merge Tags</label>' +
                                    '<div class="tl-tags-panel" id="tl-merge-tags">' +
                                        '<button class="tl-tag-btn" data-tag="{{nome}}" title="Inserir tag de nome">Nome</button>' +
                                        '<button class="tl-tag-btn" data-tag="{{email}}" title="Inserir tag de email">Email</button>' +
                                        '<button class="tl-tag-btn" data-tag="{{empresa}}" title="Inserir tag de empresa">Empresa</button>' +
                                        '<button class="tl-tag-btn" data-tag="{{telefone}}" title="Inserir tag de telefone">Telefone</button>' +
                                        '<button class="tl-tag-btn" data-tag="{{data}}" title="Inserir tag de data">Data</button>' +
                                        '<button class="tl-tag-btn" data-tag="{{unsubscribe}}" title="Inserir link de cancelamento">Unsubscribe</button>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="tl-field">' +
                                    '<label class="tl-label">Corpo Texto</label>' +
                                    '<textarea class="tl-textarea" id="tl-f-text" rows="3" placeholder="Versao em texto plano (fallback)">' + esc(template ? template.text_version : '') + '</textarea>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-modal__footer">' +
                        '<button class="tl-btn tl-btn--ghost" id="tl-modal-cancel">Cancelar</button>' +
                        '<button class="tl-btn tl-btn--primary" id="tl-modal-save">' +
                            (isEdit ? 'Guardar Alterações' : 'Criar Template') +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('tl-modal-overlay');
        var closeBtn = document.getElementById('tl-modal-close');
        var cancelBtn = document.getElementById('tl-modal-cancel');
        var saveBtn = document.getElementById('tl-modal-save');
        var htmlEditor = document.getElementById('tl-f-html');
        var previewFrame = document.getElementById('tl-editor-preview-frame');

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        // Live preview
        if (htmlEditor && previewFrame) {
            function updatePreview() {
                var html = htmlEditor.value;
                var safeHtml = sanitizePreview(html) || '<p style="color:#94a3b8;text-align:center;padding:20px;">Pré-visualização em tempo real</p>';
                previewFrame.srcdoc = safeHtml;
            }
            htmlEditor.addEventListener('input', updatePreview);
            // Initial preview
            updatePreview();
        }

        // Merge tag insertion
        document.querySelectorAll('.tl-tag-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tag = this.getAttribute('data-tag');
                if (htmlEditor) {
                    var start = htmlEditor.selectionStart;
                    var end = htmlEditor.selectionEnd;
                    var before = htmlEditor.value.substring(0, start);
                    var after = htmlEditor.value.substring(end);
                    htmlEditor.value = before + tag + after;
                    htmlEditor.selectionStart = htmlEditor.selectionEnd = start + tag.length;
                    htmlEditor.focus();
                    htmlEditor.dispatchEvent(new Event('input'));
                }
            });
        });

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
                this.textContent = isEdit ? 'Guardar Alterações' : 'Criar Template';
            }
        });
    }

    // ========================================
    // Preview Modal — PRESERVED LOGIC
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
                            '<button class="tl-preview-tab" data-view="tablet">Tablet</button>' +
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

            var frameClass = 'tl-preview-frame--' + view;
            if (view === 'text') {
                var textContent = data.text || data.html || '';
                textContent = textContent.replace(/<[^>]*>/g, ' ');
                textContent = textContent.replace(/&nbsp;/g, ' ');
                textContent = textContent.replace(/&amp;/g, '&');
                textContent = textContent.replace(/&lt;/g, '<');
                textContent = textContent.replace(/&gt;/g, '>');
                container.innerHTML = '<div class="tl-preview-text"><pre>' + esc(textContent) + '</pre></div>';
            } else {
                container.innerHTML = '<div class="tl-preview-frame ' + frameClass + '">' +
                    '<div class="tl-preview-subject-bar">' +
                        '<div class="tl-preview-subject-from">De: MailFlow Pro &lt;noreply@mailflowpro.com&gt;</div>' +
                        '<div class="tl-preview-subject-line"><strong>' + esc(data.subject) + '</strong></div>' +
                        (data.preheader ? '<div class="tl-preview-subject-preheader">' + esc(data.preheader) + '</div>' : '') +
                    '</div>' +
                    '<iframe class="tl-preview-iframe" srcdoc="' + esc(data.html).replace(/"/g, '&quot;') + '" sandbox="allow-same-origin"></iframe>' +
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
    // Test Send Modal — PRESERVED LOGIC
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
                        '<p style="color:#64748b;font-size:0.8125rem;margin-bottom:16px;line-height:1.6;">Envie um email de teste com o template <strong>' + esc(template.nome) + '</strong> para verificar como aparece no destinatario.</p>' +
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
            this.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="tl-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> A enviar...';

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
