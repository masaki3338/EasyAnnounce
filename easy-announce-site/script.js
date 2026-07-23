const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');

menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.textContent = open ? '×' : '☰';
});

document.querySelectorAll('.nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.textContent = '☰';
  });
});

const ua = navigator.userAgent.toLowerCase();
const isAndroid = ua.includes('android');
const isIOS = /iphone|ipad|ipod/.test(ua);

if (isAndroid) {
  document.querySelectorAll('.android-cta').forEach((el) => el.classList.add('recommended'));
} else if (isIOS) {
  document.querySelectorAll('.ios-cta').forEach((el) => el.classList.add('recommended'));
}
