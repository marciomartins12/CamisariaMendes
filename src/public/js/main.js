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
});
