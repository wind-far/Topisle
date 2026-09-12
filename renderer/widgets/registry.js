(function exposeWidgetRegistry(root, factory) {
  const domain = root && root.NotchDomain
    ? root.NotchDomain
    : (typeof require === 'function' ? require('../domain') : null);
  const api = factory(domain);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.NotchWidgetRegistry = api;
    root.NotchWidgets = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createWidgetRegistry(domain) {
  const WIDGET_SCHEMA_VERSION = 2;
  const WIDGET_SIZES = Object.freeze(['mini', 'small', 'medium', 'large']);
  const WIDGET_TYPES = Object.freeze({
    text: Object.freeze({
      type: 'text',
      label: '文本卡片',
      defaultTitle: '文本',
      defaultSize: 'small',
      allowedSizes: Object.freeze(['small', 'medium', 'large']),
    }),
    countdown: Object.freeze({
      type: 'countdown',
      label: '倒计时',
      defaultTitle: '倒计时',
      defaultSize: 'small',
      allowedSizes: Object.freeze(['mini', 'small', 'medium']),
    }),
    links: Object.freeze({
      type: 'links',
      label: '快捷链接',
      defaultTitle: '快捷链接',
      defaultSize: 'medium',
      allowedSizes: Object.freeze(['small', 'medium', 'large']),
    }),
    todayTodos: Object.freeze({
      type: 'todayTodos',
      label: '今日待办',
      defaultTitle: '今日待办',
      defaultSize: 'medium',
      allowedSizes: Object.freeze(['small', 'medium', 'large']),
    }),
    recentNote: Object.freeze({
      type: 'recentNote',
      label: '最近笔记',
      defaultTitle: '最近笔记',
      defaultSize: 'small',
      allowedSizes: Object.freeze(['small', 'medium', 'large']),
    }),
    linkGroup: Object.freeze({
      type: 'linkGroup',
      label: '链接分组',
      defaultTitle: '链接分组',
      defaultSize: 'medium',
      allowedSizes: Object.freeze(['small', 'medium', 'large']),
    }),
  });

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
  }

  function isPrivateHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (
      host === '::'
      || host === '::1'
      || host === '0:0:0:0:0:0:0:1'
      || /^f[cd][0-9a-f]{2}:/.test(host)
      || /^fe[89ab][0-9a-f]:/.test(host)
    ) return true;
    const mappedIpv4 = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (mappedIpv4) return isPrivateHostname(mappedIpv4);
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }

  function normalizePublicHttpUrl(value) {
    const input = cleanText(value, 2048);
    if (!input) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || isPrivateHostname(url.hostname)) return null;
      url.username = '';
      url.password = '';
      return url.toString();
    } catch (error) {
      return null;
    }
  }

  function normalizeConfig(type, config) {
    const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    if (type === 'text') {
      return { body: cleanText(source.body, 4000) };
    }
    if (type === 'countdown') {
      const timestamp = Date.parse(String(source.targetTime || ''));
      if (!Number.isFinite(timestamp)) return null;
      return {
        targetTime: new Date(timestamp).toISOString(),
        note: cleanText(source.note, 160),
      };
    }
    if (type === 'links') {
      if (!Array.isArray(source.items)) return { items: [] };
      const items = source.items.slice(0, 12).map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = normalizePublicHttpUrl(item.url);
        if (!url) return null;
        return {
          label: cleanText(item.label, 80) || new URL(url).hostname,
          url,
        };
      }).filter(Boolean);
      return { items };
    }
    if (type === 'todayTodos') {
      const limit = Math.min(8, Math.max(1, Math.trunc(Number(source.limit) || 4)));
      return { limit, includeOverdue: source.includeOverdue !== false };
    }
    if (type === 'recentNote') {
      return {
        noteId: cleanText(source.noteId, 160),
        showExcerpt: source.showExcerpt !== false,
      };
    }
    if (type === 'linkGroup') {
      return {
        groupId: cleanText(source.groupId, 160),
        limit: Math.min(8, Math.max(1, Math.trunc(Number(source.limit) || 6))),
      };
    }
    return null;
  }

  function normalizeWidgetId(value) {
    const id = cleanText(value, 72).toLowerCase();
    return /^custom-[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? id : '';
  }

  function normalizeCurrentWidgetInstance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const definition = WIDGET_TYPES[value.type];
    const id = normalizeWidgetId(value.id);
    if (!definition || !id) return null;
    const config = normalizeConfig(definition.type, value.config);
    if (!config) return null;
    const requestedSize = WIDGET_SIZES.includes(value.size) ? value.size : definition.defaultSize;
    const size = definition.allowedSizes.includes(requestedSize) ? requestedSize : definition.defaultSize;
    return {
      schemaVersion: WIDGET_SCHEMA_VERSION,
      id,
      type: definition.type,
      title: cleanText(value.title, 80) || definition.defaultTitle,
      size,
      enabled: value.enabled !== false,
      config,
    };
  }

  // 无版本字段视为早期 v0 数据；只允许已知旧版本前向迁移。
  // 高于当前版本的数据必须保留原文并等待新版应用处理，不能静默降级覆盖。
  function migrateWidgetInstance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { status: 'invalid', value: null, raw: value };
    }
    const rawVersion = value.schemaVersion == null ? 0 : Number(value.schemaVersion);
    if (!Number.isInteger(rawVersion) || rawVersion < 0) {
      return { status: 'invalid', value: null, raw: value };
    }
    if (rawVersion > WIDGET_SCHEMA_VERSION) {
      return { status: 'unsupported', value: null, raw: value, schemaVersion: rawVersion };
    }
    let migrated = { ...value };
    let version = rawVersion;
    if (version === 0) {
      migrated = { ...migrated, schemaVersion: 1 };
      version = 1;
    }
    if (version === 1) {
      // v2 adds reference-only local data widgets. Existing v1 declarations need no
      // payload rewrite, but receive an explicit version upgrade before normalization.
      migrated = { ...migrated, schemaVersion: 2 };
      version = 2;
    }
    const normalized = normalizeCurrentWidgetInstance(migrated);
    return normalized
      ? { status: 'ready', value: normalized, raw: value, migrated: rawVersion !== WIDGET_SCHEMA_VERSION }
      : { status: 'invalid', value: null, raw: value };
  }

  function normalizeWidgetInstance(value) {
    const result = migrateWidgetInstance(value);
    return result.status === 'ready' ? result.value : null;
  }

  function validateWidgetManifest(value) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, errors: ['组件配置必须是对象。'], value: null };
    }
    if (value.schemaVersion != null && value.schemaVersion !== WIDGET_SCHEMA_VERSION) {
      errors.push(`不支持的 schemaVersion：${value.schemaVersion}`);
    }
    if (!WIDGET_TYPES[value.type]) errors.push('组件类型不在白名单中。');
    if (!normalizeWidgetId(value.id)) errors.push('组件 ID 必须以 custom- 开头，且只能包含小写字母、数字、下划线和连字符。');
    if (value.title != null && !cleanText(value.title, 80)) errors.push('组件标题不能为空。');
    if (value.size != null && !WIDGET_SIZES.includes(value.size)) errors.push('组件尺寸无效。');
    if (WIDGET_TYPES[value.type] && value.size != null
      && !WIDGET_TYPES[value.type].allowedSizes.includes(value.size)) {
      errors.push('该组件类型不支持所选尺寸。');
    }
    const config = value.config;
    if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
      errors.push('组件 config 必须是对象。');
    }
    if (value.type === 'text' && config && config.body != null && typeof config.body !== 'string') {
      errors.push('文本组件 body 必须是字符串。');
    }
    if (value.type === 'countdown' && !Number.isFinite(Date.parse(String(config && config.targetTime || '')))) {
      errors.push('倒计时必须提供有效的 targetTime。');
    }
    if (value.type === 'links') {
      if (!config || !Array.isArray(config.items)) {
        errors.push('快捷链接 items 必须是数组。');
      } else {
        if (config.items.length > 12) errors.push('快捷链接最多允许 12 项。');
        if (config.items.some((item) => !item || typeof item !== 'object' || !normalizePublicHttpUrl(item.url))) {
          errors.push('快捷链接只能包含公开的 http/https 地址。');
        }
      }
    }
    if (value.type === 'todayTodos' && config) {
      const limit = Number(config.limit == null ? 4 : config.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 8) errors.push('今日待办展示数量必须为 1 到 8。');
      if (config.includeOverdue != null && typeof config.includeOverdue !== 'boolean') {
        errors.push('今日待办 includeOverdue 必须是布尔值。');
      }
    }
    if (value.type === 'recentNote' && config) {
      if (config.noteId != null && typeof config.noteId !== 'string') errors.push('最近笔记 noteId 必须是字符串。');
      if (config.showExcerpt != null && typeof config.showExcerpt !== 'boolean') {
        errors.push('最近笔记 showExcerpt 必须是布尔值。');
      }
    }
    if (value.type === 'linkGroup') {
      if (!config || !cleanText(config.groupId, 160)) errors.push('链接分组必须提供 groupId。');
      const limit = Number(config && config.limit == null ? 6 : config && config.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 8) errors.push('链接分组展示数量必须为 1 到 8。');
    }
    const normalized = errors.length ? null : normalizeWidgetInstance(value);
    if (!normalized && !errors.length) errors.push('组件配置无效。');
    return { valid: errors.length === 0, errors, value: normalized };
  }

  function normalizeWidgetInstances(values) {
    return partitionWidgetInstances(values).instances;
  }

  function partitionWidgetInstances(values) {
    const seen = new Set();
    const instances = [];
    const unsupported = [];
    (Array.isArray(values) ? values : []).forEach((raw) => {
      const result = migrateWidgetInstance(raw);
      if (result.status === 'unsupported') {
        unsupported.push(raw);
        return;
      }
      const instance = result.value;
      if (!instance || seen.has(instance.id)) return;
      seen.add(instance.id);
      instances.push(instance);
    });
    return { instances, unsupported };
  }

  function getWidgetDefinition(type) {
    return WIDGET_TYPES[type] || null;
  }

  function getDefinitions() {
    return Object.values(WIDGET_TYPES).map((definition) => ({
      ...definition,
      allowedSizes: [...definition.allowedSizes],
    }));
  }

  function createInstance(input) {
    const source = input && typeof input === 'object' ? input : {};
    const type = WIDGET_TYPES[source.type] ? source.type : '';
    if (!type) return null;
    const randomPart = Math.random().toString(36).slice(2, 8);
    const id = normalizeWidgetId(source.id)
      || `custom-${type}-${Date.now().toString(36)}-${randomPart}`;
    return normalizeWidgetInstance({ ...source, id });
  }

  function updateInstance(values, id, patch) {
    const targetId = normalizeWidgetId(id);
    const changes = patch && typeof patch === 'object' ? patch : {};
    return normalizeWidgetInstances(values).map((instance) => {
      if (instance.id !== targetId) return instance;
      const next = normalizeWidgetInstance({
        ...instance,
        ...changes,
        id: instance.id,
        type: instance.type,
        config: changes.config && typeof changes.config === 'object'
          ? { ...instance.config, ...changes.config }
          : instance.config,
      });
      return next || instance;
    });
  }

  function removeInstance(values, id) {
    const targetId = String(id || '');
    return normalizeWidgetInstances(values).filter((instance) => instance.id !== targetId);
  }

  function resolveWidgetData(value, sources, options = {}) {
    const instance = normalizeWidgetInstance(value);
    if (!instance) return { status: 'invalid' };
    const data = sources && typeof sources === 'object' ? sources : {};
    if (instance.type === 'todayTodos') {
      const now = typeof options.now === 'function' ? Number(options.now()) : Number(options.now) || Date.now();
      const today = new Date(now);
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
      const groups = data.todos && typeof data.todos === 'object' ? data.todos : {};
      const rows = Object.entries(groups).flatMap(([priority, items]) => (
        Array.isArray(items) ? items.map((item) => ({ ...item, priority })) : []
      ));
      const items = rows.filter((item) => {
        const deadline = Date.parse(String(item && item.deadline || ''));
        return item && item.done !== true && Number.isFinite(deadline) && deadline < end
          && (instance.config.includeOverdue || deadline >= start);
      }).sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline))
        .slice(0, instance.config.limit)
        .map((item) => ({
          id: String(item.id || ''),
          priority: String(item.priority || ''),
          text: cleanText(item.text, 240),
          deadline: new Date(Date.parse(item.deadline)).toISOString(),
          overdue: Date.parse(item.deadline) < start,
        })).filter((item) => item.id && item.text);
      return { status: items.length ? 'ready' : 'empty', items };
    }
    if (instance.type === 'recentNote') {
      const notes = domain && typeof domain.normalizeNoteArchive === 'function'
        ? domain.normalizeNoteArchive(data.notes)
        : (Array.isArray(data.notes) ? data.notes : []);
      const note = instance.config.noteId
        ? notes.find((item) => item.id === instance.config.noteId)
        : notes[0];
      if (!note) return { status: 'empty', note: null };
      const content = String(note.content || '');
      return {
        status: 'ready',
        note: {
          id: String(note.id),
          title: cleanText(note.title, 80) || '未命名笔记',
          excerpt: instance.config.showExcerpt
            ? cleanText(content.replace(/[#*_~`>\[\]]/g, '').replace(/\s+/g, ' '), 180)
            : '',
          updatedAt: Math.max(0, Number(note.updatedAt) || 0),
        },
      };
    }
    if (instance.type === 'linkGroup') {
      const groups = Array.isArray(data.linkGroups) ? data.linkGroups : [];
      const group = groups.find((item) => item && String(item.id || '') === instance.config.groupId);
      if (!group) return { status: 'empty', group: null, items: [] };
      const items = (Array.isArray(group.links) ? group.links : []).map((item) => {
        const url = normalizePublicHttpUrl(item && item.url);
        if (!url) return null;
        return {
          id: cleanText(item.id, 160),
          label: cleanText(item.title || item.label, 80) || new URL(url).hostname,
          url,
        };
      }).filter(Boolean).slice(0, instance.config.limit);
      return {
        status: items.length ? 'ready' : 'empty',
        group: { id: String(group.id), name: cleanText(group.name, 80) || '未命名分组' },
        items,
      };
    }
    return { status: 'unsupported' };
  }

  function normalizeDynamicHomeLayout(saved, builtinDefaults, instances) {
    const defaults = builtinDefaults && typeof builtinDefaults === 'object' ? builtinDefaults : {};
    const partition = partitionWidgetInstances(instances);
    const normalized = partition.instances;
    const unsupported = partition.unsupported.filter((instance) => normalizeWidgetId(instance && instance.id));
    if (!domain || typeof domain.migrateHomeWidgetLayout !== 'function') {
      return { order: [], sizeById: {} };
    }
    return domain.migrateHomeWidgetLayout(saved, {
      ...defaults,
      customWidgetIds: [
        ...normalized.map((instance) => instance.id),
        ...unsupported.map((instance) => normalizeWidgetId(instance.id)),
      ],
      sizeById: {
        ...(defaults.sizeById && typeof defaults.sizeById === 'object' ? defaults.sizeById : {}),
        ...Object.fromEntries(normalized.map((instance) => [instance.id, instance.size])),
        ...Object.fromEntries(unsupported.map((instance) => [
          normalizeWidgetId(instance.id),
          WIDGET_SIZES.includes(instance.size) ? instance.size : 'small',
        ])),
      },
    });
  }

  return {
    WIDGET_SCHEMA_VERSION,
    WIDGET_SIZES,
    WIDGET_TYPES,
    getWidgetDefinition,
    getDefinitions,
    normalizePublicHttpUrl,
    normalizeWidgetInstance,
    normalizeWidgetInstances,
    normalizeInstances: normalizeWidgetInstances,
    migrateWidgetInstance,
    partitionWidgetInstances,
    validateWidgetManifest,
    createInstance,
    updateInstance,
    removeInstance,
    resolveWidgetData,
    normalizeDynamicHomeLayout,
  };
});
