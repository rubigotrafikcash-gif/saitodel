'use strict';
(() => {
  const form = document.querySelector('#contact-form');
  const button = document.querySelector('#demo-button');
  const name = document.querySelector('#name');
  const email = document.querySelector('#email');
  const status = document.querySelector('#form-status');
  function errorFor(field, message) {
    document.querySelector(`#${field.id}-error`).textContent = message;
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  function checkDemo(event) {
    event.preventDefault();
    status.textContent = '';
    name.value = name.value.trim();
    email.value = email.value.trim();
    const nameError = name.value ? '' : 'Введите имя — можно вымышленное.';
    const emailError = !email.value ? 'Введите email — например, test@example.com.' : email.validity.valid ? '' : 'Проверьте email: нужен адрес вида test@example.com.';
    errorFor(name, nameError);
    errorFor(email, emailError);
    if (nameError || emailError) {
      (nameError ? name : email).focus();
      return;
    }
    status.textContent = 'Демонстрация завершена: поля заполнены корректно. Заявка не отправлена, данные не сохранены. Можно изменить поля и попробовать ещё раз.';
    status.focus();
  }
  // The button becomes a submit only after the local handler is registered.
  form.addEventListener('submit', checkDemo);
  for (const field of [name, email]) {
    field.addEventListener('input', () => {
      errorFor(field, '');
      status.textContent = '';
    });
  }
  button.type = 'submit';
  button.disabled = false;
})();

// Progressive motion: HTML/CSS remain visible before, during and without JS.
// No persistent hidden state, scroll interception, timers or animation library.
(() => {
  if (!Element.prototype.animate || !window.matchMedia) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const seen = new WeakSet();
  const targets = [...document.querySelectorAll(
    '.idea-layout > *, .section-heading, .service-list article, .steps li, .faq-layout > div, .contact-copy, #contact-form'
  )];
  let observer;

  function settle(element) {
    const animation = active.get(element);
    if (animation) animation.cancel();
    active.delete(element);
  }

  function enter(element, { distance = 14, duration = 520, delay = 0 } = {}) {
    if (!element || preference.matches || document.hidden) return;
    // Text and actions keep full contrast, even on the very first frame.
    const animation = element.animate(
      [{ transform: `translateY(${distance}px)` }, { transform: 'none' }],
      { duration, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }
    );
    active.set(element, animation);
    animation.onfinish = animation.oncancel = () => {
      if (active.get(element) === animation) active.delete(element);
    };
  }

  // The reading order settles in 660ms; the CTA is available immediately.
  if (!location.hash && scrollY < 40) {
    enter(document.querySelector('.hero-intro'), { distance: 6, duration: 380 });
    enter(document.querySelector('.hero h1'), { distance: 16, duration: 620, delay: 40 });
    enter(document.querySelector('.hero-bottom'), { distance: 10, duration: 480, delay: 120 });
    enter(document.querySelector('.business-strip'), { distance: 6, duration: 400, delay: 200 });
  }

  function observeSections() {
    if (preference.matches || !window.IntersectionObserver) return;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        observer.unobserve(element);
        if (seen.has(element)) return;
        seen.add(element);
        const section = element.closest('section');
        // Direct anchor navigation and keyboard focus get a stable destination.
        if ((location.hash && section?.id === location.hash.slice(1)) ||
            element.contains(document.activeElement)) return;
        const siblings = [...element.parentElement.children];
        const stagger = element.matches('.steps li, .service-list article, .route')
          ? Math.min(siblings.indexOf(element) * 45, 90) : 0;
        enter(element, { delay: stagger });
      });
    }, { threshold: 0, rootMargin: '0px 0px 24px 0px' });
    targets.forEach(element => { if (!seen.has(element)) observer.observe(element); });
  }

  function stopMotion() {
    observer?.disconnect();
    [...active.keys()].forEach(settle);
  }
  // Interrupt motion as soon as a visitor interacts with its contents.
  function settleInteraction(event) {
    for (const element of active.keys()) {
      if (element.contains(event.target)) settle(element);
    }
  }
  document.addEventListener('focusin', settleInteraction);
  document.addEventListener('pointerdown', settleInteraction, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMotion();
    else observeSections();
  });
  window.addEventListener('pagehide', stopMotion);
  window.addEventListener('pageshow', event => { if (event.persisted) observeSections(); });
  preference.addEventListener('change', () => {
    stopMotion();
    observeSections();
  });
  observeSections();
})();
