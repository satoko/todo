(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.TodoCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createTodoCore() {
  const DEFAULT_VERSION = 1;

  function isExactObjectKeys(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const valueKeys = Object.keys(value);
    if (valueKeys.length !== keys.length) return false;
    return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function isValidTodoEntry(item, maxTodoText) {
    if (!isExactObjectKeys(item, ["text", "done"])) return false;
    if (typeof item.text !== "string" || typeof item.done !== "boolean") return false;
    if (item.text.length === 0 || item.text.length > maxTodoText) return false;
    return true;
  }

  function isValidHistoryEntry(item, maxTodoText) {
    if (!isExactObjectKeys(item, ["text", "movedAt"])) return false;
    if (typeof item.text !== "string" || typeof item.movedAt !== "string") return false;
    if (item.text.length === 0 || item.text.length > maxTodoText) return false;
    if (item.movedAt.length === 0 || item.movedAt.length > 40) return false;
    return true;
  }

  function addTodo(state, text, options) {
    const { maxTodoText = 200, maxTodos = 1000 } = options || {};
    const nextText = String(text).trim();
    if (!nextText) {
      throw new Error("空のタスクにはできません。");
    }
    if (nextText.length > maxTodoText) {
      throw new Error(`Todoは${maxTodoText}文字以内で入力してください。`);
    }
    if (state.todos.length >= maxTodos) {
      throw new Error("Todo件数が上限を超えています。");
    }
    state.todos.push({ text: nextText, done: false });
    state.editingIndex = -1;
  }

  function updateTodoText(state, index, nextText, options) {
    const { maxTodoText = 200 } = options || {};
    if (index < 0 || index >= state.todos.length) {
      throw new Error("更新対象のTodoが見つかりません。");
    }
    const trimmed = String(nextText).trim();
    if (!trimmed) {
      throw new Error("空のタスクにはできません。");
    }
    if (trimmed.length > maxTodoText) {
      throw new Error(`Todoは${maxTodoText}文字以内で入力してください。`);
    }
    state.todos[index].text = trimmed;
    state.editingIndex = -1;
  }

  function deleteTodo(state, index) {
    if (index < 0 || index >= state.todos.length) {
      throw new Error("削除対象のTodoが見つかりません。");
    }
    state.todos.splice(index, 1);
    if (state.editingIndex === index) {
      state.editingIndex = -1;
    } else if (state.editingIndex > index) {
      state.editingIndex -= 1;
    }
  }

  function getStatePayload(state) {
    return {
      version: DEFAULT_VERSION,
      todos: state.todos.map((todo) => ({ text: todo.text, done: todo.done })),
      history: state.history.map((item) => ({ text: item.text, movedAt: item.movedAt })),
    };
  }

  function validateImportPayload(payload, options) {
    const { maxTodoText = 200, maxTodos = 1000, maxHistory = 3000 } = options || {};
    if (!isExactObjectKeys(payload, ["version", "todos", "history"])) {
      throw new Error("JSONフォーマットが不正です。");
    }
    if (payload.version !== DEFAULT_VERSION) {
      throw new Error("未対応のversionです。");
    }
    if (!Array.isArray(payload.todos) || !Array.isArray(payload.history)) {
      throw new Error("todos/historyは配列である必要があります。");
    }
    if (payload.todos.length > maxTodos || payload.history.length > maxHistory) {
      throw new Error("件数が上限を超えています。");
    }
    if (
      !payload.todos.every((todo) => isValidTodoEntry(todo, maxTodoText)) ||
      !payload.history.every((item) => isValidHistoryEntry(item, maxTodoText))
    ) {
      throw new Error("todos/historyの要素形式が不正です。");
    }
  }

  function applyImportPayload(state, payload) {
    state.todos = payload.todos.map((todo) => ({ text: todo.text, done: todo.done }));
    state.history = payload.history.map((item) => ({ text: item.text, movedAt: item.movedAt }));
    state.editingIndex = -1;
  }

  return {
    addTodo,
    applyImportPayload,
    deleteTodo,
    getStatePayload,
    updateTodoText,
    validateImportPayload,
  };
});
