const assert = require("node:assert/strict");
const TodoCore = require("../todo-core");

function createState() {
  return { todos: [], history: [], editingIndex: -1 };
}

const tests = [
  {
    name: "add: Todoを追加できる",
    run() {
      const state = createState();
      TodoCore.addTodo(state, "  買い物  ", { maxTodoText: 200, maxTodos: 1000 });
      assert.deepEqual(state.todos, [{ text: "買い物", done: false, tone: 0 }]);
      assert.equal(state.editingIndex, -1);
    },
  },
  {
    name: "update: Todoのテキストを更新できる",
    run() {
      const state = createState();
      state.todos = [{ text: "旧タスク", done: false, tone: 0 }];
      state.editingIndex = 0;
      TodoCore.updateTodoText(state, 0, "  新タスク  ", { maxTodoText: 200 });
      assert.equal(state.todos[0].text, "新タスク");
      assert.equal(state.todos[0].tone, 0);
      assert.equal(state.editingIndex, -1);
    },
  },
  {
    name: "delete: Todoを削除できる",
    run() {
      const state = createState();
      state.todos = [
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 2 },
        { text: "C", done: false, tone: 4 },
      ];
      state.editingIndex = 2;
      TodoCore.deleteTodo(state, 1);
      assert.deepEqual(state.todos, [
        { text: "A", done: false, tone: 0 },
        { text: "C", done: false, tone: 4 },
      ]);
      assert.equal(state.editingIndex, 1);
    },
  },
  {
    name: "move: Todoの順序を変更できる",
    run() {
      const state = createState();
      state.todos = [
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 1 },
        { text: "C", done: false, tone: 2 },
      ];
      state.editingIndex = 1;
      TodoCore.moveTodo(state, 2, 0);
      assert.deepEqual(state.todos, [
        { text: "C", done: false, tone: 2 },
        { text: "A", done: false, tone: 0 },
        { text: "B", done: false, tone: 1 },
      ]);
      assert.equal(state.editingIndex, 2);
    },
  },
  {
    name: "export: stateからpayloadを作成できる",
    run() {
      const state = createState();
      state.todos = [{ text: "Todo1", done: true, tone: 3 }];
      state.history = [{ text: "Done1", movedAt: "2026/02/22 13:00", tone: 4 }];
      const payload = TodoCore.getStatePayload(state);
      assert.deepEqual(payload, {
        version: 1,
        todos: [{ text: "Todo1", done: true, tone: 3 }],
        history: [{ text: "Done1", movedAt: "2026/02/22 13:00", tone: 4 }],
      });
      payload.todos[0].text = "Changed";
      assert.equal(state.todos[0].text, "Todo1");
    },
  },
  {
    name: "import: payloadを検証してstateへ反映できる",
    run() {
      const state = createState();
      const payload = {
        version: 1,
        todos: [{ text: "Todo2", done: false, tone: 1 }],
        history: [{ text: "Done2", movedAt: "2026/02/22 13:10", tone: 2 }],
      };
      TodoCore.validateImportPayload(payload, {
        maxTodoText: 200,
        maxTodos: 1000,
        maxHistory: 3000,
      });
      TodoCore.applyImportPayload(state, payload);
      assert.deepEqual(state.todos, [{ text: "Todo2", done: false, tone: 1 }]);
      assert.deepEqual(state.history, [{ text: "Done2", movedAt: "2026/02/22 13:10", tone: 2 }]);
      assert.equal(state.editingIndex, -1);
    },
  },
  {
    name: "import: tone未指定の旧形式も読み込める",
    run() {
      const state = createState();
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
      assert.deepEqual(state.todos, [{ text: "Todo3", done: true, tone: 0 }]);
      assert.deepEqual(state.history, [{ text: "Done3", movedAt: "2026/02/22 13:20", tone: 0 }]);
      assert.equal(state.editingIndex, -1);
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
