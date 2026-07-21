/**
 * MailFlow Pro — JavaScript Principal
 * 
 * Funcionalidades compartilhadas entre todas as páginas.
 */

(function() {
    'use strict';

    /* ========================================
       Navbar Scroll Effect
       ======================================== */
    function initNavbar() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;

        function handleScroll() {
            if (window.scrollY > 10) {
                navbar.classList.add('navbar--scrolled');
            } else {
                navbar.classList.remove('navbar--scrolled');
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    }

    /* ========================================
       Mobile Menu Toggle
       ======================================== */
    function initMobileMenu() {
        const toggle = document.querySelector('.navbar__toggle');
        const nav = document.querySelector('.navbar__nav');
        if (!toggle || !nav) return;

        toggle.addEventListener('click', function() {
            const isOpen = nav.classList.toggle('navbar__nav--open');
            toggle.setAttribute('aria-expanded', isOpen);
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!toggle.contains(e.target) && !nav.contains(e.target)) {
                nav.classList.remove('navbar__nav--open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* ========================================
       FAQ Accordion
       ======================================== */
    function initFAQ() {
        const faqItems = document.querySelectorAll('.faq__item');
        if (!faqItems.length) return;

        faqItems.forEach(function(item) {
            const question = item.querySelector('.faq__question');
            if (!question) return;

            question.addEventListener('click', function() {
                const isOpen = item.classList.contains('faq__item--open');
                
                // Close all other items
                faqItems.forEach(function(otherItem) {
                    if (otherItem !== item) {
                        otherItem.classList.remove('faq__item--open');
                        otherItem.querySelector('.faq__question')?.setAttribute('aria-expanded', 'false');
                    }
                });

                // Toggle current item
                item.classList.toggle('faq__item--open');
                question.setAttribute('aria-expanded', !isOpen);
            });
        });
    }

    /* ========================================
       Smooth Scroll to Section
       ======================================== */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;

                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    /* ========================================
       Button Loading State
       ======================================== */
    window.setButtonLoading = function(button, loading) {
        if (!button) return;
        
        if (loading) {
            button.classList.add('btn--loading');
            button.disabled = true;
        } else {
            button.classList.remove('btn--loading');
            button.disabled = false;
        }
    };

    /* ========================================
       Initialize
       ======================================== */
    document.addEventListener('DOMContentLoaded', function() {
        initNavbar();
        initMobileMenu();
        initFAQ();
        initSmoothScroll();
    });

})();
