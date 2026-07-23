/**
 * MailFlow Pro — View: Templates
 *
 * Objetivo:
 *   Página principal de gestão de templates (mail templates reutilizáveis).
 *   Permite criar novos templates, editá-los, replicar, e visualizar pré-visualizações.
 *   Centraliza todos os templates que podem ser usados em campanhas.
 *
 * Benefício para o cliente:
 *   Cria templates de email consistentes rapidamente.
 *   Reutiliza conteúdos entre campanhas para poupar tempo e manter a marca.
 *
 * Inputs:
 *   - Lista de templates do Supabase
 *
 * Outputs:
 *   - UI de gestão de templates com grid de visualização
 *   - Empty state profissional para primeiros utilizadores
 *
 * Erros possíveis:
 *   - Fallback para lista vazia se query falhar
 *
 * Dependências:
 *   - supabase-client.js
 *   - auth.js
 *   - toast.js
 */

var TemplatesView = (function() {
    'use strict';

    // ========================================
    // Init
    // ========================================
    var sb = null;
    var user = null;

    function init() {
        sb = window.supabaseClient;
    }

    // ========================================
    // Helpers
    // ========================================

    async function fetchTemplates() {
        if (!sb || !user) return [];

        try {
            var result = await sb.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
            return result.data || [];
        } catch (err) {
            console.error('[Templates] Erro ao buscar:', err);
            return [];
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ========================================
    // Render
    // ========================================

    async function render(container) {
        init();
        user = await MailFlowAuth.getUser();
        if (!user) return;

        var templates = await fetchTemplates();

        var html = renderHeader() + renderGrid(templates);

        container.innerHTML = html;
        bindEvents(container);
    }

    function renderHeader() {
        return '' +
            '<div class="view-header">' +
                '<div class="view-header__left">' +
                    '<h1 class="view-header__title">Templates</h1>' +
                    '<p class="view-header__subtitle">Crie templates reutilizáveis para as suas campanhas</p>' +
                '</div>' +
                '<button class="view-header__btn" id="btn-new-template">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Novo Template' +
                '</button>' +
            '</div>';
    }

    function renderGrid(templates) {
        if (templates.length === 0) {
            return renderEmpty();
        }

        var cards = templates.map(function(t) {
            return '' +
                '<div class="template-card" data-id="' + t.id + '">' +
                    '<div class="template-card__preview">' +
                        '<div class="template-card__subject">' + (t.subject || 'Assunto do Template') + '</div>' +
                        '<div class="template-card__body">' + (t.content_preview || '<p>Pré-visualização do template...</p>') + '</div>' +
                    '</div>' +
                    '<div class="template-card__info">' +
                        '<div class="template-card__title">' + (t.name || 'Sem Nome') + '</div>' +
                        '<div class="template-card__meta">' +
                            '<span>' + formatDate(t.created_at) + '</span>' +
                            '<span>Criado por: ' + (t.created_by || 'Utilizador') + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="template-card__actions">' +
                        '<button class="template-card__btn template-card__btn--edit" data-id="' + t.id + '" title="Editar">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                        '</button>' +
                        '<button class="template-card__btn template-card__btn--duplicate" data-id="' + t.id + '" title="Duplicar">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h11a2 2 0 012 2v2m-6 12h8m-9-6l9-9m-1 10l-9-9"/></svg>' +
                        '</button>' +
                        '<button class="template-card__btn template-card__btn--delete" data-id="' + t.id + '" title="Eliminar">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>';
        }).join('');

        return '' +
            '<div class="template-grid">' + cards + '</div>';
    }

    function renderEmpty() {
        return '' +
            '<div class="empty-state">' +
                '<div class="empty-state__icon empty-state__icon--indigo">' +
                    '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>' +
                '</div>' +
                '<h3 class="empty-state__title">Ainda não tem templates</h3>' +
                '<p class="empty-state__desc">Crie o seu primeiro template para reutilizar em campanhas.</p>' +
                '<button class="empty-state__btn" id="btn-create-first">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Criar Primeiro Template' +
                '</button>' +
            '</div>';
    }

    // ========================================
    // Events
    // ========================================

    function bindEvents(container) {
        // New template button
        var newBtn = container.querySelector('#btn-new-template');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                showCreateTemplateModal();
            });
        }

        // Create first template button (empty state)
        var createFirstBtn = container.querySelector('#btn-create-first');
        if (createFirstBtn) {
            createFirstBtn.addEventListener('click', function() {
                showCreateTemplateModal();
            });
        }

        // Edit buttons
        var editBtns = container.querySelectorAll('.template-card__btn--edit');
        editBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                showEditTemplateModal(id);
            });
        });

        // Duplicate buttons
        var dupBtns = container.querySelectorAll('.template-card__btn--duplicate');
        dupBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                duplicateTemplate(id);
            });
        });

        // Delete buttons
        var delBtns = container.querySelectorAll('.template-card__btn--delete');
        delBtns.forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = this.getAttribute('data-id');
                if (confirm('Eliminar este template? Esta ação não pode ser desfeita.')) {
                    await deleteTemplate(id);
                    render(container);
                }
            });
        });
    }

    function showCreateTemplateModal() {
        MailFlowToast.info('Modal de criação de template a ser implementado');
    }

    function showEditTemplateModal(id) {
        MailFlowToast.info('Modal de edição de template (ID: ' + id + ') a ser implementado');
    }

    async function duplicateTemplate(id) {
        MailFlowToast.info('Duplicar template (ID: ' + id + ') a ser implementado');
    }

    async function deleteTemplate(id) {
        if (!sb) return;
        try {
            var { error } = await sb.from('templates').delete().eq('id', id);
            if (error) throw error;
            MailFlowToast.success('Template eliminado.');
        } catch (err) {
            console.error('[Templates] Erro ao eliminar:', err);
            MailFlowToast.error('Erro ao eliminar template.');
        }
    }

    // ========================================
    // Export
    // ========================================
    return { render: render };

})();
