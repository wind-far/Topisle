const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isPrivateAddress,
  extractPageTitle,
  extractFaviconHref,
  recordingExtension,
  normalizeWindowRows,
  todoReminderState,
  taskNotificationIdentity,
  normalizeCredentialInput,
  parseSmartLinkMetadata,
  parseSmartMaterialMetadata,
  clipboardServicePolicy,
  updateFeaturePreference,
  controlSodaMusic,
  sodaShortcutSpec,
  selectTranscriptionSettings,
  isAllowedLocalEntryNavigation,
  validateWorkspaceEnvelope,
  inspectWorkspaceTarget,
  copyWorkspaceAssets,
  workspacePathsMatch,
  writeWorkspaceEnvelope,
  saveWorkspaceSnapshot,
} = require('../main-services');

function temporaryWorkspaceTree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-panel-workspace-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('local window navigation allows only an exact reload of its fixed file entry', () => {
  const entry = path.resolve('/Applications/Topisle/renderer/index.html');
  const entryUrl = new URL(`file://${entry}`).toString();
  assert.equal(isAllowedLocalEntryNavigation(entryUrl, entry), true);
  assert.equal(isAllowedLocalEntryNavigation(`${entryUrl}?redirect=1`, entry), false);
  assert.equal(isAllowedLocalEntryNavigation('https://example.com/', entry), false);
  assert.equal(isAllowedLocalEntryNavigation('file:///tmp/other.html', entry), false);
});

test('workspace envelope validation requires version 1 and string-only localStorage', () => {
  assert.deepEqual(validateWorkspaceEnvelope({ version: 1, localStorage: { todo: '[]' } }), {
    ok: true,
    value: { version: 1, localStorage: { todo: '[]' } },
  });
  assert.equal(validateWorkspaceEnvelope({ version: 2, localStorage: {} }).error, 'unsupported_workspace_version');
  assert.equal(validateWorkspaceEnvelope({ version: 1 }).error, 'invalid_workspace_storage');
  assert.equal(validateWorkspaceEnvelope({ version: 1, localStorage: { bad: 42 } }).error, 'invalid_workspace_storage');
});

test('existing workspace is validated in a real temporary directory without being changed', (t) => {
  const root = temporaryWorkspaceTree(t);
  const workspaceFile = path.join(root, 'workspace.json');
  const source = JSON.stringify({ version: 1, localStorage: { todo: '[{"id":"target"}]' } }, null, 2);
  fs.writeFileSync(workspaceFile, source);
  const inspected = inspectWorkspaceTarget(root);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.kind, 'existing');
  assert.deepEqual(inspected.envelope.localStorage, { todo: '[{"id":"target"}]' });
  assert.equal(fs.readFileSync(workspaceFile, 'utf8'), source);
});

test('empty workspace directory receives a validated migration in a real temporary tree', (t) => {
  const root = temporaryWorkspaceTree(t);
  const sourceRoot = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  fs.mkdirSync(path.join(sourceRoot, 'recordings'), { recursive: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'workspace.json'), JSON.stringify({
    version: 1,
    localStorage: { todo: '[{"id":"source"}]' },
  }));
  fs.writeFileSync(path.join(sourceRoot, 'recordings', 'recording-a.webm'), 'audio');
  assert.equal(inspectWorkspaceTarget(targetRoot).kind, 'empty');
  assert.equal(copyWorkspaceAssets(sourceRoot, targetRoot, {
    directories: ['recordings'],
    files: ['workspace.json'],
  }), true);
  assert.equal(inspectWorkspaceTarget(targetRoot).kind, 'existing');
  assert.equal(fs.readFileSync(path.join(targetRoot, 'recordings', 'recording-a.webm'), 'utf8'), 'audio');
});

test('corrupt workspace is rejected without modification', (t) => {
  const root = temporaryWorkspaceTree(t);
  const workspaceFile = path.join(root, 'workspace.json');
  const corrupt = '{"version":1,"localStorage":';
  fs.writeFileSync(workspaceFile, corrupt);
  const inspected = inspectWorkspaceTarget(root);
  assert.equal(inspected.ok, false);
  assert.equal(inspected.error, 'invalid_workspace_json');
  assert.equal(fs.readFileSync(workspaceFile, 'utf8'), corrupt);
});

test('saving a snapshot refuses to overwrite a corrupt or future current workspace', (t) => {
  const root = temporaryWorkspaceTree(t);
  const workspaceFile = path.join(root, 'workspace.json');
  for (const source of [
    '{"version":1,"localStorage":',
    JSON.stringify({ version: 2, localStorage: { future: 'keep' } }),
  ]) {
    fs.writeFileSync(workspaceFile, source);
    const saved = saveWorkspaceSnapshot(root, root, { current: 'must-not-write' }, { updatedAt: 123 });
    assert.equal(saved.ok, false);
    assert.equal(fs.readFileSync(workspaceFile, 'utf8'), source);
  }
});

test('first-run snapshot creates the source envelope before empty-directory migration', (t) => {
  const root = temporaryWorkspaceTree(t);
  const sourceRoot = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(targetRoot);
  assert.equal(inspectWorkspaceTarget(sourceRoot).kind, 'empty');
  assert.deepEqual(saveWorkspaceSnapshot(sourceRoot, sourceRoot, {
    'notch-todo-data': '[{"id":"first-run"}]',
  }, { updatedAt: 123 }), { ok: true, kind: 'empty' });
  assert.equal(copyWorkspaceAssets(sourceRoot, targetRoot, { files: ['workspace.json'] }), true);
  const migrated = inspectWorkspaceTarget(targetRoot);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.kind, 'existing');
  assert.equal(migrated.envelope.localStorage['notch-todo-data'], '[{"id":"first-run"}]');
});

test('stale expected workspace paths cannot match the active root', (t) => {
  const root = temporaryWorkspaceTree(t);
  const previous = path.join(root, 'previous');
  const active = path.join(root, 'active');
  fs.mkdirSync(previous);
  fs.mkdirSync(active);
  const activeFile = path.join(active, 'workspace.json');
  const original = JSON.stringify({ version: 1, localStorage: { target: 'keep' } });
  fs.writeFileSync(activeFile, original);
  assert.equal(workspacePathsMatch(previous, active), false);
  assert.equal(workspacePathsMatch(active, path.join(active, '.')), true);
  assert.equal(workspacePathsMatch('', active), false);
  assert.equal(writeWorkspaceEnvelope(previous, active, {
    version: 1,
    localStorage: { stale: 'must not write' },
  }), false);
  assert.equal(fs.readFileSync(activeFile, 'utf8'), original);
  assert.equal(writeWorkspaceEnvelope(active, active, {
    version: 1,
    updatedAt: 123,
    localStorage: { current: 'saved' },
  }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(activeFile, 'utf8')), {
    version: 1,
    updatedAt: 123,
    localStorage: { current: 'saved' },
  });
});

test('isPrivateAddress blocks loopback, private, link-local and unique-local ranges', () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.2.3', '192.168.1.9', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('extractPageTitle prefers og:title and decodes HTML entities', () => {
  const html = '<html><head><title>Fallback</title><meta property="og:title" content="OpenAI &amp; Friends"></head></html>';
  assert.equal(extractPageTitle(html, 'example.com'), 'OpenAI & Friends');
  assert.equal(extractPageTitle('<title>  Docs &mdash; Home  </title>', 'example.com'), 'Docs — Home');
  assert.equal(extractPageTitle('<html></html>', 'example.com'), 'example.com');
});

test('favicon and smart material metadata are normalized safely', () => {
  assert.equal(extractFaviconHref('<link rel="icon" href="/assets/icon.png">'), '/assets/icon.png');
  assert.equal(extractFaviconHref('<link rel="stylesheet" href="app.css">'), '');
  assert.deepEqual(parseSmartMaterialMetadata('```json\n{"title":" 周会决策与行动项 ","category":"会议"}\n```'), {
    title: '周会决策与行动项',
    category: '会议',
  });
});

test('transcription settings fall back to the legacy app directory only when current settings are absent', () => {
  const legacy = { encryptedApiKey: 'legacy-asr', encryptedLlmApiKey: 'legacy-llm' };
  assert.deepEqual(selectTranscriptionSettings({}, legacy), legacy);
  assert.deepEqual(selectTranscriptionSettings({ region: 'beijing' }, legacy), { region: 'beijing' });
  assert.deepEqual(selectTranscriptionSettings(null, null), {});
});

test('recordingExtension only returns known audio file extensions', () => {
  assert.equal(recordingExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(recordingExtension('audio/mp4'), 'm4a');
  assert.equal(recordingExtension('audio/ogg'), 'ogg');
  assert.equal(recordingExtension('application/octet-stream'), 'webm');
});

test('normalizeWindowRows preserves separate windows and filters empty titles', () => {
  const rows = normalizeWindowRows([
    { pid: 10, appName: 'Code', title: 'alpha — Visual Studio Code', windowIndex: 0, appPath: '/Applications/Visual Studio Code.app' },
    { pid: 10, appName: 'Code', title: 'beta — Visual Studio Code', windowIndex: 1 },
    { pid: 11, appName: 'Finder', title: '', windowIndex: 0 },
  ]);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].appPath, '/Applications/Visual Studio Code.app');
  assert.equal(rows[1].title, 'beta — Visual Studio Code');
});

test('normalizeWindowRows collapses same-process duplicates of one window title', () => {
  // 实测：微信只开了一个窗口，CGWindowList 却返回两条同名记录（窗口号 53696 与 85），
  // 界面上就成了两个「微信」。聚焦按标题匹配，重复条目指向同一个窗口，必须只留最前那条。
  const rows = normalizeWindowRows([
    { pid: 650, appName: '微信', title: '微信', windowNumber: 53696, appPath: '/Applications/微信.app' },
    { pid: 650, appName: '微信', title: '微信', windowNumber: 85, appPath: '/Applications/微信.app' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'window-650-53696');

  // 同应用的不同窗口（标题不同）必须全部保留，多工作区的 VS Code 不能被误删。
  const editors = normalizeWindowRows([
    { pid: 26497, appName: 'Code', title: '灵动岛', windowNumber: 1, appPath: '/Applications/Visual Studio Code.app' },
    { pid: 26497, appName: 'Code', title: 'Vlog制作工坊', windowNumber: 2, appPath: '/Applications/Visual Studio Code.app' },
  ]);
  assert.equal(editors.length, 2);

  // 同名窗口分属不同进程时是两个真实应用，不能合并。
  const distinct = normalizeWindowRows([
    { pid: 1, appName: '备忘录', title: '备忘录', windowNumber: 10 },
    { pid: 2, appName: '备忘录', title: '备忘录', windowNumber: 11 },
  ]);
  assert.equal(distinct.length, 2);
});

test('normalizeWindowRows keeps all named CGWindow entries with stable window ids', () => {
  const rows = normalizeWindowRows([
    { pid: 10, appName: 'Code', title: '灵动岛', windowNumber: 501, appPath: '/Applications/Visual Studio Code.app' },
    { pid: 10, appName: 'Code', title: 'Lollipop-Test', windowNumber: 502, appPath: '/Applications/Visual Studio Code.app' },
    { pid: 10, appName: 'Code', title: 'AI PM 备课坊', windowNumber: 503, appPath: '/Applications/Visual Studio Code.app' },
    { pid: 10, appName: 'Code', title: '', windowNumber: 504, appPath: '/Applications/Visual Studio Code.app' },
  ]);
  assert.deepEqual(rows.map((row) => row.id), [
    'window-10-501',
    'window-10-502',
    'window-10-503',
  ]);
});

test('todoReminderState fires once within the final hour and expires after the DDL', () => {
  const deadline = Date.parse('2026-08-22T10:00:00.000Z');
  const todo = { id: 't1', text: '发布新版', deadline: new Date(deadline).toISOString(), done: false, remindedAt: 0 };
  assert.deepEqual(todoReminderState(todo, deadline - 2 * 60 * 60 * 1000), {
    state: 'scheduled',
    delayMs: 60 * 60 * 1000,
  });
  assert.deepEqual(todoReminderState(todo, deadline - 30 * 60 * 1000), {
    state: 'due',
    delayMs: 0,
  });
  assert.equal(todoReminderState({ ...todo, remindedAt: deadline - 60 * 60 * 1000 }, deadline - 30 * 60 * 1000).state, 'notified');
  assert.equal(todoReminderState(todo, deadline + 1).state, 'expired');
});

test('task notification identifies the repository and concrete finished work', () => {
  assert.deepEqual(taskNotificationIdentity({
    title: '新的任务已经完成',
    cwd: '/Users/ahai/Documents/灵动岛',
    'last-assistant-message': '已完成 VS Code 工作区名称识别，并修复拖拽残留。\n测试已通过。',
  }, 'codex'), {
    project: '灵动岛',
    title: '已完成 VS Code 工作区名称识别，并修复拖拽残留。',
  });
  assert.deepEqual(taskNotificationIdentity({
    project: 'CourseKit',
    task_title: '生成课程大纲',
  }, 'gpt'), {
    project: 'CourseKit',
    title: '生成课程大纲',
  });
  assert.deepEqual(taskNotificationIdentity({
    cwd: '/Users/ahai/Documents/灵动岛',
    last_assistant_message: '## 已接好 Claude Code 的 Stop 钩子\n测试全部通过。',
  }, 'claude'), {
    project: '灵动岛',
    title: '已接好 Claude Code 的 Stop 钩子',
  });
  // 记录文件还没落盘时标题为空，各来源要退回自己的兜底文案。
  assert.equal(taskNotificationIdentity({ cwd: '/tmp/demo' }, 'claude').title, 'Claude 已完成任务');
  assert.equal(taskNotificationIdentity({ cwd: '/tmp/demo' }, 'codex').title, 'Codex 已完成任务');
  assert.equal(taskNotificationIdentity({ cwd: '/tmp/demo' }, 'todo').title, '任务已完成');
});

test('credential input trims metadata but preserves password bytes and rejects incomplete records', () => {
  assert.deepEqual(normalizeCredentialInput({
    service: '  GitHub  ',
    account: '  user@example.com  ',
    password: '  p@ss word  ',
  }, 'cred-1', 100), {
    id: 'cred-1',
    service: 'GitHub',
    account: 'user@example.com',
    password: '  p@ss word  ',
    createdAt: 100,
  });
  assert.equal(normalizeCredentialInput({ service: '', account: 'a', password: 'b' }), null);
  assert.equal(normalizeCredentialInput({ service: 'A', account: '', password: 'b' }), null);
  assert.equal(normalizeCredentialInput({ service: 'A', account: 'a', password: '' }), null);
});

test('smart link metadata accepts fenced JSON but restricts category and title lengths', () => {
  assert.deepEqual(parseSmartLinkMetadata('```json\n{"title":"OpenAI API 文档","category":"开发"}\n```'), {
    title: 'OpenAI API 文档',
    category: '开发',
  });
  assert.deepEqual(parseSmartLinkMetadata('{"title":"  ","category":"一个非常非常非常非常非常非常长的分类名称"}'), {
    title: '',
    category: '一个非常非常非常非常非常非常',
  });
  assert.equal(parseSmartLinkMetadata('not-json'), null);
});

test('clipboard polling follows the feature switch and never reserves a global shortcut', () => {
  // 剪贴板默认关闭，关着就不能轮询系统剪贴板：原实现恒返回 recordHistory: true，
  // 于是主进程无论开关状态都在每 500ms 读一次粘贴板，粘贴板里有大图时空转吃掉三成 CPU。
  assert.deepEqual(clipboardServicePolicy({ clip: true }), {
    recordHistory: true,
    registerGlobalShortcut: false,
  });
  assert.deepEqual(clipboardServicePolicy({ clip: false }), {
    recordHistory: false,
    registerGlobalShortcut: false,
  });
  // 缺字段或传入非对象时一律按「关闭」处理，不能默默恢复轮询。
  assert.equal(clipboardServicePolicy({}).recordHistory, false);
  assert.equal(clipboardServicePolicy(undefined).recordHistory, false);
  assert.equal(clipboardServicePolicy(true).recordHistory, false);
  // 全局快捷键在任何情况下都不注册（原 Cmd+Shift+V 已撤销）。
  for (const input of [{ clip: true }, { clip: false }, {}, undefined]) {
    assert.equal(clipboardServicePolicy(input).registerGlobalShortcut, false);
  }
});

test('feature preferences only update configurable tabs and keep permanent tabs enabled', () => {
  assert.equal(typeof updateFeaturePreference, 'function', 'updateFeaturePreference must exist');
  assert.deepEqual(updateFeaturePreference({ todo: true, clip: false }, 'clip', true), {
    todo: true,
    clip: true,
    home: true,
  });
  assert.equal(updateFeaturePreference({ todo: true }, 'home', false), null);
  assert.equal(updateFeaturePreference({ todo: true }, 'settings', false), null);
  assert.equal(updateFeaturePreference({ todo: true }, 'unknown', false), null);
  assert.equal(updateFeaturePreference({ todo: true }, 'todo', 'false'), null);
});

test('first Soda Music play launches the app and starts its restored song', async () => {
  const events = [];
  let running = false;
  const result = await controlSodaMusic('play', {
    isRunning: async () => {
      events.push('running');
      return running;
    },
    launch: async () => {
      events.push('launch');
      running = true;
      return true;
    },
    sendShortcut: async (action) => {
      events.push(`shortcut:${action}`);
      return { ok: true };
    },
    sleep: async () => {},
  });

  assert.deepEqual(events, ['running', 'launch', 'running', 'shortcut:play']);
  assert.equal(result.ok, true);
  assert.equal(result.running, true);
  assert.equal(result.playing, true);
  assert.equal(result.bootstrapped, true);
});

test('running Soda Music uses its own shortcuts because native media status can stay empty', async () => {
  const events = [];
  const result = await controlSodaMusic('play', {
    isRunning: async () => true,
    launch: async () => {
      events.push('launch');
      return true;
    },
    sendShortcut: async (action) => {
      events.push(`shortcut:${action}`);
      return { ok: true };
    },
    sleep: async () => {},
  });

  assert.deepEqual(events, ['shortcut:play']);
  assert.equal(result.ok, true);
  assert.equal(result.playing, true);
  assert.equal(result.bootstrapped, false);
});

test('Soda Music pause and track navigation preserve explicit playback state', async () => {
  const shortcuts = [];
  const dependencies = {
    isRunning: async () => true,
    launch: async () => true,
    sendShortcut: async (action) => {
      shortcuts.push(action);
      return { ok: true };
    },
    sleep: async () => {},
  };

  assert.equal((await controlSodaMusic('pause', dependencies)).playing, false);
  assert.equal((await controlSodaMusic('next', dependencies, false)).playing, true);
  assert.equal((await controlSodaMusic('previous', dependencies, false)).playing, true);
  assert.deepEqual(shortcuts, ['pause', 'next', 'previous']);
});

test('Soda Music play uses the play/pause toggle instead of the next-track key', () => {
  // play 曾经和 next 撞成同一个键（Cmd+Right），点播放实际是切歌、歌不会开始播。
  // Space 是播放/暂停切换键，play 与 pause 共用它，next / previous 必须与之不同。
  assert.deepEqual(sodaShortcutSpec('play'), { keyCode: 49, command: false, dismissOverlays: true });
  assert.deepEqual(sodaShortcutSpec('pause'), { keyCode: 49, command: false, dismissOverlays: true });
  assert.deepEqual(sodaShortcutSpec('next'), { keyCode: 124, command: true, dismissOverlays: true });
  assert.deepEqual(sodaShortcutSpec('previous'), { keyCode: 123, command: true, dismissOverlays: true });
  assert.notDeepEqual(sodaShortcutSpec('play'), sodaShortcutSpec('next'));
  assert.equal(sodaShortcutSpec('invalid'), null);
});
