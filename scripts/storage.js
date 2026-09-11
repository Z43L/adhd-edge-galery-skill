(function attachFocusStore(global) {
  'use strict';

  const DB_NAME = 'adhd_focus_companion';
  const DB_VERSION = 1;
  const STORE = {
    habits: 'habits',
    habitLogs: 'habitLogs',
    pomodoroSessions: 'pomodoroSessions',
    settings: 'settings',
  };

  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB no está disponible en este WebView.'));
        return;
      }

      const request = global.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos.'));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        createStore(database, STORE.habits, 'id');
        const logs = createStore(database, STORE.habitLogs, 'id');
        if (!logs.indexNames.contains('byHabitDate')) {
          logs.createIndex('byHabitDate', ['habitId', 'date'], { unique: true });
        }

        const sessions = createStore(database, STORE.pomodoroSessions, 'id');
        if (!sessions.indexNames.contains('byCompletedAt')) {
          sessions.createIndex('byCompletedAt', 'completedAt', { unique: false });
        }

        createStore(database, STORE.settings, 'key');
      };
    });

    return databasePromise;
  }

  function createStore(database, name, keyPath) {
    if (database.objectStoreNames.contains(name)) {
      return database.transaction(name, 'readonly').objectStore(name);
    }
    return database.createObjectStore(name, { keyPath });
  }

  async function readAll(storeName) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('No se pudieron leer los datos.'));
    });
  }

  async function readOne(storeName, key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('No se pudo leer el registro.'));
    });
  }

  async function writeOne(storeName, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).put(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error || new Error('No se pudo guardar el registro.'));
    });
  }

  async function removeOne(storeName, key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('No se pudo borrar el registro.'));
    });
  }

  function makeId(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return `${prefix}_${global.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return localTodayKey();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function localTodayKey() {
    return dateKey(new Date());
  }

  function parseDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function resolveRequestedDate(value) {
    if (!value || value === 'today') return localTodayKey();
    if (value === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return dateKey(yesterday);
    }
    const asKey = parseDateKey(value);
    if (asKey) return dateKey(asKey);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? localTodayKey() : dateKey(parsed);
  }

  function getDateWindow(days, endKey) {
    const length = clampInteger(days, 1, 365, 7);
    const end = parseDateKey(endKey || localTodayKey()) || new Date();
    const keys = [];
    for (let index = length - 1; index >= 0; index -= 1) {
      const cursor = new Date(end);
      cursor.setDate(end.getDate() - index);
      keys.push(dateKey(cursor));
    }
    return keys;
  }

  function createdOnOrBefore(habit, key) {
    const created = dateKey(habit.createdAt || Date.now());
    return created <= key;
  }

  async function createHabit(input) {
    const name = String(input && (input.name || input.title) || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Escribe el nombre del hábito.');
    if (name.length > 80) throw new Error('El hábito debe tener como máximo 80 caracteres.');

    const habit = {
      id: makeId('habit'),
      name,
      frequency: 'daily',
      createdAt: Date.now(),
      archivedAt: null,
    };
    await writeOne(STORE.habits, habit);
    return habit;
  }

  async function listHabits(options) {
    const includeArchived = Boolean(options && options.includeArchived);
    const habits = await readAll(STORE.habits);
    return habits
      .filter((habit) => includeArchived || !habit.archivedAt)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async function archiveHabit(habitId) {
    const habit = await readOne(STORE.habits, habitId);
    if (!habit) throw new Error('No encontré ese hábito.');
    const next = { ...habit, archivedAt: Date.now() };
    await writeOne(STORE.habits, next);
    return next;
  }

  async function setHabitCompletion(habitId, completed, requestedDate) {
    const habit = await readOne(STORE.habits, habitId);
    if (!habit || habit.archivedAt) throw new Error('No encontré un hábito activo con ese identificador.');

    const day = resolveRequestedDate(requestedDate);
    const log = {
      id: `${habitId}:${day}`,
      habitId,
      date: day,
      completed: Boolean(completed),
      updatedAt: Date.now(),
    };
    await writeOne(STORE.habitLogs, log);
    return log;
  }

  async function getHabitStatesForDate(requestedDate) {
    const day = resolveRequestedDate(requestedDate);
    const [habits, logs] = await Promise.all([listHabits(), readAll(STORE.habitLogs)]);
    const completedIds = new Set(
      logs.filter((log) => log.date === day && log.completed).map((log) => log.habitId),
    );
    return habits
      .filter((habit) => createdOnOrBefore(habit, day))
      .map((habit) => ({ ...habit, completed: completedIds.has(habit.id), date: day }));
  }

  function calculateStreak(habit, completedKeys, today) {
    let streak = 0;
    const cursor = parseDateKey(today) || new Date();
    while (createdOnOrBefore(habit, dateKey(cursor))) {
      const key = dateKey(cursor);
      if (!completedKeys.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  async function getHabitMetrics(days) {
    const range = getDateWindow(days || 7);
    const today = localTodayKey();
    const [habits, logs] = await Promise.all([listHabits(), readAll(STORE.habitLogs)]);
    const activeHabits = habits.filter((habit) => createdOnOrBefore(habit, today));
    const completedLogs = logs.filter((log) => log.completed);
    const completedToday = completedLogs.filter((log) => log.date === today && activeHabits.some((habit) => habit.id === log.habitId)).length;

    const byHabit = activeHabits.map((habit) => {
      const completedKeys = new Set(
        completedLogs.filter((log) => log.habitId === habit.id).map((log) => log.date),
      );
      const eligibleDays = range.filter((key) => createdOnOrBefore(habit, key));
      const completed = eligibleDays.filter((key) => completedKeys.has(key)).length;
      return {
        id: habit.id,
        name: habit.name,
        completed,
        possible: eligibleDays.length,
        completionRate: eligibleDays.length ? Math.round((completed / eligibleDays.length) * 100) : 0,
        streak: calculateStreak(habit, completedKeys, today),
      };
    });

    const possibleThisWeek = byHabit.reduce((total, habit) => total + habit.possible, 0);
    const completedThisWeek = byHabit.reduce((total, habit) => total + habit.completed, 0);

    return {
      days: range.length,
      range,
      activeCount: activeHabits.length,
      completedToday,
      possibleToday: activeHabits.length,
      todayRate: activeHabits.length ? Math.round((completedToday / activeHabits.length) * 100) : 0,
      completedThisWeek,
      possibleThisWeek,
      weekRate: possibleThisWeek ? Math.round((completedThisWeek / possibleThisWeek) * 100) : 0,
      byHabit,
    };
  }

  async function getSetting(key, fallback) {
    const record = await readOne(STORE.settings, key);
    return record ? record.value : fallback;
  }

  async function setSetting(key, value) {
    await writeOne(STORE.settings, { key, value, updatedAt: Date.now() });
    return value;
  }

  async function getActiveTimer() {
    return getSetting('activeTimer', null);
  }

  function getTimerStatus(timer, now) {
    if (!timer) return null;
    const currentTime = Number.isFinite(now) ? now : Date.now();
    const totalSeconds = clampInteger(timer.totalSeconds, 60, 10800, 900);
    let remainingSeconds;
    if (timer.pausedAt) {
      remainingSeconds = clampInteger(timer.remainingSeconds, 0, totalSeconds, totalSeconds);
    } else {
      remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - currentTime) / 1000));
    }
    return {
      ...timer,
      totalSeconds,
      remainingSeconds,
      elapsedSeconds: Math.max(0, totalSeconds - remainingSeconds),
      isPaused: Boolean(timer.pausedAt),
      isComplete: remainingSeconds <= 0,
    };
  }

  async function startTimer(input) {
    const phase = input && input.phase === 'break' ? 'break' : 'focus';
    const focusMinutes = clampInteger(input && input.focusMinutes, 1, 180, 15);
    const breakMinutes = clampInteger(input && input.breakMinutes, 1, 60, 5);
    const durationMinutes = phase === 'break' ? breakMinutes : focusMinutes;
    const totalSeconds = durationMinutes * 60;
    const now = Date.now();
    const timer = {
      id: makeId('timer'),
      phase,
      taskTitle: String(input && input.taskTitle || '').trim().slice(0, 140),
      focusMinutes,
      breakMinutes,
      totalSeconds,
      startedAt: now,
      endsAt: now + totalSeconds * 1000,
      remainingSeconds: totalSeconds,
      pausedAt: null,
      createdAt: now,
    };
    await setSetting('activeTimer', timer);
    return getTimerStatus(timer, now);
  }

  async function pauseTimer() {
    const active = await getActiveTimer();
    if (!active) throw new Error('No hay un bloque activo para pausar.');
    const status = getTimerStatus(active);
    if (status.isComplete) return status;
    const paused = {
      ...active,
      remainingSeconds: status.remainingSeconds,
      pausedAt: Date.now(),
    };
    await setSetting('activeTimer', paused);
    return getTimerStatus(paused);
  }

  async function resumeTimer() {
    const active = await getActiveTimer();
    if (!active) throw new Error('No hay un bloque activo para reanudar.');
    const status = getTimerStatus(active);
    if (!status.isPaused || status.isComplete) return status;
    const now = Date.now();
    const resumed = {
      ...active,
      endsAt: now + status.remainingSeconds * 1000,
      pausedAt: null,
      remainingSeconds: status.remainingSeconds,
    };
    await setSetting('activeTimer', resumed);
    return getTimerStatus(resumed, now);
  }

  async function discardTimer() {
    await removeOne(STORE.settings, 'activeTimer');
  }

  async function completeTimer() {
    const active = await getActiveTimer();
    if (!active) throw new Error('No hay un bloque activo para terminar.');
    const status = getTimerStatus(active);
    const completedAt = Date.now();
    let session = null;

    if (active.phase === 'focus') {
      const actualMinutes = Math.max(1, Math.round(status.elapsedSeconds / 60));
      session = {
        id: makeId('session'),
        phase: 'focus',
        taskTitle: active.taskTitle || null,
        plannedMinutes: Math.round(active.totalSeconds / 60),
        actualMinutes,
        startedAt: active.startedAt,
        completedAt,
      };
      await writeOne(STORE.pomodoroSessions, session);
    }

    await discardTimer();
    return { timer: status, session };
  }

  async function getFocusMetrics(days) {
    const range = getDateWindow(days || 7);
    const dateSet = new Set(range);
    const sessions = (await readAll(STORE.pomodoroSessions))
      .filter((session) => session.phase === 'focus' && dateSet.has(dateKey(session.completedAt)));

    const byDay = range.map((key) => {
      const sessionsForDay = sessions.filter((session) => dateKey(session.completedAt) === key);
      return {
        date: key,
        minutes: sessionsForDay.reduce((total, session) => total + Number(session.actualMinutes || 0), 0),
        sessions: sessionsForDay.length,
      };
    });

    const totalMinutes = byDay.reduce((total, day) => total + day.minutes, 0);
    const totalSessions = sessions.length;
    const today = localTodayKey();
    const todayMetric = byDay.find((day) => day.date === today) || { minutes: 0, sessions: 0 };

    return {
      days: range.length,
      range,
      byDay,
      totalMinutes,
      totalSessions,
      averageMinutes: totalSessions ? Math.round(totalMinutes / totalSessions) : 0,
      todayMinutes: todayMetric.minutes,
      todaySessions: todayMetric.sessions,
    };
  }

  async function getDashboardData() {
    const [habits, habitMetrics, focusMetrics, activeTimer, preferences] = await Promise.all([
      getHabitStatesForDate(localTodayKey()),
      getHabitMetrics(7),
      getFocusMetrics(7),
      getActiveTimer(),
      getSetting('preferences', { focusMinutes: 15, breakMinutes: 5, taskTitle: '' }),
    ]);

    return {
      today: localTodayKey(),
      habits,
      habitMetrics,
      focusMetrics,
      activeTimer: getTimerStatus(activeTimer),
      preferences,
    };
  }

  async function exportData() {
    const [habits, habitLogs, pomodoroSessions, settings] = await Promise.all([
      readAll(STORE.habits),
      readAll(STORE.habitLogs),
      readAll(STORE.pomodoroSessions),
      readAll(STORE.settings),
    ]);
    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      habits,
      habitLogs,
      pomodoroSessions,
      settings,
    };
  }

  global.FocusStore = {
    DB_NAME,
    archiveHabit,
    clampInteger,
    completeTimer,
    createHabit,
    dateKey,
    discardTimer,
    exportData,
    getActiveTimer,
    getDashboardData,
    getDateWindow,
    getFocusMetrics,
    getHabitMetrics,
    getHabitStatesForDate,
    getSetting,
    getTimerStatus,
    listHabits,
    localTodayKey,
    pauseTimer,
    resolveRequestedDate,
    resumeTimer,
    setHabitCompletion,
    setSetting,
    startTimer,
  };
}(window));
