/* =========================================================
   TaskFlow - app.js
   ========================================================= */

/* ---------- IndexedDB ---------- */
var DB = {
  _db: null,
  open: function() {
    var self = this;
    if (self._db) return Promise.resolve(self._db);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open('taskflow_db', 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('sync_queue'))
          db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('tasks_cache'))
          db.createObjectStore('tasks_cache', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('projects_cache'))
          db.createObjectStore('projects_cache', { keyPath: 'id' });
      };
      req.onsuccess = function(e) { self._db = e.target.result; resolve(self._db); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  },
  getAll: function(store) {
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  },
  put: function(store, item) {
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var req = db.transaction(store, 'readwrite').objectStore(store).put(item);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  },
  putMany: function(store, items) {
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        var os = tx.objectStore(store);
        items.forEach(function(i) { os.put(i); });
        tx.oncomplete = function() { resolve(); };
        tx.onerror    = function() { reject(tx.error); };
      });
    });
  },
  remove: function(store, id) {
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
        req.onsuccess = function() { resolve(); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  },
  clear: function(store) {
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var req = db.transaction(store, 'readwrite').objectStore(store).clear();
        req.onsuccess = function() { resolve(); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }
};

/* ---------- Offline queue ---------- */
// Luu danh sach temp ID de nhan biet task chua sync
var OfflineIds = {
  _set: {},
  add: function(id) { this._set[id] = true; },
  has: function(id) { return !!this._set[id]; },
  clear: function()  { this._set = {}; }
};

/* ---------- API ---------- */
var API = {
  base: '/api',
  getToken: function() { return localStorage.getItem('tf_token') || ''; },
  request: function(method, path, body) {
    var opts = {
      method: method,
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': 'Bearer ' + this.getToken()
      }
    };
    if (body) opts.body = JSON.stringify(body);

    return fetch(this.base + path, opts).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.message || 'Request failed');
        return { ok: true, data: data };
      });
    }).catch(function(err) {
      // Neu la network error (offline) va la mutation -> queue lai
      var isNetErr = err instanceof TypeError;
      if (method !== 'GET' && isNetErr) {
        return DB.put('sync_queue', {
          url: API.base + path, method: method,
          body: body || null, ts: Date.now()
        }).then(function() {
          Toast.show('Đã lưu offline, sẽ sync khi có mạng', 'warning');
          return { ok: false, offline: true };
        });
      }
      throw err;
    });
  },
  get:  function(path)       { return this.request('GET',    path); },
  post: function(path, body) { return this.request('POST',   path, body); },
  put:  function(path, body) { return this.request('PUT',    path, body); },
  del:  function(path)       { return this.request('DELETE', path); }
};

/* ---------- Toast ---------- */
var Toast = {
  show: function(msg, type, duration) {
    type     = type     || 'info';
    duration = duration || 3500;
    var icons = { success: 'check-circle', warning: 'exclamation-triangle', danger: 'times-circle', info: 'info-circle' };
    var el = document.createElement('div');
    el.className = 'toast-item toast-' + type;
    el.innerHTML =
      '<i class="fas fa-' + icons[type] + '" style="color:var(--' + (type === 'info' ? 'primary' : type) + ')"></i>' +
      '<div style="flex:1;font-size:.875rem">' + msg + '</div>' +
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0 0 0 8px">&times;</button>';
    document.getElementById('toast-container').appendChild(el);
    setTimeout(function() { if (el.parentElement) el.remove(); }, duration);
  }
};

/* ---------- Helpers ---------- */
function getDeadlineInfo(dueDateStr) {
  if (!dueDateStr) return null;
  var now    = new Date();
  var due    = new Date(dueDateStr);
  var diffMs = due - now;
  var diffMin = Math.floor(diffMs / 60000);
  var diffH   = Math.floor(diffMs / 3600000);
  var diffD   = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    var ago = Math.abs(diffD);
    return { label: ago > 0 ? 'Quá hạn ' + ago + ' ngày' : 'Quá hạn hôm nay', cls: 'deadline-overdue' };
  }
  if (diffMin < 60) return { label: 'Còn ' + diffMin + ' phút', cls: 'deadline-urgent' };
  if (diffH  < 24)  return { label: 'Còn ' + diffH  + ' giờ',  cls: 'deadline-urgent' };
  if (diffD === 0)  return { label: 'Hôm nay',                  cls: 'deadline-urgent' };
  if (diffD === 1)  return { label: 'Ngày mai',                 cls: 'deadline-soon'   };
  if (diffD <= 7)   return { label: 'Còn ' + diffD + ' ngày',  cls: 'deadline-soon'   };
  return              { label: 'Còn ' + diffD + ' ngày',        cls: 'deadline-ok'     };
}

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function priorityLabel(p) {
  var map = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
  return '<span class="badge-priority badge-' + p + '">' + (map[p] || p) + '</span>';
}

function statusLabel(s) {
  var map = { todo: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành' };
  return '<span class="badge-status badge-' + s + '">' + (map[s] || s) + '</span>';
}

function isPendingOffline(task) {
  return task._isOffline === true || OfflineIds.has(task.id);
}

function renderTaskCard(task, compact) {
  var dl        = getDeadlineInfo(task.due_date);
  var isDone    = task.status === 'done';
  var isOffline = isPendingOffline(task);

  var projectBadge = task.project
    ? '<span style="background:' + task.project.color + '22;color:' + task.project.color +
      ';padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:600">' +
      '<i class="fas fa-circle" style="font-size:.4rem;vertical-align:middle"></i> ' +
      escHtml(task.project.name) + '</span>'
    : '';

  var descHtml = (!compact && task.description)
    ? '<div style="font-size:.8rem;color:var(--text-muted);margin-bottom:4px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      escHtml(task.description) + '</div>'
    : '';

  var dlHtml   = dl ? '<span class="deadline-badge ' + dl.cls + '"><i class="fas fa-clock mr-1"></i>' + dl.label + '</span>' : '';
  var dateHtml = task.due_date ? '<span style="font-size:.72rem;color:var(--text-muted)">' + formatDate(task.due_date) + '</span>' : '';

  var offlineBadge = isOffline
    ? '<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:4px;' +
      'font-size:.7rem;font-weight:600"><i class="fas fa-sync-alt mr-1"></i>Chờ sync</span>'
    : '';

  return '<div class="task-card' + (isDone ? ' done' : '') + (isOffline ? ' task-offline' : '') +
    '" data-id="' + task.id + '">' +
    '<div class="d-flex align-items-start" style="gap:10px">' +
    '<div class="task-check' + (isDone ? ' checked' : '') +
    '" onclick="App.toggleDone(event,' + task.id + ')"></div>' +
    '<div style="flex:1;min-width:0" onclick="App.openTaskModal(' + task.id + ')">' +
    '<div class="task-title">' + escHtml(task.title) + '</div>' +
    descHtml +
    '<div class="task-meta">' + priorityLabel(task.priority) + statusLabel(task.status) +
    projectBadge + offlineBadge + dlHtml + dateHtml + '</div>' +
    '</div></div></div>';
}

/* ---------- Main App ---------- */
var App = {
  tasks:               [],
  projects:            [],
  currentView:         'today',
  currentFilter:       'all',
  currentProjectId:    null,
  searchQuery:         '',
  deferredInstallPrompt: null,
  currentUser:         null,

  init: function() {
    var self = this;
    // 1. Kiem tra token trong localStorage
    var token = localStorage.getItem('tf_token');
    var user  = localStorage.getItem('tf_user');
    if (!token || !user) { window.location.href = '/auth'; return; }

    try { self.currentUser = JSON.parse(user); } catch(e) { window.location.href = '/auth'; return; }
    self.renderUserInfo();

    // 2. Verify token con hop le voi server
    fetch('/api/auth/me', {
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.user) { localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user'); window.location.href = '/auth'; return; }
        // 3. Sync offline queue truoc
        return self.manualSync();
      })
      .then(function() { return self.loadProjects(); })
      .then(function() { return self.loadTasks(); })
      .then(function() {
        self.setupOnlineStatus();
        self.setupServiceWorker();
        self.startDeadlineChecker();
        self.renderStats();
        self.renderView();
        self.renderProjectNav();
        self.setupInstallPrompt();
      })
      .catch(function(err) {
        console.warn('Init error:', err);
        // Neu loi mang thi van cho dung offline
        self.loadProjects().then(function() { return self.loadTasks(); }).then(function() {
          self.setupOnlineStatus();
          self.setupServiceWorker();
          self.startDeadlineChecker();
          self.renderStats();
          self.renderView();
          self.renderProjectNav();
          self.setupInstallPrompt();
        });
      });
  },

  renderUserInfo: function() {
    var el = document.getElementById('user-info');
    if (!el || !this.currentUser) return;
    el.innerHTML =
      '<i class="fas fa-user-circle mr-1"></i>' + escHtml(this.currentUser.name) +
      ' <button onclick="App.logout()" style="background:none;border:none;color:var(--text-muted);' +
      'cursor:pointer;font-size:.75rem;padding:2px 6px;border-radius:4px;margin-left:4px" ' +
      'title="Đăng xuất"><i class="fas fa-sign-out-alt"></i></button>';
  },

  logout: function() {
    var token = localStorage.getItem('tf_token');
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token }
    }).finally(function() {
      localStorage.removeItem('tf_token');
      localStorage.removeItem('tf_user');
      window.location.href = '/auth';
    });
  },

  /* -- Data -- */
  loadTasks: function() {
    var self = this;
    return API.get('/tasks').then(function(res) {
      if (res.ok) {
        self.tasks = res.data;
        return DB.clear('tasks_cache').then(function() {
          return DB.putMany('tasks_cache', self.tasks);
        });
      }
    }).catch(function() {
      return DB.getAll('tasks_cache').then(function(cached) {
        self.tasks = cached;
        if (cached.length) Toast.show('Đang dùng dữ liệu offline', 'warning');
      });
    });
  },

  loadProjects: function() {
    var self = this;
    return API.get('/projects').then(function(res) {
      if (res.ok) {
        self.projects = res.data;
        return DB.clear('projects_cache').then(function() {
          return DB.putMany('projects_cache', self.projects);
        });
      }
    }).catch(function() {
      return DB.getAll('projects_cache').then(function(cached) {
        self.projects = cached;
      });
    }).then(function() {
      self.populateProjectSelect();
    });
  },

  populateProjectSelect: function() {
    var sel = document.getElementById('task-project');
    sel.innerHTML = '<option value="">-- Không có --</option>';
    this.projects.forEach(function(p) {
      sel.innerHTML += '<option value="' + p.id + '">' + escHtml(p.name) + '</option>';
    });
  },

  /* -- Views -- */
  setView: function(view, projectId) {
    this.currentView      = view;
    this.currentProjectId = projectId || null;
    this.currentFilter    = 'all';

    document.querySelectorAll('.nav-item[data-view]').forEach(function(el) { el.classList.remove('active'); });
    var navEl = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (navEl) navEl.classList.add('active');

    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    var titles = { today: 'Hôm nay', upcoming: 'Sắp tới', all: 'Tất cả', kanban: 'Dashboard' };
    var proj   = projectId ? this.projects.find(function(p) { return p.id == projectId; }) : null;
    document.getElementById('view-title').textContent = proj ? proj.name : (titles[view] || view);

    var isKanban = view === 'kanban';
    document.getElementById('task-list-view').style.display = isKanban ? 'none'  : 'block';
    document.getElementById('kanban-view').style.display    = isKanban ? 'block' : 'none';
    document.getElementById('filter-bar').style.display     = isKanban ? 'none'  : 'flex';

    this.renderView();
    this.closeSidebar();
  },

  setFilter: function(filter, btn) {
    this.currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    this.renderView();
  },

  onSearch: function(val) {
    this.searchQuery = val.toLowerCase();
    this.renderView();
  },

  getFilteredTasks: function() {
    var now      = new Date();
    var todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    var self     = this;
    var tasks    = this.tasks.slice();

    // Loc theo project truoc (neu dang o project view)
    if (this.currentProjectId) {
      tasks = tasks.filter(function(t) { return t.project_id == self.currentProjectId; });
    }

    // Loc theo view
    if (this.currentView === 'today') {
      tasks = tasks.filter(function(t) {
        return t.status !== 'done' && t.due_date && new Date(t.due_date) <= todayEnd;
      });
    } else if (this.currentView === 'upcoming') {
      tasks = tasks.filter(function(t) {
        return t.status !== 'done' && t.due_date && new Date(t.due_date) > todayEnd;
      });
    }

    // Loc theo filter bar (status/priority)
    if (this.currentFilter === 'high') {
      tasks = tasks.filter(function(t) { return t.priority === 'high'; });
    } else if (this.currentFilter !== 'all') {
      var f = this.currentFilter;
      tasks = tasks.filter(function(t) { return t.status === f; });
    }

    // Loc theo search
    if (this.searchQuery) {
      var q = this.searchQuery;
      tasks = tasks.filter(function(t) { return t.title.toLowerCase().indexOf(q) !== -1; });
    }
    return tasks;
  },

  renderView: function() {
    if (this.currentView === 'kanban') this.renderKanban();
    else this.renderList();
    this.renderStats();
    this.updateBadges();
  },

  renderList: function() {
    var tasks = this.getFilteredTasks();
    var el    = document.getElementById('task-list');
    if (!tasks.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-list d-block"></i>Không có task nào</div>';
      return;
    }
    el.innerHTML = tasks.map(function(t) { return renderTaskCard(t); }).join('');
  },

  renderKanban: function() {
    var self = this;
    var all  = this.currentProjectId
      ? this.tasks.filter(function(t) { return t.project_id == self.currentProjectId; })
      : this.tasks;

    var cols = { todo: [], in_progress: [], done: [] };
    all.forEach(function(t) { if (cols[t.status]) cols[t.status].push(t); });

    var empty = '<div style="color:var(--text-muted);font-size:.8rem;text-align:center;padding:20px">Trống</div>';
    document.getElementById('k-todo').innerHTML       = cols.todo.map(function(t) { return renderTaskCard(t, true); }).join('') || empty;
    document.getElementById('k-inprogress').innerHTML = cols.in_progress.map(function(t) { return renderTaskCard(t, true); }).join('') || empty;
    document.getElementById('k-done').innerHTML       = cols.done.map(function(t) { return renderTaskCard(t, true); }).join('') || empty;
    document.getElementById('k-todo-count').textContent       = cols.todo.length;
    document.getElementById('k-inprogress-count').textContent = cols.in_progress.length;
    document.getElementById('k-done-count').textContent       = cols.done.length;
  },

  renderStats: function() {
    var now = new Date();
    document.getElementById('stat-total').textContent      = this.tasks.length;
    document.getElementById('stat-inprogress').textContent = this.tasks.filter(function(t) { return t.status === 'in_progress'; }).length;
    document.getElementById('stat-done').textContent       = this.tasks.filter(function(t) { return t.status === 'done'; }).length;
    document.getElementById('stat-overdue').textContent    = this.tasks.filter(function(t) {
      return t.status !== 'done' && t.due_date && new Date(t.due_date) < now;
    }).length;
  },

  updateBadges: function() {
    var now      = new Date();
    var todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    document.getElementById('badge-today').textContent    = this.tasks.filter(function(t) {
      return t.status !== 'done' && t.due_date && new Date(t.due_date) <= todayEnd;
    }).length;
    document.getElementById('badge-upcoming').textContent = this.tasks.filter(function(t) {
      return t.status !== 'done' && t.due_date && new Date(t.due_date) > todayEnd;
    }).length;
  },

  renderProjectNav: function() {
    var self = this;
    var el   = document.getElementById('project-nav-list');
    el.innerHTML = this.projects.map(function(p) {
      var count = self.tasks.filter(function(t) { return t.project_id == p.id; }).length;
      return '<div style="display:flex;align-items:center;margin:2px 8px">' +
        '<button class="nav-item" style="flex:1;margin:0" data-view="project-' + p.id +
        '" onclick="App.setView(\'project\',' + p.id + ')">' +
        '<span class="project-dot" style="background:' + p.color + '"></span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(p.name) + '</span>' +
        '<span style="font-size:.7rem;color:var(--text-muted)">' + count + '</span>' +
        '</button>' +
        '<button onclick="App.deleteProject(' + p.id + ')" title="Xóa dự án" ' +
        'style="background:none;border:none;color:var(--text-muted);padding:4px 6px;cursor:pointer;border-radius:4px;flex-shrink:0" ' +
        'onmouseover="this.style.color=\'var(--danger)\'" onmouseout="this.style.color=\'var(--text-muted)\'">' +
        '<i class="fas fa-times" style="font-size:.7rem"></i></button>' +
        '</div>';
    }).join('');
  },

  /* -- Task CRUD -- */
  openTaskModal: function(taskId) {
    var task = taskId ? this.tasks.find(function(t) { return t.id === taskId; }) : null;

    if (task && isPendingOffline(task)) {
      Toast.show('Task này đang chờ sync. Chỉnh sửa được sau khi có mạng.', 'warning', 4000);
      return;
    }

    document.getElementById('taskModalTitle').textContent          = task ? 'Sửa Task' : 'Thêm Task';
    document.getElementById('task-id').value                       = task ? task.id : '';
    document.getElementById('task-title').value                    = task ? task.title : '';
    document.getElementById('task-desc').value                     = task ? (task.description || '') : '';
    document.getElementById('task-priority').value                 = task ? task.priority : 'medium';
    document.getElementById('task-status').value                   = task ? task.status : 'todo';
    document.getElementById('task-project').value                  = task ? (task.project_id || '') : '';
    document.getElementById('btn-delete-task').style.display       = task ? 'inline-block' : 'none';

    if (task && task.due_date) {
      var d     = new Date(task.due_date);
      var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('task-due').value = local;
    } else {
      document.getElementById('task-due').value = '';
    }
    $('#taskModal').modal('show');
  },

  saveTask: function() {
    var self  = this;
    var id    = document.getElementById('task-id').value;
    var title = document.getElementById('task-title').value.trim();
    if (!title) { Toast.show('Vui lòng nhập tiêu đề', 'danger'); return; }

    var payload = {
      title:       title,
      description: document.getElementById('task-desc').value.trim() || null,
      priority:    document.getElementById('task-priority').value,
      status:      document.getElementById('task-status').value,
      due_date:    document.getElementById('task-due').value || null,
      project_id:  document.getElementById('task-project').value || null
    };

    var promise = id
      ? API.put('/tasks/' + id, payload)
      : API.post('/tasks', payload);

    promise.then(function(res) {
      if (res.ok) {
        if (id) {
          var idx = self.tasks.findIndex(function(t) { return t.id == id; });
          if (idx !== -1) self.tasks[idx] = res.data;
          Toast.show('Đã cập nhật task', 'success');
        } else {
          self.tasks.unshift(res.data);
          Toast.show('Đã thêm task mới', 'success');
        }
      } else if (res.offline && !id) {
        // Tao task offline voi temp ID
        var tempId = Date.now();
        OfflineIds.add(tempId);
        self.tasks.unshift(Object.assign(
          { id: tempId, _isOffline: true, project: null, created_at: new Date().toISOString() },
          payload
        ));
      }
      $('#taskModal').modal('hide');
      self.renderView();
      self.renderProjectNav();
    }).catch(function(err) {
      Toast.show('Lỗi: ' + err.message, 'danger');
    });
  },

  deleteTask: function() {
    var self = this;
    var id   = document.getElementById('task-id').value;
    if (!id || !confirm('Xóa task này?')) return;
    API.del('/tasks/' + id).then(function() {
      self.tasks = self.tasks.filter(function(t) { return t.id != id; });
      $('#taskModal').modal('hide');
      Toast.show('Đã xóa task', 'success');
      self.renderView();
      self.renderProjectNav();
    }).catch(function(err) {
      Toast.show('Lỗi: ' + err.message, 'danger');
    });
  },

  toggleDone: function(e, taskId) {
    e.stopPropagation();
    var self = this;
    var task = this.tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;

    if (isPendingOffline(task)) {
      Toast.show('Task này chưa được đồng bộ. Vui lòng đợi có mạng để sync trước.', 'warning', 4000);
      return;
    }

    var newStatus = task.status === 'done' ? 'todo' : 'done';
    API.put('/tasks/' + taskId, { status: newStatus }).then(function(res) {
      task.status = res.ok ? res.data.status : newStatus;
      self.renderView();
      self.renderProjectNav();
      if (newStatus === 'done') Toast.show('Task hoàn thành! 🎉', 'success');
    }).catch(function(err) {
      Toast.show('Lỗi: ' + err.message, 'danger');
    });
  },

  /* -- Project CRUD -- */
  openProjectModal: function() {
    document.getElementById('project-name').value  = '';
    document.getElementById('project-color').value = '#2ecc71';
    $('#projectModal').modal('show');
  },

  saveProject: function() {
    var self  = this;
    var name  = document.getElementById('project-name').value.trim();
    if (!name) { Toast.show('Vui lòng nhập tên dự án', 'danger'); return; }
    var color = document.getElementById('project-color').value;
    API.post('/projects', { name: name, color: color }).then(function(res) {
      if (res.ok) {
        self.projects.push(res.data);
        self.populateProjectSelect();
        self.renderProjectNav();
        $('#projectModal').modal('hide');
        Toast.show('Đã tạo dự án', 'success');
      }
    }).catch(function(err) {
      Toast.show('Lỗi: ' + err.message, 'danger');
    });
  },

  deleteProject: function(projectId) {
    var self      = this;
    var project   = this.projects.find(function(p) { return p.id == projectId; });
    if (!project) return;
    var taskCount = this.tasks.filter(function(t) { return t.project_id == projectId; }).length;
    var msg = taskCount > 0
      ? 'Xóa dự án "' + project.name + '"? ' + taskCount + ' task sẽ bị bỏ liên kết.'
      : 'Xóa dự án "' + project.name + '"?';
    if (!confirm(msg)) return;
    API.del('/projects/' + projectId).then(function() {
      self.projects = self.projects.filter(function(p) { return p.id != projectId; });
      self.tasks.forEach(function(t) {
        if (t.project_id == projectId) { t.project_id = null; t.project = null; }
      });
      if (self.currentProjectId == projectId) self.setView('all');
      self.populateProjectSelect();
      self.renderProjectNav();
      self.renderView();
      Toast.show('Đã xóa dự án', 'success');
    }).catch(function(err) {
      Toast.show('Lỗi: ' + err.message, 'danger');
    });
  },

  /* -- Deadline notifications -- */
  startDeadlineChecker: function() {
    var self = this;
    this.checkDeadlines();
    setInterval(function() { self.checkDeadlines(); self.renderView(); }, 60000);
  },

  checkDeadlines: function() {
    if (Notification.permission !== 'granted') return;
    var now = new Date();
    this.tasks.forEach(function(task) {
      if (task.status === 'done' || !task.due_date) return;
      var due    = new Date(task.due_date);
      var diffMs = due - now;
      var diffMin = Math.floor(diffMs / 60000);

      if (diffMs < 0 && !task._notifiedOverdue) {
        task._notifiedOverdue = true;
        App.showLocalNotification(
          'Task quá hạn: ' + task.title,
          'Đã quá hạn ' + Math.abs(Math.floor(diffMs / 3600000)) + ' giờ',
          task.id
        );
      } else if (diffMs > 0 && diffMs <= 3600000 && !task._notified1h) {
        task._notified1h = true;
        App.showLocalNotification(
          'Sắp hết hạn: ' + task.title,
          'Còn ' + diffMin + ' phút nữa là hết hạn!',
          task.id
        );
      } else if (diffMs > 0 && diffMs <= 86400000 && !task._notified24h) {
        task._notified24h = true;
        App.showLocalNotification(
          'Nhắc nhở: ' + task.title,
          'Còn ' + Math.floor(diffMs / 3600000) + ' giờ nữa là hết hạn',
          task.id
        );
      }
    });
  },

  showLocalNotification: function(title, body, taskId) {
    if (Notification.permission !== 'granted') return;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION', title: title, body: body,
        tag: 'task-' + taskId, url: '/'
      });
    } else {
      new Notification(title, { body: body, icon: '/frontend/icons/icon-192.svg', tag: 'task-' + taskId });
    }
  },

  requestNotificationPermission: function() {
    var self = this;
    if (!('Notification' in window)) { Toast.show('Trình duyệt không hỗ trợ thông báo', 'danger'); return; }
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') {
        Toast.show('Đã bật thông báo!', 'success');
        document.getElementById('btn-notify').innerHTML = '<i class="fas fa-bell fa-fw"></i> Thông báo: Bật';
        self.subscribePush();
      } else {
        Toast.show('Bạn đã từ chối thông báo', 'warning');
      }
    });
  },

  subscribePush: function() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    var vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    navigator.serviceWorker.ready.then(function(sw) {
      return sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    }).then(function(sub) {
      var key  = sub.getKey('p256dh');
      var auth = sub.getKey('auth');
      return API.post('/push-subscriptions', {
        endpoint:   sub.endpoint,
        p256dh_key: btoa(String.fromCharCode.apply(null, new Uint8Array(key))),
        auth_token: btoa(String.fromCharCode.apply(null, new Uint8Array(auth)))
      });
    }).catch(function(err) {
      console.warn('Push subscription failed:', err.message);
    });
  },

  /* -- PWA / SW -- */
  setupServiceWorker: function() {
    if (!('serviceWorker' in navigator)) return;
    var self = this;
    navigator.serviceWorker.register('/frontend/sw.js', { scope: '/' })
      .then(function() {
        navigator.serviceWorker.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'SYNC_COMPLETE') {
            Toast.show('Đã đồng bộ dữ liệu offline!', 'success');
            OfflineIds.clear();
            self.loadTasks().then(function() {
              self.loadProjects().then(function() { self.renderView(); self.renderProjectNav(); });
            });
          }
        });
      })
      .catch(function(err) { console.warn('SW failed:', err); });
  },

  /* -- Online/Offline -- */
  setupOnlineStatus: function() {
    var self     = this;
    var badge    = document.getElementById('offline-badge');
    var isOnline = true; // assume online at start

    function handleOnline() {
      if (!isOnline) {
        isOnline = true;
        badge.classList.remove('show');
        // Trigger sync
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(function(reg) { reg.sync.register('sync-tasks'); });
        } else {
          self.manualSync();
        }
      }
    }

    function handleOffline() {
      if (isOnline) {
        isOnline = false;
        badge.classList.add('show');
        Toast.show('Mất kết nối - đang dùng chế độ offline', 'warning');
      }
    }

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Khoi tao trang thai ban dau
    if (!navigator.onLine) handleOffline();
  },

  manualSync: function() {
    var self = this;
    return DB.getAll('sync_queue').then(function(queue) {
      if (!queue.length) return;
      document.getElementById('sync-badge').style.display = 'inline-block';
      var synced = 0;

      var chain = Promise.resolve();
      queue.forEach(function(item) {
        chain = chain.then(function() {
          return fetch(item.url, {
            method:      item.method,
            credentials: 'same-origin',
            headers: {
              'Content-Type':  'application/json',
              'Accept':        'application/json',
              'Authorization': 'Bearer ' + (localStorage.getItem('tf_token') || '')
            },
            body:    item.body ? JSON.stringify(item.body) : undefined
          }).then(function(res) {
            if (res.ok) { synced++; return DB.remove('sync_queue', item.id); }
          }).catch(function() { /* still offline, keep in queue */ });
        });
      });

      return chain.then(function() {
        document.getElementById('sync-badge').style.display = 'none';
        if (synced > 0) {
          Toast.show('Đã sync ' + synced + ' thay đổi', 'success');
          OfflineIds.clear();
          return self.loadTasks().then(function() {
            return self.loadProjects();
          }).then(function() {
            self.renderView();
            self.renderProjectNav();
          });
        }
      });
    });
  },

  setupInstallPrompt: function() {
    var self = this;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      self.deferredInstallPrompt = e;
      document.getElementById('pwa-install-wrap').style.display = 'block';
    });
  },

  installPWA: function() {
    var self = this;
    if (!this.deferredInstallPrompt) return;
    this.deferredInstallPrompt.prompt();
    this.deferredInstallPrompt.userChoice.then(function(result) {
      if (result.outcome === 'accepted') {
        Toast.show('App đã được cài đặt!', 'success');
        document.getElementById('pwa-install-wrap').style.display = 'none';
      }
      self.deferredInstallPrompt = null;
    });
  },

  toggleSidebar: function() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
  },

  closeSidebar: function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  }
};

/* ---------- Utility ---------- */
function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw     = window.atob(base64);
  var arr     = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

document.getElementById('sidebar-overlay').addEventListener('click', function() { App.closeSidebar(); });
document.addEventListener('DOMContentLoaded', function() { App.init(); });
