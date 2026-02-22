const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const todoList = document.querySelector("#todo-list");
const historyList = document.querySelector("#history-list");
const addTodoFab = document.querySelector("#add-todo-fab");
const addTodoDialog = document.querySelector("#add-todo-dialog");
const closeAddTodoBtn = document.querySelector("#close-add-todo-btn");

const todoView = document.querySelector("#todo-view");
const historyView = document.querySelector("#history-view");
const showTodoBtn = document.querySelector("#show-todo-btn");
const showHistoryBtn = document.querySelector("#show-history-btn");
const moveHistoryBtn = document.querySelector("#move-history-btn");
const reloadBtn = document.querySelector("#reload-btn");
const historyPruneBtn = document.querySelector("#history-prune-btn");

const settingsBtn = document.querySelector("#settings-btn");
const settingsDialog = document.querySelector("#settings-dialog");
const wallpaperInput = document.querySelector("#wallpaper-input");
const clearWallpaperBtn = document.querySelector("#clear-wallpaper-btn");
const exportJsonBtn = document.querySelector("#export-json-btn");
const importJsonBtn = document.querySelector("#import-json-btn");
const importJsonInput = document.querySelector("#import-json-input");
const historyDeleteDialog = document.querySelector("#history-delete-dialog");
const historyDeleteForm = document.querySelector("#history-delete-form");
const historyCutoffInput = document.querySelector("#history-cutoff-input");
const historyDeleteCancelBtn = document.querySelector("#history-delete-cancel-btn");

const STORAGE_KEY = "todo_wallpaper";
const STATE_STORAGE_KEY = "todo_state_v1";
const MAX_TODO_TEXT = 200;
const MAX_TODOS = 1000;
const MAX_HISTORY = 3000;
const MAX_IMPORT_SIZE = 1024 * 1024;
const MAX_WALLPAPER_SIZE = 15 * 1024 * 1024;
const SWIPE_ACTIONS_WIDTH = 172;
const RIGHT_EDGE_SWIPE_START = 56;
const HISTORY_EDGE_START = 24;
const HISTORY_EDGE_TRIGGER = 72;

const state = {
  todos: [],
  history: [],
  editingIndex: -1,
};
let isTrackingViewport = false;

function syncViewportBottomGap() {
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty("--vv-bottom-gap", "0px");
    return;
  }
  const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
  document.documentElement.style.setProperty("--vv-bottom-gap", `${inset}px`);
}

function startViewportTracking() {
  if (isTrackingViewport) return;
  isTrackingViewport = true;
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", syncViewportBottomGap);
    vv.addEventListener("scroll", syncViewportBottomGap);
  }
  window.addEventListener("orientationchange", syncViewportBottomGap);
  syncViewportBottomGap();
}

function stopViewportTracking() {
  if (!isTrackingViewport) return;
  isTrackingViewport = false;
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", syncViewportBottomGap);
    vv.removeEventListener("scroll", syncViewportBottomGap);
  }
  window.removeEventListener("orientationchange", syncViewportBottomGap);
  document.documentElement.style.setProperty("--vv-bottom-gap", "0px");
}

function setView(mode) {
  const isTodo = mode === "todo";
  todoView.classList.toggle("hidden", !isTodo);
  historyView.classList.toggle("hidden", isTodo);
  showTodoBtn.classList.toggle("active", isTodo);
  showHistoryBtn.classList.toggle("active", !isTodo);
  moveHistoryBtn.classList.toggle("hidden", !isTodo);
  historyPruneBtn.classList.toggle("hidden", isTodo);
  addTodoFab.classList.toggle("hidden", !isTodo);
  if (!isTodo && addTodoDialog.open) {
    addTodoDialog.close();
  }
  document.body.classList.toggle("history-mode", !isTodo);
}

function renderEmpty(listEl, message) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = message;
  listEl.append(li);
}

function updateMoveHistoryButton() {
  const checkedCount = state.todos.filter((todo) => todo.done).length;
  moveHistoryBtn.textContent = checkedCount > 0 ? `${checkedCount}件を履歴へ移動` : "履歴へ移動";
  moveHistoryBtn.disabled = checkedCount === 0;
}

function wireSwipe(content, onDelete) {
  let startX = 0;
  let startY = 0;
  let canSwipe = false;
  let open = false;

  function setShift(shift) {
    content.style.transform = `translateX(${shift}px)`;
  }

  function close() {
    setShift(0);
    open = false;
    canSwipe = false;
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("input, button, label, a")) return;
    const rect = content.getBoundingClientRect();
    canSwipe = e.clientX >= rect.right - RIGHT_EDGE_SWIPE_START || open;
    if (!canSwipe) return;
    startX = e.clientX;
    startY = e.clientY;
    content.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!canSwipe || !content.hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (Math.abs(deltaY) > Math.abs(delta)) return;

    if (delta < 0) {
      setShift(Math.max(-SWIPE_ACTIONS_WIDTH, delta));
    }
    if (delta > 0 && open) {
      setShift(Math.min(0, -SWIPE_ACTIONS_WIDTH + delta));
    }
  }

  function onPointerUp(e) {
    if (!canSwipe || !content.hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX;
    content.releasePointerCapture(e.pointerId);

    if (delta < -42) {
      setShift(-SWIPE_ACTIONS_WIDTH);
      open = true;
      return;
    }

    if (delta > 20 && open) {
      close();
      return;
    }

    if (!open) {
      close();
    }
    canSwipe = false;
  }

  content.addEventListener("pointerdown", onPointerDown);
  content.addEventListener("pointermove", onPointerMove);
  content.addEventListener("pointerup", onPointerUp);
  content.addEventListener("pointercancel", close);

  return {
    close,
    open: () => {
      setShift(-SWIPE_ACTIONS_WIDTH);
      open = true;
    },
    remove: () => {
      onDelete();
    },
  };
}

function installEdgeHistorySwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("input, button, dialog, .swipe-item")) return;
    if (e.clientX > HISTORY_EDGE_START) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }

  function onPointerUp(e) {
    if (!tracking) return;
    tracking = false;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (deltaX > HISTORY_EDGE_TRIGGER && Math.abs(deltaX) > Math.abs(deltaY)) {
      const isTodo = historyView.classList.contains("hidden");
      setView(isTodo ? "history" : "todo");
    }
  }

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

function createTodoItem(todo, index) {
  const li = document.createElement("li");
  li.className = "swipe-item";

  const actions = document.createElement("div");
  actions.className = "swipe-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "swipe-action edit";
  editBtn.textContent = "編集";
  editBtn.addEventListener("click", () => {
    state.editingIndex = index;
    render();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "swipe-action delete";
  deleteBtn.textContent = "削除";
  actions.append(editBtn, deleteBtn);

  const content = document.createElement("div");
  content.className = "swipe-content";

  const inner = document.createElement("div");
  inner.className = "swipe-content-inner";
  const left = document.createElement("div");
  left.className = "todo-item-left";
  const right = document.createElement("div");
  right.className = "todo-item-right";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.done;
  checkbox.addEventListener("change", () => {
    state.todos[index].done = checkbox.checked;
    render();
    saveState();
  });

  if (state.editingIndex === index) {
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "todo-edit-input";
    editInput.value = todo.text;
    editInput.maxLength = MAX_TODO_TEXT;
    left.append(checkbox, editInput);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary-btn";
    saveBtn.textContent = "保存";
    saveBtn.addEventListener("click", () => {
      const nextText = editInput.value.trim();
      if (!nextText) {
        alert("空のタスクにはできません。");
        return;
      }
      state.todos[index].text = nextText;
      state.editingIndex = -1;
      render();
      saveState();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "small-btn";
    cancelBtn.textContent = "キャンセル";
    cancelBtn.addEventListener("click", () => {
      state.editingIndex = -1;
      render();
    });

    right.append(saveBtn, cancelBtn);
  } else {
    const text = document.createElement("span");
    text.className = `todo-text ${todo.done ? "done" : ""}`;
    text.textContent = todo.text;

    left.append(checkbox, text);
  }

  inner.append(left, right);
  content.append(inner);
  li.append(actions, content);

  const swipe = wireSwipe(content, () => {
    state.todos.splice(index, 1);
    if (state.editingIndex === index) {
      state.editingIndex = -1;
    } else if (state.editingIndex > index) {
      state.editingIndex -= 1;
    }
    render();
    saveState();
  });

  deleteBtn.addEventListener("click", swipe.remove);

  return li;
}

function createHistoryItem(item) {
  const li = document.createElement("li");
  li.className = "swipe-item";

  const content = document.createElement("div");
  content.className = "swipe-content";

  const inner = document.createElement("div");
  inner.className = "swipe-content-inner";

  const text = document.createElement("span");
  text.textContent = item.text;

  const movedAt = document.createElement("span");
  movedAt.className = "history-time";
  movedAt.textContent = item.movedAt;

  inner.append(text, movedAt);
  content.append(inner);
  li.append(content);

  return li;
}

function render() {
  todoList.innerHTML = "";
  historyList.innerHTML = "";

  if (state.todos.length === 0) {
    renderEmpty(todoList, "Todoはありません");
  } else {
    state.todos.forEach((todo, index) => {
      todoList.append(createTodoItem(todo, index));
    });
  }

  if (state.history.length === 0) {
    renderEmpty(historyList, "履歴はありません");
  } else {
    state.history.forEach((item) => {
      historyList.append(createHistoryItem(item));
    });
  }

  updateMoveHistoryButton();
}

function moveCheckedToHistory() {
  const now = new Date();
  const movedAt = now.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const checked = state.todos.filter((todo) => todo.done);
  if (checked.length === 0) return;

  checked.forEach((todo) => {
    state.history.unshift({ text: todo.text, movedAt });
  });

  state.todos = state.todos.filter((todo) => !todo.done);
  state.editingIndex = -1;
  render();
  saveState();
}

function applyWallpaper(dataUrl) {
  if (!dataUrl) {
    document.body.style.backgroundImage = "none";
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  document.body.style.backgroundImage = `url("${dataUrl}")`;
  localStorage.setItem(STORAGE_KEY, dataUrl);
}

function isExactObjectKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const valueKeys = Object.keys(value);
  if (valueKeys.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isValidTodoEntry(item) {
  if (!isExactObjectKeys(item, ["text", "done"])) return false;
  if (typeof item.text !== "string" || typeof item.done !== "boolean") return false;
  if (item.text.length === 0 || item.text.length > MAX_TODO_TEXT) return false;
  return true;
}

function isValidHistoryEntry(item) {
  if (!isExactObjectKeys(item, ["text", "movedAt"])) return false;
  if (typeof item.text !== "string" || typeof item.movedAt !== "string") return false;
  if (item.text.length === 0 || item.text.length > MAX_TODO_TEXT) return false;
  if (item.movedAt.length === 0 || item.movedAt.length > 40) return false;
  return true;
}

function validateImportPayload(payload) {
  if (!isExactObjectKeys(payload, ["version", "todos", "history"])) {
    throw new Error("JSONフォーマットが不正です。");
  }
  if (payload.version !== 1) {
    throw new Error("未対応のversionです。");
  }
  if (!Array.isArray(payload.todos) || !Array.isArray(payload.history)) {
    throw new Error("todos/historyは配列である必要があります。");
  }
  if (payload.todos.length > MAX_TODOS || payload.history.length > MAX_HISTORY) {
    throw new Error("件数が上限を超えています。");
  }
  if (!payload.todos.every(isValidTodoEntry) || !payload.history.every(isValidHistoryEntry)) {
    throw new Error("todos/historyの要素形式が不正です。");
  }
}

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDateForFilename(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}_${hh}-${mm}-${ss}`;
}

function getStatePayload() {
  return {
    version: 1,
    todos: state.todos.map((todo) => ({ text: todo.text, done: todo.done })),
    history: state.history.map((item) => ({ text: item.text, movedAt: item.movedAt })),
  };
}

function saveState() {
  localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(getStatePayload()));
}

function loadState() {
  const raw = localStorage.getItem(STATE_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    validateImportPayload(parsed);
    state.todos = parsed.todos.map((todo) => ({ text: todo.text, done: todo.done }));
    state.history = parsed.history.map((item) => ({ text: item.text, movedAt: item.movedAt }));
  } catch {
    localStorage.removeItem(STATE_STORAGE_KEY);
  }
}

function parseCutoffDateKey(inputValue) {
  if (!/^\d{8}$/.test(inputValue)) return null;
  const year = Number(inputValue.slice(0, 4));
  const month = Number(inputValue.slice(4, 6));
  const day = Number(inputValue.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return inputValue;
}

function extractDateKeyFromMovedAt(movedAt) {
  const ymd = movedAt.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (ymd) {
    return `${ymd[1]}${ymd[2]}${ymd[3]}`;
  }

  const md = movedAt.match(/^(\d{2})\/(\d{2})/);
  if (md) {
    const year = String(new Date().getFullYear());
    return `${year}${md[1]}${md[2]}`;
  }

  return null;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (text.length > MAX_TODO_TEXT) {
    alert(`Todoは${MAX_TODO_TEXT}文字以内で入力してください。`);
    return;
  }

  state.todos.push({ text, done: false });
  state.editingIndex = -1;
  input.value = "";
  render();
  saveState();
  addTodoDialog.close();
});

addTodoFab.addEventListener("click", () => {
  if (typeof addTodoDialog.showModal === "function") {
    addTodoDialog.showModal();
    startViewportTracking();
    requestAnimationFrame(() => {
      input.focus();
      syncViewportBottomGap();
    });
  }
});

closeAddTodoBtn.addEventListener("click", () => {
  addTodoDialog.close();
});

addTodoDialog.addEventListener("close", () => {
  stopViewportTracking();
});

showTodoBtn.addEventListener("click", () => setView("todo"));
showHistoryBtn.addEventListener("click", () => setView("history"));
moveHistoryBtn.addEventListener("click", moveCheckedToHistory);
reloadBtn.addEventListener("click", () => {
  window.location.reload();
});
historyPruneBtn.addEventListener("click", () => {
  if (typeof historyDeleteDialog.showModal === "function") {
    historyDeleteDialog.showModal();
    historyCutoffInput.focus();
  }
});

settingsBtn.addEventListener("click", () => {
  if (typeof settingsDialog.showModal === "function") {
    settingsDialog.showModal();
  }
});

wallpaperInput.addEventListener("change", () => {
  const file = wallpaperInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("画像ファイルのみ設定できます。");
    wallpaperInput.value = "";
    return;
  }
  if (file.size > MAX_WALLPAPER_SIZE) {
    alert("壁紙サイズが大きすぎます（上限15MB）。");
    wallpaperInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result);
    if (!data.startsWith("data:image/")) {
      alert("画像データの読み込みに失敗しました。");
      return;
    }
    applyWallpaper(data);
  };
  reader.readAsDataURL(file);
});

clearWallpaperBtn.addEventListener("click", () => {
  wallpaperInput.value = "";
  applyWallpaper("");
});

exportJsonBtn.addEventListener("click", () => {
  const payload = getStatePayload();
  downloadJsonFile(payload, `todo-export-${formatDateForFilename(new Date())}.json`);
});

importJsonBtn.addEventListener("click", () => {
  importJsonInput.click();
});

importJsonInput.addEventListener("change", () => {
  const file = importJsonInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_SIZE) {
    alert("ファイルサイズが大きすぎます（上限1MB）。");
    importJsonInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const parsed = JSON.parse(text);
      validateImportPayload(parsed);

      state.todos = parsed.todos.map((todo) => ({ text: todo.text, done: todo.done }));
      state.history = parsed.history.map((item) => ({ text: item.text, movedAt: item.movedAt }));
      state.editingIndex = -1;
      setView("todo");
      render();
      saveState();
      alert("Importしました。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Importに失敗しました。");
    } finally {
      importJsonInput.value = "";
    }
  };
  reader.readAsText(file);
});

historyDeleteCancelBtn.addEventListener("click", () => {
  historyDeleteDialog.close();
});

historyDeleteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = historyCutoffInput.value.trim();
  const cutoff = parseCutoffDateKey(raw);
  if (!cutoff) {
    alert("日付はYYYYMMDD形式で入力してください。例: 20260131");
    return;
  }

  const beforeCount = state.history.length;
  state.history = state.history.filter((item) => {
    const key = extractDateKeyFromMovedAt(item.movedAt);
    if (!key) return true;
    return key > cutoff;
  });

  const deleted = beforeCount - state.history.length;
  render();
  saveState();
  historyDeleteDialog.close();
  alert(`${deleted}件を削除しました。`);
});

const savedWallpaper = localStorage.getItem(STORAGE_KEY);
if (savedWallpaper) {
  applyWallpaper(savedWallpaper);
}

loadState();
installEdgeHistorySwipe();
setView("todo");
render();
