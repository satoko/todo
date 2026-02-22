const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const bgLayer = document.querySelector("#bg-layer");
const todoList = document.querySelector("#todo-list");
const historyList = document.querySelector("#history-list");
const addTodoFab = document.querySelector("#add-todo-fab");
const addTodoDialog = document.querySelector("#add-todo-dialog");
const closeAddTodoBtn = document.querySelector("#close-add-todo-btn");

const todoView = document.querySelector("#todo-view");
const historyView = document.querySelector("#history-view");
const toggleViewBtn = document.querySelector("#toggle-view-btn");
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
const TASK_ACTION_TRIGGER = 5;
const HISTORY_EDGE_START = 10000;
const HISTORY_EDGE_TRIGGER = 14;
const HISTORY_SWIPE_FROM_ITEM_TRIGGER = 12;
const TODO_DRAG_LONG_PRESS_MS = 320;
const TODO_DRAG_CANCEL_DISTANCE = 18;
const TODO_DRAG_AUTOSCROLL_EDGE = 56;
const TODO_DRAG_AUTOSCROLL_STEP = 10;
const TodoCore = window.TodoCore;

const state = {
  todos: [],
  history: [],
  editingIndex: -1,
};
let isTrackingViewport = false;
let activeTodoDragPointerId = null;
let pendingTodoDragPointerId = null;

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
  toggleViewBtn.textContent = isTodo ? "Todo" : "履歴";
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

function wireSwipe(content, handlers) {
  const { onDelete, onSwipeRight, actionWidth = SWIPE_ACTIONS_WIDTH } = handlers;
  const row = content.closest(".swipe-item");
  let startX = 0;
  let startY = 0;
  let canSwipe = false;
  let open = false;

  function setShift(shift) {
    content.style.transform = `translateX(${shift}px)`;
    if (row) {
      row.classList.toggle("actions-visible", shift < -1);
    }
  }

  function close() {
    setShift(0);
    open = false;
    canSwipe = false;
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activeTodoDragPointerId !== null || pendingTodoDragPointerId !== null) return;
    if (e.target.closest("input, button, label, a")) return;
    canSwipe = true;
    if (!canSwipe) return;
    startX = e.clientX;
    startY = e.clientY;
    content.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (activeTodoDragPointerId === e.pointerId) return;
    if (pendingTodoDragPointerId === e.pointerId) return;
    if (!canSwipe || !content.hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (Math.abs(deltaY) > Math.abs(delta) * 3.5) return;

    if (delta < 0) {
      setShift(Math.max(-actionWidth, delta));
    }
    if (delta > 0 && open) {
      setShift(Math.min(0, -actionWidth + delta));
    }
  }

  function onPointerUp(e) {
    if (activeTodoDragPointerId === e.pointerId) {
      if (content.hasPointerCapture(e.pointerId)) {
        content.releasePointerCapture(e.pointerId);
      }
      canSwipe = false;
      return;
    }
    if (pendingTodoDragPointerId === e.pointerId) {
      if (content.hasPointerCapture(e.pointerId)) {
        content.releasePointerCapture(e.pointerId);
      }
      close();
      return;
    }
    if (!canSwipe || !content.hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX;
    content.releasePointerCapture(e.pointerId);

    if (delta < -TASK_ACTION_TRIGGER) {
      setShift(-actionWidth);
      open = true;
      canSwipe = false;
      return;
    }

    if (delta > 8 && open) {
      close();
      canSwipe = false;
      return;
    }

    if (delta > HISTORY_SWIPE_FROM_ITEM_TRIGGER && !open) {
      if (typeof onSwipeRight === "function") {
        onSwipeRight();
      }
      canSwipe = false;
      return;
    }

    close();
    canSwipe = false;
  }

  content.addEventListener("pointerdown", onPointerDown);
  content.addEventListener("pointermove", onPointerMove);
  content.addEventListener("pointerup", onPointerUp);
  content.addEventListener("pointercancel", close);

  return {
    close,
    open: () => {
      setShift(-actionWidth);
      open = true;
    },
    remove: () => {
      onDelete();
    },
  };
}

function getStateIndexFromVisualIndex(visualIndex) {
  return state.todos.length - 1 - visualIndex;
}

function installTodoReorder(li, content, stateIndex) {
  let pointerId = null;
  let pressTimerId = 0;
  let dragActive = false;
  let dragOffsetY = 0;
  let placeholder = null;
  let startX = 0;
  let startY = 0;
  let lastClientY = 0;
  let windowTracking = false;
  const fromVisualIndex = state.todos.length - 1 - stateIndex;

  function clearPressTimer() {
    if (!pressTimerId) return;
    window.clearTimeout(pressTimerId);
    pressTimerId = 0;
  }

  function resetDragStyles() {
    li.style.position = "";
    li.style.top = "";
    li.style.left = "";
    li.style.width = "";
    li.style.zIndex = "";
    li.style.pointerEvents = "";
    li.classList.remove("dragging");
    document.body.classList.remove("todo-dragging");
    document.body.classList.remove("todo-drag-pending");
  }

  function startWindowTracking() {
    if (windowTracking) return;
    windowTracking = true;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  }

  function stopWindowTracking() {
    if (!windowTracking) return;
    windowTracking = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
  }

  function maybeAutoScroll(clientY) {
    const rect = todoView.getBoundingClientRect();
    if (clientY < rect.top + TODO_DRAG_AUTOSCROLL_EDGE) {
      todoView.scrollTop -= TODO_DRAG_AUTOSCROLL_STEP;
    } else if (clientY > rect.bottom - TODO_DRAG_AUTOSCROLL_EDGE) {
      todoView.scrollTop += TODO_DRAG_AUTOSCROLL_STEP;
    }
  }

  function updatePlaceholderPosition(clientY) {
    const candidates = Array.from(todoList.querySelectorAll('[data-todo-item="1"]'));
    let inserted = false;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        todoList.insertBefore(placeholder, candidate);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      todoList.append(placeholder);
    }
  }

  function updateDraggedPosition(clientY) {
    li.style.top = `${clientY - dragOffsetY}px`;
    maybeAutoScroll(clientY);
    updatePlaceholderPosition(clientY);
  }

  function startDrag(clientY) {
    if (dragActive || pointerId === null || state.editingIndex !== -1) return;
    dragActive = true;
    pendingTodoDragPointerId = null;
    activeTodoDragPointerId = pointerId;
    document.body.classList.remove("todo-drag-pending");
    document.body.classList.add("todo-dragging");
    li.classList.add("dragging");

    const rect = li.getBoundingClientRect();
    dragOffsetY = clientY - rect.top;
    placeholder = document.createElement("li");
    placeholder.className = "drag-placeholder";
    placeholder.dataset.placeholder = "1";
    placeholder.style.height = `${rect.height}px`;
    todoList.replaceChild(placeholder, li);
    document.body.append(li);

    li.style.position = "fixed";
    li.style.top = `${rect.top}px`;
    li.style.left = `${rect.left}px`;
    li.style.width = `${rect.width}px`;
    li.style.zIndex = "80";
    li.style.pointerEvents = "none";
    updateDraggedPosition(clientY);
  }

  function finishDrag() {
    if (!dragActive) return;
    dragActive = false;
    activeTodoDragPointerId = null;
    pendingTodoDragPointerId = null;
    li.dataset.suppressClick = "1";
    if (placeholder && placeholder.parentNode === todoList) {
      const sortable = Array.from(todoList.children).filter(
        (el) => el.dataset.todoItem === "1" || el.dataset.placeholder === "1",
      );
      const toVisualIndex = sortable.indexOf(placeholder);
      todoList.replaceChild(li, placeholder);
      placeholder = null;
      resetDragStyles();
      if (toVisualIndex >= 0 && toVisualIndex !== fromVisualIndex) {
        try {
          TodoCore.moveTodo(
            state,
            getStateIndexFromVisualIndex(fromVisualIndex),
            getStateIndexFromVisualIndex(toVisualIndex),
          );
          render();
          saveState();
        } catch (error) {
          alert(error instanceof Error ? error.message : "並び替えに失敗しました。");
          render();
        }
      } else {
        render();
      }
      return;
    }
    resetDragStyles();
  }

  function cancelTracking() {
    clearPressTimer();
    stopWindowTracking();
    document.body.classList.remove("todo-drag-pending");
    pendingTodoDragPointerId = null;
    pointerId = null;
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (state.editingIndex !== -1) return;
    if (e.target.closest("input, button, label, a")) return;
    pointerId = e.pointerId;
    pendingTodoDragPointerId = pointerId;
    document.body.classList.add("todo-drag-pending");
    startX = e.clientX;
    startY = e.clientY;
    lastClientY = e.clientY;
    startWindowTracking();
    if (typeof content.setPointerCapture === "function") {
      content.setPointerCapture(e.pointerId);
    }
    pressTimerId = window.setTimeout(() => {
      startDrag(lastClientY);
    }, TODO_DRAG_LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    if (pointerId !== e.pointerId) return;
    lastClientY = e.clientY;
    if (!dragActive) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > TODO_DRAG_CANCEL_DISTANCE) {
        clearPressTimer();
        document.body.classList.remove("todo-drag-pending");
        pendingTodoDragPointerId = null;
      }
      return;
    }
    if (content.hasPointerCapture(e.pointerId)) {
      e.preventDefault();
    }
    updateDraggedPosition(e.clientY);
  }

  function onPointerEnd(e) {
    if (pointerId !== e.pointerId) return;
    clearPressTimer();
    if (dragActive) {
      e.preventDefault();
      finishDrag();
    }
    if (content.hasPointerCapture(e.pointerId)) {
      content.releasePointerCapture(e.pointerId);
    }
    stopWindowTracking();
    document.body.classList.remove("todo-drag-pending");
    pointerId = null;
    pendingTodoDragPointerId = null;
  }

  function onPointerCancel(e) {
    if (pointerId !== e.pointerId) return;
    clearPressTimer();
    if (dragActive) {
      finishDrag();
    }
    stopWindowTracking();
    document.body.classList.remove("todo-drag-pending");
    pointerId = null;
    pendingTodoDragPointerId = null;
  }

  function onTouchMove(e) {
    if (pointerId === null) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!dragActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    lastClientY = touch.clientY;
    updateDraggedPosition(touch.clientY);
  }

  function onTouchEnd() {
    if (pointerId === null) return;
    clearPressTimer();
    if (dragActive) {
      finishDrag();
    }
    stopWindowTracking();
    document.body.classList.remove("todo-drag-pending");
    pointerId = null;
    pendingTodoDragPointerId = null;
  }

  content.addEventListener("pointerdown", onPointerDown);

  li.addEventListener(
    "click",
    (e) => {
      if (!li.dataset.suppressClick) return;
      delete li.dataset.suppressClick;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

function installEdgeHistorySwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activeTodoDragPointerId !== null || pendingTodoDragPointerId !== null) return;
    if (e.target.closest("input, button, dialog")) return;
    if (e.clientX > HISTORY_EDGE_START) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  }

  function onPointerUp(e) {
    if (!tracking) return;
    if (activeTodoDragPointerId !== null || pendingTodoDragPointerId !== null) return;
    tracking = false;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    if (deltaX > HISTORY_EDGE_TRIGGER && Math.abs(deltaX) > Math.abs(deltaY) * 0.45) {
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

function createTodoItem(todo, stateIndex) {
  const li = document.createElement("li");
  li.className = "swipe-item";
  li.dataset.todoItem = "1";

  const actions = document.createElement("div");
  actions.className = "swipe-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "swipe-action edit";
  editBtn.textContent = "編集";
  editBtn.addEventListener("click", () => {
    state.editingIndex = stateIndex;
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
    state.todos[stateIndex].done = checkbox.checked;
    render();
    saveState();
  });

  if (state.editingIndex === stateIndex) {
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
      try {
        TodoCore.updateTodoText(state, stateIndex, editInput.value, { maxTodoText: MAX_TODO_TEXT });
        render();
        saveState();
      } catch (error) {
        alert(error instanceof Error ? error.message : "更新に失敗しました。");
      }
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

    // Tap on the front half of a row to toggle completion quickly on mobile.
    left.addEventListener("click", (e) => {
      if (e.target.closest("input, button")) return;
      const rect = inner.getBoundingClientRect();
      if (e.clientX <= rect.left + rect.width * 0.65) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  inner.append(left, right);
  content.append(inner);
  li.append(actions, content);

  const swipe = wireSwipe(content, {
    onDelete: () => {
      try {
        TodoCore.deleteTodo(state, stateIndex);
        render();
        saveState();
      } catch (error) {
        alert(error instanceof Error ? error.message : "削除に失敗しました。");
      }
    },
    onSwipeRight: () => {
      if (historyView.classList.contains("hidden")) {
        setView("history");
      }
    },
  });

  installTodoReorder(li, content, stateIndex);
  deleteBtn.addEventListener("click", swipe.remove);

  return li;
}

function createHistoryItem(item, index) {
  const li = document.createElement("li");
  li.className = "swipe-item";

  const actions = document.createElement("div");
  actions.className = "swipe-actions single";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "swipe-action delete";
  deleteBtn.textContent = "削除";
  actions.append(deleteBtn);

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
  li.append(actions, content);

  const swipe = wireSwipe(content, {
    actionWidth: 86,
    onDelete: () => {
      state.history.splice(index, 1);
      render();
      saveState();
    },
  });

  deleteBtn.addEventListener("click", swipe.remove);

  return li;
}

function render() {
  todoList.innerHTML = "";
  historyList.innerHTML = "";

  if (state.todos.length === 0) {
    renderEmpty(todoList, "Todoはありません");
  } else {
    const todosByNewest = state.todos
      .map((todo, stateIndex) => ({ todo, stateIndex }))
      .reverse();
    todosByNewest.forEach(({ todo, stateIndex }) => {
      todoList.append(createTodoItem(todo, stateIndex));
    });
  }

  if (state.history.length === 0) {
    renderEmpty(historyList, "履歴はありません");
  } else {
    state.history.forEach((item, index) => {
      historyList.append(createHistoryItem(item, index));
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
    if (bgLayer) {
      bgLayer.style.backgroundImage = "none";
    }
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  if (bgLayer) {
    bgLayer.style.backgroundImage = `url("${dataUrl}")`;
  }
  localStorage.setItem(STORAGE_KEY, dataUrl);
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

function saveState() {
  localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(TodoCore.getStatePayload(state)));
}

function loadState() {
  const raw = localStorage.getItem(STATE_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    TodoCore.validateImportPayload(parsed, {
      maxTodoText: MAX_TODO_TEXT,
      maxTodos: MAX_TODOS,
      maxHistory: MAX_HISTORY,
    });
    TodoCore.applyImportPayload(state, parsed);
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
  try {
    TodoCore.addTodo(state, input.value, { maxTodoText: MAX_TODO_TEXT, maxTodos: MAX_TODOS });
    input.value = "";
    render();
    saveState();
    addTodoDialog.close();
  } catch (error) {
    if (error instanceof Error && error.message === "空のタスクにはできません。") return;
    alert(error instanceof Error ? error.message : "Todoの追加に失敗しました。");
  }
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

toggleViewBtn.addEventListener("click", () => {
  const isTodo = historyView.classList.contains("hidden");
  setView(isTodo ? "history" : "todo");
});
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
  const payload = TodoCore.getStatePayload(state);
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
      TodoCore.validateImportPayload(parsed, {
        maxTodoText: MAX_TODO_TEXT,
        maxTodos: MAX_TODOS,
        maxHistory: MAX_HISTORY,
      });
      TodoCore.applyImportPayload(state, parsed);
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
