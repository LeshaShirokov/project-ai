/* Хранилище проектов: localStorage, валидация, демо-данные, импорт/экспорт */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils;

  var STORAGE_KEY = 'itpd.projects.v1';
  var INIT_KEY = 'itpd.initialized';

  var STATUSES = [
    { id: 'idea', label: 'Идея', color: '#a78bfa' },
    { id: 'planning', label: 'В планировании', color: '#38bdf8' },
    { id: 'active', label: 'В работе', color: '#6366f1' },
    { id: 'paused', label: 'На паузе', color: '#f59e0b' },
    { id: 'done', label: 'Завершён', color: '#10b981' },
    { id: 'cancelled', label: 'Отменён', color: '#94a3b8' }
  ];
  var PRIORITIES = [
    { id: 'low', label: 'Низкий', weight: 1 },
    { id: 'medium', label: 'Средний', weight: 2 },
    { id: 'high', label: 'Высокий', weight: 3 },
    { id: 'critical', label: 'Критичный', weight: 4 }
  ];
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function statusLabel(id) { var s = byId(STATUSES, id); return s ? s.label : id; }
  function priorityLabel(id) { var p = byId(PRIORITIES, id); return p ? p.label : id; }
  function priorityWeight(id) { var p = byId(PRIORITIES, id); return p ? p.weight : 0; }

  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
  function num(v, min, max) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(n)) n = 0;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return n;
  }

  function normalizeTask(t) {
    if (!t || typeof t !== 'object') return null;
    var text = str(t.text, 200);
    if (!text) return null;
    // due — необязательный срок закрытия (YYYY-MM-DD); старые задачи без срока остаются как есть
    var due = typeof t.due === 'string' && U.isValidDate(t.due.trim()) ? t.due.trim() : '';
    return { id: str(t.id, 60) || U.uid('t'), text: text, done: !!t.done, due: due };
  }

  /** Открытая задача со сроком в прошлом. */
  function isTaskOverdue(t) {
    if (!t || t.done || !t.due) return false;
    var d = U.daysUntil(t.due);
    return d !== null && d < 0;
  }

  function taskProgress(tasks) {
    if (!tasks || !tasks.length) return 0;
    var done = tasks.filter(function (t) { return t.done; }).length;
    return Math.round(done / tasks.length * 100);
  }

  /** Список ID контактов-участников (без дублей). */
  function normalizeIds(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    return list.map(function (x) { return str(x, 60); }).filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true; return true;
    }).slice(0, 50);
  }

  /** Приводит произвольный объект к корректной структуре проекта. */
  function normalize(p) {
    p = p || {};
    var tasks = Array.isArray(p.tasks) ? p.tasks.map(normalizeTask).filter(Boolean).slice(0, 200) : [];
    var out = {
      id: str(p.id, 60) || U.uid('p'),
      name: str(p.name, 120) || 'Без названия',
      client: str(p.client, 120),
      description: str(p.description, 2000),
      status: byId(STATUSES, p.status) ? p.status : 'idea',
      priority: byId(PRIORITIES, p.priority) ? p.priority : 'medium',
      stack: U.splitList(p.stack),
      team: U.splitList(p.team),
      teamIds: normalizeIds(p.teamIds),
      start: U.isValidDate(p.start) ? p.start : '',
      deadline: U.isValidDate(p.deadline) ? p.deadline : '',
      budget: Math.round(num(p.budget, 0, 1e12)),
      spent: Math.round(num(p.spent, 0, 1e12)),
      progress: Math.round(num(p.progress, 0, 100)),
      autoProgress: !!p.autoProgress,
      repo: U.isHttpUrl(p.repo) ? str(p.repo, 500) : '',
      tags: U.splitList(p.tags),
      tasks: tasks,
      createdAt: str(p.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(p.updatedAt, 40) || new Date().toISOString()
    };
    if (out.autoProgress && out.tasks.length) out.progress = taskProgress(out.tasks);
    return out;
  }

  /** Проверка данных формы. Возвращает объект ошибок {поле: сообщение}. */
  function validate(d) {
    var e = {};
    if (!str(d.name)) e.name = 'Укажите название проекта';
    else if (String(d.name).trim().length > 120) e.name = 'Не длиннее 120 символов';
    if (d.start && !U.isValidDate(d.start)) e.start = 'Некорректная дата';
    if (d.deadline && !U.isValidDate(d.deadline)) e.deadline = 'Некорректная дата';
    if (!e.start && !e.deadline && d.start && d.deadline && d.deadline < d.start) e.deadline = 'Дедлайн раньше даты начала';
    ['budget', 'spent'].forEach(function (k) {
      if (d[k] === '' || d[k] == null) return;
      var n = parseFloat(String(d[k]).replace(/\s/g, '').replace(',', '.'));
      if (!isFinite(n) || n < 0) e[k] = 'Введите неотрицательное число';
    });
    if (d.progress !== '' && d.progress != null) {
      var p = Number(d.progress);
      if (!isFinite(p) || p < 0 || p > 100) e.progress = 'От 0 до 100';
    }
    if (d.repo && !U.isHttpUrl(String(d.repo).trim())) e.repo = 'Только адреса http:// или https://';
    if (d.status && !byId(STATUSES, d.status)) e.status = 'Неизвестный статус';
    if (d.priority && !byId(PRIORITIES, d.priority)) e.priority = 'Неизвестный приоритет';
    return e;
  }

  /* ---------- Демо-данные ---------- */
  function demoProjects() {
    var D = U.addDays;
    // [текст, выполнена, срок — смещение в днях от сегодня (необязательно)]
    function tasks(list) { return list.map(function (t) { return { id: U.uid('t'), text: t[0], done: !!t[1], due: typeof t[2] === 'number' ? D(t[2]) : '' }; }); }
    var raw = [
      { name: 'CRM для отдела продаж', client: 'ООО «ТехноСервис»', description: 'Внутренняя CRM: воронка сделок, интеграция с телефонией и 1С.', status: 'active', priority: 'high', stack: 'TypeScript, React, Node.js, PostgreSQL', team: 'Анна Петрова, Игорь Смирнов, Олег Ким', start: D(-90), deadline: D(21), budget: 2400000, spent: 1650000, progress: 62, repo: 'https://github.com/example/crm-sales', tags: 'b2b, внутренний',
        tasks: tasks([['Модуль сделок', 1, -35], ['Интеграция с телефонией', 1, -6], ['Отчёты для руководителя', 0, 2], ['Синхронизация с 1С', 0, 12], ['Нагрузочное тестирование', 0, 18]]), autoProgress: false },
      { name: 'Мобильное приложение доставки', client: 'FoodExpress', description: 'iOS/Android приложение для курьеров и клиентов с трекингом заказа.', status: 'active', priority: 'critical', stack: 'Kotlin, Swift, Go, Redis', team: 'Мария Иванова, Дмитрий Орлов', start: D(-60), deadline: D(-4), budget: 3800000, spent: 3950000, progress: 81, repo: 'https://github.com/example/delivery-app', tags: 'mobile, b2c',
        tasks: tasks([['Экран заказа', 1, -30], ['Трекинг курьера', 1, -14], ['Оплата картой', 1, -7], ['Push-уведомления', 0, -2], ['Публикация в сторах', 0, 0]]), autoProgress: false },
      { name: 'Миграция в Kubernetes', client: 'Внутренний ИТ', description: 'Перенос монолита и 12 сервисов в managed Kubernetes, настройка CI/CD.', status: 'planning', priority: 'medium', stack: 'Kubernetes, Docker, Terraform, Go', team: 'Сергей Волков, Павел Зайцев', start: D(10), deadline: D(120), budget: 1500000, spent: 120000, progress: 10, repo: 'https://gitlab.com/example/infra', tags: 'devops, инфраструктура',
        tasks: tasks([['Аудит сервисов', 1, -3], ['Terraform-модули', 0, 25], ['Пилотный кластер', 0, 45]]), autoProgress: true },
      { name: 'Портал самообслуживания клиентов', client: 'Банк «Северный»', description: 'Личный кабинет: заявки, документы, чат с поддержкой.', status: 'done', priority: 'high', stack: 'Java, Spring, React, PostgreSQL', team: 'Елена Соколова, Артём Новиков, Ирина Лебедева', start: D(-240), deadline: D(-30), budget: 5200000, spent: 4870000, progress: 100, repo: 'https://github.com/example/self-service', tags: 'fintech, b2c',
        tasks: tasks([['Авторизация', 1, -120], ['Документы', 1, -70], ['Чат поддержки', 1, -35]]), autoProgress: true },
      { name: 'ML-скоринг лидов', client: 'ООО «ТехноСервис»', description: 'Модель оценки вероятности сделки на основе истории CRM.', status: 'idea', priority: 'low', stack: 'Python, PostgreSQL, Docker', team: 'Наталья Морозова', start: '', deadline: D(180), budget: 900000, spent: 0, progress: 0, repo: '', tags: 'ml, аналитика', tasks: [], autoProgress: false },
      { name: 'Редизайн корпоративного сайта', client: 'Маркетинг', description: 'Новый дизайн, headless CMS, ускорение загрузки и SEO.', status: 'paused', priority: 'low', stack: 'TypeScript, Next.js, Figma', team: 'Ольга Кузнецова, Максим Попов', start: D(-45), deadline: D(30), budget: 700000, spent: 310000, progress: 35, repo: 'https://github.com/example/site', tags: 'маркетинг',
        tasks: tasks([['Дизайн-макеты', 1, -20], ['Перенос контента', 0, 9], ['SEO-аудит', 0]]), autoProgress: false },
      { name: 'Система мониторинга и алертинга', client: 'Внутренний ИТ', description: 'Prometheus + Grafana, дежурства, SLO для ключевых сервисов.', status: 'active', priority: 'high', stack: 'Go, Prometheus, Grafana, Kubernetes', team: 'Павел Зайцев, Сергей Волков', start: D(-30), deadline: D(6), budget: 850000, spent: 540000, progress: 67, repo: 'https://github.com/example/monitoring', tags: 'devops, sre',
        tasks: tasks([['Экспортеры метрик', 1, -16], ['Дашборды Grafana', 1, -1], ['Правила алертов', 0, 1], ['Регламент дежурств', 0, 5]]), autoProgress: true },
      { name: 'Интеграция с маркетплейсами', client: 'ТД «Горизонт»', description: 'Выгрузка остатков и заказов в Ozon и Wildberries.', status: 'active', priority: 'medium', stack: 'Python, FastAPI, Redis, PostgreSQL', team: 'Артём Новиков, Олег Ким', start: D(-20), deadline: D(-1), budget: 1100000, spent: 820000, progress: 74, repo: 'https://github.com/example/marketplaces', tags: 'e-commerce, интеграции',
        tasks: tasks([['API Ozon', 1, -12], ['API Wildberries', 1, -5], ['Синхронизация остатков', 0, -1]]), autoProgress: false },
      { name: 'Чат-бот поддержки', client: 'Банк «Северный»', description: 'Бот для частых вопросов с передачей оператору.', status: 'cancelled', priority: 'medium', stack: 'Python, Docker', team: 'Наталья Морозова', start: D(-150), deadline: D(-60), budget: 600000, spent: 180000, progress: 25, repo: '', tags: 'fintech, ai', tasks: [], autoProgress: false },
      { name: 'Хранилище данных (DWH)', client: 'Финансовый департамент', description: 'ETL из учётных систем, витрины для BI и управленческой отчётности.', status: 'planning', priority: 'critical', stack: 'Python, ClickHouse, Airflow, Docker', team: 'Ирина Лебедева, Дмитрий Орлов', start: D(3), deadline: D(14), budget: 2900000, spent: 250000, progress: 5, repo: 'https://github.com/example/dwh', tags: 'аналитика, bi',
        tasks: tasks([['Сбор требований', 1, -2], ['Архитектура', 0, 4], ['ETL-процессы', 0, 10], ['Витрины', 0, 14]]), autoProgress: false }
    ];
    return raw.map(normalize);
  }

  /* ---------- Состояние ---------- */
  var projects = [];
  var listeners = [];
  var storageOk = true;

  function emit(reason) { listeners.forEach(function (fn) { try { fn(reason); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  function readStorage() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      var data = JSON.parse(raw);
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : []);
      return list.map(normalize);
    } catch (e) { console.warn('Не удалось прочитать данные', e); return []; }
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: projects }));
      global.localStorage.setItem(INIT_KEY, '1');
      storageOk = true;
    } catch (e) { storageOk = false; console.warn('Не удалось сохранить данные', e); }
    return storageOk;
  }

  /** Первичная загрузка. На первом запуске подставляются демо-данные. */
  function load() {
    var stored = readStorage();
    var initialized = false;
    try { initialized = global.localStorage.getItem(INIT_KEY) === '1'; } catch (e) { /* noop */ }
    if (stored === null && !initialized) { projects = demoProjects(); save(); }
    else projects = stored || [];
    emit('load');
    return projects;
  }

  /** Перечитать хранилище (например, после изменения в другой вкладке). */
  function reload() { projects = readStorage() || []; emit('sync'); }

  function all() { return projects.slice(); }
  function get(id) { for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i]; return null; }
  function indexOf(id) { for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return i; return -1; }

  function create(data) {
    var errors = validate(data);
    if (Object.keys(errors).length) { var err = new Error('validation'); err.errors = errors; throw err; }
    var p = normalize(Object.assign({}, data, { id: U.uid('p'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    projects.push(p); save(); emit('create');
    return p;
  }

  function update(id, data) {
    var i = indexOf(id);
    if (i < 0) return null;
    var merged = Object.assign({}, projects[i], data, { id: id, createdAt: projects[i].createdAt, updatedAt: new Date().toISOString() });
    var errors = validate(merged);
    if (Object.keys(errors).length) { var err = new Error('validation'); err.errors = errors; throw err; }
    projects[i] = normalize(merged); save(); emit('update');
    return projects[i];
  }

  function remove(id) {
    var i = indexOf(id);
    if (i < 0) return false;
    projects.splice(i, 1); save(); emit('remove');
    return true;
  }

  function setStatus(id, status) {
    if (!byId(STATUSES, status)) return null;
    var p = get(id);
    if (!p || p.status === status) return p;
    var patch = { status: status };
    if (status === 'done' && !p.autoProgress) patch.progress = 100;
    return update(id, patch);
  }

  function mutateTasks(id, fn) {
    var p = get(id);
    if (!p) return null;
    var tasks = p.tasks.map(function (t) { return Object.assign({}, t); });
    fn(tasks);
    return update(id, { tasks: tasks });
  }
  /** Новая задача; due — необязательный срок (YYYY-MM-DD). Возвращает {project, task} или null. */
  function addTask(id, text, due) {
    text = str(text, 200);
    if (!text) return null;
    var task = { id: U.uid('t'), text: text, done: false, due: U.isValidDate(due) ? due : '' };
    var p = mutateTasks(id, function (tasks) { tasks.push(task); });
    return p ? { project: p, task: findTask(p, task.id) } : null;
  }
  function findTask(p, taskId) {
    if (!p) return null;
    for (var i = 0; i < p.tasks.length; i++) if (p.tasks[i].id === taskId) return p.tasks[i];
    return null;
  }
  function getTask(id, taskId) { return findTask(get(id), taskId); }
  /** Срок задачи: дата YYYY-MM-DD или '' — убрать срок. */
  function setTaskDue(id, taskId, due) {
    due = U.isValidDate(due) ? due : '';
    return mutateTasks(id, function (tasks) {
      tasks.forEach(function (t) { if (t.id === taskId) t.due = due; });
    });
  }
  function toggleTask(id, taskId, done) {
    return mutateTasks(id, function (tasks) {
      tasks.forEach(function (t) { if (t.id === taskId) t.done = done === undefined ? !t.done : !!done; });
    });
  }
  function removeTask(id, taskId) {
    return mutateTasks(id, function (tasks) {
      var i = tasks.findIndex(function (t) { return t.id === taskId; });
      if (i >= 0) tasks.splice(i, 1);
    });
  }
  function setAutoProgress(id, on) { return update(id, { autoProgress: !!on }); }

  /**
   * Пакетное изменение команд проектов (миграция имён, удаление контакта).
   * fn(project) возвращает {team, teamIds} или null, если менять нечего.
   * Сохраняет один раз; возвращает число изменённых проектов.
   */
  function mapTeams(fn) {
    var changed = 0;
    projects = projects.map(function (p) {
      var patch = fn(p);
      if (!patch) return p;
      var next = normalize(Object.assign({}, p, patch, { updatedAt: new Date().toISOString() }));
      if (JSON.stringify(next.team) === JSON.stringify(p.team) && JSON.stringify(next.teamIds) === JSON.stringify(p.teamIds)) return p;
      changed++;
      return next;
    });
    if (changed) { save(); emit('update'); }
    return changed;
  }

  function loadDemo() { projects = demoProjects(); save(); emit('demo'); }
  function clearAll() { projects = []; save(); emit('clear'); }

  /* ---------- Импорт / экспорт ---------- */
  /** extra — дополнительные разделы резервной копии (например, contacts). Формат проектов не меняется. */
  function exportJSON(extra) {
    return JSON.stringify(Object.assign({ app: 'it-projects-dashboard', version: 1, exportedAt: new Date().toISOString(), projects: projects }, extra || {}), null, 2);
  }

  /** Импорт резервной копии. mode: 'replace' | 'merge'. Возвращает число импортированных проектов. */
  function importJSON(text, mode) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Файл не является корректным JSON'); }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : null);
    if (!list) throw new Error('В файле не найден список проектов');
    var items = list.filter(function (x) { return x && typeof x === 'object'; }).slice(0, 5000).map(normalize);
    if (mode === 'merge') {
      items.forEach(function (p) {
        var i = indexOf(p.id);
        if (i >= 0) projects[i] = p; else projects.push(p);
      });
    } else {
      projects = items;
    }
    save(); emit('import');
    return items.length;
  }

  /** teamNames(p) — имена участников (контакты + имена без контакта); по умолчанию только p.team. */
  function exportCSV(teamNames) {
    var header = ['Название', 'Клиент/владелец', 'Описание', 'Статус', 'Приоритет', 'Стек', 'Команда', 'Начало', 'Дедлайн', 'Бюджет', 'Потрачено', 'Прогресс, %', 'Репозиторий', 'Теги', 'Задач всего', 'Задач выполнено', 'Просроченных задач', 'Ближайший срок задачи'];
    var rows = projects.map(function (p) {
      return [p.name, p.client, p.description, statusLabel(p.status), priorityLabel(p.priority), p.stack.join(', '), (teamNames ? teamNames(p) : p.team).join(', '),
        p.start, p.deadline, p.budget, p.spent, p.progress, p.repo, p.tags.join(', '), p.tasks.length,
        p.tasks.filter(function (t) { return t.done; }).length, p.tasks.filter(isTaskOverdue).length, nextTaskDue(p)];
    });
    return '\uFEFF' + U.toCSV([header].concat(rows));
  }

  /** Самый ранний срок среди открытых задач проекта ('' — нет). */
  function nextTaskDue(p) {
    var best = '';
    p.tasks.forEach(function (t) { if (!t.done && t.due && (!best || t.due < best)) best = t.due; });
    return best;
  }

  /* ---------- Аналитика ---------- */
  function isOverdue(p) {
    if (!p.deadline || p.status === 'done' || p.status === 'cancelled') return false;
    var d = U.daysUntil(p.deadline);
    return d !== null && d < 0;
  }
  function stats(list) {
    list = list || projects;
    var budget = 0, spent = 0, progress = 0;
    list.forEach(function (p) { budget += p.budget; spent += p.spent; progress += p.progress; });
    return {
      total: list.length,
      active: list.filter(function (p) { return p.status === 'active'; }).length,
      done: list.filter(function (p) { return p.status === 'done'; }).length,
      overdue: list.filter(isOverdue).length,
      budget: budget,
      spent: spent,
      spentPct: budget ? Math.round(spent / budget * 100) : 0,
      avgProgress: list.length ? Math.round(progress / list.length) : 0
    };
  }

  PD.store = {
    STORAGE_KEY: STORAGE_KEY, STATUSES: STATUSES, PRIORITIES: PRIORITIES,
    statusLabel: statusLabel, priorityLabel: priorityLabel, priorityWeight: priorityWeight, statusById: function (id) { return byId(STATUSES, id); },
    normalize: normalize, validate: validate, taskProgress: taskProgress, demoProjects: demoProjects,
    load: load, reload: reload, save: save, subscribe: subscribe, all: all, get: get,
    create: create, update: update, remove: remove, setStatus: setStatus, mapTeams: mapTeams,
    addTask: addTask, toggleTask: toggleTask, setTaskDue: setTaskDue, getTask: getTask, isTaskOverdue: isTaskOverdue, nextTaskDue: nextTaskDue, removeTask: removeTask, setAutoProgress: setAutoProgress,
    loadDemo: loadDemo, clearAll: clearAll, exportJSON: exportJSON, importJSON: importJSON, exportCSV: exportCSV,
    isOverdue: isOverdue, stats: stats,
    storageOk: function () { return storageOk; }
  };
})(window);
