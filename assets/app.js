(function focusDashboard() {
  'use strict';

  const Store = window.FocusStore;
  if (!Store) return;

  const elements = {
    applyCustomDuration: document.querySelector('#apply-custom-duration'),
    appMessage: document.querySelector('#app-message'),
    brainDumpForm: document.querySelector('#brain-dump-form'),
    brainDumpInput: document.querySelector('#brain-dump-input'),
    cancelBrainDump: document.querySelector('#cancel-brain-dump'),
    cancelCheckin: document.querySelector('#cancel-checkin'),
    cancelHabitForm: document.querySelector('#cancel-habit-form'),
    cancelReflection: document.querySelector('#cancel-reflection'),
    checkinForm: document.querySelector('#checkin-form'),
    customBreak: document.querySelector('#custom-break'),
    customFocus: document.querySelector('#custom-focus'),
    dateLabel: document.querySelector('#date-label'),
    dailyNote: document.querySelector('#daily-note'),
    dailyReflection: document.querySelector('#daily-reflection'),
    dailySummary: document.querySelector('#daily-summary'),
    energyOptions: document.querySelector('#energy-options'),
    focusChart: document.querySelector('#focus-chart'),
    habitForm: document.querySelector('#habit-form'),
    habitName: document.querySelector('#habit-name'),
    habitWeekStats: document.querySelector('#habit-week-stats'),
    habitsCount: document.querySelector('#habits-count'),
    habitsList: document.querySelector('#habits-list'),
    inboxIdeas: document.querySelector('#inbox-ideas'),
    insightContent: document.querySelector('#insight-content'),
    memoryForm: document.querySelector('#memory-form'),
    memoryQuery: document.querySelector('#memory-query'),
    memoryResults: document.querySelector('#memory-results'),
    openBrainDump: document.querySelector('#open-brain-dump'),
    openCheckin: document.querySelector('#open-checkin'),
    openHabitForm: document.querySelector('#open-habit-form'),
    openMemory: document.querySelector('#open-memory'),
    openReflection: document.querySelector('#open-reflection'),
    presetControls: document.querySelector('#preset-controls'),
    progressNote: document.querySelector('#progress-note'),
    progressSummary: document.querySelector('#progress-summary'),
    priorityContent: document.querySelector('#priority-content'),
    priorityStatus: document.querySelector('#priority-status'),
    reflectionForm: document.querySelector('#reflection-form'),
    refreshInsight: document.querySelector('#refresh-insight'),
    showMoreHabits: document.querySelector('#show-more-habits'),
    startFocus: document.querySelector('#start-focus'),
    taskInput: document.querySelector('#task-input'),
    taskLabel: document.querySelector('#task-label'),
    timerActions: document.querySelector('#timer-actions'),
    timerCaption: document.querySelector('#timer-caption'),
    timerDisplay: document.querySelector('#timer-display'),
    timerHelp: document.querySelector('#timer-help'),
    timerKicker: document.querySelector('#timer-kicker'),
    timerRing: document.querySelector('#timer-ring'),
    timerStatus: document.querySelector('#timer-status'),
    toggleMoreOptions: document.querySelector('#toggle-more-options'),
    toggleInbox: document.querySelector('#toggle-inbox'),
    toggleWeek: document.querySelector('#toggle-week'),
    weekFocusCopy: document.querySelector('#week-focus-copy'),
    weekPanel: document.querySelector('#week-panel'),
    weekSessionCopy: document.querySelector('#week-session-copy'),
  };

  const state = {
    dashboard: null,
    editingPriority: false,
    energyValue: null,
    initialized: false,
    insight: null,
    messageTimeout: null,
    memorySearch: null,
    selectedPreset: { focusMinutes: 15, breakMinutes: 5 },
    showAllHabits: false,
    showInbox: false,
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
      state.energyValue = state.dashboard.dailyMode && state.dashboard.dailyMode.checkin
        ? state.dashboard.dailyMode.checkin.energy
        : null;
      state.initialized = true;
    }
    renderAll();
  }

  function renderAll() {
    if (!state.dashboard) return;
    elements.dateLabel.textContent = formatDateLabel(state.dashboard.today);
    renderPriority();
    renderTimer();
    renderHabits();
    renderDailyMode();
    renderProgress();
    renderInsight();
    renderWeek();
  }

  function getDailyMode() {
    return state.dashboard && state.dashboard.dailyMode
      ? state.dashboard.dailyMode
      : { plan: { priority: null }, checkin: null, inboxIdeas: [] };
  }

  function renderPriority() {
    const mode = getDailyMode();
    const priority = mode.plan && mode.plan.priority;
    const isDone = priority && priority.status === 'done';
    elements.priorityStatus.textContent = isDone ? 'Hecha' : (priority ? 'Ahora' : 'Elige');
    elements.priorityStatus.className = `status-pill${isDone ? ' is-ended' : ''}`;

    if (!priority || state.editingPriority) {
      const current = priority ? priority.text : '';
      elements.priorityContent.innerHTML = `
        <p class="priority-question">¿Qué haría que hoy se sintiera suficiente?</p>
        <form id="priority-form" class="priority-form">
          <input id="priority-input" type="text" maxlength="180" value="${escapeHtml(current)}" placeholder="Un paso concreto" aria-label="Prioridad de hoy" autocomplete="off" required>
          <button class="primary-button compact" type="submit">Elegir esta prioridad</button>
        </form>
      `;
      return;
    }

    elements.priorityContent.innerHTML = `
      <p class="priority-task">${escapeHtml(priority.text)}</p>
      <p class="priority-copy">${isDone ? 'Prioridad completada. Ya es suficiente por hoy si quieres parar.' : 'No necesitas resolver todo lo demás ahora.'}</p>
      <div class="priority-actions">
        ${isDone
          ? '<button class="text-button" type="button" data-priority-action="reopen">Reabrir esta prioridad</button>'
          : '<button class="primary-button compact" type="button" data-priority-action="complete">Hecha</button><button class="text-button" type="button" data-priority-action="change">Cambiar</button>'}
      </div>
    `;
  }

  function renderInboxIdeas() {
    const ideas = getDailyMode().inboxIdeas || [];
    elements.toggleInbox.hidden = !ideas.length;
    elements.toggleInbox.textContent = state.showInbox ? 'Ocultar ideas' : `Ideas guardadas${ideas.length ? ` (${ideas.length})` : ''}`;
    elements.toggleInbox.setAttribute('aria-expanded', String(state.showInbox));
    elements.inboxIdeas.hidden = !state.showInbox;
    if (!state.showInbox) return;

    if (!ideas.length) {
      elements.inboxIdeas.innerHTML = '<p class="helper-text">Tu bandeja está vacía. Puedes escribir una idea cuando aparezca.</p>';
      return;
    }
    elements.inboxIdeas.innerHTML = `
      <p class="inbox-heading">Elige solo una si te sirve ahora.</p>
      ${ideas.map((idea) => `
        <article class="inbox-idea">
          <div>
            <span>${escapeHtml(idea.text)}</span>
            <small>${escapeHtml(idea.date)}</small>
          </div>
          <button class="quiet-button" type="button" data-idea-dump-id="${escapeHtml(idea.dumpId)}" data-idea-text="${escapeHtml(idea.text)}">Elegir</button>
        </article>
      `).join('')}
    `;
  }

  function sourceLabel(type) {
    const labels = {
      brain_dump: 'Brain dump',
      priority: 'Prioridad',
      daily_energy: 'Energía',
      daily_checkin: 'Nota del día',
      daily_reflection: 'Cierre del día',
      focus_session: 'Foco',
      habit_log: 'Hábito',
    };
    return labels[type] || 'Registro';
  }

  function renderMemoryResults() {
    const search = state.memorySearch;
    if (!search) {
      elements.memoryResults.innerHTML = '';
      return;
    }
    if (search.safety) {
      elements.memoryResults.innerHTML = `
        <div class="safety-card" role="alert">
          <strong>Tu seguridad va primero.</strong>
          <p>Si existe peligro inmediato o puedes hacerte daño o dañar a alguien, llama a emergencias locales (112 en España/UE) o contacta ahora a una persona de confianza. En España también está el 024.</p>
        </div>
      `;
      return;
    }
    if (!search.sources.length) {
      elements.memoryResults.innerHTML = '<p class="memory-empty">No encuentro un registro guardado que responda a eso todavía.</p>';
      return;
    }
    elements.memoryResults.innerHTML = `
      <p class="memory-result-label">Recuerdos encontrados. En el chat, el agente puede usar estas fuentes para responder con contexto.</p>
      ${search.sources.map((source) => `
        <article class="memory-source">
          <div class="memory-source-meta"><span>${escapeHtml(sourceLabel(source.sourceType))}</span><time>${escapeHtml(source.date)}</time></div>
          <p>${escapeHtml(source.excerpt)}</p>
          <button class="text-button" type="button" data-memory-action="exclude" data-source-type="${escapeHtml(source.sourceType)}" data-source-id="${escapeHtml(source.sourceId)}">Excluir de la memoria</button>
        </article>
      `).join('')}
    `;
  }

  function renderDailyMode() {
    const mode = getDailyMode();
    const checkin = mode.checkin;
    elements.dailySummary.textContent = checkin && checkin.energy ? `Energía ${checkin.energy}/5` : 'Sin registro';
    elements.dailyNote.value = checkin && checkin.note ? checkin.note : '';
    elements.dailyReflection.value = checkin && checkin.reflection ? checkin.reflection : '';
    if (state.energyValue === null && checkin && checkin.energy) state.energyValue = checkin.energy;
    renderEnergyOptions();
    renderInboxIdeas();
    renderMemoryResults();
  }

  function renderEnergyOptions() {
    elements.energyOptions.querySelectorAll('[data-energy]').forEach((button) => {
      const selected = Number(button.dataset.energy) === Number(state.energyValue);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderInsight() {
    const insight = state.insight;
    if (!insight) {
      elements.insightContent.innerHTML = '<p class="helper-text">Aún reuniendo patrones. Cuando haya suficientes días comparables, mostraré una sola pista basada en tus propios registros.</p>';
      return;
    }
    if (insight.status !== 'ready') {
      elements.insightContent.innerHTML = `<p class="helper-text">${escapeHtml(insight.message || 'Aún no hay una observación clara.')}</p>`;
      return;
    }
    elements.insightContent.innerHTML = `
      <p class="insight-evidence">${escapeHtml(insight.evidence)}</p>
      <p class="insight-caveat">${escapeHtml(insight.caveat)}</p>
      <p class="insight-suggestion"><strong>Probar mañana:</strong> ${escapeHtml(insight.suggestion)}</p>
    `;
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
      const priority = getDailyMode().plan && getDailyMode().plan.priority;
      const isPriorityOpen = Boolean(priority && priority.status === 'open');
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
      elements.taskInput.readOnly = isPriorityOpen;
      elements.taskLabel.textContent = isPriorityOpen
        ? 'Bloque vinculado a tu prioridad de hoy'
        : '¿En qué vas a enfocarte?';
      if (isPriorityOpen) elements.taskInput.value = priority.text;
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
    elements.taskInput.readOnly = false;
    elements.taskLabel.textContent = isBreak ? 'Descanso actual' : 'Bloque actual';
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
    const priority = getDailyMode().plan && getDailyMode().plan.priority;
    await Store.startTimer({
      phase: 'focus',
      focusMinutes: state.selectedPreset.focusMinutes,
      breakMinutes: state.selectedPreset.breakMinutes,
      taskTitle: priority && priority.status === 'open' ? priority.text : elements.taskInput.value,
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

  async function loadInsight() {
    state.insight = await Store.getActivityHabitInsights(28);
    renderInsight();
  }

  function setDailyFormOpen(form, trigger, open) {
    form.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }

  function restoreCheckinDraft() {
    const checkin = getDailyMode().checkin;
    state.energyValue = checkin && checkin.energy ? checkin.energy : null;
    elements.dailyNote.value = checkin && checkin.note ? checkin.note : '';
    renderEnergyOptions();
  }

  function restoreReflectionDraft() {
    const checkin = getDailyMode().checkin;
    elements.dailyReflection.value = checkin && checkin.reflection ? checkin.reflection : '';
  }

  function showDailyForm(form, trigger) {
    const shouldOpen = form.hidden;
    [
      [elements.checkinForm, elements.openCheckin],
      [elements.reflectionForm, elements.openReflection],
      [elements.memoryForm, elements.openMemory],
    ].forEach(([candidate, candidateTrigger]) => {
      setDailyFormOpen(candidate, candidateTrigger, candidate === form && shouldOpen);
    });
    if (shouldOpen) {
      const field = form.querySelector('input, textarea');
      if (field) field.focus();
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

    elements.priorityContent.addEventListener('submit', (event) => {
      if (!event.target.matches('#priority-form')) return;
      event.preventDefault();
      void withErrorHandling(async () => {
        const input = event.target.querySelector('#priority-input');
        await Store.setDailyPriority({ date: state.dashboard.today, text: input.value });
        state.editingPriority = false;
        await refreshDashboard();
        setMessage('Esta es tu única prioridad activa de hoy.');
      });
    });

    elements.priorityContent.addEventListener('click', (event) => {
      const button = event.target.closest('[data-priority-action]');
      if (!button) return;
      const action = button.dataset.priorityAction;
      void withErrorHandling(async () => {
        if (action === 'change') {
          state.editingPriority = true;
          renderPriority();
          const input = elements.priorityContent.querySelector('#priority-input');
          if (input) input.focus();
          return;
        }
        if (action === 'complete') {
          const priority = getDailyMode().plan.priority;
          await Store.completeDailyPriority(state.dashboard.today, true);
          if (priority && elements.taskInput.value === priority.text) {
            elements.taskInput.value = '';
            await savePreferences();
          }
          await refreshDashboard();
          await loadInsight();
          setMessage('Prioridad completada. Ya es suficiente por hoy si quieres parar.');
        }
        if (action === 'reopen') {
          await Store.completeDailyPriority(state.dashboard.today, false);
          await refreshDashboard();
          setMessage('La prioridad vuelve a estar abierta.');
        }
      });
    });

    elements.openBrainDump.addEventListener('click', () => {
      const open = elements.brainDumpForm.hidden;
      elements.brainDumpForm.hidden = !open;
      elements.openBrainDump.setAttribute('aria-expanded', String(open));
      if (open) elements.brainDumpInput.focus();
    });

    elements.cancelBrainDump.addEventListener('click', () => {
      elements.brainDumpForm.hidden = true;
      elements.openBrainDump.setAttribute('aria-expanded', 'false');
      elements.brainDumpForm.reset();
    });

    elements.brainDumpForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withErrorHandling(async () => {
        const dump = await Store.createBrainDump({ date: state.dashboard.today, text: elements.brainDumpInput.value });
        elements.brainDumpForm.reset();
        elements.brainDumpForm.hidden = true;
        elements.openBrainDump.setAttribute('aria-expanded', 'false');
        state.showInbox = true;
        await refreshDashboard();
        setMessage(`${dump.items.length} ${dump.items.length === 1 ? 'idea guardada' : 'ideas guardadas'} sin convertirlas en tareas.`);
      });
    });

    elements.toggleInbox.addEventListener('click', () => {
      state.showInbox = !state.showInbox;
      renderInboxIdeas();
    });

    elements.inboxIdeas.addEventListener('click', (event) => {
      const button = event.target.closest('[data-idea-dump-id]');
      if (!button) return;
      void withErrorHandling(async () => {
        await Store.setDailyPriority({
          date: state.dashboard.today,
          brainDumpId: button.dataset.ideaDumpId,
          itemText: button.dataset.ideaText,
        });
        state.editingPriority = false;
        await refreshDashboard();
        setMessage('Elegiste una idea como tu prioridad de hoy.');
      });
    });

    elements.openCheckin.addEventListener('click', () => showDailyForm(elements.checkinForm, elements.openCheckin));
    elements.openReflection.addEventListener('click', () => showDailyForm(elements.reflectionForm, elements.openReflection));
    elements.openMemory.addEventListener('click', () => showDailyForm(elements.memoryForm, elements.openMemory));

    elements.cancelCheckin.addEventListener('click', () => {
      restoreCheckinDraft();
      setDailyFormOpen(elements.checkinForm, elements.openCheckin, false);
    });
    elements.cancelReflection.addEventListener('click', () => {
      restoreReflectionDraft();
      setDailyFormOpen(elements.reflectionForm, elements.openReflection, false);
    });

    elements.energyOptions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-energy]');
      if (!button) return;
      state.energyValue = Number(button.dataset.energy);
      renderEnergyOptions();
    });

    elements.checkinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withErrorHandling(async () => {
        const payload = { date: state.dashboard.today, note: elements.dailyNote.value };
        if (state.energyValue !== null) payload.energy = state.energyValue;
        await Store.upsertDailyCheckin(payload);
        setDailyFormOpen(elements.checkinForm, elements.openCheckin, false);
        await refreshDashboard();
        await loadInsight();
        setMessage('Registro del día guardado localmente.');
      });
    });

    elements.reflectionForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withErrorHandling(async () => {
        await Store.upsertDailyCheckin({ date: state.dashboard.today, reflection: elements.dailyReflection.value });
        setDailyFormOpen(elements.reflectionForm, elements.openReflection, false);
        await refreshDashboard();
        await loadInsight();
        setMessage('Cierre del día guardado localmente.');
      });
    });

    elements.memoryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void withErrorHandling(async () => {
        const query = elements.memoryQuery.value.trim();
        if (Store.detectSafetyRisk(query)) {
          state.memorySearch = { safety: true, query, sources: [] };
        } else {
          state.memorySearch = await Store.searchMemory({ query, days: 365, limit: 6 });
        }
        renderMemoryResults();
      });
    });

    elements.memoryResults.addEventListener('click', (event) => {
      const button = event.target.closest('[data-memory-action="exclude"]');
      if (!button || !state.memorySearch || state.memorySearch.safety) return;
      void withErrorHandling(async () => {
        await Store.excludeMemorySource(button.dataset.sourceType, button.dataset.sourceId);
        state.memorySearch = await Store.searchMemory({
          query: state.memorySearch.query,
          days: state.memorySearch.searchedDays,
          limit: 6,
        });
        renderMemoryResults();
        setMessage('Ese registro deja de aparecer en las búsquedas de memoria.');
      });
    });

    elements.refreshInsight.addEventListener('click', () => {
      void withErrorHandling(async () => {
        await loadInsight();
        setMessage(state.insight && state.insight.status === 'ready'
          ? 'Observación local actualizada.'
          : 'Aún no hay suficientes días comparables para una observación.');
      });
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
    await loadInsight();
  }

  void withErrorHandling(initialize);
}());
