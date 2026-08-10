# Vía Láctea: Meteor Run

Arcade 3D Space Shooter hecho con **Three.js**: pilotas una nave a través de
la Vía Láctea —planetas, nebulosas y campos de estrellas incluidos—
destruyendo meteoritos que aparecen proceduralmente en tu camino.

No requiere build step ni backend: es HTML/CSS/JS puro con ES Modules,
pensado para desplegarse directamente en GitHub Pages o cualquier hosting
estático.

## Cómo jugar

Abre `index.html` con un servidor estático (los ES Modules no funcionan
vía `file://`):

```bash
npx serve .
# o
python3 -m http.server 8080
```

y visita `http://localhost:8080`.

### Controles

| Acción | Tecla |
|---|---|
| Mover nave (lateral / vertical) | `W A S D` o flechas, + ratón para ajuste fino |
| Disparar | `Espacio` o click (mantener) |
| Boost | `Shift` |
| Cambiar cámara 3ª / 1ª persona | `C` |
| Pausa | `P` o `Esc` |

## Arquitectura

Todo el juego vive en `js/`, organizado en módulos con responsabilidad
única (sin frameworks ni bundler):

- **`GameManager.js`** — orquestador: renderer/escena/cámara, la máquina de
  estados (menú → jugando → pausa → game over), el bucle principal,
  puntuación/combo y el escalado de dificultad.
- **`PlayerController.js`** — la nave: movimiento con inercia, roll/pitch/yaw,
  cámara en 3ª/1ª persona con seguimiento suavizado (lerp), boost, y
  casco/escudo.
- **`Weapons.js`** — cañones duales con cadencia, sobrecalentamiento, y un
  pool de proyectiles (convergen hacia el centro de la mira).
- **`MeteorSpawner.js`** — generación procedural de meteoritos (grandes,
  medianos, pequeños), colisión por segmento barrido (evita que los
  proyectiles rápidos "atraviesen" objetivos pequeños), fragmentación de
  meteoritos grandes en medianos, y pooling.
- **`Galaxy.js`** — el telón de fondo: campo de estrellas profundo, banda
  galáctica, nebulosas, y planetas (con anillos y texturas procedurales)
  que aparecen a lo largo del vuelo.
- **`FX.js`** — partículas: explosiones, chispas de impacto, destello de
  disparo, onda de choque, estela de los motores — todo pooled.
- **`PowerUps.js`** — recolectables: recarga de escudo, enfriamiento de
  armas, multiplicador de puntuación.
- **`UIManager.js`** — HUD y menús (inicio, ajustes, récords, pausa, game
  over), y las puntuaciones más altas guardadas en `localStorage`.
- **`AudioManager.js`** — todo el audio (láser, explosiones, impacto,
  power-up, motor, música ambiental) sintetizado en tiempo real con la
  WebAudio API — el repositorio no incluye archivos de audio binarios.
- **`InputManager.js`** — estado de teclado/ratón/touch centralizado.
- **`ObjectPool.js`** — pool genérico usado por proyectiles, meteoritos y
  partículas para evitar asignaciones en tiempo de juego (sin presión al
  Garbage Collector).

### Rendimiento

- Object pooling en proyectiles, meteoritos y partículas.
- Colisión proyectil↔meteorito por segmento barrido (swept collision), no
  solo por distancia puntual — necesario porque los láseres viajan a más
  de 250 unidades/segundo.
- `three.js` está vendorizado en `js/vendor/` (sin depender de un CDN
  externo en tiempo de ejecución).

## Créditos

Three.js es MIT License — ver `js/vendor/THREE_LICENSE.txt`.
