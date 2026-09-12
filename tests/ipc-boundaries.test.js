const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'renderer', 'app.js'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(projectRoot, 'renderer', 'workspace.js'), 'utf8');

function loadPreload(relativePath) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  let exposed = null;
  const invokes = [];
  const sends = [];
  const listeners = new Map();
  const electron = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        exposed = { name, api };
      },
    },
    ipcRenderer: {
      invoke(channel, ...args) {
        invokes.push([channel, ...args]);
        return Promise.resolve(true);
      },
      send(channel, ...args) {
        sends.push([channel, ...args]);
      },
      on(channel, handler) {
        listeners.set(channel, handler);
      },
      removeListener(channel) {
        listeners.delete(channel);
      },
    },
  };
  vm.runInNewContext(source, {
    require(id) {
      if (id === 'electron') return electron;
      throw new Error(`Unexpected preload dependency: ${id}`);
    },
  }, { filename: relativePath });
  return { exposed, invokes, sends, listeners };
}

test('notification preload exposes only notification capabilities', () => {
  const { exposed } = loadPreload('renderer/notification-preload.js');
  assert.equal(exposed.name, 'notchAPI');
  assert.deepEqual(Object.keys(exposed.api).sort(), [
    'activateTaskNotification',
    'onTaskNotification',
    'onTaskNotificationHide',
    'onTaskNotificationQueue',
    'taskNotificationDismissed',
    'taskNotificationHover',
  ]);
  assert.equal('getCredential' in exposed.api, false);
  assert.equal('openPath' in exposed.api, false);
  assert.equal('saveWorkspaceData' in exposed.api, false);
});

test('workspace saves include the renderer expected root', async () => {
  const { exposed, invokes } = loadPreload('preload.js');
  const storage = { example: 'value' };
  await exposed.api.saveWorkspaceData(storage, '/expected/workspace');
  assert.deepEqual(JSON.parse(JSON.stringify(invokes.at(-1))), [
    'workspace:save-data',
    { storage, expectedPath: '/expected/workspace' },
  ]);
});

test('workspace selection flushes the current renderer snapshot before opening a target', async () => {
  const { exposed, invokes } = loadPreload('preload.js');
  const storage = { firstRun: 'preserved' };
  await exposed.api.chooseWorkspace(storage, '/current/workspace');
  assert.deepEqual(JSON.parse(JSON.stringify(invokes.at(-1))), [
    'workspace:choose',
    { storage, expectedPath: '/current/workspace' },
  ]);
});

test('workspace load failures stop autosave and workspace selection sends a fresh snapshot', () => {
  assert.match(appSource, /if \(!loaded\?\.ok\) \{[\s\S]{0,260}?stopWorkspaceSaving\(\)[\s\S]{0,260}?return;/);
  assert.match(appSource, /const snapshot = loaded\.storage/);
  assert.match(workspaceSource, /for \(let index = 0; index < localStorage\.length; index \+= 1\)/);
  assert.match(workspaceSource, /chooseWorkspace\?\.\([\s\S]{0,160}?snapshot,[\s\S]{0,160}?currentWorkspace\?\.path/);
  assert.match(workspaceSource, /workspace_flush_failed/);
});

test('main process guards privileged IPC with the trusted main sender', () => {
  assert.match(mainSource, /function isTrustedMainSender\(event\)/);
  const channels = [
    'workspace:save-data',
    'workspace:open',
    'workspace:choose',
    'shell:openExternal',
    'shell:openPath',
    'shell:open-privacy-settings',
    'credentials:list',
    'credentials:get',
    'credentials:save',
    'credentials:delete-many',
    'credentials:copy',
    'recordings:save',
    'recordings:read',
    'recordings:delete',
    'recordings:reveal',
    'clipboard:readImage',
    'clipboard:deleteImages',
    'clipboard:write',
    'clipboard:paste',
  ];
  channels.forEach((channel) => {
    const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const handler = new RegExp(
      `ipcMain\\.handle\\('${escaped}'[\\s\\S]{0,180}?isTrustedMainSender\\(event\\)`
    );
    assert.match(mainSource, handler, `${channel} must reject non-main renderers`);
  });
});

test('workspace switch tells the renderer to reload target data and rejects stale writers', () => {
  assert.match(mainSource, /strategy:\s*'reload-target'/);
  assert.match(mainSource, /const inspected = inspectWorkspaceTarget\(workspaceRoot\(\), WORKSPACE_DATA_FILE\)/);
  assert.match(mainSource, /storage: inspected\.kind === 'existing' \? inspected\.envelope\.localStorage : \{\}/);
  assert.match(mainSource, /const target = inspectWorkspaceTarget\(selected, WORKSPACE_DATA_FILE\)/);
  assert.match(mainSource, /if \(!target\.ok\) return \{ ok: false, error: target\.error \}/);
  assert.match(mainSource, /if \(target\.kind === 'empty'\)/);
  assert.match(mainSource, /workspacePathsMatch\(previousRoot, selected\)/);
  assert.match(
    mainSource,
    /saveWorkspaceSnapshot\(rendererExpectedPath, workspaceRoot\(\), portableStorage/
  );
  assert.match(mainSource, /const flushed = persistWorkspaceSnapshot\(payload && payload\.storage, payload && payload\.expectedPath\)/);
  assert.match(mainSource, /if \(!flushed\.ok\) return \{ ok: false, error: 'workspace_flush_failed', reason: flushed\.error \}/);
  assert.match(
    mainSource,
    /preload:\s*path\.join\(__dirname,\s*'renderer',\s*'notification-preload\.js'\)/
  );
});

test('local window navigation delegates exact-entry reload decisions to the tested policy', () => {
  assert.match(mainSource, /function lockDownLocalWindow\(targetWindow, entryFilePath\)/);
  assert.match(mainSource, /lockDownLocalWebContents\(targetWindow\.webContents, entryFilePath\)/);
  assert.match(mainSource, /lockDownLocalWindow\(mainWindow, mainEntryPath\)/);
  assert.match(mainSource, /lockDownLocalWindow\(targetWindow, notificationEntryPath\)/);
});
