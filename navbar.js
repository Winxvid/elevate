document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('navbar-container');
  
  if (!container) return;

  const checkForButton = () => {
    const btn = document.getElementById('mobile-menu-btn');
    if (btn) {
      initMobileMenu();
      return true;
    }
    return false;
  };

  // Check immediately in case it's already there
  if (checkForButton()) return;

  // Observe for changes
  const observer = new MutationObserver((mutations) => {
    if (checkForButton()) {
      observer.disconnect();
    }
  });

  observer.observe(container, { childList: true, subtree: true });
});

function initMobileMenu() {
  // Use requestAnimationFrame to ensure DOM is painted/stable
  requestAnimationFrame(() => {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    
    // Safety check: prevent re-initializing if we've already done it
    if (!btn || !menu || btn.hasAttribute('data-init')) return;

    // Mark as initialized
    btn.setAttribute('data-init', 'true');

    // Remove existing listeners to prevent duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Re-mark the new button after cloning
    newBtn.setAttribute('data-init', 'true');

    // Use divs now instead of spans
    const spans = newBtn.querySelectorAll('div > div'); 
    const links = menu.querySelectorAll('.mobile-link, .contact-info');
    // Use closest to ensure we get the parent nav regardless of ID
    const mainNav = newBtn.closest('nav') || document.getElementById('main-nav');
    const menuBg = document.getElementById('menu-bg');
    let isOpen = false;


  // Add group class to container for hover effects
  const linkContainer = menu.querySelector('.flex-col.gap-6');
  if(linkContainer) linkContainer.classList.add('group');

  // Preload images and setup hover effects
  links.forEach(link => {
      // Rolling Text Effect for main links
      if (link.classList.contains('mobile-link') && !link.hasAttribute('data-text-rolled')) {
          link.setAttribute('data-text-rolled', 'true');
          const text = link.textContent.trim();
          link.innerHTML = '';
          
          const letters = [...text];
          letters.forEach((char, index) => {
              const wrapper = document.createElement('span');
              wrapper.className = 'roll-letter';
              
              const inner = document.createElement('span');
              inner.className = 'roll-inner';
              inner.style.transitionDelay = `${index * 70}ms`; // Slower stagger for wave effect
              
              // White Original
              const topVal = document.createElement('span');
              topVal.textContent = char === ' ' ? '\u00A0' : char;
              topVal.className = 'block';
              
              // Purple Hover
              const bottomVal = document.createElement('span');
              bottomVal.textContent = char === ' ' ? '\u00A0' : char;
              bottomVal.className = 'block text-purple-500';
              
              inner.appendChild(topVal);
              inner.appendChild(bottomVal);
              wrapper.appendChild(inner);
              link.appendChild(wrapper);
          });
      }

      if(link.dataset && link.dataset.bg) {
          // Preload
          const img = new Image();
          img.src = link.dataset.bg;

          // Mouse interactions
          link.addEventListener('mouseenter', () => {
              if (menuBg) {
                  menuBg.style.backgroundImage = `url('${link.dataset.bg}')`;
                  menuBg.classList.remove('opacity-0');
                  menuBg.classList.add('opacity-50');
              }
          });
          
          link.addEventListener('mouseleave', () => {
              if (menuBg) {
                  menuBg.classList.remove('opacity-50');
                  menuBg.classList.add('opacity-0');
              }
          });
      }

      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        // Only close menu for local actions (anchors, tel, mailto)
        // For page navigation, we let the browser handle the transition naturally
        // to avoid the "glitch" of revealing the old page before the new one loads.
        if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) {
           if(isOpen) newBtn.click();
        }
      });
  });

  newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) {
      menu.classList.remove('translate-x-full');
      document.body.style.overflow = 'hidden'; // Lock body scroll
      
      // Bring nav to front
      if (mainNav) {
        mainNav.classList.remove('z-[900]');
        mainNav.classList.add('z-[10000]');
      }
      
      // Animate hamburger to X
      spans[0].style.transform = 'rotate(-45deg) translate(-5px, 6px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(45deg) translate(-5px, -6px)';
      
      // Stagger links
      setTimeout(() => {
        links.forEach(link => {
          link.classList.remove('opacity-0', 'translate-y-8');
        });
      }, 300);
    } else {
      menu.classList.add('translate-x-full');
      document.body.style.overflow = ''; // Unlock body scroll
      
      // Reset nav layering
      if (mainNav) {
        setTimeout(() => {
          mainNav.classList.remove('z-[10000]');
          mainNav.classList.add('z-[900]');
        }, 500); // Wait for transition
      }

      // Reset hamburger
      spans[0].style.transform = 'none';
      spans[1].style.opacity = '1';
      spans[2].style.transform = 'none';
      
      // Reset links
      links.forEach(link => {
        link.classList.add('opacity-0', 'translate-y-8');
      });
    }
  });

  // Close when clicking outside content (on the overlay)
  menu.addEventListener('click', (e) => {
    if (isOpen && (e.target === menu || e.target.id === 'menu-overlay' || e.target.id === 'mobile-menu')) {
      newBtn.click();
    }
  });

  // Handle Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      newBtn.click();
    }
  });

  }); // End requestAnimationFrame
}


