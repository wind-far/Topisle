(function exposeWidgetRenderers(root, factory) {
  const registry = root && root.NotchWidgetRegistry
    ? root.NotchWidgetRegistry
    : (typeof require === 'function' ? require('./registry') : null);
  const api = factory(registry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NotchWidgetRenderers = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWidgetRenderers(registry) {
  function element(documentRef, tagName, className, text) {
    const node = documentRef.createElement(tagName);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function renderTextWidget(container, instance) {
    const body = element(container.ownerDocument, 'p', 'custom-widget-text', instance.config.body);
    container.appendChild(body);
    return () => {};
  }

  function countdownLabel(targetTime, now) {
    const remaining = Date.parse(targetTime) - now;
    if (remaining <= 0) return '已到时间';
    const totalMinutes = Math.ceil(remaining / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) return `${days}天 ${hours}小时`;
    if (hours) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
  }

  function renderCountdownWidget(container, instance, options) {
    const documentRef = container.ownerDocument;
    const value = element(documentRef, 'time', 'custom-widget-countdown');
    value.dateTime = instance.config.targetTime;
    const update = () => {
      const now = options && typeof options.now === 'function' ? options.now() : Date.now();
      value.textContent = countdownLabel(instance.config.targetTime, now);
    };
    update();
    container.appendChild(value);
    if (instance.config.note) {
      container.appendChild(element(documentRef, 'p', 'custom-widget-note', instance.config.note));
    }
    const setIntervalRef = options && options.setInterval ? options.setInterval : setInterval;
    const clearIntervalRef = options && options.clearInterval ? options.clearInterval : clearInterval;
    const timer = setIntervalRef(update, 30000);
    return () => clearIntervalRef(timer);
  }

  function renderLinksWidget(container, instance, options) {
    const documentRef = container.ownerDocument;
    const list = element(documentRef, 'ul', 'custom-widget-links');
    instance.config.items.forEach((item) => {
      const row = element(documentRef, 'li', 'custom-widget-link-item');
      const link = element(documentRef, 'a', 'custom-widget-link', item.label);
      link.href = item.url;
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (!options || typeof options.openExternal !== 'function') return;
        const result = options.openExternal(item.url);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      });
      row.appendChild(link);
      list.appendChild(row);
    });
    container.appendChild(list);
    return () => {};
  }

  function resolvedData(instance, options) {
    if (!options || typeof options.resolveData !== 'function') return { status: 'empty' };
    try {
      const result = options.resolveData(instance);
      return result && typeof result === 'object' ? result : { status: 'empty' };
    } catch (error) {
      return { status: 'empty' };
    }
  }

  function appendNavigationButton(container, label, tab, detail, options) {
    const button = element(container.ownerDocument, 'button', 'custom-widget-navigation', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (options && typeof options.navigate === 'function') options.navigate(tab, detail || {});
    });
    container.appendChild(button);
  }

  function renderTodayTodosWidget(container, instance, options) {
    const data = resolvedData(instance, options);
    if (!Array.isArray(data.items) || !data.items.length) {
      container.appendChild(element(container.ownerDocument, 'p', 'custom-widget-empty', '今天没有未完成待办'));
    } else {
      const list = element(container.ownerDocument, 'ul', 'custom-widget-todos');
      data.items.forEach((item) => {
        const row = element(container.ownerDocument, 'li', 'custom-widget-todo-item');
        const text = element(container.ownerDocument, 'span', 'custom-widget-todo-text', item.text);
        const state = element(container.ownerDocument, 'small', 'custom-widget-todo-state', item.overdue ? '已逾期' : '今天');
        row.append(text, state);
        list.appendChild(row);
      });
      container.appendChild(list);
    }
    appendNavigationButton(container, '查看待办', 'todo', {}, options);
    return () => {};
  }

  function renderRecentNoteWidget(container, instance, options) {
    const data = resolvedData(instance, options);
    if (!data.note) {
      container.appendChild(element(container.ownerDocument, 'p', 'custom-widget-empty', '引用的笔记不存在'));
      appendNavigationButton(container, '查看笔记', 'notes', {}, options);
      return () => {};
    }
    container.appendChild(element(container.ownerDocument, 'strong', 'custom-widget-note-title', data.note.title));
    if (data.note.excerpt) {
      container.appendChild(element(container.ownerDocument, 'p', 'custom-widget-note-excerpt', data.note.excerpt));
    }
    appendNavigationButton(container, '打开笔记', 'notes', { noteId: data.note.id }, options);
    return () => {};
  }

  function renderLinkGroupWidget(container, instance, options) {
    const data = resolvedData(instance, options);
    if (!data.group) {
      container.appendChild(element(container.ownerDocument, 'p', 'custom-widget-empty', '引用的链接分组不存在'));
      return () => {};
    }
    if (!Array.isArray(data.items) || !data.items.length) {
      container.appendChild(element(container.ownerDocument, 'p', 'custom-widget-empty', '这个分组还没有可用链接'));
      return () => {};
    }
    const list = element(container.ownerDocument, 'ul', 'custom-widget-links custom-widget-link-group');
    data.items.forEach((item) => {
      const row = element(container.ownerDocument, 'li', 'custom-widget-link-item');
      const link = element(container.ownerDocument, 'a', 'custom-widget-link', item.label);
      link.href = item.url;
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (!options || typeof options.openExternal !== 'function') return;
        const result = options.openExternal(item.url);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      });
      row.appendChild(link);
      list.appendChild(row);
    });
    container.appendChild(list);
    return () => {};
  }

  const RENDERERS = Object.freeze({
    text: renderTextWidget,
    countdown: renderCountdownWidget,
    links: renderLinksWidget,
    todayTodos: renderTodayTodosWidget,
    recentNote: renderRecentNoteWidget,
    linkGroup: renderLinkGroupWidget,
  });

  function renderWidget(container, value, options) {
    if (!container || !container.ownerDocument || !registry) return null;
    const instance = registry.normalizeWidgetInstance(value);
    if (!instance || !RENDERERS[instance.type]) return null;
    container.replaceChildren();
    const title = element(container.ownerDocument, 'h3', 'custom-widget-title', instance.title);
    container.appendChild(title);
    const content = element(container.ownerDocument, 'div', 'custom-widget-content');
    container.appendChild(content);
    const cleanup = RENDERERS[instance.type](content, instance, options) || (() => {});
    return { instance, cleanup };
  }

  const mounted = new Map();

  function mount(container, widget, options) {
    const previous = mounted.get(container);
    if (previous) previous.cleanup();
    const result = renderWidget(container, widget, options);
    if (!result) {
      mounted.delete(container);
      return null;
    }
    mounted.set(container, { widget: result.instance, options, cleanup: result.cleanup });
    return result;
  }

  function unmount(container) {
    const previous = mounted.get(container);
    if (previous) previous.cleanup();
    mounted.delete(container);
    if (container && typeof container.replaceChildren === 'function') container.replaceChildren();
  }

  function refreshAll() {
    [...mounted.entries()].forEach(([container, entry]) => {
      if (container.isConnected === false) {
        entry.cleanup();
        mounted.delete(container);
        return;
      }
      mount(container, entry.widget, entry.options);
    });
  }

  return {
    RENDERERS,
    countdownLabel,
    renderWidget,
    mount,
    unmount,
    refreshAll,
  };
});
