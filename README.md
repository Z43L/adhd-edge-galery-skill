# ADHD Focus Companion

Una skill local para Google AI Edge Gallery con una interfaz pequeña para
vaciar la mente, elegir una única prioridad de hoy, registrar hábitos y
Pomodoro, revisar estadísticas y guardar un cierre diario. No usa red ni
`localStorage`; guarda sus registros en IndexedDB del WebView.

Incluye una memoria local tipo RAG: busca por palabras y frases en los brain
dumps, prioridades, notas diarias, energía, cierres, sesiones de foco y hábitos
que la persona haya guardado. No usa embeddings, servicios externos ni inventa
recuerdos; cada resultado conserva su fecha y tipo de fuente.

## Contenido

- `SKILL.md`: instrucciones para el modelo local.
- `scripts/index.html`: punto de entrada que Gallery ejecuta con `run_js`.
- `scripts/storage.js`: capa IndexedDB compartida.
- `scripts/controller.js`: acciones que puede invocar el modelo.
- `assets/dashboard.html`: interfaz interactiva para “Ahora”, diario, memoria
  y estadísticas.

## Uso en AI Edge Gallery

Copia este directorio completo como `gallery/skills/adhd-focus-companion` dentro
de tu fork, o impórtalo como una skill local desde el administrador de Skills.
Después pide, por ejemplo: “abre mi panel de foco”, “guarda estas ideas”, “qué
me ayudó la última vez que me bloqueé” o “muéstrame mis estadísticas de esta
semana”.

La primera versión funciona mientras el WebView está disponible. Alarmas,
notificaciones y temporizadores persistentes en segundo plano requieren la capa
nativa de Android prevista para una fase posterior. Las observaciones del modo
diario solo aparecen cuando hay días comparables suficientes; describen
coincidencias y proponen un experimento pequeño, no una causa ni consejo médico.
