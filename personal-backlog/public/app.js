let tasks = [];
let habits = [];
let editingTaskId = null;
let selectedPriority = 'A';

const SECTIONS = [
  { key: 'today',     label: 'Today',      emoji: '⚡' },
  { key: 'thisWeek',  label: 'This Week',  emoji: '📅' },
  { key: 'thisMonth', label: 'This Month', emoji: '🗓️' },
  { key: 'backlog',   label: 'Backlog',    emoji: '📋' },
  { key: 'completed', label: 'Completed',  emoji: '✅' },
];

const collapsedSections = new Set(['completed']);

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const today = todayStr();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);

  const d = new Date(dateStr + 'T00:00:00');
  if (dateStr === today) return { label: 'Today', cls: 'today' };
  if (dateStr === tomorrowStr) return { label: 'Tomorrow', cls: 'soon' };
  if (dateStr < today) return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'overdue' };
  if (d <= in7) return { label: d.toLocaleDateString('en-GB', { weekday: 'long' }), cls: 'soon' };
  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: '' };
}

function formatHeaderDate() {
  const d = new Date();
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── API ───────────────────────────────────────────────────────────────────────

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderBoard() {
  const board = document.getElementById('taskBoard');
  board.innerHTML = '';

  for (const section of SECTIONS) {
    const sectionTasks = tasks.filter(t => t.section === section.key);
    const isCollapsed = collapsedSections.has(section.key);

    const el = document.createElement('div');
    el.className = 'task-section';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <div class="section-title">
        <span>${section.emoji} ${section.label}</span>
        <span class="section-count">${sectionTasks.length}</span>
      </div>
      <span class="section-chevron">${isCollapsed ? '▸' : '▾'}</span>
    `;
    header.addEventListener('click', () => {
      if (collapsedSections.has(section.key)) collapsedSections.delete(section.key);
      else collapsedSections.add(section.key);
      renderBoard();
    });
    el.appendChild(header);

    if (!isCollapsed) {
      const body = document.createElement('div');
      body.className = 'section-body';
      body.dataset.section = section.key;

      if (sectionTasks.length === 0) {
        body.innerHTML = `<div class="section-empty">No tasks here</div>`;
      } else {
        for (const task of sectionTasks) {
          body.appendChild(buildTaskRow(task));
        }
      }
      el.appendChild(body);

      Sortable.create(body, {
        group: 'tasks',
        animation: 150,
        ghostClass: 'task-ghost',
        dragClass: 'task-dragging',
        filter: '.section-empty',
        onAdd: async (evt) => {
          const taskId = parseInt(evt.item.dataset.id);
          const newSection = evt.to.dataset.section;
          const empty = evt.to.querySelector('.section-empty');
          if (empty) empty.remove();
          const updated = await api('PATCH', `/api/tasks/${taskId}`, { section: newSection });
          tasks = tasks.map(t => t.id === taskId ? updated : t);
          if (evt.from.querySelectorAll('.task-row').length === 0) {
            evt.from.innerHTML = `<div class="section-empty">No tasks here</div>`;
          }
        },
      });
    }

    board.appendChild(el);
  }
}

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row' + (task.completedAt ? ' completed' : '');
  row.dataset.id = task.id;

  const due = task.dueDate ? formatDate(task.dueDate) : null;

  row.innerHTML = `
    <button class="task-check ${task.completedAt ? 'done' : ''}" data-id="${task.id}"></button>
    <div class="task-name" data-id="${task.id}">${task.name}</div>
    ${task.notes ? `<div class="task-notes">${task.notes}</div>` : '<div class="task-notes-empty"></div>'}
    ${due ? `<div class="task-due ${due.cls}">${due.label}</div>` : ''}
    <span class="priority-badge ${task.priority}">${task.priority}</span>
    <button class="task-delete" data-id="${task.id}">×</button>
  `;

  row.querySelector('.task-check').addEventListener('click', () => toggleTask(task.id));
  row.querySelector('.task-name').addEventListener('click', () => openEditTask(task.id));
  row.querySelector('.task-delete').addEventListener('click', () => deleteTask(task.id));

  return row;
}

function renderHabits() {
  const list = document.getElementById('habitsList');
  list.innerHTML = '';

  if (habits.length === 0) {
    list.innerHTML = '<div class="habits-empty">No habits yet — add one!</div>';
    return;
  }

  const today = todayStr();
  for (const habit of habits) {
    const done = habit.completedDates.includes(today);
    const card = document.createElement('div');
    card.className = 'habit-card';
    card.innerHTML = `
      <button class="habit-toggle ${done ? 'done' : ''}" data-id="${habit.id}">
        ${habit.emoji}
      </button>
      <div class="habit-info">
        <div class="habit-name">${habit.name}</div>
        <div class="habit-stats">
          <span class="habit-streak">🔥 ${habit.streak} day streak</span>
          <span class="habit-best">Best: ${habit.bestStreak}</span>
        </div>
      </div>
      <button class="habit-delete" data-id="${habit.id}">×</button>
    `;
    card.querySelector('.habit-toggle').addEventListener('click', () => toggleHabit(habit.id));
    card.querySelector('.habit-delete').addEventListener('click', () => deleteHabit(habit.id));
    list.appendChild(card);
  }
}

// ── Task actions ──────────────────────────────────────────────────────────────

async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const completedAt = task.completedAt ? null : new Date().toISOString();
  const section = completedAt ? 'completed' : 'today';
  const updated = await api('PATCH', `/api/tasks/${id}`, { completedAt, section });
  tasks = tasks.map(t => t.id === id ? updated : t);
  renderBoard();
}

async function deleteTask(id) {
  await api('DELETE', `/api/tasks/${id}`);
  tasks = tasks.filter(t => t.id !== id);
  renderBoard();
}

function openEditTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('taskName').value = task.name;
  document.getElementById('taskSection').value = task.section;
  datePicker.setDate(task.dueDate || null);
  document.getElementById('taskNotes').value = task.notes || '';
  selectedPriority = task.priority;
  document.querySelectorAll('.priority-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.priority === selectedPriority);
  });
  document.getElementById('taskModal').classList.add('open');
}

// ── Habit actions ─────────────────────────────────────────────────────────────

async function toggleHabit(id) {
  const updated = await api('PATCH', `/api/habits/${id}/toggle`);
  habits = habits.map(h => h.id === id ? updated : h);
  renderHabits();
}

async function deleteHabit(id) {
  await api('DELETE', `/api/habits/${id}`);
  habits = habits.filter(h => h.id !== id);
  renderHabits();
}

// ── Task Modal ────────────────────────────────────────────────────────────────

document.getElementById('addTaskBtn').addEventListener('click', () => {
  editingTaskId = null;
  document.getElementById('taskModalTitle').textContent = 'Add Task';
  document.getElementById('taskName').value = '';
  document.getElementById('taskSection').value = 'today';
  datePicker.clear();
  document.getElementById('taskNotes').value = '';
  selectedPriority = 'A';
  document.querySelectorAll('.priority-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.priority === 'A');
  });
  document.getElementById('taskModal').classList.add('open');
  setTimeout(() => document.getElementById('taskName').focus(), 100);
});

document.querySelectorAll('.priority-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedPriority = btn.dataset.priority;
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('taskCancel').addEventListener('click', () => {
  document.getElementById('taskModal').classList.remove('open');
});

document.getElementById('taskSave').addEventListener('click', async () => {
  const name = document.getElementById('taskName').value.trim();
  if (!name) return;
  const section = document.getElementById('taskSection').value;
  const dueDate = document.getElementById('taskDueDate').value || null;
  const notes = document.getElementById('taskNotes').value.trim() || null;

  if (editingTaskId) {
    const updated = await api('PATCH', `/api/tasks/${editingTaskId}`, { name, section, priority: selectedPriority, dueDate, notes });
    tasks = tasks.map(t => t.id === editingTaskId ? updated : t);
  } else {
    const task = await api('POST', '/api/tasks', { name, section, priority: selectedPriority, dueDate, notes });
    tasks.push(task);
  }

  document.getElementById('taskModal').classList.remove('open');
  renderBoard();
});

// Enter key to save task
document.getElementById('taskName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('taskSave').click();
});

// ── Habit Modal ───────────────────────────────────────────────────────────────

document.getElementById('addHabitBtn').addEventListener('click', () => {
  document.getElementById('habitName').value = '';
  document.getElementById('habitEmoji').value = '';
  document.getElementById('habitModal').classList.add('open');
  setTimeout(() => document.getElementById('habitName').focus(), 100);
});

document.getElementById('habitCancel').addEventListener('click', () => {
  document.getElementById('habitModal').classList.remove('open');
});

document.getElementById('habitSave').addEventListener('click', async () => {
  const name = document.getElementById('habitName').value.trim();
  const emoji = document.getElementById('habitEmoji').value.trim() || '✅';
  if (!name) return;
  const habit = await api('POST', '/api/habits', { name, emoji });
  habits.push(habit);
  document.getElementById('habitModal').classList.remove('open');
  renderHabits();
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

const datePicker = flatpickr('#taskDueDate', {
  dateFormat: 'Y-m-d',
  altInput: true,
  altFormat: 'd/m/Y',
  minDate: 'today',
  disableMobile: true,
});

async function init() {
  document.getElementById('dateLabel').textContent = formatHeaderDate();

  [tasks, habits] = await Promise.all([
    api('GET', '/api/tasks'),
    api('GET', '/api/habits'),
  ]);

  renderBoard();
  renderHabits();
}

init();
