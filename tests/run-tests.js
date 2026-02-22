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
      assert.deepEqual(state.todos, [{ text: "買い物", done: false }]);
      assert.equal(state.editingIndex, -1);
    },
  },
  {
    name: "update: Todoのテキストを更新できる",
    run() {
      const state = createState();
      state.todos = [{ text: "旧タスク", done: false }];
      state.editingIndex = 0;
      TodoCore.updateTodoText(state, 0, "  新タスク  ", { maxTodoText: 200 });
      assert.equal(state.todos[0].text, "新タスク");
      assert.equal(state.editingIndex, -1);
    },
  },
  {
    name: "delete: Todoを削除できる",
    run() {
      const state = createState();
      state.todos = [
        { text: "A", done: false },
        { text: "B", done: false },
        { text: "C", done: false },
      ];
      state.editingIndex = 2;
      TodoCore.deleteTodo(state, 1);
      assert.deepEqual(state.todos, [
        { text: "A", done: false },
        { text: "C", done: false },
      ]);
      assert.equal(state.editingIndex, 1);
    },
  },
  {
    name: "export: stateからpayloadを作成できる",
    run() {
      const state = createState();
      state.todos = [{ text: "Todo1", done: true }];
      state.history = [{ text: "Done1", movedAt: "2026/02/22 13:00" }];
      const payload = TodoCore.getStatePayload(state);
      assert.deepEqual(payload, {
        version: 1,
        todos: [{ text: "Todo1", done: true }],
        history: [{ text: "Done1", movedAt: "2026/02/22 13:00" }],
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
        todos: [{ text: "Todo2", done: false }],
        history: [{ text: "Done2", movedAt: "2026/02/22 13:10" }],
      };
      TodoCore.validateImportPayload(payload, {
        maxTodoText: 200,
        maxTodos: 1000,
        maxHistory: 3000,
      });
      TodoCore.applyImportPayload(state, payload);
      assert.deepEqual(state.todos, [{ text: "Todo2", done: false }]);
      assert.deepEqual(state.history, [{ text: "Done2", movedAt: "2026/02/22 13:10" }]);
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
