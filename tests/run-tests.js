const assert = require("node:assert/strict");
const TodoCore = require("../todo-core");

function createBucketState() {
  return { todos: [], history: [], editingIndex: -1 };
}

function createAppState() {
  return {
    categories: {
      todo: { todos: [], history: [], editingIndex: -1 },
      dinner: { todos: [], history: [], editingIndex: -1 },
      other: { todos: [], history: [], editingIndex: -1 },
    },
    activeCategory: "todo",
    viewMode: "list",
  };
}

const tests = [
  {
    name: "add: Todoを追加できる",
    run() {
      const bucket = createBucketState();
      TodoCore.addTodo(bucket, "  買い物  ", { maxTodoText: 200, maxTodos: 1000 });
      assert.deepEqual(bucket.todos, [{ text: "買い物", done: false, tone: 0 }]);
      assert.equal(bucket.editingIndex, -1);
    },
  },
  {
    name: "update: Todoのテキストを更新できる",
    run() {
      const bucket = createBucketState();
      bucket.todos = [{ text: "旧タスク", done: false, tone: 0 }];
      bucket.editingIndex = 0;
      TodoCore.updateTodoText(bucket, 0, "  新タスク  ", { maxTodoText: 200 });
      assert.equal(bucket.todos[0].text, "新タスク");
      assert.equal(bucket.todos[0].tone, 0);
      assert.equal(bucket.editingIndex, -1);
    },
  },
  {
    name: "delete: Todoを削除できる",
    run() {
      const bucket = createBucketState();
      bucket.todos = [
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 2 },
        { text: "C", done: false, tone: 4 },
      ];
      bucket.editingIndex = 2;
      TodoCore.deleteTodo(bucket, 1);
      assert.deepEqual(bucket.todos, [
        { text: "A", done: false, tone: 0 },
        { text: "C", done: false, tone: 4 },
      ]);
      assert.equal(bucket.editingIndex, 1);
    },
  },
  {
    name: "move: Todoの順序を変更できる",
    run() {
      const bucket = createBucketState();
      bucket.todos = [
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 1 },
        { text: "C", done: false, tone: 2 },
      ];
      bucket.editingIndex = 1;
      TodoCore.moveTodo(bucket, 2, 0);
      assert.deepEqual(bucket.todos, [
        { text: "C", done: false, tone: 2 },
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 1 },
      ]);
      assert.equal(bucket.editingIndex, 2);
    },
  },
  {
    name: "export: v2 stateからpayloadを作成できる",
    run() {
      const state = createAppState();
      state.categories.todo.todos = [{ text: "Todo1", done: true, tone: 3 }];
      state.categories.todo.history = [{ text: "Done1", movedAt: "2026/02/22 13:00", tone: 4 }];
      state.categories.dinner.todos = [{ text: "Dinner1", done: false, tone: 1 }];
      const payload = TodoCore.getStatePayload(state);
      assert.deepEqual(payload, {
        version: 2,
        categories: {
          todo: {
            todos: [{ text: "Todo1", done: true, tone: 3 }],
            history: [{ text: "Done1", movedAt: "2026/02/22 13:00", tone: 4 }],
          },
          dinner: {
            todos: [{ text: "Dinner1", done: false, tone: 1 }],
            history: [],
          },
          other: {
            todos: [],
            history: [],
          },
        },
      });
      payload.categories.todo.todos[0].text = "Changed";
      assert.equal(state.categories.todo.todos[0].text, "Todo1");
    },
  },
  {
    name: "import: v2 payloadを検証してstateへ反映できる",
    run() {
      const state = createAppState();
      const payload = {
        version: 2,
        categories: {
          todo: {
            todos: [{ text: "Todo2", done: false, tone: 1 }],
            history: [{ text: "Done2", movedAt: "2026/02/22 13:10", tone: 2 }],
          },
          dinner: {
            todos: [{ text: "Dinner2", done: true, tone: 4 }],
            history: [{ text: "DinnerDone", movedAt: "2026/02/22 14:10", tone: 0 }],
          },
          other: {
            todos: [],
            history: [],
          },
        },
      };
      TodoCore.validateImportPayload(payload, {
        maxTodoText: 200,
        maxTodos: 1000,
        maxHistory: 3000,
      });
      TodoCore.applyImportPayload(state, payload);
      assert.deepEqual(state.categories.todo.todos, [{ text: "Todo2", done: false, tone: 1 }]);
      assert.deepEqual(state.categories.todo.history, [{ text: "Done2", movedAt: "2026/02/22 13:10", tone: 2 }]);
      assert.deepEqual(state.categories.dinner.todos, [{ text: "Dinner2", done: true, tone: 4 }]);
      assert.deepEqual(state.categories.other.history, []);
      assert.equal(state.activeCategory, "todo");
      assert.equal(state.viewMode, "list");
    },
  },
  {
    name: "import: v1 payloadをtodo区分へ移行できる",
    run() {
      const state = createAppState();
      const payload = {
        version: 1,
        todos: [{ text: "Todo3", done: true }],
        history: [{ text: "Done3", movedAt: "2026/02/22 13:20" }],
      };
      TodoCore.validateImportPayload(payload, {
        maxTodoText: 200,
        maxTodos: 1000,
        maxHistory: 3000,
      });
      TodoCore.applyImportPayload(state, payload);
      assert.deepEqual(state.categories.todo.todos, [{ text: "Todo3", done: true, tone: 0 }]);
      assert.deepEqual(state.categories.todo.history, [{ text: "Done3", movedAt: "2026/02/22 13:20", tone: 0 }]);
      assert.deepEqual(state.categories.dinner.todos, []);
      assert.deepEqual(state.categories.other.history, []);
    },
  },
];

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`PASS: ${t.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${t.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${tests.length} tests passed.`);
