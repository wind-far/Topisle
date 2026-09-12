const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { lockDownLocalWebContents } = require('../main-services');

async function waitForLoadCount(window, expected, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await window.webContents.executeJavaScript(
      'Number(document.body.dataset.loadCount || 0)',
      true
    ).catch(() => 0);
    if (count >= expected) return count;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${expected} local loads`);
}

async function main() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-panel-navigation-test-'));
  const entryPath = path.join(fixtureRoot, 'index.html');
  fs.writeFileSync(entryPath, `<!doctype html><meta charset="utf-8"><body><script>
    const count = Number(sessionStorage.getItem('load-count') || 0) + 1;
    sessionStorage.setItem('load-count', String(count));
    document.body.dataset.loadCount = String(count);
    if (count === 1) setTimeout(() => location.reload(), 20);
  </script></body>`);

  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  try {
    lockDownLocalWebContents(window.webContents, entryPath);
    await window.loadFile(entryPath);
    assert.equal(await waitForLoadCount(window, 2), 2, 'same-entry location.reload must be allowed');
    const entryUrl = window.webContents.getURL();
    await window.webContents.executeJavaScript("location.href = 'https://example.com/'", true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(window.webContents.getURL(), entryUrl, 'remote navigation must be blocked');
  } finally {
    if (!window.isDestroyed()) window.destroy();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
