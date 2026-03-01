(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.TodoCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createTodoCore() {
  const DEFAULT_VERSION = 2;
  const V1_VERSION = 1;
  const CATEGORY_KEYS = ["todo", "dinner", "other"];

  function isExactObjectKeys(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const valueKeys = Object.keys(value);
    if (valueKeys.length !== keys.length) return false;
    return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function isToneValue(value) {
    return Number.isInteger(value) && value >= 0 && value <= 4;
  }

  function normalizeTone(value) {
    return isToneValue(value) ? value : 0;
  }

  function createEmptyBucket() {
    return { todos: [], history: [], editingIndex: -1 };
  }

  function createEmptyCategories() {
    return {
      todo: createEmptyBucket(),
      dinner: createEmptyBucket(),
      other: createEmptyBucket(),
    };
  }

  function isValidTodoEntry(item, maxTodoText) {
    if (
      !isExactObjectKeys(item, ["text", "done"]) &&
      !isExactObjectKeys(item, ["text", "done", "tone"])
    ) {
      return false;
    }
    if (typeof item.text !== "string" || typeof item.done !== "boolean") return false;
    if (item.text.length === 0 || item.text.length > maxTodoText) return false;
    if (Object.prototype.hasOwnProperty.call(item, "tone") && !isToneValue(item.tone)) return false;
    return true;
  }

  function isValidHistoryEntry(item, maxTodoText) {
    if (
      !isExactObjectKeys(item, ["text", "movedAt"]) &&
      !isExactObjectKeys(item, ["text", "movedAt", "tone"])
    ) {
      return false;
    }
    if (typeof item.text !== "string" || typeof item.movedAt !== "string") return false;
    if (item.text.length === 0 || item.text.length > maxTodoText) return false;
    if (item.movedAt.length === 0 || item.movedAt.length > 40) return false;
    if (Object.prototype.hasOwnProperty.call(item, "tone") && !isToneValue(item.tone)) return false;
    return true;
  }

  function isValidBucket(value, options) {
    const { maxTodoText = 200, maxTodos = 1000, maxHistory = 3000 } = options || {};
    if (!isExactObjectKeys(value, ["todos", "history"])) return false;
    if (!Array.isArray(value.todos) || !Array.isArray(value.history)) return false;
    if (value.todos.length > maxTodos || value.history.length > maxHistory) return false;
    if (!value.todos.every((todo) => isValidTodoEntry(todo, maxTodoText))) return false;
    if (!value.history.every((item) => isValidHistoryEntry(item, maxTodoText))) return false;
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
    state.todos.push({ text: nextText, done: false, tone: 0 });
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

  function moveTodo(state, fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= state.todos.length) {
      throw new Error("移動元のTodoが見つかりません。");
    }
    if (toIndex < 0 || toIndex >= state.todos.length) {
      throw new Error("移動先のTodoが見つかりません。");
    }
    if (fromIndex === toIndex) return;

    const [moved] = state.todos.splice(fromIndex, 1);
    state.todos.splice(toIndex, 0, moved);

    if (state.editingIndex === fromIndex) {
      state.editingIndex = toIndex;
      return;
    }
    if (fromIndex < toIndex && state.editingIndex > fromIndex && state.editingIndex <= toIndex) {
      state.editingIndex -= 1;
      return;
    }
    if (toIndex < fromIndex && state.editingIndex >= toIndex && state.editingIndex < fromIndex) {
      state.editingIndex += 1;
    }
  }

  function normalizeCategoriesFromState(state) {
    if (
      state &&
      state.categories &&
      CATEGORY_KEYS.every((key) => state.categories[key] && Array.isArray(state.categories[key].todos))
    ) {
      return CATEGORY_KEYS.reduce((acc, key) => {
        const bucket = state.categories[key];
        acc[key] = {
          todos: Array.isArray(bucket.todos) ? bucket.todos : [],
          history: Array.isArray(bucket.history) ? bucket.history : [],
        };
        return acc;
      }, {});
    }
    return {
      todo: {
        todos: Array.isArray(state?.todos) ? state.todos : [],
        history: Array.isArray(state?.history) ? state.history : [],
      },
      dinner: { todos: [], history: [] },
      other: { todos: [], history: [] },
    };
  }

  function getStatePayload(state) {
    const categories = normalizeCategoriesFromState(state);
    return {
      version: DEFAULT_VERSION,
      categories: CATEGORY_KEYS.reduce((acc, key) => {
        const bucket = categories[key];
        acc[key] = {
          todos: bucket.todos.map((todo) => ({
            text: todo.text,
            done: todo.done,
            tone: normalizeTone(todo.tone),
          })),
          history: bucket.history.map((item) => ({
            text: item.text,
            movedAt: item.movedAt,
            tone: normalizeTone(item.tone),
          })),
        };
        return acc;
      }, {}),
    };
  }

  function validateImportPayload(payload, options) {
    const { maxTodoText = 200, maxTodos = 1000, maxHistory = 3000 } = options || {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSONフォーマットが不正です。");
    }

    if (payload.version === DEFAULT_VERSION) {
      if (!isExactObjectKeys(payload, ["version", "categories"])) {
        throw new Error("JSONフォーマットが不正です。");
      }
      if (!isExactObjectKeys(payload.categories, CATEGORY_KEYS)) {
        throw new Error("categories形式が不正です。");
      }
      if (
        !CATEGORY_KEYS.every((key) =>
          isValidBucket(payload.categories[key], { maxTodoText, maxTodos, maxHistory }),
        )
      ) {
        throw new Error("categoriesの要素形式が不正です。");
      }
      return;
    }

    if (payload.version === V1_VERSION) {
      if (!isExactObjectKeys(payload, ["version", "todos", "history"])) {
        throw new Error("JSONフォーマットが不正です。");
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
      return;
    }

    throw new Error("未対応のversionです。");
  }

  function applyImportPayload(state, payload) {
    if (payload.version === V1_VERSION) {
      const categories = createEmptyCategories();
      categories.todo.todos = payload.todos.map((todo) => ({
        text: todo.text,
        done: todo.done,
        tone: normalizeTone(todo.tone),
      }));
      categories.todo.history = payload.history.map((item) => ({
        text: item.text,
        movedAt: item.movedAt,
        tone: normalizeTone(item.tone),
      }));
      state.categories = categories;
    } else {
      state.categories = CATEGORY_KEYS.reduce((acc, key) => {
        const bucket = payload.categories[key];
        acc[key] = {
          todos: bucket.todos.map((todo) => ({
            text: todo.text,
            done: todo.done,
            tone: normalizeTone(todo.tone),
          })),
          history: bucket.history.map((item) => ({
            text: item.text,
            movedAt: item.movedAt,
            tone: normalizeTone(item.tone),
          })),
          editingIndex: -1,
        };
        return acc;
      }, {});
    }

    CATEGORY_KEYS.forEach((key) => {
      state.categories[key].editingIndex = -1;
    });
    state.activeCategory = CATEGORY_KEYS.includes(state.activeCategory) ? state.activeCategory : "todo";
    state.viewMode = state.viewMode === "history" ? "history" : "list";
  }

  return {
    addTodo,
    applyImportPayload,
    deleteTodo,
    getStatePayload,
    moveTodo,
    updateTodoText,
    validateImportPayload,
  };
});
