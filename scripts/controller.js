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

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function dashboardResult(result) {
    return { result, webview: DASHBOARD_WEBVIEW };
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

  function summarizeToday(mode) {
    const priority = mode.plan.priority;
    const priorityLine = !priority
      ? 'Aún no has elegido una prioridad para hoy.'
      : priority.status === 'done'
        ? `Prioridad completada: ${priority.text}.`
        : `Prioridad de hoy: ${priority.text}.`;
    const checkinLine = mode.checkin && mode.checkin.energy
      ? `Energía registrada: ${mode.checkin.energy}/5.`
      : 'No hay energía registrada todavía.';
    const ideaLine = mode.inboxIdeas.length
      ? `${mode.inboxIdeas.length} ${plural(mode.inboxIdeas.length, 'idea guardada', 'ideas guardadas')} para revisar cuando quieras.`
      : 'Tu bandeja de ideas está vacía.';
    return `${priorityLine}\n${checkinLine}\n${ideaLine}`;
  }

  function summarizeInsight(insight) {
    if (insight.status !== 'ready') return insight.message || 'Todavía no hay suficientes registros comparables.';
    return `${insight.evidence}\n${insight.caveat}\nExperimento opcional: ${insight.suggestion}`;
  }

  function summarizeMemory(search) {
    if (!search.sources.length) {
      return `No encontré recuerdos locales relevantes para “${search.query}”. No inventes una explicación; puedes decir que aún no hay un registro que responda a eso.`;
    }
    const lines = search.sources.map((source) => (
      `- [${source.date} · ${sourceLabel(source.sourceType)}] ${source.excerpt} (id: ${source.sourceType}:${source.sourceId})`
    ));
    return [
      `Memorias locales relevantes para “${search.query}”:`,
      ...lines,
      'Responde usando solo estos hechos cuando hables del historial. Cita fecha y tipo de registro. Distingue hechos de interpretaciones; si propones algo, ofrece un experimento pequeño y reversible, no una certeza ni una recomendación médica, legal, financiera o de seguridad.',
    ].join('\n');
  }

  function safetyResult() {
    return [
      'Siento que estés pasando por esto. No voy a intentar resolverlo con productividad o una lectura de tus registros.',
      'Si existe peligro inmediato o podrías hacerte daño o dañar a alguien, llama ahora a emergencias locales (112 en España/UE) o contacta a una persona de confianza. En España también puedes llamar al 024. No tienes que afrontarlo a solas.',
      'Puedo quedarme contigo para ordenar un paso seguro y buscar apoyo cercano, pero no puedo sustituir ayuda urgente o profesional.',
    ].join('\n');
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
        return { result: `Hábito creado: ${habit.name}. Identificador: ${habit.id}. Está listo para registrarlo hoy.` };
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
        return { result: completed ? `Hábito registrado como hecho el ${log.date}.` : `Hábito actualizado como aún no registrado el ${log.date}.` };
      }

      case 'brain_dump':
      case 'create_brain_dump': {
        const dump = await Store.createBrainDump({ text: input.text, items: input.items, date: input.date });
        const result = `Guardé ${dump.items.length} ${plural(dump.items.length, 'idea', 'ideas')} en tu bandeja local. No las convertí en obligaciones; puedes elegir una como prioridad cuando estés listo.`;
        return input.show_dashboard === false ? { result } : dashboardResult(result);
      }

      case 'get_brain_dumps': {
        const dumps = await Store.listBrainDumps({ status: input.status || 'inbox', limit: input.limit || 8 });
        if (!dumps.length) return { result: 'No hay ideas guardadas en esa bandeja.' };
        const list = dumps.map((dump) => `- [${dump.date}] ${dump.text} (id: ${dump.id})`).join('\n');
        return { result: `Ideas guardadas:\n${list}` };
      }

      case 'set_today_priority': {
        const sourceId = input.brain_dump_id || input.brainDumpId;
        if (sourceId && input.text) throw new Error('Elige una idea guardada o escribe una prioridad, pero no ambas a la vez.');
        const plan = await Store.setDailyPriority({
          brainDumpId: sourceId,
          itemText: input.item_text || input.itemText,
          text: input.text,
          date: input.date,
        });
        return dashboardResult(`Prioridad elegida para ${plan.date}: ${plan.priority.text}. Solo hace falta pensar en esto ahora.`);
      }

      case 'complete_today_priority': {
        const plan = await Store.completeDailyPriority(input.date, input.completed !== false);
        return dashboardResult(plan.priority.status === 'done'
          ? `Prioridad completada: ${plan.priority.text}. Ya es suficiente por hoy si quieres parar.`
          : `La prioridad vuelve a estar abierta: ${plan.priority.text}.`);
      }

      case 'get_today':
      case 'get_daily_mode': {
        const mode = await Store.getDailyModeData(input.date);
        const result = summarizeToday(mode);
        return input.show_dashboard === false ? { result } : dashboardResult(result);
      }

      case 'save_daily_checkin':
      case 'daily_checkin': {
        const patch = { date: input.date };
        if (hasOwn(input, 'energy')) patch.energy = input.energy;
        if (hasOwn(input, 'note')) patch.note = input.note;
        else if (hasOwn(input, 'notes')) patch.note = input.notes;
        const checkin = await Store.upsertDailyCheckin(patch);
        return { result: `Registro del día guardado para ${checkin.date}.` };
      }

      case 'daily_reflection': {
        const patch = { date: input.date };
        if (hasOwn(input, 'reflection')) patch.reflection = input.reflection;
        else if (hasOwn(input, 'text')) patch.reflection = input.text;
        const checkin = await Store.upsertDailyCheckin(patch);
        return { result: `Cierre del día guardado para ${checkin.date}.` };
      }

      case 'get_daily_insights': {
        const insight = await Store.getActivityHabitInsights(input.days || 28);
        const result = summarizeInsight(insight);
        return input.show_dashboard ? dashboardResult(result) : { result };
      }

      case 'search_memory':
      case 'query_memory': {
        const query = input.query || input.text;
        if (Store.detectSafetyRisk(query)) return { result: safetyResult() };
        const search = await Store.searchMemory({ query, days: input.days, limit: input.limit });
        const result = summarizeMemory(search);
        return input.show_dashboard ? dashboardResult(result) : { result };
      }

      case 'exclude_memory': {
        const sourceType = input.source_type || input.sourceType;
        const sourceId = input.source_id || input.sourceId;
        if (!sourceType || !sourceId) throw new Error('Necesito el tipo y el identificador del recuerdo que quieres excluir.');
        await Store.excludeMemorySource(sourceType, sourceId);
        return { result: 'Ese registro ya no se usará en las búsquedas de memoria. Sigue guardado localmente.' };
      }

      case 'start_focus': {
        const active = await Store.getActiveTimer();
        if (active) throw new Error('Ya hay un bloque activo. Ábrelo en el panel para pausarlo, terminarlo o cancelarlo.');
        const plan = await Store.getDailyPlan(input.date);
        const timer = await Store.startTimer({
          phase: 'focus',
          focusMinutes: input.minutes || input.focus_minutes,
          breakMinutes: input.break_minutes || input.breakMinutes,
          taskTitle: input.task_title || input.taskTitle || (plan.priority && plan.priority.status === 'open' ? plan.priority.text : ''),
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
        return { result: JSON.stringify(backup) };
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
