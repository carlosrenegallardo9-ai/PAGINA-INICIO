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

/** Resalta (o quita el resalte de) el botón del Hangar en #top-links con un pulso y una etiqueta señalándolo. */
function highlightHangarButton(on) {
    const btn = document.getElementById('hangar-link');
    if (btn) btn.classList.toggle('cc-highlight', on);
}

/**
 * El menú de misión cubre #top-links y está abierto por defecto al cargar la
 * página, así que resaltar el Hangar mientras tanto sería invisible. Se
 * activa el resalte de una vez, y se espera a que el menú se cierre (con un
 * respiro tras cerrarse) antes de apagarlo — con un límite de seguridad por
 * si el menú nunca reporta como cerrado.
 */
function pointToHangarButton() {
    highlightHangarButton(true);
    const menu = document.getElementById('menu-panel');
    let cleared = false;
    function clearSoon() {
        if (cleared) return;
        cleared = true;
        setTimeout(() => highlightHangarButton(false), 3000);
    }
    if (!menu || menu.style.display === 'none') {
        clearSoon();
        return;
    }
    const observer = new MutationObserver(() => {
        if (menu.style.display === 'none') {
            observer.disconnect();
            clearSoon();
        }
    });
    observer.observe(menu, { attributes: true, attributeFilter: ['style'] });
    setTimeout(() => {
        observer.disconnect();
        clearSoon();
    }, 20000);
}

/** Muestra una línea (o varias, en secuencia) en la burbuja del Capitán Cósmico. */
export async function captainSay(lines, opts = {}) {
    if (!ensureEls()) return;
    const token = ++activeToken;
    const arr = Array.isArray(lines) ? lines : [lines];
    const duration = opts.duration ?? 4200;
    const gap = opts.gap ?? 350;

    for (let i = 0; i < arr.length; i++) {
        if (token !== activeToken) return;
        rootEl.classList.remove('cosmic-captain--countdown');
        textEl.textContent = arr[i];
        opts.onLine?.(i, arr[i]);
        reveal();
        await wait(duration);
        if (token !== activeToken) return;
        conceal();
        await wait(gap);
    }
    if (token === activeToken) opts.onDone?.();
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
        highlightHangarButton(false);
    });
    setTimeout(() => {
        captainSay(WELCOME_LINES, {
            duration: 4600,
            gap: 400,
            // La 2ª línea (índice 1) es la que menciona el Hangar: señala el botón justo entonces.
            onLine: (i) => { if (i === 1) pointToHangarButton(); },
        });
    }, 1200);
}
