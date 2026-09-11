(function focusDashboard() {
  'use strict';

  const Store = window.FocusStore;
  if (!Store) return;

  const elements = {
    applyCustomDuration: document.querySelector('#apply-custom-duration'),
    appMessage: document.querySelector('#app-message'),
    cancelHabitForm: document.querySelector('#cancel-habit-form'),
    customBreak: document.querySelector('#custom-break'),
    customFocus: document.querySelector('#custom-focus'),
    dateLabel: document.querySelector('#date-label'),
    focusChart: document.querySelector('#focus-chart'),
    habitForm: document.querySelector('#habit-form'),
    habitName: document.querySelector('#habit-name'),
    habitWeekStats: document.querySelector('#habit-week-stats'),
    habitsCount: document.querySelector('#habits-count'),
    habitsList: document.querySelector('#habits-list'),
    openHabitForm: document.querySelector('#open-habit-form'),
    presetControls: document.querySelector('#preset-controls'),
    progressNote: document.querySelector('#progress-note'),
    progressSummary: document.querySelector('#progress-summary'),
    showMoreHabits: document.querySelector('#show-more-habits'),
    startFocus: document.querySelector('#start-focus'),
    taskInput: document.querySelector('#task-input'),
    timerActions: document.querySelector('#timer-actions'),
    timerCaption: document.querySelector('#timer-caption'),
    timerDisplay: document.querySelector('#timer-display'),
    timerHelp: document.querySelector('#timer-help'),
    timerKicker: document.querySelector('#timer-kicker'),
    timerRing: document.querySelector('#timer-ring'),
    timerStatus: document.querySelector('#timer-status'),
    toggleMoreOptions: document.querySelector('#toggle-more-options'),
    toggleWeek: document.querySelector('#toggle-week'),
    weekFocusCopy: document.querySelector('#week-focus-copy'),
    weekPanel: document.querySelector('#week-panel'),
    weekSessionCopy: document.querySelector('#week-session-copy'),
  };

  const state = {
    dashboard: null,
    initialized: false,
    messageTimeout: null,
    selectedPreset: { focusMinutes: 15, breakMinutes: 5 },
    showAllHabits: false,
    timerInterval: null,
    completion: null,
    undo: null,
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMinutes(value) {
    const minutes = Number(value || 0);
    return `${minutes} min`;
  }

  function formatTimer(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function formatDateLabel(key) {
    const date = new Date(`${key}T12:00:00`);
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  function formatWeekday(key) {
    const date = new Date(`${key}T12:00:00`);
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
      .format(date)
      .replace('.', '')
      .slice(0, 2);
  }

  function setMessage(message, options) {
    const config = options || {};
    window.clearTimeout(state.messageTimeout);
    elements.appMessage.classList.toggle('is-error', Boolean(config.error));
    if (config.undo) {
      state.undo = config.undo;
      elements.appMessage.innerHTML = `${escapeHtml(message)} <button class="text-button" type="button" data-action="undo-habit">Deshacer</button>`;
    } else {
      state.undo = null;
      elements.appMessage.textContent = message || '';
    }
    if (message && !config.persistent) {
      state.messageTimeout = window.setTimeout(() => {
        elements.appMessage.textContent = '';
        state.undo = null;
      }, 7000);
    }
  }

  function clearTimerInterval() {
    if (state.timerInterval) {
      window.clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function setPreset(focusMinutes, breakMinutes, persist) {
    state.selectedPreset = {
      focusMinutes: Store.clampInteger(focusMinutes, 1, 180, 15),
      breakMinutes: Store.clampInteger(breakMinutes, 1, 60, 5),
    };
    elements.customFocus.value = state.selectedPreset.focusMinutes;
    elements.customBreak.value = state.selectedPreset.breakMinutes;
    if (persist) void savePreferences();
    renderTimer();
  }

  async function savePreferences() {
    await Store.setSetting('preferences', {
      focusMinutes: state.selectedPreset.focusMinutes,
      breakMinutes: state.selectedPreset.breakMinutes,
      taskTitle: elements.taskInput.value.trim().slice(0, 140),
    });
  }

  async function refreshDashboard() {
    state.dashboard = await Store.getDashboardData();
    if (!state.initialized) {
      const preferences = state.dashboard.preferences || {};
      setPreset(preferences.focusMinutes, preferences.breakMinutes, false);
      elements.taskInput.value = preferences.taskTitle || '';
      state.initialized = true;
    }
    renderAll();
  }

  function renderAll() {
    if (!state.dashboard) return;
    elements.dateLabel.textContent = formatDateLabel(state.dashboard.today);
    renderTimer();
    renderHabits();
    renderProgress();
    renderWeek();
  }

  function setPresetSelection(active) {
    const buttons = document.querySelectorAll('.preset-chip[data-focus]');
    buttons.forEach((button) => {
      const sameFocus = Number(button.dataset.focus) === state.selectedPreset.focusMinutes;
      const sameBreak = Number(button.dataset.break) === state.selectedPreset.breakMinutes;
      button.classList.toggle('is-selected', !active && sameFocus && sameBreak);
      button.disabled = Boolean(active);
    });
  }

  function renderTimerActions(active) {
    if (!active) {
      if (state.completion && state.completion.phase === 'focus') {
        elements.timerActions.innerHTML = `
          <button class="primary-button" type="button" data-timer-action="break">Descansar ${state.selectedPreset.breakMinutes} min</button>
          <button class="secondary-button" type="button" data-timer-action="another-focus">Otro bloque</button>
        `;
        return;
      }
      if (state.completion && state.completion.phase === 'break') {
        elements.timerActions.innerHTML = '<button class="primary-button" type="button" data-timer-action="another-focus">Empezar otro bloque</button>';
        return;
      }
      elements.timerActions.innerHTML = '<button id="start-focus" class="primary-button" type="button" data-timer-action="start"><span aria-hidden="true">▶</span> Empezar foco</button>';
      return;
    }

    if (active.isComplete) {
      const label = active.phase === 'focus' ? 'Terminar bloque' : 'Terminar descanso';
      elements.timerActions.innerHTML = `
        <button class="primary-button" type="button" data-timer-action="complete">${label}</button>
        <button class="danger-button" type="button" data-timer-action="cancel">Cancelar</button>
      `;
      return;
    }

    const pauseLabel = active.isPaused ? 'Reanudar' : 'Pausar';
    const finishLabel = active.phase === 'focus' ? 'Terminar' : 'Terminar descanso';
    elements.timerActions.innerHTML = `
      <button class="primary-button" type="button" data-timer-action="${active.isPaused ? 'resume' : 'pause'}">${pauseLabel}</button>
      <button class="secondary-button" type="button" data-timer-action="complete">${finishLabel}</button>
      <button class="danger-button" type="button" data-timer-action="cancel">Cancelar</button>
    `;
  }

  function renderTimer() {
    const active = state.dashboard && state.dashboard.activeTimer;
    clearTimerInterval();
    elements.timerRing.classList.remove('is-break', 'is-idle');

    if (!active) {
      const totalSeconds = state.selectedPreset.focusMinutes * 60;
      elements.timerKicker.textContent = 'BLOQUE DE FOCO';
      elements.timerStatus.textContent = state.completion ? 'Listo' : 'Listo';
      elements.timerStatus.className = 'status-pill';
      elements.timerDisplay.textContent = formatTimer(totalSeconds);
      elements.timerDisplay.dateTime = `PT${state.selectedPreset.focusMinutes}M`;
      elements.timerCaption.textContent = state.completion ? 'Elige el siguiente paso' : 'Elige un bloque';
      elements.timerRing.setAttribute('aria-label', `Temporizador listo para ${state.selectedPreset.focusMinutes} minutos de foco`);
      elements.timerRing.style.setProperty('--progress', '0');
      elements.timerRing.classList.add('is-idle');
      elements.timerHelp.textContent = `${state.selectedPreset.focusMinutes} min de foco · ${state.selectedPreset.breakMinutes} min de descanso`;
      elements.taskInput.disabled = false;
      elements.toggleMoreOptions.disabled = false;
      elements.applyCustomDuration.disabled = false;
      elements.customFocus.disabled = false;
      elements.customBreak.disabled = false;
      setPresetSelection(false);
      renderTimerActions(null);
      return;
    }

    const status = Store.getTimerStatus(active);
    state.dashboard.activeTimer = status;
    const percent = Math.min(100, Math.max(0, Math.round((status.elapsedSeconds / status.totalSeconds) * 100)));
    const isBreak = status.phase === 'break';
    const phaseName = isBreak ? 'DESCANSO' : 'BLOQUE DE FOCO';
    const statusText = status.isComplete ? 'Terminado' : (status.isPaused ? 'Pausado' : 'En marcha');

    elements.timerKicker.textContent = phaseName;
    elements.timerStatus.textContent = statusText;
    elements.timerStatus.className = `status-pill${status.isPaused ? ' is-paused' : ''}${status.isComplete ? ' is-ended' : ''}`;
    elements.timerDisplay.textContent = formatTimer(status.remainingSeconds);
    elements.timerDisplay.dateTime = `PT${Math.ceil(status.remainingSeconds / 60)}M`;
    elements.timerCaption.textContent = status.isComplete
      ? (isBreak ? 'El descanso terminó' : 'El bloque terminó')
      : (isBreak ? 'Respira un poco' : (status.taskTitle || 'Una cosa a la vez'));
    elements.timerRing.setAttribute('aria-label', `${isBreak ? 'Descanso' : 'Foco'}: ${formatTimer(status.remainingSeconds)} restantes`);
    elements.timerRing.style.setProperty('--progress', String(percent));
    elements.timerRing.classList.toggle('is-break', isBreak);
    elements.timerHelp.textContent = status.isComplete
      ? (isBreak ? 'Cuando quieras, vuelve a un bloque breve.' : 'Márcalo como terminado para registrarlo.')
      : `${status.focusMinutes} min de foco · ${status.breakMinutes} min de descanso`;
    elements.taskInput.disabled = true;
    elements.toggleMoreOptions.disabled = true;
    elements.applyCustomDuration.disabled = true;
    elements.customFocus.disabled = true;
    elements.customBreak.disabled = true;
    elements.taskInput.value = status.taskTitle || (isBreak ? 'Descanso' : '');
    setPresetSelection(true);
    renderTimerActions(status);

    if (!status.isPaused && !status.isComplete) {
      state.timerInterval = window.setInterval(() => {
        const current = Store.getTimerStatus(state.dashboard.activeTimer);
        state.dashboard.activeTimer = current;
        renderTimer();
        if (current.isComplete) {
          setMessage(current.phase === 'focus'
            ? 'El bloque terminó. Márcalo como terminado para registrarlo.'
            : 'El descanso terminó. Cuando quieras, vuelve a un bloque breve.', { persistent: true });
        }
      }, 1000);
    }
  }

  function renderHabits() {
    const habits = state.dashboard.habits || [];
    const metrics = state.dashboard.habitMetrics;
    const visible = state.showAllHabits ? habits : habits.slice(0, 3);

    elements.habitsCount.textContent = `${metrics.completedToday} / ${metrics.possibleToday}`;
    elements.showMoreHabits.hidden = habits.length <= 3;
    elements.showMoreHabits.textContent = state.showAllHabits ? 'Ver menos' : `Ver los ${habits.length} hábitos`;

    if (!habits.length) {
      elements.habitsList.innerHTML = `
        <div class="empty-state">
          <strong>Tu lista está libre.</strong>
          Añade un hábito que quieras ver hoy. No hace falta hacerlo perfecto.
        </div>
      `;
      return;
    }

    elements.habitsList.innerHTML = visible.map((habit) => `
      <article class="habit-row${habit.completed ? ' is-complete' : ''}">
        <button class="habit-toggle" type="button" data-habit-id="${escapeHtml(habit.id)}" data-completed="${habit.completed}" aria-pressed="${habit.completed}" aria-label="${habit.completed ? 'Quitar' : 'Marcar'} ${escapeHtml(habit.name)}">
          <span aria-hidden="true">✓</span>
        </button>
        <div class="habit-copy">
          <span class="habit-name">${escapeHtml(habit.name)}</span>
          <span class="habit-state">${habit.completed ? 'Registrado hoy' : 'Aún no registrado'}</span>
        </div>
      </article>
    `).join('');
  }

  function renderProgress() {
    const habits = state.dashboard.habitMetrics;
    const focus = state.dashboard.focusMetrics;
    elements.progressSummary.innerHTML = `
      <div class="stat-tile">
        <span class="stat-value">${focus.todayMinutes}</span>
        <span class="stat-label">min de foco</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value">${focus.todaySessions}</span>
        <span class="stat-label">sesiones</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value">${habits.completedToday}/${habits.possibleToday}</span>
        <span class="stat-label">hábitos</span>
      </div>
    `;

    const noData = !habits.activeCount && !focus.totalSessions;
    elements.progressNote.textContent = noData
      ? 'Tus patrones aparecerán después de tu primer bloque o registro.'
      : `Esta semana: ${focus.totalMinutes} min de foco y ${habits.weekRate}% de registro de hábitos.`;
  }

  function renderWeek() {
    const habits = state.dashboard.habitMetrics;
    const focus = state.dashboard.focusMetrics;
    const maxMinutes = Math.max(...focus.byDay.map((day) => day.minutes), 1);
    elements.weekFocusCopy.textContent = focus.totalSessions
      ? `${focus.totalMinutes} min · ${focus.totalSessions} ${focus.totalSessions === 1 ? 'sesión' : 'sesiones'}`
      : 'Aún sin sesiones';
    elements.focusChart.innerHTML = focus.byDay.map((day) => {
      const height = day.minutes ? Math.max(7, Math.round((day.minutes / maxMinutes) * 100)) : 3;
      return `
        <div class="chart-day" aria-label="${formatWeekday(day.date)}: ${day.minutes} minutos de foco">
          <span class="chart-value">${day.minutes || ''}</span>
          <div class="chart-bar-track"><span class="chart-bar" style="height: ${height}%"></span></div>
          <span class="chart-label">${escapeHtml(formatWeekday(day.date))}</span>
        </div>
      `;
    }).join('');
    elements.weekSessionCopy.textContent = focus.totalSessions
      ? `Esta semana: ${focus.totalMinutes} min en ${focus.totalSessions} ${focus.totalSessions === 1 ? 'sesión' : 'sesiones'} · media de ${focus.averageMinutes} min.`
      : 'Empieza un bloque cuando quieras; aquí aparecerá tu ritmo de la semana.';

    if (!habits.byHabit.length) {
      elements.habitWeekStats.innerHTML = '<p class="helper-text">Cuando añadas un hábito, aquí verás su registro semanal.</p>';
      return;
    }

    elements.habitWeekStats.innerHTML = habits.byHabit.map((habit) => `
      <div class="habit-stat-row">
        <span class="habit-stat-name">${escapeHtml(habit.name)}</span>
        <span class="habit-stat-copy">${habit.completed}/${habit.possible} · ${habit.streak} ${habit.streak === 1 ? 'día seguido' : 'días seguidos'}</span>
        <div class="habit-progress" aria-label="${habit.completionRate}% de registros para ${escapeHtml(habit.name)}"><span style="--rate: ${habit.completionRate}%"></span></div>
      </div>
    `).join('');
  }

  async function beginFocus() {
    state.completion = null;
    await savePreferences();
    await Store.startTimer({
      phase: 'focus',
      focusMinutes: state.selectedPreset.focusMinutes,
      breakMinutes: state.selectedPreset.breakMinutes,
      taskTitle: elements.taskInput.value,
    });
    await refreshDashboard();
    setMessage('Bloque de foco en marcha. Solo este paso.', { persistent: false });
  }

  async function beginBreak() {
    state.completion = null;
    await Store.startTimer({
      phase: 'break',
      focusMinutes: state.selectedPreset.focusMinutes,
      breakMinutes: state.selectedPreset.breakMinutes,
      taskTitle: '',
    });
    await refreshDashboard();
    setMessage('Descanso en marcha.', { persistent: false });
  }

  async function finishActiveTimer() {
    const result = await Store.completeTimer();
    state.completion = { phase: result.timer.phase, session: result.session };
    await refreshDashboard();
    if (result.session) {
      setMessage(`${result.session.actualMinutes} min de foco registrados. Bien hecho.`, { persistent: true });
    } else {
      setMessage('Descanso terminado. Cuando quieras, vuelve a un bloque breve.', { persistent: true });
    }
  }

  async function withErrorHandling(callback) {
    try {
      await callback();
    } catch (error) {
      setMessage(error && error.message ? error.message : 'Algo no salió como esperábamos.', { error: true, persistent: true });
    }
  }

  function bindEvents() {
    elements.presetControls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-focus]');
      if (!button || button.disabled) return;
      setPreset(button.dataset.focus, button.dataset.break, true);
    });

    document.querySelector('#more-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-focus]');
      if (!button) return;
      setPreset(button.dataset.focus, button.dataset.break, true);
    });

    elements.toggleMoreOptions.addEventListener('click', () => {
      const options = document.querySelector('#more-options');
      const next = options.hidden;
      options.hidden = !next;
      elements.toggleMoreOptions.setAttribute('aria-expanded', String(next));
      elements.toggleMoreOptions.textContent = next ? 'Menos opciones' : 'Más opciones';
    });

    elements.applyCustomDuration.addEventListener('click', () => {
      setPreset(elements.customFocus.value, elements.customBreak.value, true);
      setMessage('Duración personalizada preparada.');
    });

    elements.taskInput.addEventListener('change', () => {
      void savePreferences();
    });

    elements.timerActions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-timer-action]');
      if (!button) return;
      const action = button.dataset.timerAction;
      void withErrorHandling(async () => {
        if (action === 'start' || action === 'another-focus') await beginFocus();
        if (action === 'break') await beginBreak();
        if (action === 'pause') {
          await Store.pauseTimer();
          await refreshDashboard();
          setMessage('Pausado. Puedes volver cuando estés listo.');
        }
        if (action === 'resume') {
          await Store.resumeTimer();
          await refreshDashboard();
          setMessage('De nuevo en marcha.');
        }
        if (action === 'complete') await finishActiveTimer();
        if (action === 'cancel') {
          const accepted = window.confirm('¿Cancelar este bloque sin registrarlo?');
          if (!accepted) return;
          await Store.discardTimer();
          state.completion = null;
          await refreshDashboard();
          setMessage('Bloque cancelado sin registrarlo.');
        }
      });
    });

    elements.habitsList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-habit-id]');
      if (!button) return;
      void withErrorHandling(async () => {
        const wasCompleted = button.dataset.completed === 'true';
        const habit = state.dashboard.habits.find((item) => item.id === button.dataset.habitId);
        await Store.setHabitCompletion(button.dataset.habitId, !wasCompleted, state.dashboard.today);
        await refreshDashboard();
        setMessage(wasCompleted ? 'Registro quitado.' : 'Registrado para hoy.', {
          undo: {
            habitId: button.dataset.habitId,
            completed: wasCompleted,
            date: state.dashboard.today,
            name: habit ? habit.name : '',
          },
        });
      });
    });

    elements.appMessage.addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="undo-habit"]') || !state.undo) return;
      void withErrorHandling(async () => {
        const undo = state.undo;
        await Store.setHabitCompletion(undo.habitId, undo.completed, undo.date);
        await refreshDashboard();
        setMessage('Cambio deshecho.');
      });
    });

    elements.openHabitForm.addEventListener('click', () => {
      elements.habitForm.hidden = false;
      elements.habitName.focus();
    });

    elements.cancelHabitForm.addEventListener('click', () => {
      elements.habitForm.hidden = true;
      elements.habitForm.reset();
    });

    elements.habitForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withErrorHandling(async () => {
        const habit = await Store.createHabit({ name: elements.habitName.value });
        elements.habitForm.reset();
        elements.habitForm.hidden = true;
        await refreshDashboard();
        setMessage(`“${habit.name}” está listo para hoy.`);
      });
    });

    elements.showMoreHabits.addEventListener('click', () => {
      state.showAllHabits = !state.showAllHabits;
      renderHabits();
    });

    elements.toggleWeek.addEventListener('click', () => {
      const next = elements.weekPanel.hidden;
      elements.weekPanel.hidden = !next;
      elements.toggleWeek.setAttribute('aria-expanded', String(next));
      elements.toggleWeek.textContent = next ? 'Ocultar semana' : 'Ver mi semana';
    });
  }

  async function initialize() {
    bindEvents();
    await refreshDashboard();
  }

  void withErrorHandling(initialize);
}());
