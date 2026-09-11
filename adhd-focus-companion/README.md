# ADHD Focus Companion

Una skill local para Google AI Edge Gallery con una interfaz pequeña para tres
cosas: hábitos diarios, Pomodoro y estadísticas personales. No usa red ni
`localStorage`; guarda sus registros en IndexedDB del WebView.

## Contenido

- `SKILL.md`: instrucciones para el modelo local.
- `scripts/index.html`: punto de entrada que Gallery ejecuta con `run_js`.
- `scripts/storage.js`: capa IndexedDB compartida.
- `scripts/controller.js`: acciones que puede invocar el modelo.
- `assets/dashboard.html`: interfaz interactiva.

## Uso en AI Edge Gallery

Copia la carpeta `adhd-focus-companion` dentro de `gallery/skills/` de tu fork,
o impórtala como una skill local desde el administrador de Skills. Después pide,
por ejemplo: “abre mi panel de foco”, “crea el hábito de caminar” o “muéstrame
mis estadísticas de esta semana”.

La primera versión funciona mientras el WebView está disponible. Alarmas,
notificaciones y temporizadores persistentes en segundo plano requieren la capa
nativa de Android prevista para una fase posterior.
