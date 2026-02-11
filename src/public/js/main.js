document.addEventListener('DOMContentLoaded', () => {
    console.log('Camisaria Mendes front-end carregado');

    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-item');

    // Toggle Mobile Menu
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuBtn.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // Close menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navMenu.classList.contains('active')) {
                mobileMenuBtn.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active') && 
            !navMenu.contains(e.target) && 
            !mobileMenuBtn.contains(e.target)) {
            mobileMenuBtn.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });

    // Timeline Scroll Animation (Mobile Focus Effect)
    const timelineSteps = document.querySelectorAll('.timeline-step');
    
    if (timelineSteps.length > 0) {
        const observerOptions = {
            root: null,
            rootMargin: '-40% 0px -40% 0px', // Active when element is in the vertical center (middle 20%)
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                } else {
                    entry.target.classList.remove('active');
                }
            });
        }, observerOptions);

        timelineSteps.forEach(step => {
            observer.observe(step);
        });
    }

    // Generic Scroll Reveal Animation
    const revealElements = document.querySelectorAll('.reveal-left, .reveal-right');
    
    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-visible');
                } else {
                    // Remove class when out of view to re-animate
                    entry.target.classList.remove('reveal-visible');
                }
            });
        }, {
            threshold: 0.15, // Trigger when 15% visible
            rootMargin: '0px 0px -50px 0px'
        });

        revealElements.forEach(el => {
            revealObserver.observe(el);
        });
    }

    // Admin Sidebar Toggle
    const adminSidebar = document.querySelector('.admin-sidebar');
    const adminToggleBtn = document.getElementById('adminSidebarToggle');

    if (adminToggleBtn && adminSidebar) {
        adminToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            adminSidebar.classList.toggle('active');
            
            // Toggle icon
            const icon = adminToggleBtn.querySelector('i');
            if (icon) {
                if (adminSidebar.classList.contains('active')) {
                    icon.classList.remove('fa-chevron-right');
                    icon.classList.add('fa-chevron-left');
                } else {
                    icon.classList.remove('fa-chevron-left');
                    icon.classList.add('fa-chevron-right');
                }
            }
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                adminSidebar.classList.contains('active') && 
                !adminSidebar.contains(e.target) && 
                !adminToggleBtn.contains(e.target)) {
                
                adminSidebar.classList.remove('active');
                const icon = adminToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevron-left');
                    icon.classList.add('fa-chevron-right');
                }
            }
        });
    }
});
