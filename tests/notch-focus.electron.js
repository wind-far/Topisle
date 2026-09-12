const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-panel-focus-'));
app.setPath('userData', testUserData);
app.once('will-quit', () => {
  fs.rmSync(testUserData, { recursive: true, force: true });
});

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 200,
    height: 38,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
  });

  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    await window.webContents.executeJavaScript(`
      localStorage.removeItem('notch-custom-widgets-v1');
      localStorage.removeItem('notch-home-layout-v4');
      localStorage.removeItem('notch-home-layout-hint-seen-v1');
    `);
    await new Promise((resolve) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.reload();
    });
    window.show();
    window.focus();
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const focusStyle = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const notch = document.getElementById('notch');
        requestAnimationFrame(() => {
          const notchStyle = getComputedStyle(notch);
          const dotStyle = getComputedStyle(notch.querySelector('.notch-dot'));
          resolve({
            active: document.activeElement === notch,
            focusVisible: notch.matches(':focus-visible'),
            outlineStyle: notchStyle.outlineStyle,
            outlineWidth: notchStyle.outlineWidth,
            dotBoxShadow: dotStyle.boxShadow,
          });
        });
      })
    `);

    assert.equal(focusStyle.active, true, '折叠条应能通过键盘获得焦点');
    assert.equal(
      focusStyle.outlineStyle,
      'none',
      `折叠外壳不能画焦点描边，当前为 ${focusStyle.outlineWidth} ${focusStyle.outlineStyle}`
    );
    assert.notEqual(
      focusStyle.dotBoxShadow,
      'none',
      `焦点提示应转移到中间抓握条（focus-visible=${focusStyle.focusVisible}）`
    );

    window.setSize(1240, 616);
    const settingsSurface = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const appSurface = document.getElementById('app');
        appSurface.classList.remove('collapsed');
        appSurface.classList.add('expanded');
        document.getElementById('tab-button-settings').click();
        setTimeout(() => {
          const page = document.getElementById('settings-page');
          resolve({
            rightmostTab: document.querySelector('.tab[data-tab]:last-of-type')?.dataset.tab,
            activePanel: document.getElementById('tab-settings')?.classList.contains('active'),
            display: getComputedStyle(page).display,
            columns: getComputedStyle(page).gridTemplateColumns.split(' ').filter(Boolean).length,
            api: Boolean(document.getElementById('settings-api-configure')),
            mirror: Boolean(document.getElementById('settings-mirror-choose')),
            features: document.querySelectorAll('[data-settings-feature]').length,
            widgets: Boolean(document.getElementById('settings-widget-add') && document.getElementById('widget-editor-form')),
            shortcut: Boolean(document.getElementById('settings-shortcut-change')),
            workspace: Boolean(document.getElementById('settings-workspace-choose')),
            autoLaunch: Boolean(document.getElementById('settings-auto-launch')),
          });
        }, 80);
      })
    `);

    assert.deepEqual(settingsSurface, {
      rightmostTab: 'settings',
      activePanel: true,
      display: 'grid',
      columns: 2,
      api: true,
      mirror: true,
      features: 6,
      widgets: true,
      shortcut: true,
      workspace: true,
      autoLaunch: true,
    });

    const customLinksEditing = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        document.getElementById('tab-button-settings').click();
        document.getElementById('settings-widget-add').click();
        const type = document.getElementById('widget-editor-type');
        type.value = 'links';
        type.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('widget-editor-name').value = '项目入口';
        const add = document.getElementById('widget-editor-link-add');
        add.click();
        add.click();
        let rows = [...document.querySelectorAll('[data-widget-link-row]')];
        const values = [
          ['文档', 'https://docs.example.com'],
          ['看板', 'https://board.example.com'],
          ['仓库', 'https://repo.example.com'],
        ];
        rows.forEach((row, index) => {
          row.querySelector('[data-widget-link-label]').value = values[index][0];
          row.querySelector('[data-widget-link-url]').value = values[index][1];
        });
        rows[2].querySelector('[data-widget-link-move="up"]').click();
        document.getElementById('widget-editor-form').requestSubmit();

        setTimeout(() => {
          const created = JSON.parse(localStorage.getItem('notch-custom-widgets-v1') || '[]');
          const widget = created.find((item) => item.title === '项目入口');
          document.querySelector('[data-widget-edit="' + widget.id + '"]').click();
          const hiddenText = document.getElementById('widget-editor-content');
          document.getElementById('widget-editor-name').value = '项目导航';
          rows = [...document.querySelectorAll('[data-widget-link-row]')];
          rows[2].querySelector('[data-widget-link-move="up"]').click();
          document.getElementById('widget-editor-form').requestSubmit();
          setTimeout(() => {
            const saved = JSON.parse(localStorage.getItem('notch-custom-widgets-v1') || '[]')
              .find((item) => item.id === widget.id);
            resolve({
              title: saved.title,
              itemCount: saved.config.items.length,
              labels: saved.config.items.map((item) => item.label),
              hiddenTextDisabled: hiddenText.disabled,
              hiddenTextRects: hiddenText.getClientRects().length,
              editorClosed: document.getElementById('widget-editor-backdrop').hidden,
            });
          }, 20);
        }, 20);
      })
    `);

    assert.deepEqual(customLinksEditing, {
      title: '项目导航',
      itemCount: 3,
      labels: ['文档', '看板', '仓库'],
      hiddenTextDisabled: true,
      hiddenTextRects: 0,
      editorClosed: true,
    });

    const localDataWidgets = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        localStorage.setItem('notch-note-archive-v1', JSON.stringify([{
          id: 'note-ref-1',
          title: '发布清单',
          content: '这段正文不能进入组件配置',
          createdAt: 1,
          updatedAt: 2,
        }]));
        localStorage.setItem('notch-link-groups', JSON.stringify([{
          id: 'group-ref-1',
          name: '工作资料',
          links: [{ id: 'link-1', title: '内部资料', url: 'https://example.com/private-copy' }],
        }]));

        const createWidget = (type, title, configure) => {
          document.getElementById('settings-widget-add').click();
          const typeInput = document.getElementById('widget-editor-type');
          typeInput.value = type;
          typeInput.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('widget-editor-name').value = title;
          configure();
          document.getElementById('widget-editor-form').requestSubmit();
          return JSON.parse(localStorage.getItem('notch-custom-widgets-v1') || '[]')
            .find((item) => item.title === title);
        };
        const editWidget = (widget, configure) => {
          document.querySelector('[data-widget-edit="' + widget.id + '"]').click();
          configure();
          document.getElementById('widget-editor-form').requestSubmit();
        };

        const todos = createWidget('todayTodos', '今日冲刺', () => {
          document.getElementById('widget-editor-today-todos-limit').value = '7';
          document.getElementById('widget-editor-today-todos-overdue').checked = false;
        });
        const note = createWidget('recentNote', '发布笔记', () => {
          document.getElementById('widget-editor-recent-note-id').value = 'note-ref-1';
          document.getElementById('widget-editor-recent-note-excerpt').checked = false;
        });
        const group = createWidget('linkGroup', '工作链接', () => {
          document.getElementById('widget-editor-link-group-id').value = 'group-ref-1';
          document.getElementById('widget-editor-link-group-limit').value = '5';
        });

        editWidget(todos, () => {
          document.getElementById('widget-editor-today-todos-limit').value = '8';
          document.getElementById('widget-editor-today-todos-overdue').checked = true;
        });
        editWidget(note, () => {
          document.getElementById('widget-editor-recent-note-excerpt').checked = true;
        });
        editWidget(group, () => {
          document.getElementById('widget-editor-link-group-limit').value = '3';
        });

        setTimeout(() => {
          const saved = JSON.parse(localStorage.getItem('notch-custom-widgets-v1') || '[]');
          const byId = (widget) => saved.find((item) => item.id === widget.id);
          const savedTodos = byId(todos);
          const savedNote = byId(note);
          const savedGroup = byId(group);
          resolve({
            todosConfig: savedTodos.config,
            noteConfig: savedNote.config,
            groupConfig: savedGroup.config,
            noteKeys: Object.keys(savedNote.config).sort(),
            groupKeys: Object.keys(savedGroup.config).sort(),
            noteBodyLeaked: JSON.stringify(savedNote.config).includes('这段正文'),
            groupLinksLeaked: Object.hasOwn(savedGroup.config, 'links'),
          });
        }, 20);
      })
    `);

    assert.deepEqual(localDataWidgets, {
      todosConfig: { limit: 8, includeOverdue: true },
      noteConfig: { noteId: 'note-ref-1', showExcerpt: true },
      groupConfig: { groupId: 'group-ref-1', limit: 3 },
      noteKeys: ['noteId', 'showExcerpt'],
      groupKeys: ['groupId', 'limit'],
      noteBodyLeaked: false,
      groupLinksLeaked: false,
    });

    const todoCalendarNavigation = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        document.getElementById('tab-button-todo').click();
        const trigger = document.querySelector('.todo-deadline-trigger[data-deadline-priority="P0"]');
        trigger.click();
        const previous = document.getElementById('todo-calendar-previous');
        const next = document.getElementById('todo-calendar-next');
        if (!previous || !next) {
          resolve({ controls: false });
          return;
        }
        const base = new Date();
        const popover = document.getElementById('todo-date-popover');
        const previousRect = previous.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();
        const clicksToJanuary = 12 - base.getMonth();
        for (let index = 0; index < clicksToJanuary; index += 1) next.click();
        const expectedYear = base.getFullYear() + 1;
        const januaryLabel = document.getElementById('todo-editor-month').textContent.trim();
        const day = [...document.querySelectorAll('#todo-calendar-grid [data-day]')]
          .find((button) => button.dataset.day === '2');
        day.click();
        const selected = new Date(trigger.dataset.deadline);
        previous.click();
        resolve({
          controls: true,
          popoverVisible: !popover.hidden && getComputedStyle(popover).display !== 'none',
          controlsUsable: [previousRect.width, previousRect.height, nextRect.width, nextRect.height]
            .every((size) => size >= 18),
          januaryLabel,
          decemberLabel: document.getElementById('todo-editor-month').textContent.trim(),
          selected: [selected.getFullYear(), selected.getMonth(), selected.getDate()],
          expectedYear,
        });
      })
    `);

    assert.deepEqual(todoCalendarNavigation, {
      controls: true,
      popoverVisible: true,
      controlsUsable: true,
      januaryLabel: `${new Date().getFullYear() + 1}年 1月`,
      decemberLabel: `${new Date().getFullYear()}年 12月`,
      selected: [new Date().getFullYear() + 1, 0, 2],
      expectedYear: new Date().getFullYear() + 1,
    });
  } finally {
    window.destroy();
  }
}

main().then(
  () => app.quit(),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);
