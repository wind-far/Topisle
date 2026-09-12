const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// 提醒窗口只拥有展示、悬停、关闭与激活当前提醒所需的最小能力。
contextBridge.exposeInMainWorld('notchAPI', {
  onTaskNotification: (callback) =>
    subscribe('task-notification:show', (event, notification) => callback(notification)),
  onTaskNotificationQueue: (callback) =>
    subscribe('task-notification:queue', (event, count) => callback(count)),
  onTaskNotificationHide: (callback) =>
    subscribe('task-notification:hide', (event, eventId) => callback(eventId)),
  taskNotificationDismissed: (eventId) =>
    ipcRenderer.send('task-notification:dismissed', eventId),
  activateTaskNotification: (eventId) =>
    ipcRenderer.invoke('task-notification:activate', eventId),
  taskNotificationHover: (paused) =>
    ipcRenderer.send('task-notification:hover', paused === true),
});
