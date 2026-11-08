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
