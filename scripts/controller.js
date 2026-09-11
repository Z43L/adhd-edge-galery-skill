(function attachSkillController(global) {
  'use strict';

  const Store = global.FocusStore;
  const DASHBOARD_WEBVIEW = {
    url: 'dashboard.html?view=dashboard',
    aspectRatio: 1.0,
  };

  function parsePayloads(dataStr) {
    if (typeof dataStr === 'object' && dataStr !== null) {
      return Array.isArray(dataStr) ? dataStr : [dataStr];
    }

    const source = String(dataStr || '').trim();
    if (!source) throw new Error('No recibí una acción para la skill.');

    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (firstError) {
      try {
        const parsed = JSON.parse(`[${source}]`);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (secondError) {
        throw new Error('La acción debe ser un JSON válido.');
      }
    }
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : pluralForm;
  }

  function dashboardResult(result) {
    return { result, webview: DASHBOARD_WEBVIEW };
  }

  function summarizeStats(habits, focus) {
    const habitLine = habits.activeCount
      ? `${habits.completedToday} de ${habits.possibleToday} hábitos registrados hoy (${habits.todayRate}%).`
      : 'Aún no hay hábitos activos.';
    const focusLine = focus.totalSessions
      ? `${focus.totalMinutes} min de foco en ${focus.totalSessions} ${plural(focus.totalSessions, 'sesión', 'sesiones')} durante los últimos ${focus.days} días.`
      : `Aún no hay sesiones de foco en los últimos ${focus.days} días.`;
    const averageLine = focus.totalSessions
      ? `Duración media: ${focus.averageMinutes} min por sesión.`
      : 'Tus patrones aparecerán después de tu primer bloque o registro.';
    return `${habitLine}\n${focusLine}\n${averageLine}`;
  }

  async function processAction(input) {
    if (!input || typeof input !== 'object') throw new Error('La acción debe ser un objeto JSON.');
    const action = String(input.action || '').trim();

    switch (action) {
      case 'open_dashboard':
      case 'get_dashboard':
        return dashboardResult('Panel de Focus Companion abierto.');

      case 'create_habit': {
        const habit = await Store.createHabit({ name: input.name || input.title });
        return {
          result: `Hábito creado: ${habit.name}. Identificador: ${habit.id}. Está listo para registrarlo hoy.`,
        };
      }

      case 'get_habits': {
        const habits = await Store.getHabitStatesForDate(input.date);
        if (!habits.length) return { result: 'Aún no hay hábitos activos. Puedes crear uno sencillo cuando quieras.' };
        const list = habits.map((habit) => (
          `- ${habit.completed ? 'Hecho' : 'Aún no registrado'}: ${habit.name} (id: ${habit.id})`
        )).join('\n');
        return { result: `Hábitos de ${Store.resolveRequestedDate(input.date)}:\n${list}` };
      }

      case 'log_habit': {
        const habitId = input.habit_id || input.habitId;
        if (!habitId) throw new Error('Necesito el identificador del hábito para registrarlo.');
        const completed = input.completed !== false;
        const log = await Store.setHabitCompletion(habitId, completed, input.date);
        return {
          result: completed
            ? `Hábito registrado como hecho el ${log.date}.`
            : `Hábito actualizado como aún no registrado el ${log.date}.`,
        };
      }

      case 'start_focus': {
        const active = await Store.getActiveTimer();
        if (active) throw new Error('Ya hay un bloque activo. Ábrelo en el panel para pausarlo, terminarlo o cancelarlo.');
        const timer = await Store.startTimer({
          phase: 'focus',
          focusMinutes: input.minutes || input.focus_minutes,
          breakMinutes: input.break_minutes || input.breakMinutes,
          taskTitle: input.task_title || input.taskTitle,
        });
        const task = timer.taskTitle ? ` para “${timer.taskTitle}”` : '';
        return dashboardResult(`Bloque de foco de ${timer.focusMinutes} min iniciado${task}.`);
      }

      case 'finish_focus': {
        const completed = await Store.completeTimer();
        if (!completed.session) return dashboardResult('Descanso terminado. Cuando quieras, puedes empezar otro bloque de foco.');
        return dashboardResult(`Bloque registrado: ${completed.session.actualMinutes} min de foco.`);
      }

      case 'discard_focus':
        await Store.discardTimer();
        return { result: 'El bloque activo se canceló sin registrarlo.' };

      case 'get_statistics': {
        const days = Store.clampInteger(input.days, 1, 365, 7);
        const [habitMetrics, focusMetrics] = await Promise.all([
          Store.getHabitMetrics(days),
          Store.getFocusMetrics(days),
        ]);
        const result = summarizeStats(habitMetrics, focusMetrics);
        return input.show_dashboard ? dashboardResult(result) : { result };
      }

      case 'export_data': {
        const backup = await Store.exportData();
        return {
          result: JSON.stringify(backup),
        };
      }

      default:
        throw new Error(`No reconozco la acción “${action || 'sin acción'}”.`);
    }
  }

  global.ai_edge_gallery_get_result = async function getResult(dataStr) {
    try {
      const payloads = parsePayloads(dataStr);
      const results = [];
      let shouldShowDashboard = false;

      for (const payload of payloads) {
        const result = await processAction(payload);
        results.push(result.result);
        shouldShowDashboard = shouldShowDashboard || Boolean(result.webview);
      }

      const combinedResult = results.join('\n\n');
      return JSON.stringify(shouldShowDashboard ? dashboardResult(combinedResult) : { result: combinedResult });
    } catch (error) {
      return JSON.stringify({
        error: error && error.message ? error.message : 'No se pudo completar esa acción.',
      });
    }
  };
}(window));
