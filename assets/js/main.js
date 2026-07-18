/**
 * MOODBEAT STUDIO - Main JavaScript
 * Version: 4.0
 */

(function() {
    'use strict';

    // ---------- NAVBAR ----------
    const navbar = document.getElementById('navbar');
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');

    // Scroll effect
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = currentScroll;
    });

    // Mobile menu
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // Close menu on link click (mobile)
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });

    // ---------- BACK TO TOP ----------
    const backToTop = document.getElementById('backToTop');

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ---------- SMOOTH SCROLL ----------
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const offsetTop = target.offsetTop - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ---------- ACTIVE NAV LINK ----------
    const sections = document.querySelectorAll('section[id]');
    const navLinksAll = document.querySelectorAll('.nav-links a');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 120;
            if (window.pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinksAll.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });

    // ---------- PLATFORM CARDS ----------
    const platformCards = document.querySelectorAll('.platform-card');
    platformCards.forEach(card => {
        card.addEventListener('click', function() {
            platformCards.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // ---------- SCROLL ANIMATIONS ----------
    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.feature-card, .platform-card, .pricing-card, .testimonial-card, .step');
        
        elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            if (rect.top < windowHeight - 100) {
                el.classList.add('animate');
            }
        });
    };

    window.addEventListener('scroll', animateOnScroll);
    window.addEventListener('load', animateOnScroll);

    // ---------- CONSOLE BANNER ----------
    console.log('%c🎵 MoodBeat Studio v4.0', 'font-size: 24px; font-weight: 700; color: #8b5cf6;');
    console.log('%c🚀 Professional Video Editor with AI', 'font-size: 14px; color: #94a3b8;');
    console.log('%c📦 Powered by FFmpeg.wasm', 'font-size: 12px; color: #64748b;');

})();