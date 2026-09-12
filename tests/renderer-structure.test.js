const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const workspaceJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'workspace.js'), 'utf8');
const widgetRegistryJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'widgets', 'registry.js'), 'utf8');

test('clipboard rows define both favorite icons before rendering entries', () => {
  assert.match(appJs, /const starOutlineSvg\s*=/);
  assert.match(appJs, /const starFilledSvg\s*=/);
});

test('notes have a dedicated top-level tab and management panel', () => {
  assert.match(html, /data-tab="notes"/);
  assert.match(html, /id="tab-notes"/);
  assert.match(html, /id="notes-search"/);
  assert.match(html, /id="notes-list"/);
  assert.match(html, /id="notes-detail"/);
});

test('home scratch note keeps only the save action', () => {
  const homeNote = html.match(/<section class="tile home-note"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(homeNote, /id="note-save-btn"/);
  assert.doesNotMatch(homeNote, /id="note-library-btn"/);
  assert.doesNotMatch(homeNote, /id="note-library"/);
});

test('recordings expose in-page API settings and create a live draft while recording', () => {
  assert.match(html, /id="recording-configure"/);
  assert.match(workspaceJs, /function beginRecordingDraft\(\)/);
  assert.match(workspaceJs, /recordingLiveTranscript/);
  assert.match(workspaceJs, /configure-transcription/);
});

test('a live recording can be paused, resumed, and stopped from the recordings tab', () => {
  assert.match(workspaceJs, /recording-live-pause/);
  assert.match(workspaceJs, /recording-live-stop/);
  assert.match(workspaceJs, /togglePauseRecording/);
  assert.match(workspaceJs, /stopRecording/);
});

test('settings expose declaration-only custom widgets without arbitrary code inputs', () => {
  assert.match(html, /id="settings-widget-add"/);
  assert.match(html, /id="settings-widget-list"/);
  assert.match(html, /id="widget-editor-form"/);
  assert.match(html, /widgets\/registry\.js/);
  assert.match(html, /widgets\/renderers\.js/);
  assert.match(workspaceJs, /notch:widget-create/);
  assert.match(workspaceJs, /notch:widget-update/);
  assert.match(workspaceJs, /notch:widget-delete/);
  assert.doesNotMatch(html, /widget-editor-(?:html|javascript|script)/i);
  assert.match(widgetRegistryJs, /const WIDGET_TYPES = Object\.freeze/);
});

test('custom link widgets preserve and manage every configured link', () => {
  assert.match(html, /id="widget-editor-links-list"/);
  assert.match(html, /id="widget-editor-link-add"/);
  assert.match(workspaceJs, /const MAX_WIDGET_LINKS = 12/);
  assert.match(workspaceJs, /function renderWidgetLinkEditor\(items = \[\]\)/);
  assert.match(workspaceJs, /items\.slice\(0, MAX_WIDGET_LINKS\)/);
  assert.match(workspaceJs, /function readWidgetLinkEditor\(\)/);
  assert.match(workspaceJs, /querySelectorAll\('\[data-widget-link-row\]'\)/);
  assert.match(workspaceJs, /dataset\.widgetLinkMove === 'up'/);
  assert.match(workspaceJs, /dataset\.widgetLinkMove === 'down'/);
  assert.match(workspaceJs, /data-widget-link-remove/);
  assert.doesNotMatch(workspaceJs, /config\.items\?\.\[0\]/);
});

test('local data widgets expose reference-only editors for todos, notes, and link groups', () => {
  assert.match(html, /option value="todayTodos"/);
  assert.match(html, /option value="recentNote"/);
  assert.match(html, /option value="linkGroup"/);
  assert.match(html, /id="widget-editor-today-todos-limit"[^>]+min="1" max="8"/);
  assert.match(html, /id="widget-editor-recent-note-id"/);
  assert.match(html, /id="widget-editor-link-group-id"[^>]+required/);
  assert.match(workspaceJs, /NOTE_ARCHIVE_KEY = 'notch-note-archive-v1'/);
  assert.match(workspaceJs, /noteId: widgetEditorRecentNoteId\?\.value \|\| ''/);
  assert.match(workspaceJs, /groupId: widgetEditorLinkGroupId\?\.value \|\| ''/);
  assert.match(workspaceJs, /includeOverdue: widgetEditorTodayTodosOverdue\?\.checked !== false/);
  assert.match(workspaceJs, /原笔记已不存在/);
  assert.match(workspaceJs, /暂无可选链接分组/);
});

test('custom widget editor traps focus on visible controls and exposes capacity guidance', () => {
  assert.match(html, /id="home-widget-manage"/);
  assert.match(html, /id="settings-widget-count"/);
  assert.match(html, /最多 8 个；新增后首页会自动适配布局/);
  assert.match(workspaceJs, /element\.closest\('\[hidden\], \[aria-hidden="true"\]'\)/);
  assert.match(workspaceJs, /element\.getClientRects\(\)\.length > 0/);
  assert.match(workspaceJs, /widgets\.length >= MAX_CUSTOM_WIDGETS/);
  assert.match(workspaceJs, /tab-button-settings/);
});

test('custom widgets expose accessible ordering and one-time layout guidance', () => {
  assert.match(html, /id="home-layout-hint"/);
  assert.match(html, /id="home-layout-hint-close"/);
  assert.match(html, /id="settings-widget-order-status"/);
  assert.match(workspaceJs, /notch:widget-move/);
  assert.match(workspaceJs, /detail: \{ id, direction \}/);
  assert.match(workspaceJs, /dataset\.widgetMove = 'previous'/);
  assert.match(workspaceJs, /dataset\.widgetMove = 'next'/);
  assert.match(workspaceJs, /HOME_LAYOUT_HINT_KEY/);
  assert.match(workspaceJs, /pendingRestoredWidgetFocusId/);
});

test('workspace switching accepts only explicit success and explains damaged targets', () => {
  assert.match(workspaceJs, /result === true \|\| result\?\.ok === true/);
  assert.match(workspaceJs, /invalid_workspace_json/);
  assert.match(workspaceJs, /invalid_workspace_storage/);
  assert.match(workspaceJs, /unsupported_workspace_version/);
  assert.match(workspaceJs, /workspace_unreadable/);
  assert.match(workspaceJs, /workspace_migration_failed/);
  assert.match(workspaceJs, /workspace_settings_save_failed/);
  assert.match(workspaceJs, /所选工作区数据文件损坏或格式无效，未切换。/);
  assert.match(workspaceJs, /工作区切换失败，原数据位置未改变。/);
});
