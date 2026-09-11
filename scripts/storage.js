(function attachFocusStore(global) {
  'use strict';

  const DB_NAME = 'adhd_focus_companion';
  const DB_VERSION = 2;
  const STORE = {
    habits: 'habits',
    habitLogs: 'habitLogs',
    pomodoroSessions: 'pomodoroSessions',
    brainDumps: 'brainDumps',
    dailyPlans: 'dailyPlans',
    dailyCheckins: 'dailyCheckins',
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
      request.onblocked = () => reject(new Error('Cierra otra vista del panel para actualizar la memoria local.'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        const transaction = event.target.transaction;

        getOrCreateStore(database, transaction, STORE.habits, 'id');
        const logs = getOrCreateStore(database, transaction, STORE.habitLogs, 'id');
        if (!logs.indexNames.contains('byHabitDate')) {
          logs.createIndex('byHabitDate', ['habitId', 'date'], { unique: true });
        }

        const sessions = getOrCreateStore(database, transaction, STORE.pomodoroSessions, 'id');
        if (!sessions.indexNames.contains('byCompletedAt')) {
          sessions.createIndex('byCompletedAt', 'completedAt', { unique: false });
        }

        const brainDumps = getOrCreateStore(database, transaction, STORE.brainDumps, 'id');
        if (!brainDumps.indexNames.contains('byDate')) {
          brainDumps.createIndex('byDate', 'date', { unique: false });
        }
        if (!brainDumps.indexNames.contains('byStatusCreatedAt')) {
          brainDumps.createIndex('byStatusCreatedAt', ['status', 'createdAt'], { unique: false });
        }

        const dailyPlans = getOrCreateStore(database, transaction, STORE.dailyPlans, 'date');
        if (!dailyPlans.indexNames.contains('byUpdatedAt')) {
          dailyPlans.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
        }

        const dailyCheckins = getOrCreateStore(database, transaction, STORE.dailyCheckins, 'date');
        if (!dailyCheckins.indexNames.contains('byUpdatedAt')) {
          dailyCheckins.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
        }

        getOrCreateStore(database, transaction, STORE.settings, 'key');
      };
    });

    return databasePromise;
  }

  function getOrCreateStore(database, transaction, name, keyPath) {
    if (database.objectStoreNames.contains(name)) {
      return transaction.objectStore(name);
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

  function cleanText(value, maximumLength) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, maximumLength || 2000);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function cleanBrainDumpItems(value, suppliedItems) {
    const candidates = Array.isArray(suppliedItems) && suppliedItems.length
      ? suppliedItems.map((item) => (typeof item === 'string' ? item : item && (item.text || item.title)))
      : String(value || '').split(/\n+/);

    return candidates
      .map((item) => cleanText(item, 180).replace(/^(?:[-*•]|\d+[.)])\s*/, ''))
      .filter(Boolean)
      .slice(0, 12);
  }

  async function createBrainDump(input) {
    const rawText = cleanText(input && input.text, 2000);
    const items = cleanBrainDumpItems(rawText, input && input.items);
    const text = rawText || items.join('\n');
    if (!text) throw new Error('Escribe al menos una idea para vaciar la mente.');

    const now = Date.now();
    const brainDump = {
      id: makeId('dump'),
      text,
      items: items.length ? items : [text],
      date: resolveRequestedDate(input && input.date),
      status: 'inbox',
      searchable: true,
      createdAt: now,
      updatedAt: now,
    };
    await writeOne(STORE.brainDumps, brainDump);
    return brainDump;
  }

  async function listBrainDumps(options) {
    const config = options || {};
    const status = config.status || 'inbox';
    const limit = clampInteger(config.limit, 1, 50, 12);
    const dumps = await readAll(STORE.brainDumps);
    return dumps
      .filter((dump) => !status || dump.status === status)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit);
  }

  async function archiveBrainDump(brainDumpId) {
    const dump = await readOne(STORE.brainDumps, brainDumpId);
    if (!dump) throw new Error('No encontré esa nota.');
    const updated = { ...dump, status: 'archived', updatedAt: Date.now() };
    await writeOne(STORE.brainDumps, updated);
    return updated;
  }

  async function getInboxIdeas(limit) {
    const dumps = await listBrainDumps({ status: 'inbox', limit: 50 });
    const ideas = dumps.flatMap((dump) => (dump.items || [dump.text]).map((text, index) => ({
      id: `${dump.id}:${index}`,
      dumpId: dump.id,
      itemIndex: index,
      text,
      date: dump.date,
      createdAt: dump.createdAt,
    })));
    return ideas.slice(0, clampInteger(limit, 1, 30, 6));
  }

  function defaultDailyPlan(day) {
    return {
      date: day,
      priority: null,
      updatedAt: Date.now(),
    };
  }

  async function getDailyPlan(requestedDate) {
    const day = resolveRequestedDate(requestedDate);
    return (await readOne(STORE.dailyPlans, day)) || defaultDailyPlan(day);
  }

  async function setDailyPriority(input) {
    const day = resolveRequestedDate(input && input.date);
    const sourceId = input && (input.brainDumpId || input.brain_dump_id);
    let text = cleanText(input && input.text, 180);
    let sourceBrainDumpId = null;

    if (sourceId) {
      const dump = await readOne(STORE.brainDumps, sourceId);
      if (!dump) throw new Error('No encontré esa idea guardada.');
      const suppliedText = cleanText(input && (input.itemText || input.item_text), 180);
      const availableItems = dump.items || [dump.text];
      text = suppliedText || availableItems[0] || dump.text;
      if (!availableItems.includes(text) && text !== dump.text) {
        throw new Error('Esa prioridad no pertenece a la nota seleccionada.');
      }
      sourceBrainDumpId = dump.id;
    }

    if (!text) throw new Error('Elige o escribe una prioridad concreta para hoy.');
    const plan = await getDailyPlan(day);
    const now = Date.now();
    const updated = {
      ...plan,
      priority: {
        id: makeId('priority'),
        text,
        sourceBrainDumpId,
        status: 'open',
        searchable: true,
        selectedAt: now,
        completedAt: null,
      },
      updatedAt: now,
    };
    await writeOne(STORE.dailyPlans, updated);
    return updated;
  }

  async function completeDailyPriority(requestedDate, completed) {
    const plan = await getDailyPlan(requestedDate);
    if (!plan.priority) throw new Error('No hay una prioridad elegida para ese día.');
    const now = Date.now();
    const isDone = completed !== false;
    const updated = {
      ...plan,
      priority: {
        ...plan.priority,
        status: isDone ? 'done' : 'open',
        completedAt: isDone ? now : null,
      },
      updatedAt: now,
    };
    await writeOne(STORE.dailyPlans, updated);
    return updated;
  }

  async function clearDailyPriority(requestedDate) {
    const plan = await getDailyPlan(requestedDate);
    const updated = { ...plan, priority: null, updatedAt: Date.now() };
    await writeOne(STORE.dailyPlans, updated);
    return updated;
  }

  function defaultDailyCheckin(day) {
    return {
      date: day,
      energy: null,
      note: '',
      reflection: '',
      searchable: true,
      searchableEnergy: true,
      searchableNote: true,
      searchableReflection: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async function getDailyCheckin(requestedDate) {
    const day = resolveRequestedDate(requestedDate);
    return (await readOne(STORE.dailyCheckins, day)) || null;
  }

  async function upsertDailyCheckin(input) {
    const day = resolveRequestedDate(input && input.date);
    const previous = (await getDailyCheckin(day)) || defaultDailyCheckin(day);
    const next = { ...previous, updatedAt: Date.now() };

    if (hasOwn(input, 'energy') && input.energy !== undefined) {
      next.energy = input.energy === null || input.energy === ''
        ? null
        : clampInteger(input.energy, 1, 5, previous.energy || 3);
    }
    if (hasOwn(input, 'note') && input.note !== undefined) next.note = cleanText(input.note, 1000);
    if (hasOwn(input, 'reflection') && input.reflection !== undefined) next.reflection = cleanText(input.reflection, 1200);
    if (hasOwn(input, 'searchable')) next.searchable = Boolean(input.searchable);

    await writeOne(STORE.dailyCheckins, next);
    return next;
  }

  async function getDailyRecords(days) {
    const range = getDateWindow(days || 28);
    const allowedDates = new Set(range);
    const [habits, habitLogs, sessions, plans, checkins] = await Promise.all([
      listHabits(),
      readAll(STORE.habitLogs),
      readAll(STORE.pomodoroSessions),
      readAll(STORE.dailyPlans),
      readAll(STORE.dailyCheckins),
    ]);
    const logsInRange = habitLogs.filter((log) => allowedDates.has(log.date));
    const completedLogs = logsInRange.filter((log) => log.completed);
    const sessionsByDate = new Map();
    sessions.filter((session) => session.phase === 'focus' && allowedDates.has(dateKey(session.completedAt)))
      .forEach((session) => {
        const key = dateKey(session.completedAt);
        const current = sessionsByDate.get(key) || { minutes: 0, sessions: 0 };
        current.minutes += Number(session.actualMinutes || 0);
        current.sessions += 1;
        sessionsByDate.set(key, current);
      });
    const plansByDate = new Map(plans.map((plan) => [plan.date, plan]));
    const checkinsByDate = new Map(checkins.map((entry) => [entry.date, entry]));

    return range.map((date) => {
      const activeHabits = habits.filter((habit) => !habit.archivedAt && createdOnOrBefore(habit, date));
      const doneIds = new Set(completedLogs.filter((log) => log.date === date).map((log) => log.habitId));
      const hasHabitLog = activeHabits.length > 0 && logsInRange.some((log) => (
        log.date === date && activeHabits.some((habit) => habit.id === log.habitId)
      ));
      const focus = sessionsByDate.get(date) || { minutes: 0, sessions: 0 };
      const plan = plansByDate.get(date) || null;
      const checkin = checkinsByDate.get(date) || null;
      return {
        date,
        focusMinutes: focus.minutes,
        focusSessions: focus.sessions,
        habitsPossible: activeHabits.length,
        habitsDone: activeHabits.filter((habit) => doneIds.has(habit.id)).length,
        habitRate: hasHabitLog
          ? Math.round((activeHabits.filter((habit) => doneIds.has(habit.id)).length / activeHabits.length) * 100)
          : null,
        priorityChosen: Boolean(plan && plan.priority),
        priorityDone: Boolean(plan && plan.priority && plan.priority.status === 'done'),
        energy: checkin && Number.isInteger(checkin.energy) ? checkin.energy : null,
      };
    });
  }

  function average(records, field) {
    if (!records.length) return 0;
    return Math.round(records.reduce((total, record) => total + Number(record[field] || 0), 0) / records.length);
  }

  async function getActivityHabitInsights(days) {
    const records = await getDailyRecords(days || 28);
    const energyRecords = records.filter((record) => record.energy !== null);
    const enoughDays = energyRecords.length >= 7;

    if (enoughDays) {
      const highEnergy = energyRecords.filter((record) => record.energy >= 4);
      const lowEnergy = energyRecords.filter((record) => record.energy <= 2);
      if (highEnergy.length >= 3 && lowEnergy.length >= 3) {
        const highAverage = average(highEnergy, 'focusMinutes');
        const lowAverage = average(lowEnergy, 'focusMinutes');
        if (Math.abs(highAverage - lowAverage) >= 10) {
          const higher = highAverage > lowAverage ? 'alta' : 'baja';
          return {
            status: 'ready',
            kind: 'energy_focus',
            evidence: `En ${highEnergy.length} días con energía alta registraste una media de ${highAverage} min de foco; en ${lowEnergy.length} días con energía baja, ${lowAverage} min.`,
            caveat: 'Es una coincidencia en tus registros, no una causa demostrada.',
            suggestion: `Durante 7 días, prueba reservar tu primer bloque breve cuando anotes energía ${higher}; después revisa si te sirve.`,
            sampleSize: highEnergy.length + lowEnergy.length,
            dates: [...highEnergy, ...lowEnergy].map((record) => record.date),
          };
        }
      }
    }

    const habitRecords = records.filter((record) => record.habitRate !== null);
    if (habitRecords.length >= 7) {
      const registered = habitRecords.filter((record) => record.habitRate >= 50);
      const sparse = habitRecords.filter((record) => record.habitRate < 50);
      if (registered.length >= 3 && sparse.length >= 3) {
        const registeredAverage = average(registered, 'focusMinutes');
        const sparseAverage = average(sparse, 'focusMinutes');
        if (Math.abs(registeredAverage - sparseAverage) >= 10) {
          return {
            status: 'ready',
            kind: 'habit_focus',
            evidence: `En ${registered.length} días con al menos la mitad de tus hábitos registrados, anotaste ${registeredAverage} min de foco de media; en ${sparse.length} días con menos registros, ${sparseAverage} min.`,
            caveat: 'Es una coincidencia en tus registros, no una causa demostrada.',
            suggestion: 'Elige un solo hábito muy pequeño para hacer antes de tu primer bloque durante 7 días y observa si cambia algo.',
            sampleSize: registered.length + sparse.length,
            dates: [...registered, ...sparse].map((record) => record.date),
          };
        }
      }
    }

    const priorityRecords = records.filter((record) => record.priorityChosen);
    if (priorityRecords.length >= 7) {
      const completed = priorityRecords.filter((record) => record.priorityDone);
      const open = priorityRecords.filter((record) => !record.priorityDone);
      if (completed.length >= 3 && open.length >= 3) {
        return {
          status: 'ready',
          kind: 'priority_practice',
          evidence: `Elegiste una prioridad en ${priorityRecords.length} días; la marcaste como hecha en ${completed.length}.`,
          caveat: 'Esto describe tus registros, no mide tu valor ni explica todo lo que pasó.',
          suggestion: 'Durante la próxima semana, formula la prioridad como un paso que pueda caber en un bloque breve y revisa si resulta más amable de empezar.',
          sampleSize: priorityRecords.length,
          dates: priorityRecords.map((record) => record.date),
        };
      }
    }

    const recordedDays = Math.max(energyRecords.length, habitRecords.length, priorityRecords.length);
    return {
      status: 'collecting',
      recordedDays,
      message: recordedDays
        ? `Aún estoy reuniendo registros comparables (${recordedDays}/7 días).`
        : 'Aún no hay suficientes registros para buscar una relación útil.',
    };
  }

  const STOP_WORDS = new Set([
    'a', 'al', 'algo', 'con', 'como', 'de', 'del', 'el', 'en', 'es', 'esta', 'este', 'he', 'la', 'las',
    'lo', 'los', 'me', 'mi', 'mis', 'no', 'para', 'por', 'que', 'se', 'si', 'su', 'un', 'una', 'y', 'ya',
  ]);

  function normalizeForSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9ñü\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function searchTokens(value) {
    return [...new Set(normalizeForSearch(value)
      .split(' ')
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
  }

  function excerptForQuery(text, tokens) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeForSearch(source);
    const found = tokens.map((token) => normalized.indexOf(token)).find((index) => index >= 0);
    if (found === undefined) return source.slice(0, 220);
    const start = Math.max(0, found - 72);
    const end = Math.min(source.length, found + 180);
    return `${start ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  }

  function scoreMemoryDocument(document, tokens, normalizedQuery) {
    const normalized = normalizeForSearch(`${document.title} ${document.text}`);
    let score = 0;
    tokens.forEach((token) => {
      const matches = normalized.split(token).length - 1;
      score += matches ? 1 + Math.min(matches - 1, 2) * 0.3 : 0;
    });
    if (normalizedQuery.length > 3 && normalized.includes(normalizedQuery)) score += 2.5;
    if (score <= 0) return 0;
    const date = parseDateKey(document.date);
    if (date) {
      const age = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
      score += Math.max(0, 0.5 - age / 730);
    }
    return score;
  }

  async function getMemoryDocuments(days) {
    const range = getDateWindow(days || 365);
    const earliest = range[0];
    const [dumps, plans, checkins, sessions, habits, habitLogs] = await Promise.all([
      readAll(STORE.brainDumps),
      readAll(STORE.dailyPlans),
      readAll(STORE.dailyCheckins),
      readAll(STORE.pomodoroSessions),
      listHabits({ includeArchived: true }),
      readAll(STORE.habitLogs),
    ]);
    const documents = [];

    dumps.filter((dump) => dump.searchable !== false && dump.date >= earliest).forEach((dump) => {
      documents.push({
        id: `dump:${dump.id}`,
        sourceType: 'brain_dump',
        sourceId: dump.id,
        date: dump.date,
        title: 'Brain dump',
        text: dump.text,
      });
    });
    plans.filter((plan) => plan.priority && plan.priority.searchable !== false && plan.date >= earliest).forEach((plan) => {
      documents.push({
        id: `priority:${plan.date}`,
        sourceType: 'priority',
        sourceId: plan.date,
        date: plan.date,
        title: plan.priority.status === 'done' ? 'Prioridad completada' : 'Prioridad del día',
        text: plan.priority.text,
      });
    });
    checkins.filter((entry) => entry.searchable !== false && entry.date >= earliest).forEach((entry) => {
      if (Number.isInteger(entry.energy) && entry.searchableEnergy !== false) documents.push({
        id: `energy:${entry.date}`,
        sourceType: 'daily_energy',
        sourceId: entry.date,
        date: entry.date,
        title: 'Energía del día',
        text: `Energía registrada: ${entry.energy}/5.`,
      });
      if (entry.note && entry.searchableNote !== false) documents.push({
        id: `checkin:${entry.date}`,
        sourceType: 'daily_checkin',
        sourceId: entry.date,
        date: entry.date,
        title: 'Nota del día',
        text: entry.note,
      });
      if (entry.reflection && entry.searchableReflection !== false) documents.push({
        id: `reflection:${entry.date}`,
        sourceType: 'daily_reflection',
        sourceId: entry.date,
        date: entry.date,
        title: 'Cierre del día',
        text: entry.reflection,
      });
    });
    sessions.filter((session) => session.searchable !== false && session.phase === 'focus' && dateKey(session.completedAt) >= earliest && session.taskTitle).forEach((session) => {
      documents.push({
        id: `focus:${session.id}`,
        sourceType: 'focus_session',
        sourceId: session.id,
        date: dateKey(session.completedAt),
        title: `${session.actualMinutes || session.plannedMinutes || 0} min de foco`,
        text: session.taskTitle,
      });
    });
    const habitNames = new Map(habits.map((habit) => [habit.id, habit.name]));
    habitLogs.filter((log) => log.searchable !== false && log.completed && log.date >= earliest && habitNames.has(log.habitId)).forEach((log) => {
      documents.push({
        id: `habit:${log.id}`,
        sourceType: 'habit_log',
        sourceId: log.id,
        date: log.date,
        title: 'Hábito registrado',
        text: habitNames.get(log.habitId),
      });
    });
    return documents;
  }

  async function searchMemory(input) {
    const query = cleanText(input && input.query, 300);
    const tokens = searchTokens(query);
    if (!query || !tokens.length) throw new Error('Escribe una pregunta o una palabra concreta para buscar en tus recuerdos.');
    const limit = clampInteger(input && input.limit, 1, 10, 6);
    const days = clampInteger(input && input.days, 1, 3650, 365);
    const normalizedQuery = normalizeForSearch(query);
    const documents = await getMemoryDocuments(days);
    const sources = documents
      .map((document) => ({ ...document, score: scoreMemoryDocument(document, tokens, normalizedQuery) }))
      .filter((document) => document.score > 0)
      .sort((left, right) => right.score - left.score || right.date.localeCompare(left.date))
      .slice(0, limit)
      .map((document) => ({
        ...document,
        excerpt: excerptForQuery(document.text, tokens),
      }));
    return { query, searchedDays: days, sources };
  }

  async function excludeMemorySource(sourceType, sourceId) {
    const mappings = {
      brain_dump: STORE.brainDumps,
      priority: STORE.dailyPlans,
      daily_energy: STORE.dailyCheckins,
      daily_checkin: STORE.dailyCheckins,
      daily_reflection: STORE.dailyCheckins,
      focus_session: STORE.pomodoroSessions,
      habit_log: STORE.habitLogs,
    };
    const storeName = mappings[sourceType];
    if (!storeName) throw new Error('Ese tipo de recuerdo no se puede excluir todavía.');
    const record = await readOne(storeName, sourceId);
    if (!record) throw new Error('No encontré ese recuerdo.');

    let updated;
    if (sourceType === 'priority') {
      updated = { ...record, priority: { ...record.priority, searchable: false }, updatedAt: Date.now() };
    } else if (sourceType === 'daily_energy') {
      updated = { ...record, searchableEnergy: false, updatedAt: Date.now() };
    } else if (sourceType === 'daily_checkin') {
      updated = { ...record, searchableNote: false, updatedAt: Date.now() };
    } else if (sourceType === 'daily_reflection') {
      updated = { ...record, searchableReflection: false, updatedAt: Date.now() };
    } else {
      updated = { ...record, searchable: false, updatedAt: Date.now() };
    }
    await writeOne(storeName, updated);
    return updated;
  }

  function detectSafetyRisk(text) {
    return /(suicid|quitarme\s+la\s+vida|matarme|hacerme\s+dañ|autolesion|lastimar\s+a\s+alguien|matar\s+a\s+alguien|peligro\s+inmediato)/i.test(String(text || ''));
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

  async function getDailyModeData(requestedDate) {
    const day = resolveRequestedDate(requestedDate);
    const [plan, checkin, inboxIdeas] = await Promise.all([
      getDailyPlan(day),
      getDailyCheckin(day),
      getInboxIdeas(8),
    ]);
    return { date: day, plan, checkin, inboxIdeas };
  }

  async function getDashboardData() {
    const [habits, habitMetrics, focusMetrics, activeTimer, preferences, dailyMode] = await Promise.all([
      getHabitStatesForDate(localTodayKey()),
      getHabitMetrics(7),
      getFocusMetrics(7),
      getActiveTimer(),
      getSetting('preferences', { focusMinutes: 15, breakMinutes: 5, taskTitle: '' }),
      getDailyModeData(localTodayKey()),
    ]);

    return {
      today: localTodayKey(),
      habits,
      habitMetrics,
      focusMetrics,
      activeTimer: getTimerStatus(activeTimer),
      preferences,
      dailyMode,
    };
  }

  async function exportData() {
    const [habits, habitLogs, pomodoroSessions, brainDumps, dailyPlans, dailyCheckins, settings] = await Promise.all([
      readAll(STORE.habits),
      readAll(STORE.habitLogs),
      readAll(STORE.pomodoroSessions),
      readAll(STORE.brainDumps),
      readAll(STORE.dailyPlans),
      readAll(STORE.dailyCheckins),
      readAll(STORE.settings),
    ]);
    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      habits,
      habitLogs,
      pomodoroSessions,
      brainDumps,
      dailyPlans,
      dailyCheckins,
      settings,
    };
  }

  global.FocusStore = {
    DB_NAME,
    archiveHabit,
    archiveBrainDump,
    clampInteger,
    completeTimer,
    completeDailyPriority,
    createHabit,
    createBrainDump,
    dateKey,
    detectSafetyRisk,
    discardTimer,
    excludeMemorySource,
    exportData,
    getActiveTimer,
    getActivityHabitInsights,
    getDashboardData,
    getDailyCheckin,
    getDailyModeData,
    getDailyPlan,
    getDailyRecords,
    getDateWindow,
    getFocusMetrics,
    getHabitMetrics,
    getHabitStatesForDate,
    getSetting,
    getTimerStatus,
    getInboxIdeas,
    listBrainDumps,
    listHabits,
    localTodayKey,
    pauseTimer,
    resolveRequestedDate,
    resumeTimer,
    searchMemory,
    setDailyPriority,
    setHabitCompletion,
    setSetting,
    startTimer,
    upsertDailyCheckin,
  };
}(window));
