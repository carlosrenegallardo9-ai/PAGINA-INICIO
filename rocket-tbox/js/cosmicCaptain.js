// Capitán Cósmico — personaje guía de Rocket TBox.
// Avatar con emoji de marcador de posición: se reemplazará por la imagen del personaje.

const WELCOME_LINES = [
    '¡Bienvenido a bordo de Rocket TBox, tripulante! Soy el Capitán Cósmico.',
    'Diseña tu cohete en el Hangar o entra directo a la plataforma de lanzamiento. ¡El cielo salvadoreño te espera! 🇸🇻',
];

let rootEl = null;
let textEl = null;
let closeBtn = null;

// Only one "speak" sequence may drive the bubble at a time. Each call gets a
// token; if a newer call starts, older ones abort at their next await.
let activeToken = 0;

function ensureEls() {
    if (rootEl) return true;
    rootEl = document.getElementById('cosmic-captain');
    textEl = document.getElementById('cosmic-captain-text');
    closeBtn = document.getElementById('cosmic-captain-close');
    return !!(rootEl && textEl);
}

function reveal() {
    rootEl.hidden = false;
    requestAnimationFrame(() => rootEl.classList.add('show'));
}

function conceal() {
    rootEl.classList.remove('show');
    setTimeout(() => {
        if (rootEl && !rootEl.classList.contains('show')) rootEl.hidden = true;
    }, 260);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Muestra una línea (o varias, en secuencia) en la burbuja del Capitán Cósmico. */
export async function captainSay(lines, opts = {}) {
    if (!ensureEls()) return;
    const token = ++activeToken;
    const arr = Array.isArray(lines) ? lines : [lines];
    const duration = opts.duration ?? 4200;
    const gap = opts.gap ?? 350;

    for (const line of arr) {
        if (token !== activeToken) return;
        rootEl.classList.remove('cosmic-captain--countdown');
        textEl.textContent = line;
        reveal();
        await wait(duration);
        if (token !== activeToken) return;
        conceal();
        await wait(gap);
    }
}

/** Cuenta regresiva de despegue narrada por el Capitán Cósmico (3 → 2 → 1 → ¡Despegue!). */
export async function captainLaunchCountdown() {
    if (!ensureEls()) return;
    const token = ++activeToken;
    rootEl.classList.add('cosmic-captain--countdown');
    const steps = ['3…', '2…', '1…', '¡DESPEGUE! 🚀🇸🇻'];
    reveal();
    for (const step of steps) {
        if (token !== activeToken) return;
        textEl.textContent = step;
        await wait(800);
    }
    if (token !== activeToken) return;
    conceal();
    rootEl.classList.remove('cosmic-captain--countdown');
}

export function initCosmicCaptain() {
    if (!ensureEls()) return;
    closeBtn?.addEventListener('click', () => {
        activeToken++; // stop any in-progress sequence
        conceal();
    });
    setTimeout(() => {
        captainSay(WELCOME_LINES, { duration: 4600, gap: 400 });
    }, 1200);
}
