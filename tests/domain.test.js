const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../renderer/domain');
const {
  normalizeHttpUrl,
  classifyLink,
  addLinkToGroups,
  renameGroup,
  createCommand,
  createRecording,
  removeRecordingState,
  calculateRecordingDuration,
  completionMatchesWindow,
  deriveWindowDisplayName,
  numberWindowLabels,
  createTodo,
  updateTodo,
  currentMonthDeadline,
  calendarDeadline,
  shiftCalendarMonth,
  defaultTodoDeadline,
  normalizeTodoCategoryNames,
  normalizeHomeWidgetSizes,
  packHomeWidgetLayout,
  migrateHomeWidgetLayout,
  mergeWorkspaceStorage,
  moveHomeWidgetOrder,
  insertHomeWidgetAt,
  calculateAudioLevel,
  normalizeHomeLayout,
  swapHomeLayoutSlots,
  resampleFloat32ToPcm16,
  shouldTogglePanelForSpace,
  todoTimeBattery,
  updateRangeSelection,
  sortTodosForDisplay,
  preferredLinkGroupId,
  moveLinkToGroup,
  moveLinkToPosition,
  filterCredentials,
  credentialRowAction,
  visiblePanelTabs,
  settingsSummary,
  normalizeNoteArchive,
  filterNotes,
  updateNoteInArchive,
  updateNoteTitle,
  applyGeneratedNoteTitle,
  apiCredentialStatuses,
  prependClipboardHistory,
} = domain;

test('clipboard history preserves repeated copies of identical text', () => {
  const previous = [{ id: 'first', type: 'text', text: '同一段内容', timestamp: 100 }];
  const next = { id: 'second', type: 'text', text: '同一段内容', timestamp: 200 };
  const result = prependClipboardHistory(previous, next, 100);

  assert.deepEqual(result.history.map((entry) => entry.id), ['second', 'first']);
  assert.deepEqual(result.evicted, []);
});

test('clipboard history evicts only entries beyond its capacity', () => {
  const previous = [
    { id: 'first', type: 'text', text: 'A', timestamp: 100 },
    { id: 'older-image', type: 'image', imagePath: '/tmp/old.png', timestamp: 50 },
  ];
  const result = prependClipboardHistory(
    previous,
    { id: 'new', type: 'text', text: 'A', timestamp: 200 },
    2
  );

  assert.deepEqual(result.history.map((entry) => entry.id), ['new', 'first']);
  assert.deepEqual(result.evicted.map((entry) => entry.id), ['older-image']);
});

test('normalizeHttpUrl adds https and removes URL credentials', () => {
  assert.equal(normalizeHttpUrl(' example.com/docs '), 'https://example.com/docs');
  assert.equal(normalizeHttpUrl('https://user:secret@example.com/a'), 'https://example.com/a');
});

test('normalizeHttpUrl rejects non-web and local URLs', () => {
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpUrl('file:///tmp/a'), null);
  assert.equal(normalizeHttpUrl('http://localhost:3000'), null);
  assert.equal(normalizeHttpUrl('http://127.0.0.1/private'), null);
});

test('classifyLink maps familiar services and falls back to 其他', () => {
  assert.equal(classifyLink('https://github.com/openai', 'OpenAI repository'), '开发');
  assert.equal(classifyLink('https://www.feishu.cn/', '飞书'), '工作');
  assert.equal(classifyLink('https://www.bilibili.com/video/1', '视频'), '影音');
  assert.equal(classifyLink('https://example.com/', 'Example Domain'), '其他');
});

test('addLinkToGroups reuses a matching group and creates a missing group', () => {
  const initial = [{ id: 'g1', name: '开发', collapsed: false, links: [] }];
  const first = addLinkToGroups(initial, {
    id: 'l1',
    url: 'https://github.com/',
    title: 'GitHub',
  }, '开发');
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].links.map((link) => link.id), ['l1']);

  const second = addLinkToGroups(first, {
    id: 'l2',
    url: 'https://example.com/',
    title: 'Example',
  }, '其他');
  assert.equal(second.length, 2);
  assert.equal(second[1].name, '其他');
  assert.equal(second[1].links[0].id, 'l2');
});

test('same-site links reuse an existing group before automatic classification', () => {
  const groups = [
    { id: 'product', name: 'Lollipop', links: [{ id: 'home', url: 'https://lollipop.plus/' }] },
    { id: 'work', name: '工作', links: [{ id: 'docs', url: 'https://docs.example.com/' }] },
  ];
  assert.equal(preferredLinkGroupId(groups, 'https://docs.lollipop.plus/guide'), 'product');
  assert.equal(preferredLinkGroupId(groups, 'https://news.example.com/'), 'work');
  assert.equal(preferredLinkGroupId(groups, 'https://openai.com/'), '');
});

test('same-site grouping respects common multi-part and hosted public suffixes', () => {
  const groups = [
    { id: 'uk', name: '英国站', links: [{ id: 'uk-docs', url: 'https://docs.example.co.uk/' }] },
    { id: 'alice', name: 'Alice', links: [{ id: 'alice-home', url: 'https://alice.github.io/' }] },
  ];
  assert.equal(preferredLinkGroupId(groups, 'https://news.example.co.uk/'), 'uk');
  assert.equal(preferredLinkGroupId(groups, 'https://bob.github.io/'), '');
});

test('moving a link changes only its group and keeps an emptied source group available', () => {
  const groups = [
    { id: 'source', name: '来源', collapsed: false, links: [{ id: 'move-me', url: 'https://example.com/' }] },
    { id: 'target', name: '目标', collapsed: true, links: [{ id: 'stay', url: 'https://openai.com/' }] },
  ];
  const moved = moveLinkToGroup(groups, 'move-me', 'target');
  assert.deepEqual(moved.map((group) => [group.id, group.links.map((link) => link.id)]), [
    ['source', []],
    ['target', ['stay', 'move-me']],
  ]);
  assert.equal(groups[0].links.length, 1);
});

test('moveLinkToPosition reorders links inside one group in both directions', () => {
  const groups = [{ id: 'g1', name: '开发', collapsed: false, links: [
    { id: 'a', url: 'https://a.example.com/' },
    { id: 'b', url: 'https://b.example.com/' },
    { id: 'c', url: 'https://c.example.com/' },
  ] }];
  const order = (result) => result[0].links.map((link) => link.id);

  // 落点下标按「移动前」的行序算：拖 a 到 c 之后 = 目标下标 3。
  // 同组要先摘后插，若不把下标减一就会多跳一格，这里正是那个边界。
  assert.deepEqual(order(moveLinkToPosition(groups, 'a', 'g1', 3)), ['b', 'c', 'a']);
  // 往上拖不需要修正下标。
  assert.deepEqual(order(moveLinkToPosition(groups, 'c', 'g1', 0)), ['c', 'a', 'b']);
  // 拖到 c 之前 = 下标 2，修正后落在 b 与 c 之间。
  assert.deepEqual(order(moveLinkToPosition(groups, 'a', 'g1', 2)), ['b', 'a', 'c']);
  // 拖回原位视为无变化。
  assert.deepEqual(order(moveLinkToPosition(groups, 'b', 'g1', 1)), ['a', 'b', 'c']);
  // 原数组不能被改动，渲染层靠这一点判断顺序有没有真的变。
  assert.deepEqual(order(groups), ['a', 'b', 'c']);
});

test('moveLinkToPosition inserts at an exact slot when crossing groups', () => {
  const groups = [
    { id: 'source', name: '来源', collapsed: false, links: [{ id: 'x', url: 'https://x.example.com/' }] },
    { id: 'target', name: '目标', collapsed: false, links: [
      { id: 'p', url: 'https://p.example.com/' },
      { id: 'q', url: 'https://q.example.com/' },
    ] },
  ];
  const layout = (result) => result.map((group) => [group.id, group.links.map((link) => link.id)]);

  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', 1)),
    [['source', []], ['target', ['p', 'x', 'q']]]);
  // 落在分组空白或折叠标题上时没有具体行，index 为 null 表示追加到末尾。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', null)),
    [['source', []], ['target', ['p', 'q', 'x']]]);
  // 越界下标要被夹住，不能凭空造出空洞。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', 99)),
    [['source', []], ['target', ['p', 'q', 'x']]]);
  // 未知链接或未知分组一律原样返回。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'nope', 'target', 0)), layout(groups));
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'nope', 0)), layout(groups));
});

test('renameGroup trims names but never creates an empty name', () => {
  const groups = [{ id: 'g1', name: '开发', collapsed: false, links: [] }];
  assert.equal(renameGroup(groups, 'g1', '  资料  ')[0].name, '资料');
  assert.equal(renameGroup(groups, 'g1', '   ')[0].name, '开发');
});

test('createCommand and createRecording normalize user-authored metadata', () => {
  assert.deepEqual(createCommand('  npm test  ', 'c1', 100), {
    id: 'c1',
    text: 'npm test',
    createdAt: 100,
  });
  assert.equal(createCommand('   ', 'c2', 100), null);
  const recording = createRecording({
    id: 'r1',
    createdAt: 200,
    durationMs: 1234.8,
    transcript: '  第一段录音  ',
    audioPath: '/tmp/r1.webm',
    mimeType: 'audio/webm',
  });
  assert.equal(recording.id, 'r1');
  assert.equal(recording.transcript, '第一段录音');
  assert.notEqual(recording.title, recording.transcript);
  assert.equal(recording.category, '未分类');
});

test('single recording deletion removes only its row and keeps a valid active recording', () => {
  const recordings = [
    { id: 'first', title: '第一条' },
    { id: 'second', title: '第二条' },
    { id: 'third', title: '第三条' },
  ];
  assert.deepEqual(removeRecordingState(recordings, 'second', ['first', 'second'], 'second'), {
    recordings: [recordings[0], recordings[2]],
    selection: ['first'],
    selectedId: 'third',
  });
  assert.deepEqual(removeRecordingState(recordings, 'third', [], 'first'), {
    recordings: [recordings[0], recordings[1]],
    selection: [],
    selectedId: 'first',
  });
});

test('completionMatchesWindow distinguishes projects across VS Code windows', () => {
  const completion = { project: '灵动岛', title: '链接页已完成' };
  assert.equal(completionMatchesWindow(completion, {
    appName: 'Visual Studio Code',
    title: '灵动岛 — main.js — Visual Studio Code',
  }), true);
  assert.equal(completionMatchesWindow(completion, {
    appName: 'Visual Studio Code',
    title: 'website — page.tsx — Visual Studio Code',
  }), false);
});

test('calculateRecordingDuration does not double subtract an active pause', () => {
  assert.equal(calculateRecordingDuration({
    startedAt: 1000,
    status: 'recording',
    pausedAt: 0,
    pausedTotalMs: 2000,
    now: 11000,
  }), 8000);
  assert.equal(calculateRecordingDuration({
    startedAt: 1000,
    status: 'paused',
    pausedAt: 6000,
    pausedTotalMs: 0,
    now: 8000,
  }), 5000);
});

test('window labels expose VS Code workspace names instead of app sequence numbers', () => {
  assert.deepEqual(numberWindowLabels([
    { appName: 'Code', id: 'a', title: 'main.js — 灵动岛 — Visual Studio Code' },
    { appName: 'WeChat', id: 'b' },
    { appName: 'Code', id: 'c', title: 'Lollipop-Test' },
  ]).map((item) => item.displayName), ['灵动岛', 'WeChat', 'Lollipop-Test']);
});

test('window labels disambiguate duplicate workspace names without losing their identity', () => {
  assert.equal(deriveWindowDisplayName({ appName: 'Cursor', title: 'README.md — CourseKit — Cursor' }), 'CourseKit');
  assert.deepEqual(numberWindowLabels([
    { appName: 'Code', id: 'a', title: '灵动岛' },
    { appName: 'Code', id: 'b', title: '灵动岛' },
  ]).map((item) => item.displayName), ['灵动岛 · 1', '灵动岛 · 2']);
});

test('multiple browser windows use page titles instead of generic app numbers', () => {
  assert.deepEqual(numberWindowLabels([
    { appName: 'Arc', id: 'a', title: '阿里云百炼控制台 — Arc' },
    { appName: 'Arc', id: 'b', title: 'Topisle 设计稿 — Arc' },
  ]).map((item) => item.displayName), ['阿里云百炼控制台', 'Topisle 设计稿']);
});

test('createTodo requires a valid DDL and preserves reminder metadata', () => {
  assert.equal(createTodo('没有截止时间', '', 't0', 100), null);
  assert.equal(createTodo('日期无效', 'not-a-date', 't0', 100), null);
  assert.deepEqual(createTodo('  发布新版  ', '2026-08-22T10:30:00.000Z', 't1', 100), {
    id: 't1',
    text: '发布新版',
    done: false,
    createdAt: 100,
    deadline: '2026-08-22T10:30:00.000Z',
    remindedAt: 0,
  });
});

test('todo editor updates text and deadline while keeping completion state', () => {
  const original = { ...createTodo('旧标题', '2026-08-22T10:30:00.000Z', 't1', 100), done: true, remindedAt: 88 };
  const updated = updateTodo(original, '新标题', '2026-08-23T09:00:00.000Z');
  assert.equal(updated.id, 't1');
  assert.equal(updated.text, '新标题');
  assert.equal(updated.done, true);
  assert.equal(updated.remindedAt, 0);
  const localDeadline = new Date(currentMonthDeadline(
    { day: 21, hour: 14, minute: 30 },
    new Date(2026, 7, 1, 0, 0, 0, 0),
  ));
  assert.deepEqual([
    localDeadline.getFullYear(),
    localDeadline.getMonth(),
    localDeadline.getDate(),
    localDeadline.getHours(),
    localDeadline.getMinutes(),
  ], [2026, 7, 21, 14, 30]);
  assert.equal(currentMonthDeadline(
    { day: 32, hour: 14, minute: 30 },
    new Date(2026, 7, 1, 0, 0, 0, 0),
  ), null);
});

test('todo calendar month navigation crosses year boundaries in both directions', () => {
  assert.equal(typeof shiftCalendarMonth, 'function', 'shiftCalendarMonth must exist');
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftCalendarMonth({ year: 2027, month: 0 }, -1), { year: 2026, month: 11 });
});

test('todo deadline uses the calendar month being viewed instead of the current month', () => {
  assert.equal(typeof calendarDeadline, 'function', 'calendarDeadline must exist');
  const deadline = new Date(calendarDeadline({
    year: 2027,
    month: 0,
    day: 2,
    hour: 23,
    minute: 30,
  }));
  assert.deepEqual([
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    deadline.getHours(),
    deadline.getMinutes(),
  ], [2027, 0, 2, 23, 30]);
  assert.equal(calendarDeadline({ year: 2027, month: 1, day: 29, hour: 23, minute: 30 }), null);
});

test('default todo deadline follows the current local day across midnight and month boundaries', () => {
  const daytime = new Date(2026, 7, 28, 9, 15, 0, 0);
  const sameDayDeadline = new Date(defaultTodoDeadline(daytime));
  assert.deepEqual([
    sameDayDeadline.getFullYear(),
    sameDayDeadline.getMonth(),
    sameDayDeadline.getDate(),
    sameDayDeadline.getHours(),
    sameDayDeadline.getMinutes(),
  ], [2026, 7, 28, 23, 30]);

  const afterCutoff = new Date(2026, 7, 31, 23, 31, 0, 0);
  const nextDayDeadline = new Date(defaultTodoDeadline(afterCutoff));
  assert.deepEqual([
    nextDayDeadline.getFullYear(),
    nextDayDeadline.getMonth(),
    nextDayDeadline.getDate(),
    nextDayDeadline.getHours(),
    nextDayDeadline.getMinutes(),
  ], [2026, 8, 1, 23, 30]);
});

test('todos sort unfinished by DDL and creation time with completed items last', () => {
  const rows = sortTodosForDisplay([
    { id: 'done', done: true, deadline: '2026-08-20T00:00:00.000Z', createdAt: 1 },
    { id: 'late', done: false, deadline: '2026-08-22T00:00:00.000Z', createdAt: 2 },
    { id: 'early-new', done: false, deadline: '2026-08-21T00:00:00.000Z', createdAt: 3 },
    { id: 'early-old', done: false, deadline: '2026-08-21T00:00:00.000Z', createdAt: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['early-old', 'early-new', 'late', 'done']);
});

test('credential search matches service or account without exposing passwords', () => {
  const rows = [
    { id: 'github', service: 'GitHub', account: 'hello@example.com', passwordMask: '********' },
    { id: 'feishu', service: '飞书', account: '13800000000', passwordMask: '********' },
  ];
  assert.deepEqual(filterCredentials(rows, 'GITHUB').map((row) => row.id), ['github']);
  assert.deepEqual(filterCredentials(rows, 'example').map((row) => row.id), ['github']);
  assert.deepEqual(filterCredentials(rows, '').map((row) => row.id), ['github', 'feishu']);
});

test('credential row routes its trailing action to delete while its body still opens editing', () => {
  assert.equal(typeof credentialRowAction, 'function', 'credentialRowAction must exist');
  assert.deepEqual(credentialRowAction({ requestedAction: 'delete' }), {
    type: 'delete',
    label: '删除',
    ariaLabel: '删除密钥',
  });
  assert.deepEqual(credentialRowAction({ copyField: 'account' }), { type: 'copy', field: 'account' });
  assert.deepEqual(credentialRowAction({ rowBody: true }), { type: 'edit' });
  assert.deepEqual(credentialRowAction({ rowBody: true, shiftKey: true }), { type: 'select' });
});

test('settings stays at the far right when optional tabs are hidden', () => {
  assert.equal(typeof visiblePanelTabs, 'function', 'visiblePanelTabs must exist');
  const tabs = ['home', 'todo', 'notes', 'links', 'recordings', 'credentials', 'clip', 'settings'];
  assert.deepEqual(visiblePanelTabs(tabs, { todo: false, clip: true }), [
    'home', 'notes', 'links', 'recordings', 'credentials', 'clip', 'settings',
  ]);
  assert.deepEqual(visiblePanelTabs(tabs, {
    todo: false,
    notes: false,
    links: false,
    recordings: false,
    credentials: false,
    clip: false,
    settings: false,
  }), ['home', 'settings']);
});

test('settings summary combines safe API status with local device settings', () => {
  assert.equal(typeof settingsSummary, 'function', 'settingsSummary must exist');
  assert.deepEqual(settingsSummary({
    appSettings: { shortcut: 'Command+Shift+P', autoLaunch: true },
    workspace: { path: '/Users/test/Panel', portable: true },
    transcription: { configured: true, llmConfigured: false },
  }), {
    shortcut: 'Command+Shift+P',
    autoLaunch: true,
    workspacePath: '/Users/test/Panel',
    workspaceLabel: '自定义文件夹',
    transcription: { label: '已安全保存', state: 'saved' },
    llm: { label: '未配置', state: 'empty' },
  });
  assert.doesNotMatch(JSON.stringify(settingsSummary({
    transcription: { configured: true, apiKey: 'api-secret' },
  })), /api-secret/);
});

test('saved notes preserve cleared content and keep recently updated notes first', () => {
  const notes = normalizeNoteArchive([
    { id: 'older', title: '产品复盘', titleSource: 'model', content: '  # 旧笔记\n正文  ', createdAt: 100, updatedAt: 200 },
    { id: 'newer', content: '新笔记', createdAt: 300, updatedAt: 400 },
    { id: 'empty', content: '', createdAt: 500, updatedAt: 500 },
    null,
  ]);
  assert.deepEqual(notes.map((note) => note.id), ['empty', 'newer', 'older']);
  assert.equal(notes[0].content, '');
  assert.equal(notes[2].content, '  # 旧笔记\n正文  ');
  assert.equal(notes[2].title, '产品复盘');
  assert.equal(notes[2].titleSource, 'model');
  assert.equal(notes[2].updatedAt, 200);
});

test('editing a saved note updates content and timestamp without losing its identity', () => {
  const notes = normalizeNoteArchive([
    { id: 'selected', content: '旧内容', createdAt: 100, updatedAt: 200 },
    { id: 'other', content: '其他笔记', createdAt: 150, updatedAt: 300 },
  ]);
  const updated = updateNoteInArchive(notes, 'selected', '新内容\n第二行', 400);
  assert.deepEqual(updated.map((note) => note.id), ['selected', 'other']);
  assert.deepEqual(updated[0], {
    id: 'selected',
    title: '',
    titleSource: '',
    content: '新内容\n第二行',
    createdAt: 100,
    updatedAt: 400,
  });

  const cleared = updateNoteInArchive(updated, 'selected', '', 500);
  assert.equal(cleared[0].content, '');
  assert.equal(normalizeNoteArchive(JSON.parse(JSON.stringify(cleared)))[0].id, 'selected');
});

test('note search matches titles and full content without changing archive order', () => {
  const notes = normalizeNoteArchive([
    { id: 'one', title: 'Topisle 设计', titleSource: 'model', content: '正文没有产品英文名', createdAt: 100, updatedAt: 300 },
    { id: 'two', content: '会议备忘\n下周交付录制功能', createdAt: 200, updatedAt: 200 },
  ]);
  assert.deepEqual(filterNotes(notes, 'topisle').map((note) => note.id), ['one']);
  assert.deepEqual(filterNotes(notes, '录制').map((note) => note.id), ['two']);
  assert.deepEqual(filterNotes(notes, '').map((note) => note.id), ['one', 'two']);
});

test('users can rename a note without changing its content', () => {
  const notes = normalizeNoteArchive([
    { id: 'note-1', title: '模型标题', titleSource: 'model', content: '正文', createdAt: 100, updatedAt: 200 },
  ]);
  const renamed = updateNoteTitle(notes, 'note-1', '  用户自己的标题  ', 300);
  assert.deepEqual(renamed[0], {
    id: 'note-1',
    title: '用户自己的标题',
    titleSource: 'user',
    content: '正文',
    createdAt: 100,
    updatedAt: 300,
  });
});

test('generated note titles never overwrite user titles or stale content', () => {
  const base = normalizeNoteArchive([
    { id: 'note-1', content: '最初正文', createdAt: 100, updatedAt: 200 },
  ]);
  const generated = applyGeneratedNoteTitle(base, 'note-1', '模型概括标题', '最初正文');
  assert.equal(generated[0].title, '模型概括标题');
  assert.equal(generated[0].titleSource, 'model');

  const userRenamed = updateNoteTitle(generated, 'note-1', '我的标题', 300);
  assert.equal(applyGeneratedNoteTitle(userRenamed, 'note-1', '迟到的模型标题', '最初正文')[0].title, '我的标题');

  const edited = updateNoteInArchive(base, 'note-1', '已经变化的正文', 400);
  assert.equal(applyGeneratedNoteTitle(edited, 'note-1', '过期标题', '最初正文')[0].title, '');
});

test('API credential statuses distinguish saved, missing, and legacy keys that need re-entry', () => {
  assert.deepEqual(apiCredentialStatuses({
    configured: true,
    llmConfigured: false,
    llmNeedsReentry: true,
  }), {
    transcription: { label: '已安全保存', state: 'saved' },
    llm: { label: '需重新输入', state: 'warning' },
  });
  assert.deepEqual(apiCredentialStatuses({}), {
    transcription: { label: '未配置', state: 'empty' },
    llm: { label: '未配置', state: 'empty' },
  });
});

test('home layout swaps complete slot assignments without duplicates', () => {
  const defaults = {
    windows: 'tall-left',
    clock: 'small-top',
    recorder: 'medium-top',
    mirror: 'square-top',
    commands: 'tall-right',
    note: 'wide-bottom',
  };
  assert.deepEqual(normalizeHomeLayout({ windows: 'wide-bottom' }, defaults), defaults);
  assert.deepEqual(swapHomeLayoutSlots(defaults, 'mirror', 'clock'), {
    windows: 'tall-left',
    clock: 'square-top',
    recorder: 'medium-top',
    mirror: 'small-top',
    commands: 'tall-right',
    note: 'wide-bottom',
  });
});

test('todo category names migrate to work streams and reject blank edits', () => {
  const defaults = {
    P0: '课程',
    P1: '自媒体&写作',
    P2: 'Vibe coding',
    P3: '日常',
  };
  assert.deepEqual(normalizeTodoCategoryNames(null, defaults), defaults);
  assert.deepEqual(normalizeTodoCategoryNames({ P0: '  教学产品  ', P1: '', P4: '无效' }, defaults), {
    P0: '教学产品',
    P1: '自媒体&写作',
    P2: 'Vibe coding',
    P3: '日常',
  });
});

test('home widget sizes keep the requested tile large and adapt siblings to the grid budget', () => {
  const defaults = {
    character: 'small',
    windows: 'large',
    recorder: 'medium',
    mirror: 'medium',
    note: 'large',
    commands: 'medium',
  };
  assert.deepEqual(normalizeHomeWidgetSizes({ windows: 'huge' }, defaults, 'windows', 22), defaults);
  const fitted = normalizeHomeWidgetSizes({
    character: 'large',
    windows: 'large',
    recorder: 'large',
    mirror: 'large',
    note: 'large',
    commands: 'large',
  }, defaults, 'mirror', 22);
  assert.equal(fitted.mirror, 'large');
  assert.ok(Object.values(fitted).some((size) => size !== 'large'));
});

test('home widget sizes fill the complete bento capacity without blank cells', () => {
  const defaults = {
    music: 'medium',
    windows: 'large',
    recorder: 'small',
    mirror: 'medium',
    note: 'medium',
    commands: 'mini',
    pomodoro: 'mini',
  };
  const area = { mini: 2, small: 4, medium: 8, large: 16 };
  const fitted = normalizeHomeWidgetSizes({ ...defaults, mirror: 'large' }, defaults, 'mirror', 48);
  assert.equal(fitted.mirror, 'large');
  assert.equal(Object.values(fitted).reduce((total, size) => total + area[size], 0), 48);
});

test('home widget packing fills all four rows even when logical order would fragment the grid', () => {
  const order = ['recorder', 'windows', 'commands', 'mirror', 'music', 'note', 'pomodoro'];
  const sizes = {
    recorder: 'small',
    windows: 'large',
    commands: 'mini',
    mirror: 'medium',
    music: 'medium',
    note: 'medium',
    pomodoro: 'mini',
  };
  const layout = packHomeWidgetLayout(order, sizes, 12, 4);
  assert.ok(layout);
  const occupied = new Set();
  Object.entries(layout).forEach(([id, item]) => {
    for (let row = item.row; row < item.row + item.height; row += 1) {
      for (let column = item.column; column < item.column + item.width; column += 1) {
        const cell = `${row}:${column}`;
        assert.equal(occupied.has(cell), false, `${id} overlaps ${cell}`);
        occupied.add(cell);
      }
    }
  });
  assert.equal(occupied.size, 48);
});

test('dynamic home widget migration preserves saved order and appends new custom widgets', () => {
  const result = migrateHomeWidgetLayout({
    order: ['mirror', 'music', 'missing', 'custom-focus', 'mirror'],
    sizeById: { mirror: 'large', music: 'huge', 'custom-focus': 'mini' },
  }, {
    order: ['music', 'mirror', 'note'],
    sizeById: { music: 'medium', mirror: 'medium', note: 'large' },
    customWidgetIds: ['custom-focus', 'custom-links'],
  });
  assert.deepEqual(result, {
    order: ['mirror', 'music', 'custom-focus', 'note', 'custom-links'],
    sizeById: {
      mirror: 'large',
      music: 'medium',
      'custom-focus': 'mini',
      note: 'large',
      'custom-links': 'small',
    },
  });
});

test('dynamic home widget migration accepts fixed-slot legacy layout and historical aliases', () => {
  const result = migrateHomeWidgetLayout({
    legacyLayout: {
      note: 'wide-bottom',
      character: 'tall-left',
      mirror: 'square-top',
    },
    legacySizes: { music: 'small', mirror: 'medium' },
  }, {
    order: ['music', 'mirror', 'note'],
    sizeById: { music: 'medium', mirror: 'small', note: 'large' },
  });
  assert.deepEqual(result.order, ['music', 'mirror', 'note']);
  assert.deepEqual(result.sizeById, { music: 'small', mirror: 'medium', note: 'large' });
});

test('custom widget registry accepts only normalized compile-time widget schemas', () => {
  const registry = require('../renderer/widgets/registry');
  assert.deepEqual(Object.keys(registry.WIDGET_TYPES), [
    'text', 'countdown', 'links', 'todayTodos', 'recentNote', 'linkGroup',
  ]);
  const checked = registry.validateWidgetManifest({
    schemaVersion: 2,
    id: 'custom-reading',
    type: 'links',
    title: ' 阅读 ',
    size: 'medium',
    config: { items: [
      { label: 'OpenAI', url: 'openai.com' },
    ] },
  });
  assert.equal(checked.valid, true);
  assert.deepEqual(checked.value.config.items, [{ label: 'OpenAI', url: 'https://openai.com/' }]);
  assert.equal(registry.validateWidgetManifest({
    id: 'custom-local', type: 'links', config: { items: [{ label: '本机', url: 'http://127.0.0.1:3000' }] },
  }).valid, false);
  assert.equal(registry.validateWidgetManifest({
    id: 'custom-ipv6', type: 'links', config: { items: [{ label: '本机 IPv6', url: 'http://[fc00::1]/' }] },
  }).valid, false);
  assert.equal(registry.validateWidgetManifest({ id: 'custom-x', type: 'html', config: {} }).valid, false);
  assert.equal(registry.validateWidgetManifest({
    id: 'custom-timer', type: 'countdown', config: { targetTime: 'not-a-date' },
  }).valid, false);
});

test('custom widget registry drops duplicate and malformed instances', () => {
  const { normalizeWidgetInstances } = require('../renderer/widgets/registry');
  const rows = normalizeWidgetInstances([
    { id: 'custom-a', type: 'text', title: 'A', config: { body: '<script>alert(1)</script>' } },
    { id: 'custom-a', type: 'text', title: '重复', config: { body: 'ignored' } },
    { id: 'unsafe', type: 'text', config: { body: 'ignored' } },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].config.body, '<script>alert(1)</script>');
});

test('custom widget facade creates, updates, removes, and lays out safe instances', () => {
  const widgets = require('../renderer/widgets/registry');
  const created = widgets.createInstance({
    id: 'custom-status', type: 'text', title: '状态', config: { body: '正常' },
  });
  assert.equal(created.id, 'custom-status');
  const updated = widgets.updateInstance([created], created.id, { title: '最新状态', config: { body: '完成' } });
  assert.equal(updated[0].title, '最新状态');
  assert.equal(updated[0].config.body, '完成');
  assert.deepEqual(widgets.normalizeDynamicHomeLayout({ order: ['custom-status', 'music'] }, {
    order: ['music'], sizeById: { music: 'medium' },
  }, updated), {
    order: ['custom-status', 'music'],
    sizeById: { 'custom-status': 'small', music: 'medium' },
  });
  assert.deepEqual(widgets.removeInstance(updated, created.id), []);
});

test('home widget sizing respects each custom type allowed sizes while fitting capacity', () => {
  const sizes = normalizeHomeWidgetSizes({
    builtin: 'large',
    'custom-text': 'large',
    'custom-countdown': 'large',
  }, {
    builtin: 'large',
    'custom-text': 'large',
    'custom-countdown': 'medium',
  }, 'builtin', 22, {
    'custom-text': ['small', 'medium', 'large'],
    'custom-countdown': ['mini', 'small', 'medium'],
  });
  assert.deepEqual(sizes, {
    builtin: 'large',
    'custom-text': 'small',
    'custom-countdown': 'mini',
  });
});

test('home widget sizing can safely reduce the preferred widget when every sibling reached its minimum', () => {
  const defaults = {
    music: 'mini', pomodoro: 'mini', windows: 'mini', recorder: 'mini',
    mirror: 'mini', note: 'mini', commands: 'mini',
    'custom-1': 'large', 'custom-2': 'small', 'custom-3': 'small', 'custom-4': 'small',
    'custom-5': 'small', 'custom-6': 'small', 'custom-7': 'small', 'custom-8': 'small',
  };
  const textSizes = Object.fromEntries(
    Object.keys(defaults).filter((id) => id.startsWith('custom-')).map((id) => [id, ['small', 'medium', 'large']])
  );
  const sizes = normalizeHomeWidgetSizes(defaults, defaults, 'custom-1', 48, textSizes);
  const area = { mini: 2, small: 4, medium: 8, large: 16 };
  assert.equal(Object.values(sizes).reduce((total, size) => total + area[size], 0), 48);
  assert.equal(textSizes['custom-1'].includes(sizes['custom-1']), true);
});

test('widget facade delegates dynamic layout migration to the shared domain contract', () => {
  const widgets = require('../renderer/widgets/registry');
  const instances = [{
    id: 'custom-focus', type: 'countdown', size: 'mini', enabled: true,
    config: { targetTime: '2026-09-01T00:00:00.000Z' },
  }];
  const saved = { order: ['character', 'custom-focus'], sizeById: { music: 'medium' } };
  const defaults = { order: ['music'], sizeById: { music: 'small' } };
  assert.deepEqual(
    widgets.normalizeDynamicHomeLayout(saved, defaults, instances),
    migrateHomeWidgetLayout(saved, {
      ...defaults,
      customWidgetIds: ['custom-focus'],
      sizeById: { music: 'small', 'custom-focus': 'mini' },
    })
  );
});

test('workspace target replacement drops every key from the previous workspace', () => {
  assert.deepEqual(mergeWorkspaceStorage({
    'notch-todo-data': 'old todos',
    'only-in-old': 'must disappear',
  }, {
    'notch-todo-data': 'target todos',
    'only-in-target': 'must remain',
    malformed: 42,
  }, true), {
    'notch-todo-data': 'target todos',
    'only-in-target': 'must remain',
  });
  assert.deepEqual(mergeWorkspaceStorage({ current: 'keep' }, { current: 'do not overwrite', added: 'yes' }), {
    current: 'keep',
    added: 'yes',
  });
});

test('widget schema migration upgrades legacy instances and quarantines future versions', () => {
  const widgets = require('../renderer/widgets/registry');
  const legacy = {
    id: 'custom-legacy', type: 'text', title: '旧组件', size: 'small', config: { body: '保留' },
  };
  const migrated = widgets.migrateWidgetInstance(legacy);
  assert.equal(migrated.status, 'ready');
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.value.schemaVersion, 2);
  const versionOne = widgets.migrateWidgetInstance({ ...legacy, schemaVersion: 1 });
  assert.equal(versionOne.status, 'ready');
  assert.equal(versionOne.value.schemaVersion, 2);

  const future = {
    schemaVersion: 9,
    id: 'custom-future',
    type: 'future-type',
    title: '新版组件',
    config: { nested: { mustStay: true } },
  };
  const partition = widgets.partitionWidgetInstances([legacy, future]);
  assert.deepEqual(partition.instances, [migrated.value]);
  assert.deepEqual(partition.unsupported, [future]);
  assert.equal(widgets.normalizeWidgetInstance(future), null);
});

test('dynamic layout retains hidden and future widget positions without rendering contracts', () => {
  const widgets = require('../renderer/widgets/registry');
  const saved = {
    order: ['custom-hidden', 'music', 'custom-future'],
    sizeById: { 'custom-hidden': 'small', music: 'medium', 'custom-future': 'large' },
  };
  const result = widgets.normalizeDynamicHomeLayout(saved, {
    order: ['music'], sizeById: { music: 'medium' },
  }, [
    { schemaVersion: 2, id: 'custom-hidden', type: 'text', enabled: false, size: 'small', config: { body: 'H' } },
    { schemaVersion: 3, id: 'custom-future', type: 'future', size: 'large', config: { future: true } },
  ]);
  assert.deepEqual(result.order, ['custom-hidden', 'music', 'custom-future']);
  assert.deepEqual(result.sizeById, { 'custom-hidden': 'small', music: 'medium', 'custom-future': 'large' });
});

test('local data widget manifests store references and bounded display options only', () => {
  const widgets = require('../renderer/widgets/registry');
  const todos = widgets.validateWidgetManifest({
    id: 'custom-today', type: 'todayTodos', config: { limit: 8, includeOverdue: false },
  });
  assert.equal(todos.valid, true);
  assert.deepEqual(todos.value.config, { limit: 8, includeOverdue: false });

  const note = widgets.validateWidgetManifest({
    id: 'custom-note-ref', type: 'recentNote', config: { noteId: 'note-7', showExcerpt: false },
  });
  assert.equal(note.valid, true);
  assert.deepEqual(note.value.config, { noteId: 'note-7', showExcerpt: false });

  const links = widgets.validateWidgetManifest({
    id: 'custom-group-ref', type: 'linkGroup', config: { groupId: 'group-2', limit: 3 },
  });
  assert.equal(links.valid, true);
  assert.deepEqual(links.value.config, { groupId: 'group-2', limit: 3 });
  assert.equal(widgets.validateWidgetManifest({
    id: 'custom-group-invalid', type: 'linkGroup', config: { groupId: '', limit: 9 },
  }).valid, false);
});

test('today todo reference resolves only unfinished overdue and current-day rows', () => {
  const widgets = require('../renderer/widgets/registry');
  const widget = widgets.createInstance({
    id: 'custom-today', type: 'todayTodos', config: { limit: 2, includeOverdue: true },
  });
  const result = widgets.resolveWidgetData(widget, {
    todos: {
      P0: [
        { id: 'overdue', text: '逾期任务', deadline: '2026-08-29T12:00:00.000Z' },
        { id: 'today', text: '今日任务', deadline: '2026-08-30T12:00:00.000Z' },
        { id: 'done', text: '已完成', deadline: '2026-08-30T13:00:00.000Z', done: true },
      ],
      P1: [{ id: 'future', text: '明天任务', deadline: '2026-08-31T12:00:00.000Z' }],
    },
  }, { now: Date.parse('2026-08-30T08:00:00.000Z') });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.items.map((item) => item.id), ['overdue', 'today']);
  assert.deepEqual(result.items.map((item) => item.overdue), [true, false]);
});

test('note and link-group references resolve current data and fail closed when targets disappear', () => {
  const widgets = require('../renderer/widgets/registry');
  const noteWidget = widgets.createInstance({
    id: 'custom-note-ref', type: 'recentNote', config: { noteId: 'chosen', showExcerpt: true },
  });
  const noteResult = widgets.resolveWidgetData(noteWidget, { notes: [
    { id: 'newest', title: '更新', content: 'later', createdAt: 20, updatedAt: 20 },
    { id: 'chosen', title: ' 指定笔记 ', content: '**只保存引用**', createdAt: 10, updatedAt: 10 },
  ] });
  assert.equal(noteResult.note.id, 'chosen');
  assert.equal(noteResult.note.excerpt, '只保存引用');
  assert.equal(widgets.resolveWidgetData(noteWidget, { notes: [] }).status, 'empty');

  const groupWidget = widgets.createInstance({
    id: 'custom-group-ref', type: 'linkGroup', config: { groupId: 'group-a', limit: 2 },
  });
  const groupResult = widgets.resolveWidgetData(groupWidget, { linkGroups: [{
    id: 'group-a', name: '资料', links: [
      { id: 'public', title: 'OpenAI', url: 'https://openai.com' },
      { id: 'private', title: 'Local', url: 'http://127.0.0.1' },
    ],
  }] });
  assert.deepEqual(groupResult.items, [{ id: 'public', label: 'OpenAI', url: 'https://openai.com/' }]);
  assert.equal(widgets.resolveWidgetData(groupWidget, { linkGroups: [] }).status, 'empty');
});

test('home widget order supports keyboard movement within an allowed subset and exact undo insertion', () => {
  const order = ['music', 'custom-a', 'mirror', 'custom-hidden', 'custom-b'];
  assert.deepEqual(moveHomeWidgetOrder(order, 'custom-b', 'previous', [
    'custom-a', 'custom-hidden', 'custom-b',
  ]), ['music', 'custom-a', 'mirror', 'custom-b', 'custom-hidden']);
  assert.deepEqual(moveHomeWidgetOrder(order, 'music', 'previous'), order);
  assert.deepEqual(moveHomeWidgetOrder(order, 'custom-a', 'invalid'), order);
  assert.deepEqual(insertHomeWidgetAt(['music', 'mirror'], 'custom-a', 1), ['music', 'custom-a', 'mirror']);
  assert.deepEqual(insertHomeWidgetAt(['custom-a', 'music'], 'custom-a', 99), ['music', 'custom-a']);
});

test('audio level returns stable RMS volume for recording strands', () => {
  assert.equal(calculateAudioLevel(new Float32Array([0, 0, 0])), 0);
  assert.equal(calculateAudioLevel(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5);
  assert.equal(calculateAudioLevel(new Float32Array([2, -2])), 1);
});

test('resampleFloat32ToPcm16 downsamples and clamps audio', () => {
  const pcm = resampleFloat32ToPcm16(new Float32Array([1.5, 1, -1.5, -1]), 32000, 16000);
  assert.deepEqual(Array.from(pcm), [32767, -32768]);
});

test('shouldTogglePanelForSpace toggles plain Space but never steals typing input', () => {
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: false }), true);
  assert.equal(shouldTogglePanelForSpace({ key: 'Spacebar', repeat: false, editable: false }), true);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: true, editable: false }), false);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: true }), false);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: false, metaKey: true }), false);
});

test('mirror pinch zooms only a live camera and stays within safe bounds', () => {
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: false, ctrlKey: true }), false);
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: true, ctrlKey: false }), false);
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: true, ctrlKey: true }), true);
  assert.equal(domain.adjustMirrorZoom?.(1, -100), 1.2);
  assert.equal(domain.adjustMirrorZoom?.(1, 100), 1);
  assert.equal(domain.adjustMirrorZoom?.(2.55, -100), 2.6);
});

test('todo time battery reports the remaining share with exact color boundaries', () => {
  const createdAt = Date.parse('2026-08-21T00:00:00.000Z');
  const deadline = '2026-08-21T10:00:00.000Z';
  const todo = { createdAt, deadline, done: false };
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T02:00:00.000Z')), {
    percent: 80,
    tone: 'green',
    overdue: false,
    label: '剩余 80%',
  });
  assert.equal(todoTimeBattery(todo, Date.parse('2026-08-21T05:00:00.000Z')).tone, 'yellow');
  assert.equal(todoTimeBattery(todo, Date.parse('2026-08-21T07:00:00.000Z')).tone, 'red');
  // 恰好压在截止点上就算逾期，不再是「剩余 0%」。
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T10:00:00.000Z')), {
    percent: 0,
    tone: 'red',
    overdue: true,
    label: '已逾期',
  });
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T11:00:00.000Z')), {
    percent: 0,
    tone: 'red',
    overdue: true,
    label: '已逾期',
  });
  // 逾期前的最后一刻仍是「剩余 0%」：取整落到 0 与真正欠账必须可区分。
  const almostDue = todoTimeBattery(todo, Date.parse('2026-08-21T09:59:00.000Z'));
  assert.equal(almostDue.overdue, false);
  assert.equal(almostDue.percent, 0);
  assert.equal(almostDue.label, '剩余 0%');
  assert.equal(todoTimeBattery({ createdAt, deadline, done: true }, createdAt), null);
  assert.deepEqual(todoTimeBattery({ deadline }, createdAt), {
    percent: 0,
    tone: 'red',
    overdue: false,
    label: '待补充有效截止时间',
  });
});

test('Shift range selection selects contiguous rows while plain selection resets the range', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(updateRangeSelection(ids, [], 'b', null, false), {
    selected: ['b'],
    anchor: 'b',
  });
  assert.deepEqual(updateRangeSelection(ids, ['b'], 'd', 'b', true), {
    selected: ['b', 'c', 'd'],
    anchor: 'b',
  });
  assert.deepEqual(updateRangeSelection(ids, ['b', 'c', 'd'], 'c', 'b', false), {
    selected: ['c'],
    anchor: 'c',
  });
  assert.deepEqual(updateRangeSelection(ids, ['a'], 'missing', 'a', true), {
    selected: ['a'],
    anchor: 'a',
  });
});
