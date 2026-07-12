"use strict";
var XpertCrmWorkbench = (() => {
  var __defProp = Object.defineProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // src/lib/remote-components/crm-workbench/src/utils.ts
  var PAGE_SIZE = 25;
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function unwrap(response) {
    if (!isObject(response)) return {};
    if (Object.prototype.hasOwnProperty.call(response, "data")) return response.data;
    if (Object.prototype.hasOwnProperty.call(response, "result")) return response.result;
    if (Object.prototype.hasOwnProperty.call(response, "payload")) return response.payload;
    return response;
  }
  function buildQuery(context, objectKey, search, recordId) {
    const payload = context.payload ?? {};
    const initialQuery = context.initialQuery ?? {};
    const parameters = {
      ...payload.parameters ?? {},
      ...initialQuery.parameters ?? {},
      objectKey: objectKey || void 0,
      recordId: recordId || void 0
    };
    return {
      page: 1,
      pageSize: PAGE_SIZE,
      ...initialQuery,
      search: search || void 0,
      parameters
    };
  }
  function normalizeData(raw) {
    const value = isObject(raw) ? raw : {};
    const table = isObject(value.table) ? value.table : {};
    return {
      summary: isObject(value.summary) ? value.summary : {},
      objects: Array.isArray(value.objects) ? value.objects : [],
      selectedObject: isObject(value.selectedObject) ? value.selectedObject : null,
      fields: Array.isArray(value.fields) ? value.fields : [],
      views: Array.isArray(value.views) ? value.views : [],
      table: {
        key: typeof table.key === "string" ? table.key : "records",
        items: Array.isArray(table.items) ? table.items : [],
        total: typeof table.total === "number" ? table.total : 0,
        page: typeof table.page === "number" ? table.page : 1,
        pageSize: typeof table.pageSize === "number" ? table.pageSize : PAGE_SIZE
      },
      selectedRecord: isObject(value.selectedRecord) ? value.selectedRecord : null,
      meta: isObject(value.meta) ? value.meta : {}
    };
  }
  function resolveNextSelection(result, options2) {
    if (options2.recordId) {
      return result.table.items.find((item) => item.id === options2.recordId) ?? result.selectedRecord ?? null;
    }
    if (options2.keepSelection && options2.selected) {
      return result.table.items.find((item) => item.id === options2.selected?.id) ?? result.selectedRecord ?? options2.selected;
    }
    return null;
  }
  function getInitialObjectKey(context) {
    const fromInitial = context.initialQuery?.parameters?.objectKey;
    const fromPayload = context.payload?.parameters?.objectKey;
    const value = Array.isArray(fromInitial) ? fromInitial[0] : fromInitial || fromPayload;
    return typeof value === "string" && value.trim() ? value.trim() : "company";
  }
  function getColumnsFromKeys(fields, columnKeys) {
    const normalized = columnKeys.map((key) => fields.find((field) => field.fieldKey === key)).filter((field) => Boolean(field)).slice(0, 7);
    return normalized.length ? normalized : fields.slice(0, 7);
  }
  function getDefaultColumnKeys(data, fields) {
    const view = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0];
    const keys = Array.isArray(view?.columns) && view.columns.length ? view.columns : fields.slice(0, 6).map((field) => field.fieldKey);
    return getColumnsFromKeys(fields, keys).map((field) => field.fieldKey);
  }
  function getRelationLabels(data) {
    const value = data?.meta?.relationLabels;
    if (!isObject(value)) return {};
    const relationLabels = {};
    Object.entries(value).forEach(([fieldKey, labels]) => {
      if (!isObject(labels)) return;
      relationLabels[fieldKey] = Object.fromEntries(Object.entries(labels).map(([recordId, label]) => [recordId, String(label)]));
    });
    return relationLabels;
  }
  function getRelatedRecordSections(data) {
    const value = data?.meta?.relatedRecords;
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((section) => ({
      objectKey: typeof section.objectKey === "string" ? section.objectKey : "",
      objectLabel: typeof section.objectLabel === "string" ? section.objectLabel : void 0,
      objectPluralLabel: typeof section.objectPluralLabel === "string" ? section.objectPluralLabel : void 0,
      relationFieldKey: typeof section.relationFieldKey === "string" ? section.relationFieldKey : "",
      relationFieldLabel: typeof section.relationFieldLabel === "string" ? section.relationFieldLabel : void 0,
      fields: Array.isArray(section.fields) ? section.fields : [],
      items: Array.isArray(section.items) ? section.items : [],
      total: typeof section.total === "number" ? section.total : 0
    })).filter((section) => section.objectKey && section.relationFieldKey && section.total > 0);
  }
  function getTimelineItems(data) {
    const value = data?.meta?.timeline;
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      type: normalizeTimelineType(item.type),
      objectKey: typeof item.objectKey === "string" ? item.objectKey : null,
      recordId: typeof item.recordId === "string" ? item.recordId : null,
      title: typeof item.title === "string" && item.title.trim() ? item.title : "Activity",
      body: typeof item.body === "string" && item.body.trim() ? item.body : void 0,
      status: typeof item.status === "string" && item.status.trim() ? item.status : void 0,
      occurredAt: stringifyDate(item.occurredAt),
      createdAt: stringifyDate(item.createdAt),
      updatedAt: stringifyDate(item.updatedAt)
    })).filter((item) => item.id);
  }
  function toFormValues(fields, values, includeDefaults = false) {
    const form = {};
    fields.forEach((field) => {
      if (!field.fieldKey) return;
      if (Object.prototype.hasOwnProperty.call(values, field.fieldKey)) {
        form[field.fieldKey] = values[field.fieldKey];
      } else if (includeDefaults && field.defaultValue !== void 0) {
        form[field.fieldKey] = field.defaultValue;
      } else {
        form[field.fieldKey] = field.type === "boolean" ? false : "";
      }
    });
    return form;
  }
  function normalizeFormValues(fields, form) {
    const values = {};
    fields.forEach((field) => {
      const value = form[field.fieldKey];
      if (field.type === "boolean") {
        values[field.fieldKey] = Boolean(value);
        return;
      }
      if (value === void 0 || value === null) return;
      if (typeof value === "string" && value.trim() === "") return;
      values[field.fieldKey] = value;
    });
    return values;
  }
  function displayRecordTitle(record, fields, t) {
    const values = record.values ?? {};
    const title = values.name || [values.firstName, values.lastName].filter(Boolean).join(" ") || values.title || fields.map((field) => values[field.fieldKey]).find(Boolean);
    return title ? String(title) : record.id || t.untitled;
  }
  function formatText(value, field, _fields, t) {
    if (value === void 0 || value === null || value === "") return t.noValue;
    const text = String(value);
    if (field.type === "rich_text" && text.length > 96) return `${text.slice(0, 96)}...`;
    if (text.length > 64) return `${text.slice(0, 64)}...`;
    return text;
  }
  function formatCurrency(value, locale) {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) return String(value);
    return numberValue.toLocaleString(locale === "zh_Hans" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 0
    });
  }
  function formatDate(value, locale) {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(locale === "zh_Hans" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function resolveText(value, locale) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (isObject(value)) {
      const preferred = locale === "zh_Hans" ? value.zh_Hans : value.en_US;
      const fallback = locale === "zh_Hans" ? value.en_US : value.zh_Hans;
      return String(preferred || fallback || "");
    }
    return String(value);
  }
  function objectIcon(object) {
    const key = object.objectKey || "";
    const icon = object.icon || "";
    if (key === "company" || icon.includes("building")) return "building";
    if (key === "person" || icon.includes("contacts")) return "person";
    if (key === "opportunity" || icon.includes("line-chart")) return "target";
    if (key === "task" || icon.includes("checkbox")) return "check";
    if (key === "note" || icon.includes("note")) return "note";
    if (key === "workflow") return "workflow";
    return "grid";
  }
  function fieldIcon(field) {
    if (field.type === "url") return "link";
    if (field.type === "email") return "mail";
    if (field.type === "phone") return "phone";
    if (field.type === "date" || field.type === "datetime") return "calendar";
    if (field.type === "currency" || field.type === "number") return "money";
    if (field.type === "relation") return "link";
    if (field.type === "select" || field.type === "multi_select") return "list";
    if (field.fieldKey?.toLowerCase().includes("owner")) return "person";
    return "hash";
  }
  function columnWidth(field, index2) {
    if (index2 === 0) return 240;
    if (field.type === "url" || field.type === "email") return 220;
    if (field.type === "phone") return 170;
    if (field.type === "select" || field.type === "multi_select") return 180;
    if (field.type === "currency" || field.type === "number") return 150;
    if (field.type === "date" || field.type === "datetime") return 160;
    if (field.type === "boolean") return 130;
    if (field.type === "relation") return 210;
    if (field.type === "rich_text") return 280;
    return 220;
  }
  function sortRecords(records, field, sortMode) {
    if (!field || sortMode === "server") return records;
    return [...records].sort((a, b) => {
      const left = String(a.values?.[field.fieldKey] ?? "");
      const right = String(b.values?.[field.fieldKey] ?? "");
      return sortMode === "asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
  }
  function countNonEmpty(records, fieldKey) {
    return records.filter((record) => {
      const value = record.values?.[fieldKey];
      return value !== void 0 && value !== null && String(value).trim() !== "";
    }).length;
  }
  function recordInitial(title) {
    const trimmed = title.trim();
    if (!trimmed) return "#";
    const firstTwo = trimmed.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
    return firstTwo.slice(0, 2).toUpperCase();
  }
  function isUrlLike(value) {
    return /^https?:\/\//i.test(value) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(value);
  }
  function shortUrl(value) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return value.replace(/^https?:\/\//, "").replace(/^www\./, "");
    }
  }
  function stringifyDate(value) {
    if (value === void 0 || value === null || value === "") return void 0;
    return String(value);
  }
  function normalizeTimelineType(value) {
    if (value === "note" || value === "task") return value;
    return "activity";
  }

  // src/lib/remote-components/crm-workbench/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var instanceId = null;
  var requestSequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function installBridgeListener(handlers) {
    const listener = (event) => {
      const rawMessage = event.data;
      if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return;
      const message = rawMessage;
      if (message.type === "init") {
        instanceId = typeof message.instanceId === "string" ? message.instanceId : null;
        handlers.onInit({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery ?? {},
          locale: message.locale,
          theme: message.theme
        });
        setTimeout(reportResize, 0);
        return;
      }
      if (message.instanceId !== instanceId) return;
      if (message.type === "hostEvent") {
        handlers.onHostEvent();
        return;
      }
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      if (requestId && pending.has(requestId)) {
        const item = pending.get(requestId);
        pending.delete(requestId);
        if (!item) return;
        if (message.type === "error") {
          item.reject(new Error(typeof message.message === "string" ? message.message : "Remote CRM request failed"));
        } else {
          item.resolve(message);
        }
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function post(type, body) {
    if (!instanceId && type !== "ready") return;
    window.parent.postMessage(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type,
        ...body ?? {}
      },
      "*"
    );
  }
  function request(type, body) {
    const requestId = String(++requestSequence);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        post(type, { requestId, ...body ?? {} });
      } catch (error) {
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function requestData(query) {
    return request("requestData", { query });
  }
  function executeAction(actionKey, targetId, input, parameters) {
    return request("executeAction", { actionKey, targetId, input, parameters });
  }
  function notify(message, level = "success") {
    post("notify", { message, level });
  }
  function reportResize() {
    const root2 = document.getElementById("root");
    const shell = root2?.firstElementChild;
    const height = Math.max(shell?.scrollHeight ?? 0, 640);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }

  // src/lib/remote-components/crm-workbench/src/vendor.ts
  var React2 = window.React;
  var ReactDOM = window.ReactDOM;

  // ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // ../../node_modules/.pnpm/tailwind-merge@3.6.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
  var concatArrays = (array1, array2) => {
    const combinedArray = new Array(array1.length + array2.length);
    for (let i = 0; i < array1.length; i++) {
      combinedArray[i] = array1[i];
    }
    for (let i = 0; i < array2.length; i++) {
      combinedArray[array1.length + i] = array2[i];
    }
    return combinedArray;
  };
  var createClassValidatorObject = (classGroupId, validator) => ({
    classGroupId,
    validator
  });
  var createClassPartObject = (nextPart = /* @__PURE__ */ new Map(), validators = null, classGroupId) => ({
    nextPart,
    validators,
    classGroupId
  });
  var CLASS_PART_SEPARATOR = "-";
  var EMPTY_CONFLICTS = [];
  var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
  var createClassGroupUtils = (config) => {
    const classMap = createClassMap(config);
    const {
      conflictingClassGroups,
      conflictingClassGroupModifiers
    } = config;
    const getClassGroupId = (className) => {
      if (className.startsWith("[") && className.endsWith("]")) {
        return getGroupIdForArbitraryProperty(className);
      }
      const classParts = className.split(CLASS_PART_SEPARATOR);
      const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
      return getGroupRecursive(classParts, startIndex, classMap);
    };
    const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
      if (hasPostfixModifier) {
        const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
        const baseConflicts = conflictingClassGroups[classGroupId];
        if (modifierConflicts) {
          if (baseConflicts) {
            return concatArrays(baseConflicts, modifierConflicts);
          }
          return modifierConflicts;
        }
        return baseConflicts || EMPTY_CONFLICTS;
      }
      return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
    };
    return {
      getClassGroupId,
      getConflictingClassGroupIds
    };
  };
  var getGroupRecursive = (classParts, startIndex, classPartObject) => {
    const classPathsLength = classParts.length - startIndex;
    if (classPathsLength === 0) {
      return classPartObject.classGroupId;
    }
    const currentClassPart = classParts[startIndex];
    const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
    if (nextClassPartObject) {
      const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
      if (result) return result;
    }
    const validators = classPartObject.validators;
    if (validators === null) {
      return void 0;
    }
    const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
    const validatorsLength = validators.length;
    for (let i = 0; i < validatorsLength; i++) {
      const validatorObj = validators[i];
      if (validatorObj.validator(classRest)) {
        return validatorObj.classGroupId;
      }
    }
    return void 0;
  };
  var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
    const content = className.slice(1, -1);
    const colonIndex = content.indexOf(":");
    const property = content.slice(0, colonIndex);
    return property ? ARBITRARY_PROPERTY_PREFIX + property : void 0;
  })();
  var createClassMap = (config) => {
    const {
      theme,
      classGroups
    } = config;
    return processClassGroups(classGroups, theme);
  };
  var processClassGroups = (classGroups, theme) => {
    const classMap = createClassPartObject();
    for (const classGroupId in classGroups) {
      const group = classGroups[classGroupId];
      processClassesRecursively(group, classMap, classGroupId, theme);
    }
    return classMap;
  };
  var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
    const len = classGroup.length;
    for (let i = 0; i < len; i++) {
      const classDefinition = classGroup[i];
      processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
    }
  };
  var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (typeof classDefinition === "string") {
      processStringDefinition(classDefinition, classPartObject, classGroupId);
      return;
    }
    if (typeof classDefinition === "function") {
      processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
      return;
    }
    processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
  };
  var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
    const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
    classPartObjectToEdit.classGroupId = classGroupId;
  };
  var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (isThemeGetter(classDefinition)) {
      processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
      return;
    }
    if (classPartObject.validators === null) {
      classPartObject.validators = [];
    }
    classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
  };
  var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    const entries = Object.entries(classDefinition);
    const len = entries.length;
    for (let i = 0; i < len; i++) {
      const [key, value] = entries[i];
      processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
    }
  };
  var getPart = (classPartObject, path) => {
    let current = classPartObject;
    const parts = path.split(CLASS_PART_SEPARATOR);
    const len = parts.length;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      let next = current.nextPart.get(part);
      if (!next) {
        next = createClassPartObject();
        current.nextPart.set(part, next);
      }
      current = next;
    }
    return current;
  };
  var isThemeGetter = (func) => "isThemeGetter" in func && func.isThemeGetter === true;
  var createLruCache = (maxCacheSize) => {
    if (maxCacheSize < 1) {
      return {
        get: () => void 0,
        set: () => {
        }
      };
    }
    let cacheSize = 0;
    let cache = /* @__PURE__ */ Object.create(null);
    let previousCache = /* @__PURE__ */ Object.create(null);
    const update = (key, value) => {
      cache[key] = value;
      cacheSize++;
      if (cacheSize > maxCacheSize) {
        cacheSize = 0;
        previousCache = cache;
        cache = /* @__PURE__ */ Object.create(null);
      }
    };
    return {
      get(key) {
        let value = cache[key];
        if (value !== void 0) {
          return value;
        }
        if ((value = previousCache[key]) !== void 0) {
          update(key, value);
          return value;
        }
      },
      set(key, value) {
        if (key in cache) {
          cache[key] = value;
        } else {
          update(key, value);
        }
      }
    };
  };
  var IMPORTANT_MODIFIER = "!";
  var MODIFIER_SEPARATOR = ":";
  var EMPTY_MODIFIERS = [];
  var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
    isExternal
  });
  var createParseClassName = (config) => {
    const {
      prefix,
      experimentalParseClassName
    } = config;
    let parseClassName = (className) => {
      const modifiers = [];
      let bracketDepth = 0;
      let parenDepth = 0;
      let modifierStart = 0;
      let postfixModifierPosition;
      const len = className.length;
      for (let index2 = 0; index2 < len; index2++) {
        const currentCharacter = className[index2];
        if (bracketDepth === 0 && parenDepth === 0) {
          if (currentCharacter === MODIFIER_SEPARATOR) {
            modifiers.push(className.slice(modifierStart, index2));
            modifierStart = index2 + 1;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index2;
            continue;
          }
        }
        if (currentCharacter === "[") bracketDepth++;
        else if (currentCharacter === "]") bracketDepth--;
        else if (currentCharacter === "(") parenDepth++;
        else if (currentCharacter === ")") parenDepth--;
      }
      const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
      let baseClassName = baseClassNameWithImportantModifier;
      let hasImportantModifier = false;
      if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
        baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
        hasImportantModifier = true;
      } else if (
        /**
         * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
         * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
         */
        baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)
      ) {
        baseClassName = baseClassNameWithImportantModifier.slice(1);
        hasImportantModifier = true;
      }
      const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
      return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
    };
    if (prefix) {
      const fullPrefix = prefix + MODIFIER_SEPARATOR;
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, void 0, true);
    }
    if (experimentalParseClassName) {
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => experimentalParseClassName({
        className,
        parseClassName: parseClassNameOriginal
      });
    }
    return parseClassName;
  };
  var createSortModifiers = (config) => {
    const modifierWeights = /* @__PURE__ */ new Map();
    config.orderSensitiveModifiers.forEach((mod, index2) => {
      modifierWeights.set(mod, 1e6 + index2);
    });
    return (modifiers) => {
      const result = [];
      let currentSegment = [];
      for (let i = 0; i < modifiers.length; i++) {
        const modifier = modifiers[i];
        const isArbitrary = modifier[0] === "[";
        const isOrderSensitive = modifierWeights.has(modifier);
        if (isArbitrary || isOrderSensitive) {
          if (currentSegment.length > 0) {
            currentSegment.sort();
            result.push(...currentSegment);
            currentSegment = [];
          }
          result.push(modifier);
        } else {
          currentSegment.push(modifier);
        }
      }
      if (currentSegment.length > 0) {
        currentSegment.sort();
        result.push(...currentSegment);
      }
      return result;
    };
  };
  var createConfigUtils = (config) => ({
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    sortModifiers: createSortModifiers(config),
    postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
    ...createClassGroupUtils(config)
  });
  var createPostfixLookupClassGroupIds = (config) => {
    const lookup = /* @__PURE__ */ Object.create(null);
    const classGroupIds = config.postfixLookupClassGroups;
    if (classGroupIds) {
      for (let i = 0; i < classGroupIds.length; i++) {
        lookup[classGroupIds[i]] = true;
      }
    }
    return lookup;
  };
  var SPLIT_CLASSES_REGEX = /\s+/;
  var mergeClassList = (classList, configUtils) => {
    const {
      parseClassName,
      getClassGroupId,
      getConflictingClassGroupIds,
      sortModifiers,
      postfixLookupClassGroupIds
    } = configUtils;
    const classGroupsInConflict = [];
    const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
    let result = "";
    for (let index2 = classNames.length - 1; index2 >= 0; index2 -= 1) {
      const originalClassName = classNames[index2];
      const {
        isExternal,
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      } = parseClassName(originalClassName);
      if (isExternal) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      let hasPostfixModifier = !!maybePostfixModifierPosition;
      let classGroupId;
      if (hasPostfixModifier) {
        const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
        classGroupId = getClassGroupId(baseClassNameWithoutPostfix);
        const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : void 0;
        if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
          classGroupId = classGroupIdWithPostfix;
          hasPostfixModifier = false;
        }
      } else {
        classGroupId = getClassGroupId(baseClassName);
      }
      if (!classGroupId) {
        if (!hasPostfixModifier) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        classGroupId = getClassGroupId(baseClassName);
        if (!classGroupId) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        hasPostfixModifier = false;
      }
      const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
      const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
      const classId = modifierId + classGroupId;
      if (classGroupsInConflict.indexOf(classId) > -1) {
        continue;
      }
      classGroupsInConflict.push(classId);
      const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
      for (let i = 0; i < conflictGroups.length; ++i) {
        const group = conflictGroups[i];
        classGroupsInConflict.push(modifierId + group);
      }
      result = originalClassName + (result.length > 0 ? " " + result : result);
    }
    return result;
  };
  var twJoin = (...classLists) => {
    let index2 = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index2 < classLists.length) {
      if (argument = classLists[index2++]) {
        if (resolvedValue = toValue(argument)) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var toValue = (mix) => {
    if (typeof mix === "string") {
      return mix;
    }
    let resolvedValue;
    let string = "";
    for (let k4 = 0; k4 < mix.length; k4++) {
      if (mix[k4]) {
        if (resolvedValue = toValue(mix[k4])) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
    let configUtils;
    let cacheGet;
    let cacheSet;
    let functionToCall;
    const initTailwindMerge = (classList) => {
      const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
      configUtils = createConfigUtils(config);
      cacheGet = configUtils.cache.get;
      cacheSet = configUtils.cache.set;
      functionToCall = tailwindMerge;
      return tailwindMerge(classList);
    };
    const tailwindMerge = (classList) => {
      const cachedResult = cacheGet(classList);
      if (cachedResult) {
        return cachedResult;
      }
      const result = mergeClassList(classList, configUtils);
      cacheSet(classList, result);
      return result;
    };
    functionToCall = initTailwindMerge;
    return (...args) => functionToCall(twJoin(...args));
  };
  var fallbackThemeArr = [];
  var fromTheme = (key) => {
    const themeGetter = (theme) => theme[key] || fallbackThemeArr;
    themeGetter.isThemeGetter = true;
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
  var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
  var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
  var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var isFraction = (value) => fractionRegex.test(value);
  var isNumber = (value) => !!value && !Number.isNaN(Number(value));
  var isInteger = (value) => !!value && Number.isInteger(Number(value));
  var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
  var isTshirtSize = (value) => tshirtUnitRegex.test(value);
  var isAny = () => true;
  var isLengthOnly = (value) => (
    // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
    // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
    // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
    lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
  );
  var isNever = () => false;
  var isShadow = (value) => shadowRegex.test(value);
  var isImage = (value) => imageRegex.test(value);
  var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
  var isNamedContainerQuery = (value) => value.startsWith("@container") && (value[10] === "/" && value[11] !== void 0 || value[11] === "s" && value[16] !== void 0 && value.startsWith("-size/", 10) || value[11] === "n" && value[18] !== void 0 && value.startsWith("-normal/", 10));
  var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
  var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
  var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
  var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
  var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
  var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
  var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
  var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
  var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
  var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
  var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
  var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
  var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
  var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
  var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
  var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
  var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
  var getIsArbitraryValue = (value, testLabel, testValue) => {
    const result = arbitraryValueRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return testValue(result[2]);
    }
    return false;
  };
  var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
    const result = arbitraryVariableRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return shouldMatchNoLabel;
    }
    return false;
  };
  var isLabelPosition = (label) => label === "position" || label === "percentage";
  var isLabelImage = (label) => label === "image" || label === "url";
  var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
  var isLabelLength = (label) => label === "length";
  var isLabelNumber = (label) => label === "number";
  var isLabelFamilyName = (label) => label === "family-name";
  var isLabelWeight = (label) => label === "number" || label === "weight";
  var isLabelShadow = (label) => label === "shadow";
  var getDefaultConfig = () => {
    const themeColor = fromTheme("color");
    const themeFont = fromTheme("font");
    const themeText = fromTheme("text");
    const themeFontWeight = fromTheme("font-weight");
    const themeTracking = fromTheme("tracking");
    const themeLeading = fromTheme("leading");
    const themeBreakpoint = fromTheme("breakpoint");
    const themeContainer = fromTheme("container");
    const themeSpacing = fromTheme("spacing");
    const themeRadius = fromTheme("radius");
    const themeShadow = fromTheme("shadow");
    const themeInsetShadow = fromTheme("inset-shadow");
    const themeTextShadow = fromTheme("text-shadow");
    const themeDropShadow = fromTheme("drop-shadow");
    const themeBlur = fromTheme("blur");
    const themePerspective = fromTheme("perspective");
    const themeAspect = fromTheme("aspect");
    const themeEase = fromTheme("ease");
    const themeAnimate = fromTheme("animate");
    const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
    const scalePosition = () => [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-top",
      "top-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-top",
      "bottom-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-bottom",
      "bottom-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-bottom"
    ];
    const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
    const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
    const scaleOverscroll = () => ["auto", "contain", "none"];
    const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
    const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
    const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartAndEnd = () => ["auto", {
      span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
    }, isInteger, isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
    const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
    const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
    const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
    const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
    const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingInline = () => [isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingBlock = () => [isFraction, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
    const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
      position: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleBgRepeat = () => ["no-repeat", {
      repeat: ["", "x", "y", "space", "round"]
    }];
    const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
      size: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
    const scaleRadius = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      "full",
      themeRadius,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
    const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
    const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
    const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
    const scaleBlur = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      themeBlur,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
    return {
      cacheSize: 500,
      theme: {
        animate: ["spin", "ping", "pulse", "bounce"],
        aspect: ["video"],
        blur: [isTshirtSize],
        breakpoint: [isTshirtSize],
        color: [isAny],
        container: [isTshirtSize],
        "drop-shadow": [isTshirtSize],
        ease: ["in", "out", "in-out"],
        font: [isAnyNonArbitrary],
        "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
        "inset-shadow": [isTshirtSize],
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
        perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
        radius: [isTshirtSize],
        shadow: [isTshirtSize],
        spacing: ["px", isNumber],
        text: [isTshirtSize],
        "text-shadow": [isTshirtSize],
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
      },
      classGroups: {
        // --------------
        // --- Layout ---
        // --------------
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        aspect: [{
          aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
        }],
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         * @deprecated since Tailwind CSS v4.0.0
         */
        container: ["container"],
        /**
         * Container Type
         * @see https://tailwindcss.com/docs/responsive-design#container-queries
         */
        "container-type": [{
          "@container": ["", "normal", "size", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Container Name
         * @see https://tailwindcss.com/docs/responsive-design#named-containers
         */
        "container-named": [isNamedContainerQuery],
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        columns: [{
          columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
        }],
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        "break-after": [{
          "break-after": scaleBreak()
        }],
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        "break-before": [{
          "break-before": scaleBreak()
        }],
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        "break-inside": [{
          "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
        }],
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        "box-decoration": [{
          "box-decoration": ["slice", "clone"]
        }],
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        box: [{
          box: ["border", "content"]
        }],
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
        /**
         * Screen Reader Only
         * @see https://tailwindcss.com/docs/display#screen-reader-only
         */
        sr: ["sr-only", "not-sr-only"],
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        float: [{
          float: ["right", "left", "none", "start", "end"]
        }],
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        clear: [{
          clear: ["left", "right", "both", "none", "start", "end"]
        }],
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        isolation: ["isolate", "isolation-auto"],
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        "object-fit": [{
          object: ["contain", "cover", "fill", "none", "scale-down"]
        }],
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        "object-position": [{
          object: scalePositionWithArbitrary()
        }],
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        overflow: [{
          overflow: scaleOverflow()
        }],
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-x": [{
          "overflow-x": scaleOverflow()
        }],
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-y": [{
          "overflow-y": scaleOverflow()
        }],
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        overscroll: [{
          overscroll: scaleOverscroll()
        }],
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-x": [{
          "overscroll-x": scaleOverscroll()
        }],
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-y": [{
          "overscroll-y": scaleOverscroll()
        }],
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        /**
         * Inset
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        inset: [{
          inset: scaleInset()
        }],
        /**
         * Inset Inline
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-x": [{
          "inset-x": scaleInset()
        }],
        /**
         * Inset Block
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-y": [{
          "inset-y": scaleInset()
        }],
        /**
         * Inset Inline Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-s` in next major release
         */
        start: [{
          "inset-s": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          start: scaleInset()
        }],
        /**
         * Inset Inline End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-e` in next major release
         */
        end: [{
          "inset-e": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          end: scaleInset()
        }],
        /**
         * Inset Block Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-bs": [{
          "inset-bs": scaleInset()
        }],
        /**
         * Inset Block End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-be": [{
          "inset-be": scaleInset()
        }],
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        top: [{
          top: scaleInset()
        }],
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        right: [{
          right: scaleInset()
        }],
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        bottom: [{
          bottom: scaleInset()
        }],
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        left: [{
          left: scaleInset()
        }],
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        visibility: ["visible", "invisible", "collapse"],
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        z: [{
          z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------------
        // --- Flexbox and Grid ---
        // ------------------------
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        basis: [{
          basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
        }],
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        "flex-direction": [{
          flex: ["row", "row-reverse", "col", "col-reverse"]
        }],
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        "flex-wrap": [{
          flex: ["nowrap", "wrap", "wrap-reverse"]
        }],
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        flex: [{
          flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
        }],
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        grow: [{
          grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        shrink: [{
          shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        order: [{
          order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        "grid-cols": [{
          "grid-cols": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start-end": [{
          col: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start": [{
          "col-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-end": [{
          "col-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        "grid-rows": [{
          "grid-rows": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start-end": [{
          row: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start": [{
          "row-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-end": [{
          "row-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        "grid-flow": [{
          "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
        }],
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        "auto-cols": [{
          "auto-cols": scaleGridAutoColsRows()
        }],
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        "auto-rows": [{
          "auto-rows": scaleGridAutoColsRows()
        }],
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        gap: [{
          gap: scaleUnambiguousSpacing()
        }],
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-x": [{
          "gap-x": scaleUnambiguousSpacing()
        }],
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-y": [{
          "gap-y": scaleUnambiguousSpacing()
        }],
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        "justify-content": [{
          justify: [...scaleAlignPrimaryAxis(), "normal"]
        }],
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        "justify-items": [{
          "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
        }],
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        "justify-self": [{
          "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        "align-content": [{
          content: ["normal", ...scaleAlignPrimaryAxis()]
        }],
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        "align-items": [{
          items: [...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        "align-self": [{
          self: ["auto", ...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        "place-content": [{
          "place-content": scaleAlignPrimaryAxis()
        }],
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        "place-items": [{
          "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
        }],
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        "place-self": [{
          "place-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        // Spacing
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        p: [{
          p: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline
         * @see https://tailwindcss.com/docs/padding
         */
        px: [{
          px: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block
         * @see https://tailwindcss.com/docs/padding
         */
        py: [{
          py: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline Start
         * @see https://tailwindcss.com/docs/padding
         */
        ps: [{
          ps: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline End
         * @see https://tailwindcss.com/docs/padding
         */
        pe: [{
          pe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block Start
         * @see https://tailwindcss.com/docs/padding
         */
        pbs: [{
          pbs: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block End
         * @see https://tailwindcss.com/docs/padding
         */
        pbe: [{
          pbe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        pt: [{
          pt: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        pr: [{
          pr: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        pb: [{
          pb: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        pl: [{
          pl: scaleUnambiguousSpacing()
        }],
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        m: [{
          m: scaleMargin()
        }],
        /**
         * Margin Inline
         * @see https://tailwindcss.com/docs/margin
         */
        mx: [{
          mx: scaleMargin()
        }],
        /**
         * Margin Block
         * @see https://tailwindcss.com/docs/margin
         */
        my: [{
          my: scaleMargin()
        }],
        /**
         * Margin Inline Start
         * @see https://tailwindcss.com/docs/margin
         */
        ms: [{
          ms: scaleMargin()
        }],
        /**
         * Margin Inline End
         * @see https://tailwindcss.com/docs/margin
         */
        me: [{
          me: scaleMargin()
        }],
        /**
         * Margin Block Start
         * @see https://tailwindcss.com/docs/margin
         */
        mbs: [{
          mbs: scaleMargin()
        }],
        /**
         * Margin Block End
         * @see https://tailwindcss.com/docs/margin
         */
        mbe: [{
          mbe: scaleMargin()
        }],
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        mt: [{
          mt: scaleMargin()
        }],
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        mr: [{
          mr: scaleMargin()
        }],
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        mb: [{
          mb: scaleMargin()
        }],
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        ml: [{
          ml: scaleMargin()
        }],
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x": [{
          "space-x": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x-reverse": ["space-x-reverse"],
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y": [{
          "space-y": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y-reverse": ["space-y-reverse"],
        // --------------
        // --- Sizing ---
        // --------------
        /**
         * Size
         * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
         */
        size: [{
          size: scaleSizing()
        }],
        /**
         * Inline Size
         * @see https://tailwindcss.com/docs/width
         */
        "inline-size": [{
          inline: ["auto", ...scaleSizingInline()]
        }],
        /**
         * Min-Inline Size
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-inline-size": [{
          "min-inline": ["auto", ...scaleSizingInline()]
        }],
        /**
         * Max-Inline Size
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-inline-size": [{
          "max-inline": ["none", ...scaleSizingInline()]
        }],
        /**
         * Block Size
         * @see https://tailwindcss.com/docs/height
         */
        "block-size": [{
          block: ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Min-Block Size
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-block-size": [{
          "min-block": ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Max-Block Size
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-block-size": [{
          "max-block": ["none", ...scaleSizingBlock()]
        }],
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        w: [{
          w: [themeContainer, "screen", ...scaleSizing()]
        }],
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-w": [{
          "min-w": [
            themeContainer,
            "screen",
            /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "none",
            ...scaleSizing()
          ]
        }],
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-w": [{
          "max-w": [
            themeContainer,
            "screen",
            "none",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "prose",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            {
              screen: [themeBreakpoint]
            },
            ...scaleSizing()
          ]
        }],
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        h: [{
          h: ["screen", "lh", ...scaleSizing()]
        }],
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-h": [{
          "min-h": ["screen", "lh", "none", ...scaleSizing()]
        }],
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-h": [{
          "max-h": ["screen", "lh", ...scaleSizing()]
        }],
        // ------------------
        // --- Typography ---
        // ------------------
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        "font-size": [{
          text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        "font-style": ["italic", "not-italic"],
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        "font-weight": [{
          font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
        }],
        /**
         * Font Stretch
         * @see https://tailwindcss.com/docs/font-stretch
         */
        "font-stretch": [{
          "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
        }],
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        "font-family": [{
          font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
        }],
        /**
         * Font Feature Settings
         * @see https://tailwindcss.com/docs/font-feature-settings
         */
        "font-features": [{
          "font-features": [isArbitraryValue]
        }],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-normal": ["normal-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-ordinal": ["ordinal"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-slashed-zero": ["slashed-zero"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        tracking: [{
          tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        "line-clamp": [{
          "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
        }],
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        leading: [{
          leading: [
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            themeLeading,
            ...scaleUnambiguousSpacing()
          ]
        }],
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        "list-image": [{
          "list-image": ["none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        "list-style-position": [{
          list: ["inside", "outside"]
        }],
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        "list-style-type": [{
          list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        "text-alignment": [{
          text: ["left", "center", "right", "justify", "start", "end"]
        }],
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://v3.tailwindcss.com/docs/placeholder-color
         */
        "placeholder-color": [{
          placeholder: scaleColor()
        }],
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        "text-color": [{
          text: scaleColor()
        }],
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        "text-decoration": ["underline", "overline", "line-through", "no-underline"],
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        "text-decoration-style": [{
          decoration: [...scaleLineStyle(), "wavy"]
        }],
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        "text-decoration-thickness": [{
          decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
        }],
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        "text-decoration-color": [{
          decoration: scaleColor()
        }],
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        "underline-offset": [{
          "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        /**
         * Text Wrap
         * @see https://tailwindcss.com/docs/text-wrap
         */
        "text-wrap": [{
          text: ["wrap", "nowrap", "balance", "pretty"]
        }],
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        indent: [{
          indent: scaleUnambiguousSpacing()
        }],
        /**
         * Tab Size
         * @see https://tailwindcss.com/docs/tab-size
         */
        "tab-size": [{
          tab: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        "vertical-align": [{
          align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        whitespace: [{
          whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
        }],
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        break: [{
          break: ["normal", "words", "all", "keep"]
        }],
        /**
         * Overflow Wrap
         * @see https://tailwindcss.com/docs/overflow-wrap
         */
        wrap: [{
          wrap: ["break-word", "anywhere", "normal"]
        }],
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        hyphens: [{
          hyphens: ["none", "manual", "auto"]
        }],
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        content: [{
          content: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // -------------------
        // --- Backgrounds ---
        // -------------------
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        "bg-attachment": [{
          bg: ["fixed", "local", "scroll"]
        }],
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        "bg-clip": [{
          "bg-clip": ["border", "padding", "content", "text"]
        }],
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        "bg-origin": [{
          "bg-origin": ["border", "padding", "content"]
        }],
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        "bg-position": [{
          bg: scaleBgPosition()
        }],
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        "bg-repeat": [{
          bg: scaleBgRepeat()
        }],
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        "bg-size": [{
          bg: scaleBgSize()
        }],
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        "bg-image": [{
          bg: ["none", {
            linear: [{
              to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
            }, isInteger, isArbitraryVariable, isArbitraryValue],
            radial: ["", isArbitraryVariable, isArbitraryValue],
            conic: [isInteger, isArbitraryVariable, isArbitraryValue]
          }, isArbitraryVariableImage, isArbitraryImage]
        }],
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        "bg-color": [{
          bg: scaleColor()
        }],
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from-pos": [{
          from: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via-pos": [{
          via: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to-pos": [{
          to: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from": [{
          from: scaleColor()
        }],
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via": [{
          via: scaleColor()
        }],
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to": [{
          to: scaleColor()
        }],
        // ---------------
        // --- Borders ---
        // ---------------
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        rounded: [{
          rounded: scaleRadius()
        }],
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-s": [{
          "rounded-s": scaleRadius()
        }],
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-e": [{
          "rounded-e": scaleRadius()
        }],
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-t": [{
          "rounded-t": scaleRadius()
        }],
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-r": [{
          "rounded-r": scaleRadius()
        }],
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-b": [{
          "rounded-b": scaleRadius()
        }],
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-l": [{
          "rounded-l": scaleRadius()
        }],
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ss": [{
          "rounded-ss": scaleRadius()
        }],
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-se": [{
          "rounded-se": scaleRadius()
        }],
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ee": [{
          "rounded-ee": scaleRadius()
        }],
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-es": [{
          "rounded-es": scaleRadius()
        }],
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tl": [{
          "rounded-tl": scaleRadius()
        }],
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tr": [{
          "rounded-tr": scaleRadius()
        }],
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-br": [{
          "rounded-br": scaleRadius()
        }],
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-bl": [{
          "rounded-bl": scaleRadius()
        }],
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w": [{
          border: scaleBorderWidth()
        }],
        /**
         * Border Width Inline
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-x": [{
          "border-x": scaleBorderWidth()
        }],
        /**
         * Border Width Block
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-y": [{
          "border-y": scaleBorderWidth()
        }],
        /**
         * Border Width Inline Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-s": [{
          "border-s": scaleBorderWidth()
        }],
        /**
         * Border Width Inline End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-e": [{
          "border-e": scaleBorderWidth()
        }],
        /**
         * Border Width Block Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-bs": [{
          "border-bs": scaleBorderWidth()
        }],
        /**
         * Border Width Block End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-be": [{
          "border-be": scaleBorderWidth()
        }],
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-t": [{
          "border-t": scaleBorderWidth()
        }],
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-r": [{
          "border-r": scaleBorderWidth()
        }],
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-b": [{
          "border-b": scaleBorderWidth()
        }],
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-l": [{
          "border-l": scaleBorderWidth()
        }],
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x": [{
          "divide-x": scaleBorderWidth()
        }],
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x-reverse": ["divide-x-reverse"],
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y": [{
          "divide-y": scaleBorderWidth()
        }],
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y-reverse": ["divide-y-reverse"],
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        "border-style": [{
          border: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
         */
        "divide-style": [{
          divide: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color": [{
          border: scaleColor()
        }],
        /**
         * Border Color Inline
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-x": [{
          "border-x": scaleColor()
        }],
        /**
         * Border Color Block
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-y": [{
          "border-y": scaleColor()
        }],
        /**
         * Border Color Inline Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-s": [{
          "border-s": scaleColor()
        }],
        /**
         * Border Color Inline End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-e": [{
          "border-e": scaleColor()
        }],
        /**
         * Border Color Block Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-bs": [{
          "border-bs": scaleColor()
        }],
        /**
         * Border Color Block End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-be": [{
          "border-be": scaleColor()
        }],
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-t": [{
          "border-t": scaleColor()
        }],
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-r": [{
          "border-r": scaleColor()
        }],
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-b": [{
          "border-b": scaleColor()
        }],
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-l": [{
          "border-l": scaleColor()
        }],
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        "divide-color": [{
          divide: scaleColor()
        }],
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        "outline-style": [{
          outline: [...scaleLineStyle(), "none", "hidden"]
        }],
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        "outline-offset": [{
          "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        "outline-w": [{
          outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        "outline-color": [{
          outline: scaleColor()
        }],
        // ---------------
        // --- Effects ---
        // ---------------
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        shadow: [{
          shadow: [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
         */
        "shadow-color": [{
          shadow: scaleColor()
        }],
        /**
         * Inset Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
         */
        "inset-shadow": [{
          "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Inset Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
         */
        "inset-shadow-color": [{
          "inset-shadow": scaleColor()
        }],
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
         */
        "ring-w": [{
          ring: scaleBorderWidth()
        }],
        /**
         * Ring Width Inset
         * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-w-inset": ["ring-inset"],
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
         */
        "ring-color": [{
          ring: scaleColor()
        }],
        /**
         * Ring Offset Width
         * @see https://v3.tailwindcss.com/docs/ring-offset-width
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-w": [{
          "ring-offset": [isNumber, isArbitraryLength]
        }],
        /**
         * Ring Offset Color
         * @see https://v3.tailwindcss.com/docs/ring-offset-color
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-color": [{
          "ring-offset": scaleColor()
        }],
        /**
         * Inset Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
         */
        "inset-ring-w": [{
          "inset-ring": scaleBorderWidth()
        }],
        /**
         * Inset Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
         */
        "inset-ring-color": [{
          "inset-ring": scaleColor()
        }],
        /**
         * Text Shadow
         * @see https://tailwindcss.com/docs/text-shadow
         */
        "text-shadow": [{
          "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Text Shadow Color
         * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
         */
        "text-shadow-color": [{
          "text-shadow": scaleColor()
        }],
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        opacity: [{
          opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        "mix-blend": [{
          "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
        }],
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        "bg-blend": [{
          "bg-blend": scaleBlendMode()
        }],
        /**
         * Mask Clip
         * @see https://tailwindcss.com/docs/mask-clip
         */
        "mask-clip": [{
          "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
        }, "mask-no-clip"],
        /**
         * Mask Composite
         * @see https://tailwindcss.com/docs/mask-composite
         */
        "mask-composite": [{
          mask: ["add", "subtract", "intersect", "exclude"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image-linear-pos": [{
          "mask-linear": [isNumber]
        }],
        "mask-image-linear-from-pos": [{
          "mask-linear-from": scaleMaskImagePosition()
        }],
        "mask-image-linear-to-pos": [{
          "mask-linear-to": scaleMaskImagePosition()
        }],
        "mask-image-linear-from-color": [{
          "mask-linear-from": scaleColor()
        }],
        "mask-image-linear-to-color": [{
          "mask-linear-to": scaleColor()
        }],
        "mask-image-t-from-pos": [{
          "mask-t-from": scaleMaskImagePosition()
        }],
        "mask-image-t-to-pos": [{
          "mask-t-to": scaleMaskImagePosition()
        }],
        "mask-image-t-from-color": [{
          "mask-t-from": scaleColor()
        }],
        "mask-image-t-to-color": [{
          "mask-t-to": scaleColor()
        }],
        "mask-image-r-from-pos": [{
          "mask-r-from": scaleMaskImagePosition()
        }],
        "mask-image-r-to-pos": [{
          "mask-r-to": scaleMaskImagePosition()
        }],
        "mask-image-r-from-color": [{
          "mask-r-from": scaleColor()
        }],
        "mask-image-r-to-color": [{
          "mask-r-to": scaleColor()
        }],
        "mask-image-b-from-pos": [{
          "mask-b-from": scaleMaskImagePosition()
        }],
        "mask-image-b-to-pos": [{
          "mask-b-to": scaleMaskImagePosition()
        }],
        "mask-image-b-from-color": [{
          "mask-b-from": scaleColor()
        }],
        "mask-image-b-to-color": [{
          "mask-b-to": scaleColor()
        }],
        "mask-image-l-from-pos": [{
          "mask-l-from": scaleMaskImagePosition()
        }],
        "mask-image-l-to-pos": [{
          "mask-l-to": scaleMaskImagePosition()
        }],
        "mask-image-l-from-color": [{
          "mask-l-from": scaleColor()
        }],
        "mask-image-l-to-color": [{
          "mask-l-to": scaleColor()
        }],
        "mask-image-x-from-pos": [{
          "mask-x-from": scaleMaskImagePosition()
        }],
        "mask-image-x-to-pos": [{
          "mask-x-to": scaleMaskImagePosition()
        }],
        "mask-image-x-from-color": [{
          "mask-x-from": scaleColor()
        }],
        "mask-image-x-to-color": [{
          "mask-x-to": scaleColor()
        }],
        "mask-image-y-from-pos": [{
          "mask-y-from": scaleMaskImagePosition()
        }],
        "mask-image-y-to-pos": [{
          "mask-y-to": scaleMaskImagePosition()
        }],
        "mask-image-y-from-color": [{
          "mask-y-from": scaleColor()
        }],
        "mask-image-y-to-color": [{
          "mask-y-to": scaleColor()
        }],
        "mask-image-radial": [{
          "mask-radial": [isArbitraryVariable, isArbitraryValue]
        }],
        "mask-image-radial-from-pos": [{
          "mask-radial-from": scaleMaskImagePosition()
        }],
        "mask-image-radial-to-pos": [{
          "mask-radial-to": scaleMaskImagePosition()
        }],
        "mask-image-radial-from-color": [{
          "mask-radial-from": scaleColor()
        }],
        "mask-image-radial-to-color": [{
          "mask-radial-to": scaleColor()
        }],
        "mask-image-radial-shape": [{
          "mask-radial": ["circle", "ellipse"]
        }],
        "mask-image-radial-size": [{
          "mask-radial": [{
            closest: ["side", "corner"],
            farthest: ["side", "corner"]
          }]
        }],
        "mask-image-radial-pos": [{
          "mask-radial-at": scalePosition()
        }],
        "mask-image-conic-pos": [{
          "mask-conic": [isNumber]
        }],
        "mask-image-conic-from-pos": [{
          "mask-conic-from": scaleMaskImagePosition()
        }],
        "mask-image-conic-to-pos": [{
          "mask-conic-to": scaleMaskImagePosition()
        }],
        "mask-image-conic-from-color": [{
          "mask-conic-from": scaleColor()
        }],
        "mask-image-conic-to-color": [{
          "mask-conic-to": scaleColor()
        }],
        /**
         * Mask Mode
         * @see https://tailwindcss.com/docs/mask-mode
         */
        "mask-mode": [{
          mask: ["alpha", "luminance", "match"]
        }],
        /**
         * Mask Origin
         * @see https://tailwindcss.com/docs/mask-origin
         */
        "mask-origin": [{
          "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
        }],
        /**
         * Mask Position
         * @see https://tailwindcss.com/docs/mask-position
         */
        "mask-position": [{
          mask: scaleBgPosition()
        }],
        /**
         * Mask Repeat
         * @see https://tailwindcss.com/docs/mask-repeat
         */
        "mask-repeat": [{
          mask: scaleBgRepeat()
        }],
        /**
         * Mask Size
         * @see https://tailwindcss.com/docs/mask-size
         */
        "mask-size": [{
          mask: scaleBgSize()
        }],
        /**
         * Mask Type
         * @see https://tailwindcss.com/docs/mask-type
         */
        "mask-type": [{
          "mask-type": ["alpha", "luminance"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image": [{
          mask: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------
        // --- Filters ---
        // ---------------
        /**
         * Filter
         * @see https://tailwindcss.com/docs/filter
         */
        filter: [{
          filter: [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        blur: [{
          blur: scaleBlur()
        }],
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        brightness: [{
          brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        contrast: [{
          contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        "drop-shadow": [{
          "drop-shadow": [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeDropShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Drop Shadow Color
         * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
         */
        "drop-shadow-color": [{
          "drop-shadow": scaleColor()
        }],
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        grayscale: [{
          grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        "hue-rotate": [{
          "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        invert: [{
          invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        saturate: [{
          saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        sepia: [{
          sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Filter
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        "backdrop-filter": [{
          "backdrop-filter": [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        "backdrop-blur": [{
          "backdrop-blur": scaleBlur()
        }],
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        "backdrop-brightness": [{
          "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        "backdrop-contrast": [{
          "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        "backdrop-grayscale": [{
          "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        "backdrop-hue-rotate": [{
          "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        "backdrop-invert": [{
          "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        "backdrop-opacity": [{
          "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        "backdrop-saturate": [{
          "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        "backdrop-sepia": [{
          "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        // --------------
        // --- Tables ---
        // --------------
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        "border-collapse": [{
          border: ["collapse", "separate"]
        }],
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing": [{
          "border-spacing": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-x": [{
          "border-spacing-x": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-y": [{
          "border-spacing-y": scaleUnambiguousSpacing()
        }],
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        "table-layout": [{
          table: ["auto", "fixed"]
        }],
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        caption: [{
          caption: ["top", "bottom"]
        }],
        // ---------------------------------
        // --- Transitions and Animation ---
        // ---------------------------------
        /**
         * Transition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        transition: [{
          transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Behavior
         * @see https://tailwindcss.com/docs/transition-behavior
         */
        "transition-behavior": [{
          transition: ["normal", "discrete"]
        }],
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        duration: [{
          duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        ease: [{
          ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        delay: [{
          delay: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        animate: [{
          animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------
        // --- Transforms ---
        // ------------------
        /**
         * Backface Visibility
         * @see https://tailwindcss.com/docs/backface-visibility
         */
        backface: [{
          backface: ["hidden", "visible"]
        }],
        /**
         * Perspective
         * @see https://tailwindcss.com/docs/perspective
         */
        perspective: [{
          perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Perspective Origin
         * @see https://tailwindcss.com/docs/perspective-origin
         */
        "perspective-origin": [{
          "perspective-origin": scalePositionWithArbitrary()
        }],
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        rotate: [{
          rotate: scaleRotate()
        }],
        /**
         * Rotate X
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-x": [{
          "rotate-x": scaleRotate()
        }],
        /**
         * Rotate Y
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-y": [{
          "rotate-y": scaleRotate()
        }],
        /**
         * Rotate Z
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-z": [{
          "rotate-z": scaleRotate()
        }],
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        scale: [{
          scale: scaleScale()
        }],
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-x": [{
          "scale-x": scaleScale()
        }],
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-y": [{
          "scale-y": scaleScale()
        }],
        /**
         * Scale Z
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-z": [{
          "scale-z": scaleScale()
        }],
        /**
         * Scale 3D
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-3d": ["scale-3d"],
        /**
         * Skew
         * @see https://tailwindcss.com/docs/skew
         */
        skew: [{
          skew: scaleSkew()
        }],
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-x": [{
          "skew-x": scaleSkew()
        }],
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-y": [{
          "skew-y": scaleSkew()
        }],
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        transform: [{
          transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
        }],
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        "transform-origin": [{
          origin: scalePositionWithArbitrary()
        }],
        /**
         * Transform Style
         * @see https://tailwindcss.com/docs/transform-style
         */
        "transform-style": [{
          transform: ["3d", "flat"]
        }],
        /**
         * Translate
         * @see https://tailwindcss.com/docs/translate
         */
        translate: [{
          translate: scaleTranslate()
        }],
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-x": [{
          "translate-x": scaleTranslate()
        }],
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-y": [{
          "translate-y": scaleTranslate()
        }],
        /**
         * Translate Z
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-z": [{
          "translate-z": scaleTranslate()
        }],
        /**
         * Translate None
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-none": ["translate-none"],
        /**
         * Zoom
         * @see https://tailwindcss.com/docs/zoom
         */
        zoom: [{
          zoom: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------------
        // --- Interactivity ---
        // ---------------------
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        accent: [{
          accent: scaleColor()
        }],
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        appearance: [{
          appearance: ["none", "auto"]
        }],
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        "caret-color": [{
          caret: scaleColor()
        }],
        /**
         * Color Scheme
         * @see https://tailwindcss.com/docs/color-scheme
         */
        "color-scheme": [{
          scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
        }],
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        cursor: [{
          cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Field Sizing
         * @see https://tailwindcss.com/docs/field-sizing
         */
        "field-sizing": [{
          "field-sizing": ["fixed", "content"]
        }],
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        "pointer-events": [{
          "pointer-events": ["auto", "none"]
        }],
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        resize: [{
          resize: ["none", "", "y", "x"]
        }],
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        "scroll-behavior": [{
          scroll: ["auto", "smooth"]
        }],
        /**
         * Scrollbar Thumb Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-thumb-color": [{
          "scrollbar-thumb": scaleColor()
        }],
        /**
         * Scrollbar Track Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-track-color": [{
          "scrollbar-track": scaleColor()
        }],
        /**
         * Scrollbar Gutter
         * @see https://tailwindcss.com/docs/scrollbar-gutter
         */
        "scrollbar-gutter": [{
          "scrollbar-gutter": ["auto", "stable", "both"]
        }],
        /**
         * Scrollbar Width
         * @see https://tailwindcss.com/docs/scrollbar-width
         */
        "scrollbar-w": [{
          scrollbar: ["auto", "thin", "none"]
        }],
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-m": [{
          "scroll-m": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mx": [{
          "scroll-mx": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-my": [{
          "scroll-my": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ms": [{
          "scroll-ms": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-me": [{
          "scroll-me": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbs": [{
          "scroll-mbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbe": [{
          "scroll-mbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mt": [{
          "scroll-mt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mr": [{
          "scroll-mr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mb": [{
          "scroll-mb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ml": [{
          "scroll-ml": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-p": [{
          "scroll-p": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-px": [{
          "scroll-px": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-py": [{
          "scroll-py": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-ps": [{
          "scroll-ps": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pe": [{
          "scroll-pe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbs": [{
          "scroll-pbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbe": [{
          "scroll-pbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pt": [{
          "scroll-pt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pr": [{
          "scroll-pr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pb": [{
          "scroll-pb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pl": [{
          "scroll-pl": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        "snap-align": [{
          snap: ["start", "end", "center", "align-none"]
        }],
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        "snap-stop": [{
          snap: ["normal", "always"]
        }],
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-type": [{
          snap: ["none", "x", "y", "both"]
        }],
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-strictness": [{
          snap: ["mandatory", "proximity"]
        }],
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        touch: [{
          touch: ["auto", "none", "manipulation"]
        }],
        /**
         * Touch Action X
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-x": [{
          "touch-pan": ["x", "left", "right"]
        }],
        /**
         * Touch Action Y
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-y": [{
          "touch-pan": ["y", "up", "down"]
        }],
        /**
         * Touch Action Pinch Zoom
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-pz": ["touch-pinch-zoom"],
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        select: [{
          select: ["none", "text", "all", "auto"]
        }],
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        "will-change": [{
          "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
        }],
        // -----------
        // --- SVG ---
        // -----------
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        fill: [{
          fill: ["none", ...scaleColor()]
        }],
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        "stroke-w": [{
          stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
        }],
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        stroke: [{
          stroke: ["none", ...scaleColor()]
        }],
        // ---------------------
        // --- Accessibility ---
        // ---------------------
        /**
         * Forced Color Adjust
         * @see https://tailwindcss.com/docs/forced-color-adjust
         */
        "forced-color-adjust": [{
          "forced-color-adjust": ["auto", "none"]
        }]
      },
      conflictingClassGroups: {
        "container-named": ["container-type"],
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"]
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"]
      },
      postfixLookupClassGroups: ["container-type"],
      orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
    };
  };
  var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

  // src/lib/remote-components/crm-workbench/src/react-shim.ts
  var react_shim_exports = {};
  __export(react_shim_exports, {
    Children: () => Children,
    Component: () => Component,
    Fragment: () => Fragment,
    Profiler: () => Profiler,
    PureComponent: () => PureComponent,
    StrictMode: () => StrictMode,
    Suspense: () => Suspense,
    cloneElement: () => cloneElement,
    createContext: () => createContext,
    createElement: () => createElement,
    createFactory: () => createFactory,
    createRef: () => createRef,
    default: () => react_shim_default,
    forwardRef: () => forwardRef,
    isValidElement: () => isValidElement,
    lazy: () => lazy,
    memo: () => memo,
    startTransition: () => startTransition,
    useCallback: () => useCallback,
    useContext: () => useContext,
    useDebugValue: () => useDebugValue,
    useDeferredValue: () => useDeferredValue,
    useEffect: () => useEffect,
    useId: () => useId,
    useImperativeHandle: () => useImperativeHandle,
    useInsertionEffect: () => useInsertionEffect,
    useLayoutEffect: () => useLayoutEffect,
    useMemo: () => useMemo,
    useReducer: () => useReducer,
    useRef: () => useRef,
    useState: () => useState,
    useSyncExternalStore: () => useSyncExternalStore,
    useTransition: () => useTransition,
    version: () => version
  });
  var ReactGlobal = window.React;
  var react_shim_default = ReactGlobal;
  var Children = ReactGlobal.Children;
  var Component = ReactGlobal.Component;
  var Fragment = ReactGlobal.Fragment;
  var Profiler = ReactGlobal.Profiler;
  var PureComponent = ReactGlobal.PureComponent;
  var StrictMode = ReactGlobal.StrictMode;
  var Suspense = ReactGlobal.Suspense;
  var cloneElement = ReactGlobal.cloneElement;
  var createContext = ReactGlobal.createContext;
  var createElement = ReactGlobal.createElement;
  var createFactory = ReactGlobal.createFactory;
  var createRef = ReactGlobal.createRef;
  var forwardRef = ReactGlobal.forwardRef;
  var isValidElement = ReactGlobal.isValidElement;
  var lazy = ReactGlobal.lazy;
  var memo = ReactGlobal.memo;
  var startTransition = ReactGlobal.startTransition;
  var useCallback = ReactGlobal.useCallback;
  var useContext = ReactGlobal.useContext;
  var useDebugValue = ReactGlobal.useDebugValue;
  var useDeferredValue = ReactGlobal.useDeferredValue;
  var useEffect = ReactGlobal.useEffect;
  var useId = ReactGlobal.useId;
  var useImperativeHandle = ReactGlobal.useImperativeHandle;
  var useInsertionEffect = ReactGlobal.useInsertionEffect;
  var useLayoutEffect = ReactGlobal.useLayoutEffect;
  var useMemo = ReactGlobal.useMemo;
  var useReducer = ReactGlobal.useReducer;
  var useRef = ReactGlobal.useRef;
  var useState = ReactGlobal.useState;
  var useSyncExternalStore = ReactGlobal.useSyncExternalStore;
  var useTransition = ReactGlobal.useTransition;
  var version = ReactGlobal.version;

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
  var mergeClasses = (...classes) => classes.filter((className, index2, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index2;
  }).join(" ").trim();

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
  var toCamelCase = (string) => string.replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
  );

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  var toPascalCase = (string) => {
    const camelCase = toCamelCase(string);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
  var LucideContext = createContext({});
  var useLucideContext = () => useContext(LucideContext);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
  var Icon = forwardRef(
    ({ color, size: size4, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
      const {
        size: contextSize = 24,
        strokeWidth: contextStrokeWidth = 2,
        absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
        color: contextColor = "currentColor",
        className: contextClass = ""
      } = useLucideContext() ?? {};
      const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size4 ?? contextSize) : strokeWidth ?? contextStrokeWidth;
      return createElement(
        "svg",
        {
          ref,
          ...defaultAttributes,
          width: size4 ?? contextSize ?? defaultAttributes.width,
          height: size4 ?? contextSize ?? defaultAttributes.height,
          stroke: color ?? contextColor,
          strokeWidth: calculatedStrokeWidth,
          className: mergeClasses("lucide", contextClass, className),
          ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
          ...rest
        },
        [
          ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
          ...Array.isArray(children) ? children : [children]
        ]
      );
    }
  );

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
  var createLucideIcon = (iconName, iconNode) => {
    const Component2 = forwardRef(
      ({ className, ...props }, ref) => createElement(Icon, {
        ref,
        iconNode,
        className: mergeClasses(
          `lucide-${toKebabCase(toPascalCase(iconName))}`,
          `lucide-${iconName}`,
          className
        ),
        ...props
      })
    );
    Component2.displayName = toPascalCase(iconName);
    return Component2;
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/check.mjs
  var __iconNode = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Check = createLucideIcon("check", __iconNode);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs
  var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
  var ChevronDown = createLucideIcon("chevron-down", __iconNode2);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-up.mjs
  var __iconNode3 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
  var ChevronUp = createLucideIcon("chevron-up", __iconNode3);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/search.mjs
  var __iconNode4 = [
    ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
    ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
  ];
  var Search = createLucideIcon("search", __iconNode4);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.mjs
  var __iconNode5 = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("x", __iconNode5);

  // src/lib/remote-components/crm-workbench/src/react-jsx-runtime-shim.ts
  var ReactGlobal2 = window.React;
  var Fragment2 = ReactGlobal2.Fragment;
  function jsx(type, props, key) {
    return ReactGlobal2.createElement(type, key === void 0 ? props : { ...props, key });
  }
  var jsxs = jsx;

  // src/lib/remote-components/crm-workbench/src/react-dom-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createPortal = ReactDOMGlobal.createPortal;
  var flushSync = ReactDOMGlobal.flushSync;
  var findDOMNode = ReactDOMGlobal.findDOMNode;
  var hydrate = ReactDOMGlobal.hydrate;
  var render = ReactDOMGlobal.render;
  var unstable_batchedUpdates = ReactDOMGlobal.unstable_batchedUpdates;
  var unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode;
  var version2 = ReactDOMGlobal.version;

  // ../../node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  var dist_exports = {};
  __export(dist_exports, {
    Root: () => Slot,
    Slot: () => Slot,
    Slottable: () => Slottable,
    createSlot: () => createSlot,
    createSlottable: () => createSlottable
  });

  // ../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function composeRefs(...refs) {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((ref) => {
        const cleanup = setRef(ref, node);
        if (!hasCleanup && typeof cleanup == "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup == "function") {
              cleanup();
            } else {
              setRef(refs[i], null);
            }
          }
        };
      }
    };
  }
  function useComposedRefs(...refs) {
    return useCallback(composeRefs(...refs), refs);
  }

  // ../../node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  // @__NO_SIDE_EFFECTS__
  function createSlot(ownerName) {
    const Slot22 = forwardRef((props, forwardedRef) => {
      let { children, ...slotProps } = props;
      let slottableElement = null;
      let hasSlottable = false;
      const newChildren = [];
      if (isLazyComponent(children) && typeof use === "function") {
        children = use(children._payload);
      }
      Children.forEach(children, (maybeSlottable) => {
        if (isSlottable(maybeSlottable)) {
          hasSlottable = true;
          const slottable = maybeSlottable;
          let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
          if (isLazyComponent(child) && typeof use === "function") {
            child = use(child._payload);
          }
          slottableElement = getSlottableElementFromSlottable(slottable, child);
          newChildren.push(slottableElement?.props?.children);
        } else {
          newChildren.push(maybeSlottable);
        }
      });
      if (slottableElement) {
        slottableElement = cloneElement(slottableElement, void 0, newChildren);
      } else if (
        // A `Slottable` was found but it didn't resolve to a single element (e.g.
        // it wrapped multiple elements, text, or a render-prop `child` that
        // wasn't an element). Don't fall back to treating the `Slottable` wrapper
        // itself as the slot target — throw a descriptive error below instead.
        !hasSlottable && Children.count(children) === 1 && isValidElement(children)
      ) {
        slottableElement = children;
      }
      const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
      const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
      if (!slottableElement) {
        if (children || children === 0) {
          throw new Error(
            hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName)
          );
        }
        return children;
      }
      const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
      if (slottableElement.type !== Fragment) {
        mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
      }
      return cloneElement(slottableElement, mergedProps);
    });
    Slot22.displayName = `${ownerName}.Slot`;
    return Slot22;
  }
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  // @__NO_SIDE_EFFECTS__
  function createSlottable(ownerName) {
    const Slottable2 = (props) => "child" in props ? props.children(props.child) : props.children;
    Slottable2.displayName = `${ownerName}.Slottable`;
    Slottable2.__radixId = SLOTTABLE_IDENTIFIER;
    return Slottable2;
  }
  var Slottable = /* @__PURE__ */ createSlottable("Slottable");
  var getSlottableElementFromSlottable = (slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!isValidElement(child2)) return null;
      return cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return isValidElement(child) ? child : null;
  };
  function mergeProps(slotProps, childProps) {
    const overrideProps = { ...childProps };
    for (const propName in childProps) {
      const slotPropValue = slotProps[propName];
      const childPropValue = childProps[propName];
      const isHandler = /^on[A-Z]/.test(propName);
      if (isHandler) {
        if (slotPropValue && childPropValue) {
          overrideProps[propName] = (...args) => {
            const result = childPropValue(...args);
            slotPropValue(...args);
            return result;
          };
        } else if (slotPropValue) {
          overrideProps[propName] = slotPropValue;
        }
      } else if (propName === "style") {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (propName === "className") {
        overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
      }
    }
    return { ...slotProps, ...overrideProps };
  }
  function getElementRef(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  function isSlottable(child) {
    return isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  var createSlotError = (ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  };
  var createSlottableError = (ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  };
  var use = react_shim_exports[" use ".trim().toString()];

  // ../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-primitive/dist/index.mjs
  var NODES = [
    "a",
    "button",
    "div",
    "form",
    "h2",
    "h3",
    "img",
    "input",
    "label",
    "li",
    "nav",
    "ol",
    "p",
    "select",
    "span",
    "svg",
    "ul"
  ];
  var Primitive = NODES.reduce((primitive, node) => {
    const Slot6 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot6 : node;
      if (typeof window !== "undefined") {
        window[/* @__PURE__ */ Symbol.for("radix-ui")] = true;
      }
      return /* @__PURE__ */ jsx(Comp, { ...primitiveProps, ref: forwardedRef });
    });
    Node2.displayName = `Primitive.${node}`;
    return { ...primitive, [node]: Node2 };
  }, {});
  function dispatchDiscreteCustomEvent(target, event) {
    if (target) flushSync(() => target.dispatchEvent(event));
  }

  // ../../node_modules/.pnpm/@radix-ui+react-visually-hidden@1.2.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
  var VISUALLY_HIDDEN_STYLES = Object.freeze({
    // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
    position: "absolute",
    border: 0,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    wordWrap: "normal"
  });
  var NAME = "VisuallyHidden";
  var VisuallyHidden = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...props,
          ref: forwardedRef,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style }
        }
      );
    }
  );
  VisuallyHidden.displayName = NAME;

  // ../../node_modules/.pnpm/@radix-ui+react-context@1.2.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-context/dist/index.mjs
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider = (props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      };
      Provider.displayName = rootComponentName + "Provider";
      function useContext2(consumerName, scope, options2 = {}) {
        const { optional = false } = options2;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const context = useContext(Context);
        if (context) return context;
        if (defaultContext !== void 0) return defaultContext;
        if (optional) return void 0;
        throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
      }
      return [Provider, useContext2];
    }
    const createScope = () => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return createContext(defaultContext);
      });
      return function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      };
    };
    createScope.scopeName = scopeName;
    return [createContext3, composeContextScopes(createScope, ...createContextScopeDeps)];
  }
  function composeContextScopes(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = () => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      };
    };
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }

  // ../../node_modules/.pnpm/@radix-ui+react-collection@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-collection/dist/index.mjs
  function createCollection(name) {
    const PROVIDER_NAME2 = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME2);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME2,
      { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
    );
    const CollectionProvider = (props) => {
      const { scope, children } = props;
      const ref = useRef(null);
      const itemMap = useRef(/* @__PURE__ */ new Map()).current;
      return /* @__PURE__ */ jsx(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
    };
    CollectionProvider.displayName = PROVIDER_NAME2;
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ jsx(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = useRef(null);
        const composedRefs = useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        useEffect(() => {
          context.itemMap.set(ref, { ref, ...itemData });
          return () => void context.itemMap.delete(ref);
        });
        return /* @__PURE__ */ jsx(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useCollection4(scope) {
      const context = useCollectionContext(name + "CollectionConsumer", scope);
      const getItems = useCallback(() => {
        const collectionNode = context.collectionRef.current;
        if (!collectionNode) return [];
        const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
        const items = Array.from(context.itemMap.values());
        const orderedItems = items.sort(
          (a, b) => orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current)
        );
        return orderedItems;
      }, [context.collectionRef, context.itemMap]);
      return getItems;
    }
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      useCollection4,
      createCollectionScope4
    ];
  }

  // ../../node_modules/.pnpm/@radix-ui+primitive@1.1.5/node_modules/@radix-ui/primitive/dist/index.mjs
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    };
  }

  // ../../node_modules/.pnpm/@radix-ui+react-use-layout-effect@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  var useLayoutEffect2 = globalThis?.document ? useLayoutEffect : () => {
  };

  // ../../node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var useInsertionEffect2 = react_shim_exports[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
  function useControllableState({
    prop,
    defaultProp,
    onChange = () => {
    },
    caller
  }) {
    const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
      defaultProp,
      onChange
    });
    const isControlled = prop !== void 0;
    const value = isControlled ? prop : uncontrolledProp;
    if (true) {
      const isControlledRef = useRef(prop !== void 0);
      useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const setValue = useCallback(
      (nextValue) => {
        if (isControlled) {
          const value2 = isFunction(nextValue) ? nextValue(prop) : nextValue;
          if (value2 !== prop) {
            onChangeRef.current?.(value2);
          }
        } else {
          setUncontrolledProp(nextValue);
        }
      },
      [isControlled, prop, setUncontrolledProp, onChangeRef]
    );
    return [value, setValue];
  }
  function useUncontrolledState({
    defaultProp,
    onChange
  }) {
    const [value, setValue] = useState(defaultProp);
    const prevValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    useInsertionEffect2(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      if (prevValueRef.current !== value) {
        onChangeRef.current?.(value);
        prevValueRef.current = value;
      }
    }, [value, prevValueRef]);
    return [value, setValue, onChangeRef];
  }
  function isFunction(value) {
    return typeof value === "function";
  }

  // ../../node_modules/.pnpm/@radix-ui+react-presence@1.1.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-presence/dist/index.mjs
  function useStateMachine(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var Presence = (props) => {
    const { present, children } = props;
    const presence = usePresence(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : Children.only(children);
    const ref = useStableComposedRefs(presence.ref, getElementRef2(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? cloneElement(child, { ref }) : null;
  };
  Presence.displayName = "Presence";
  function usePresence(present) {
    const [node, setNode] = useState();
    const stylesRef = useRef(null);
    const prevPresentRef = useRef(present);
    const prevAnimationNameRef = useRef("none");
    const mountAnimationNameRef = useRef(void 0);
    const initialState = present ? "mounted" : "unmounted";
    const [state, send] = useStateMachine(initialState, {
      mounted: {
        UNMOUNT: "unmounted",
        ANIMATION_OUT: "unmountSuspended"
      },
      unmountSuspended: {
        MOUNT: "mounted",
        ANIMATION_END: "unmounted"
      },
      unmounted: {
        MOUNT: "mounted"
      }
    });
    useEffect(() => {
      if (state === "mounted") {
        prevAnimationNameRef.current = mountAnimationNameRef.current ?? getAnimationName(stylesRef.current);
        mountAnimationNameRef.current = void 0;
      } else {
        prevAnimationNameRef.current = "none";
      }
    }, [state]);
    useLayoutEffect2(() => {
      const styles = stylesRef.current;
      const wasPresent = prevPresentRef.current;
      const hasPresentChanged = wasPresent !== present;
      if (hasPresentChanged) {
        const prevAnimationName = prevAnimationNameRef.current;
        const currentAnimationName = getAnimationName(styles);
        if (present) {
          mountAnimationNameRef.current = currentAnimationName;
          send("MOUNT");
        } else if (currentAnimationName === "none" || styles?.display === "none") {
          send("UNMOUNT");
        } else {
          const isAnimating = prevAnimationName !== currentAnimationName;
          if (wasPresent && isAnimating) {
            send("ANIMATION_OUT");
          } else {
            send("UNMOUNT");
          }
        }
        prevPresentRef.current = present;
      }
    }, [present, send]);
    useLayoutEffect2(() => {
      if (node) {
        let timeoutId;
        const ownerWindow = node.ownerDocument.defaultView ?? window;
        const handleAnimationEnd = (event) => {
          const currentAnimationName = getAnimationName(stylesRef.current);
          const isCurrentAnimation = currentAnimationName.includes(CSS.escape(event.animationName));
          if (event.target === node && isCurrentAnimation) {
            send("ANIMATION_END");
            if (!prevPresentRef.current) {
              const currentFillMode = node.style.animationFillMode;
              node.style.animationFillMode = "forwards";
              timeoutId = ownerWindow.setTimeout(() => {
                if (node.style.animationFillMode === "forwards") {
                  node.style.animationFillMode = currentFillMode;
                }
              });
            }
          }
        };
        const handleAnimationStart = (event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName(stylesRef.current);
          }
        };
        node.addEventListener("animationstart", handleAnimationStart);
        node.addEventListener("animationcancel", handleAnimationEnd);
        node.addEventListener("animationend", handleAnimationEnd);
        return () => {
          ownerWindow.clearTimeout(timeoutId);
          node.removeEventListener("animationstart", handleAnimationStart);
          node.removeEventListener("animationcancel", handleAnimationEnd);
          node.removeEventListener("animationend", handleAnimationEnd);
        };
      } else {
        send("ANIMATION_END");
      }
    }, [node, send]);
    return {
      isPresent: ["mounted", "unmountSuspended"].includes(state),
      ref: useCallback((node2) => {
        if (node2) {
          const styles = getComputedStyle(node2);
          stylesRef.current = styles;
          mountAnimationNameRef.current = getAnimationName(styles);
        } else {
          stylesRef.current = null;
        }
        setNode(node2);
      }, [])
    };
  }
  function setRef2(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function useStableComposedRefs(...refs) {
    const refsRef = useRef(refs);
    refsRef.current = refs;
    return useCallback((node) => {
      const currentRefs = refsRef.current;
      let hasCleanup = false;
      const cleanups = currentRefs.map((ref) => {
        const cleanup = setRef2(ref, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup === "function") {
              cleanup();
            } else {
              setRef2(currentRefs[i], null);
            }
          }
        };
      }
    }, []);
  }
  function getAnimationName(styles) {
    return styles?.animationName || "none";
  }
  function getElementRef2(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }

  // ../../node_modules/.pnpm/@radix-ui+react-id@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-id/dist/index.mjs
  var useReactId = react_shim_exports[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId2(deterministicId) {
    const [id, setId] = useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }

  // ../../node_modules/.pnpm/@radix-ui+react-direction@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-direction/dist/index.mjs
  var DirectionContext = createContext(void 0);
  function useDirection(localDir) {
    const globalDir = useContext(DirectionContext);
    return localDir || globalDir || "ltr";
  }

  // ../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var dist_exports2 = {};
  __export(dist_exports2, {
    Close: () => DialogClose,
    Content: () => DialogContent,
    Description: () => DialogDescription,
    Dialog: () => Dialog,
    DialogClose: () => DialogClose,
    DialogContent: () => DialogContent,
    DialogDescription: () => DialogDescription,
    DialogOverlay: () => DialogOverlay,
    DialogPortal: () => DialogPortal,
    DialogTitle: () => DialogTitle,
    DialogTrigger: () => DialogTrigger,
    Overlay: () => DialogOverlay,
    Portal: () => DialogPortal,
    Root: () => Dialog,
    Title: () => DialogTitle,
    Trigger: () => DialogTrigger,
    WarningProvider: () => WarningProvider,
    createDialogScope: () => createDialogScope
  });

  // ../../node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  function useCallbackRef(callback) {
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    });
    return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }

  // ../../node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.15_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var DISMISSABLE_LAYER_NAME = "DismissableLayer";
  var CONTEXT_UPDATE = "dismissableLayer.update";
  var POINTER_DOWN_OUTSIDE = "dismissableLayer.pointerDownOutside";
  var FOCUS_OUTSIDE = "dismissableLayer.focusOutside";
  var originalBodyPointerEvents;
  var DismissableLayerContext = createContext({
    layers: /* @__PURE__ */ new Set(),
    layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
    branches: /* @__PURE__ */ new Set(),
    // Outside elements that belong to a layer's own dismiss affordance (eg, a
    // dialog overlay). Pressing them should dismiss the layer regardless of
    // whether or not they stop propagation.
    //
    // See https://github.com/radix-ui/primitives/issues/3346
    dismissableSurfaces: /* @__PURE__ */ new Set()
  });
  var DismissableLayer = forwardRef(
    (props, forwardedRef) => {
      const {
        disableOutsidePointerEvents = false,
        deferPointerDownOutside = false,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        ...layerProps
      } = props;
      const context = useContext(DismissableLayerContext);
      const [node, setNode] = useState(null);
      const ownerDocument = node?.ownerDocument ?? globalThis?.document;
      const [, force] = useState({});
      const composedRefs = useComposedRefs(forwardedRef, setNode);
      const layers = Array.from(context.layers);
      const [highestLayerWithOutsidePointerEventsDisabled] = [
        ...context.layersWithOutsidePointerEventsDisabled
      ].slice(-1);
      const highestLayerWithOutsidePointerEventsDisabledIndex = highestLayerWithOutsidePointerEventsDisabled ? layers.indexOf(highestLayerWithOutsidePointerEventsDisabled) : -1;
      const index2 = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index2 >= highestLayerWithOutsidePointerEventsDisabledIndex;
      const isDeferredPointerDownOutsideRef = useRef(false);
      const pointerDownOutside = usePointerDownOutside(
        (event) => {
          onPointerDownOutside?.(event);
          onInteractOutside?.(event);
          if (!event.defaultPrevented) onDismiss?.();
        },
        {
          ownerDocument,
          deferPointerDownOutside,
          isDeferredPointerDownOutsideRef,
          dismissableSurfaces: context.dismissableSurfaces,
          shouldHandlePointerDownOutside: useCallback(
            (target) => {
              if (!(target instanceof Node)) {
                return false;
              }
              const isPointerDownOnBranch = [...context.branches].some(
                (branch) => branch.contains(target)
              );
              return isPointerEventsEnabled && !isPointerDownOnBranch;
            },
            [context.branches, isPointerEventsEnabled]
          )
        }
      );
      const focusOutside = useFocusOutside((event) => {
        if (deferPointerDownOutside && isDeferredPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
        if (isFocusInBranch) return;
        onFocusOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      const isHighestLayer = node ? index2 === layers.length - 1 : false;
      const handleKeyDown = useCallbackRef((event) => {
        if (event.key !== "Escape") {
          return;
        }
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented && onDismiss) {
          event.preventDefault();
          onDismiss();
        }
      });
      useEffect(() => {
        if (!isHighestLayer) {
          return;
        }
        ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
      }, [ownerDocument, isHighestLayer, handleKeyDown]);
      useEffect(() => {
        if (!node) return;
        if (disableOutsidePointerEvents) {
          if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
            originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
            ownerDocument.body.style.pointerEvents = "none";
          }
          context.layersWithOutsidePointerEventsDisabled.add(node);
        }
        context.layers.add(node);
        dispatchUpdate();
        return () => {
          if (disableOutsidePointerEvents) {
            context.layersWithOutsidePointerEventsDisabled.delete(node);
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
              ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
            }
          }
        };
      }, [node, ownerDocument, disableOutsidePointerEvents, context]);
      useEffect(() => {
        return () => {
          if (!node) return;
          context.layers.delete(node);
          context.layersWithOutsidePointerEventsDisabled.delete(node);
          dispatchUpdate();
        };
      }, [node, context]);
      useEffect(() => {
        const handleUpdate = () => force({});
        document.addEventListener(CONTEXT_UPDATE, handleUpdate);
        return () => document.removeEventListener(CONTEXT_UPDATE, handleUpdate);
      }, []);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          ...layerProps,
          ref: composedRefs,
          style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? "auto" : "none" : void 0,
            ...props.style
          },
          onFocusCapture: composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
          onBlurCapture: composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
          onPointerDownCapture: composeEventHandlers(
            props.onPointerDownCapture,
            pointerDownOutside.onPointerDownCapture
          )
        }
      );
    }
  );
  DismissableLayer.displayName = DISMISSABLE_LAYER_NAME;
  var BRANCH_NAME = "DismissableLayerBranch";
  var DismissableLayerBranch = forwardRef((props, forwardedRef) => {
    const context = useContext(DismissableLayerContext);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        context.branches.add(node);
        return () => {
          context.branches.delete(node);
        };
      }
    }, [context.branches]);
    return /* @__PURE__ */ jsx(Primitive.div, { ...props, ref: composedRefs });
  });
  DismissableLayerBranch.displayName = BRANCH_NAME;
  function useDismissableLayerSurface() {
    const context = useContext(DismissableLayerContext);
    const [node, setNode] = useState(null);
    useEffect(() => {
      if (!node) {
        return;
      }
      context.dismissableSurfaces.add(node);
      return () => {
        context.dismissableSurfaces.delete(node);
      };
    }, [node, context.dismissableSurfaces]);
    return setNode;
  }
  var IS_TRUE = () => true;
  function usePointerDownOutside(onPointerDownOutside, args) {
    const {
      ownerDocument = globalThis?.document,
      deferPointerDownOutside = false,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside = IS_TRUE
    } = args;
    const handlePointerDownOutside = useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = useRef(false);
    const isPointerDownOutsideRef = useRef(false);
    const interceptedOutsideInteractionEventsRef = useRef(/* @__PURE__ */ new Map());
    const handleClickRef = useRef(() => {
    });
    useEffect(() => {
      function resetOutsideInteraction() {
        isPointerDownOutsideRef.current = false;
        isDeferredPointerDownOutsideRef.current = false;
        interceptedOutsideInteractionEventsRef.current.clear();
      }
      function isOutsideInteractionIntercepted() {
        return Array.from(interceptedOutsideInteractionEventsRef.current.values()).some(Boolean);
      }
      function handleInteractionCapture(event) {
        if (!isPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isDismissableSurface = target instanceof Node && [...dismissableSurfaces].some((surface) => surface.contains(target));
        if (!isDismissableSurface) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, true);
        }
        if (event.type === "click") {
          window.setTimeout(() => {
            if (isPointerDownOutsideRef.current) {
              handleClickRef.current();
            }
          }, 0);
        }
      }
      function handleInteractionBubble(event) {
        if (isPointerDownOutsideRef.current) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, false);
        }
      }
      const handlePointerDown = (event) => {
        if (event.target && !isPointerInsideReactTreeRef.current) {
          let handleAndDispatchPointerDownOutsideEvent2 = function() {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            const wasOutsideInteractionIntercepted = isOutsideInteractionIntercepted();
            resetOutsideInteraction();
            if (!wasOutsideInteractionIntercepted) {
              handleAndDispatchCustomEvent(
                POINTER_DOWN_OUTSIDE,
                handlePointerDownOutside,
                eventDetail,
                { discrete: true }
              );
            }
          };
          var handleAndDispatchPointerDownOutsideEvent = handleAndDispatchPointerDownOutsideEvent2;
          if (!shouldHandlePointerDownOutside(event.target)) {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            resetOutsideInteraction();
            isPointerInsideReactTreeRef.current = false;
            return;
          }
          const eventDetail = { originalEvent: event };
          isPointerDownOutsideRef.current = true;
          isDeferredPointerDownOutsideRef.current = deferPointerDownOutside && event.button === 0;
          interceptedOutsideInteractionEventsRef.current.clear();
          if (!deferPointerDownOutside || event.button !== 0) {
            handleAndDispatchPointerDownOutsideEvent2();
          } else {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            handleClickRef.current = handleAndDispatchPointerDownOutsideEvent2;
            ownerDocument.addEventListener("click", handleClickRef.current, { once: true });
          }
        } else {
          ownerDocument.removeEventListener("click", handleClickRef.current);
          resetOutsideInteraction();
        }
        isPointerInsideReactTreeRef.current = false;
      };
      const outsideInteractionEvents = [
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "click"
      ];
      for (const eventName of outsideInteractionEvents) {
        ownerDocument.addEventListener(eventName, handleInteractionCapture, true);
        ownerDocument.addEventListener(eventName, handleInteractionBubble);
      }
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener("pointerdown", handlePointerDown);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener("pointerdown", handlePointerDown);
        ownerDocument.removeEventListener("click", handleClickRef.current);
        for (const eventName of outsideInteractionEvents) {
          ownerDocument.removeEventListener(eventName, handleInteractionCapture, true);
          ownerDocument.removeEventListener(eventName, handleInteractionBubble);
        }
      };
    }, [
      ownerDocument,
      handlePointerDownOutside,
      deferPointerDownOutside,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside
    ]);
    return {
      // ensures we check React component tree (not just DOM tree)
      onPointerDownCapture: () => isPointerInsideReactTreeRef.current = true
    };
  }
  function useFocusOutside(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = useRef(false);
    useEffect(() => {
      const handleFocus = (event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      };
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: () => isFocusInsideReactTreeRef.current = true,
      onBlurCapture: () => isFocusInsideReactTreeRef.current = false
    };
  }
  function dispatchUpdate() {
    const event = new CustomEvent(CONTEXT_UPDATE);
    document.dispatchEvent(event);
  }
  function handleAndDispatchCustomEvent(name, handler, detail, { discrete }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
    if (handler) target.addEventListener(name, handler, { once: true });
    if (discrete) {
      dispatchDiscreteCustomEvent(target, event);
    } else {
      target.dispatchEvent(event);
    }
  }

  // ../../node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  var AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS = { bubbles: false, cancelable: true };
  var FOCUS_SCOPE_NAME = "FocusScope";
  var FocusScope = forwardRef((props, forwardedRef) => {
    const {
      loop = false,
      trapped = false,
      onMountAutoFocus: onMountAutoFocusProp,
      onUnmountAutoFocus: onUnmountAutoFocusProp,
      ...scopeProps
    } = props;
    const [container, setContainer] = useState(null);
    const onMountAutoFocus = useCallbackRef(onMountAutoFocusProp);
    const onUnmountAutoFocus = useCallbackRef(onUnmountAutoFocusProp);
    const lastFocusedElementRef = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, setContainer);
    const focusScope = useRef({
      paused: false,
      pause() {
        this.paused = true;
      },
      resume() {
        this.paused = false;
      }
    }).current;
    useEffect(() => {
      if (trapped) {
        let handleFocusIn2 = function(event) {
          if (focusScope.paused || !container) return;
          const target = event.target;
          if (container.contains(target)) {
            lastFocusedElementRef.current = target;
          } else {
            focus(lastFocusedElementRef.current, { select: true });
          }
        }, handleFocusOut2 = function(event) {
          if (focusScope.paused || !container) return;
          const relatedTarget = event.relatedTarget;
          if (relatedTarget === null) return;
          if (!container.contains(relatedTarget)) {
            focus(lastFocusedElementRef.current, { select: true });
          }
        }, handleMutations2 = function(mutations) {
          const focusedElement = document.activeElement;
          if (focusedElement !== document.body) return;
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) focus(container);
          }
        };
        var handleFocusIn = handleFocusIn2, handleFocusOut = handleFocusOut2, handleMutations = handleMutations2;
        document.addEventListener("focusin", handleFocusIn2);
        document.addEventListener("focusout", handleFocusOut2);
        const mutationObserver = new MutationObserver(handleMutations2);
        if (container) mutationObserver.observe(container, { childList: true, subtree: true });
        return () => {
          document.removeEventListener("focusin", handleFocusIn2);
          document.removeEventListener("focusout", handleFocusOut2);
          mutationObserver.disconnect();
        };
      }
    }, [trapped, container, focusScope.paused]);
    useEffect(() => {
      if (container) {
        focusScopesStack.add(focusScope);
        const previouslyFocusedElement = document.activeElement;
        const hasFocusedCandidate = container.contains(previouslyFocusedElement);
        if (!hasFocusedCandidate) {
          const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
          container.addEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
          container.dispatchEvent(mountEvent);
          if (!mountEvent.defaultPrevented) {
            focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });
            if (document.activeElement === previouslyFocusedElement) {
              focus(container);
            }
          }
        }
        return () => {
          container.removeEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
          setTimeout(() => {
            const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
            container.addEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
            container.dispatchEvent(unmountEvent);
            if (!unmountEvent.defaultPrevented) {
              focus(previouslyFocusedElement ?? document.body, { select: true });
            }
            container.removeEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
            focusScopesStack.remove(focusScope);
          }, 0);
        };
      }
    }, [container, onMountAutoFocus, onUnmountAutoFocus, focusScope]);
    const handleKeyDown = useCallback(
      (event) => {
        if (!loop && !trapped) return;
        if (focusScope.paused) return;
        const isTabKey = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
        const focusedElement = document.activeElement;
        if (isTabKey && focusedElement) {
          const container2 = event.currentTarget;
          const [first, last] = getTabbableEdges(container2);
          const hasTabbableElementsInside = first && last;
          if (!hasTabbableElementsInside) {
            if (focusedElement === container2) event.preventDefault();
          } else {
            if (!event.shiftKey && focusedElement === last) {
              event.preventDefault();
              if (loop) focus(first, { select: true });
            } else if (event.shiftKey && focusedElement === first) {
              event.preventDefault();
              if (loop) focus(last, { select: true });
            }
          }
        }
      },
      [loop, trapped, focusScope.paused]
    );
    return /* @__PURE__ */ jsx(Primitive.div, { tabIndex: -1, ...scopeProps, ref: composedRefs, onKeyDown: handleKeyDown });
  });
  FocusScope.displayName = FOCUS_SCOPE_NAME;
  function focusFirst(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  function getTabbableEdges(container) {
    const candidates = getTabbableCandidates(container);
    const first = findVisible(candidates, container);
    const last = findVisible(candidates.reverse(), container);
    return [first, last];
  }
  function getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function findVisible(elements, container) {
    const canUseCheckVisibility = typeof container.checkVisibility === "function" && container.checkVisibility({ checkVisibilityCSS: true });
    for (const element of elements) {
      const hidden = canUseCheckVisibility ? !element.checkVisibility({ checkVisibilityCSS: true }) : isHidden(element, { upTo: container });
      if (!hidden) {
        return element;
      }
    }
  }
  function isHidden(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  function isSelectableInput(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  function focus(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput(element) && select)
        element.select();
    }
  }
  var focusScopesStack = createFocusScopesStack();
  function createFocusScopesStack() {
    let stack = [];
    return {
      add(focusScope) {
        const activeFocusScope = stack[0];
        if (focusScope !== activeFocusScope) {
          activeFocusScope?.pause();
        }
        stack = arrayRemove(stack, focusScope);
        stack.unshift(focusScope);
      },
      remove(focusScope) {
        stack = arrayRemove(stack, focusScope);
        stack[0]?.resume();
      }
    };
  }
  function arrayRemove(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }

  // ../../node_modules/.pnpm/@radix-ui+react-portal@1.1.13_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-portal/dist/index.mjs
  var PORTAL_NAME = "Portal";
  var Portal = forwardRef((props, forwardedRef) => {
    const { container: containerProp, ...portalProps } = props;
    const [mounted, setMounted] = useState(false);
    useLayoutEffect2(() => setMounted(true), []);
    const container = containerProp || mounted && globalThis?.document?.body;
    return container ? createPortal(/* @__PURE__ */ jsx(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
  });
  Portal.displayName = PORTAL_NAME;

  // ../../node_modules/.pnpm/@radix-ui+react-focus-guards@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
  var count2 = 0;
  var guards = null;
  function useFocusGuards() {
    useEffect(() => {
      if (!guards) {
        guards = { start: createFocusGuard(), end: createFocusGuard() };
      }
      const { start, end } = guards;
      if (document.body.firstElementChild !== start) {
        document.body.insertAdjacentElement("afterbegin", start);
      }
      if (document.body.lastElementChild !== end) {
        document.body.insertAdjacentElement("beforeend", end);
      }
      count2++;
      return () => {
        if (count2 === 1) {
          guards?.start.remove();
          guards?.end.remove();
          guards = null;
        }
        count2 = Math.max(0, count2 - 1);
      };
    }, []);
  }
  function createFocusGuard() {
    const element = document.createElement("span");
    element.setAttribute("data-radix-focus-guard", "");
    element.tabIndex = 0;
    element.style.outline = "none";
    element.style.opacity = "0";
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    return element;
  }

  // ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
  var __assign = function() {
    __assign = Object.assign || function __assign2(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p2 in s) if (Object.prototype.hasOwnProperty.call(s, p2)) t[p2] = s[p2];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  function __rest(s, e) {
    var t = {};
    for (var p2 in s) if (Object.prototype.hasOwnProperty.call(s, p2) && e.indexOf(p2) < 0)
      t[p2] = s[p2];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p2 = Object.getOwnPropertySymbols(s); i < p2.length; i++) {
        if (e.indexOf(p2[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p2[i]))
          t[p2[i]] = s[p2[i]];
      }
    return t;
  }
  function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar2; i < l; i++) {
      if (ar2 || !(i in from)) {
        if (!ar2) ar2 = Array.prototype.slice.call(from, 0, i);
        ar2[i] = from[i];
      }
    }
    return to.concat(ar2 || Array.prototype.slice.call(from));
  }

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/assignRef.js
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useRef.js
  function useCallbackRef2(initialValue, callback) {
    var ref = useState(function() {
      return {
        // value
        value: initialValue,
        // last callback
        callback,
        // "memoized" public interface
        facade: {
          get current() {
            return ref.value;
          },
          set current(value) {
            var last = ref.value;
            if (last !== value) {
              ref.value = value;
              ref.callback(value, last);
            }
          }
        }
      };
    })[0];
    ref.callback = callback;
    return ref.facade;
  }

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
  var useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  var currentValues = /* @__PURE__ */ new WeakMap();
  function useMergeRefs(refs, defaultValue) {
    var callbackRef = useCallbackRef2(defaultValue || null, function(newValue) {
      return refs.forEach(function(ref) {
        return assignRef(ref, newValue);
      });
    });
    useIsomorphicLayoutEffect(function() {
      var oldValue = currentValues.get(callbackRef);
      if (oldValue) {
        var prevRefs_1 = new Set(oldValue);
        var nextRefs_1 = new Set(refs);
        var current_1 = callbackRef.current;
        prevRefs_1.forEach(function(ref) {
          if (!nextRefs_1.has(ref)) {
            assignRef(ref, null);
          }
        });
        nextRefs_1.forEach(function(ref) {
          if (!prevRefs_1.has(ref)) {
            assignRef(ref, current_1);
          }
        });
      }
      currentValues.set(callbackRef, refs);
    }, [refs]);
    return callbackRef;
  }

  // ../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/medium.js
  function ItoI(a) {
    return a;
  }
  function innerCreateMedium(defaults, middleware) {
    if (middleware === void 0) {
      middleware = ItoI;
    }
    var buffer = [];
    var assigned = false;
    var medium = {
      read: function() {
        if (assigned) {
          throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
        }
        if (buffer.length) {
          return buffer[buffer.length - 1];
        }
        return defaults;
      },
      useMedium: function(data) {
        var item = middleware(data, assigned);
        buffer.push(item);
        return function() {
          buffer = buffer.filter(function(x) {
            return x !== item;
          });
        };
      },
      assignSyncMedium: function(cb) {
        assigned = true;
        while (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
        }
        buffer = {
          push: function(x) {
            return cb(x);
          },
          filter: function() {
            return buffer;
          }
        };
      },
      assignMedium: function(cb) {
        assigned = true;
        var pendingQueue = [];
        if (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
          pendingQueue = buffer;
        }
        var executeQueue = function() {
          var cbs2 = pendingQueue;
          pendingQueue = [];
          cbs2.forEach(cb);
        };
        var cycle = function() {
          return Promise.resolve().then(executeQueue);
        };
        cycle();
        buffer = {
          push: function(x) {
            pendingQueue.push(x);
            cycle();
          },
          filter: function(filter) {
            pendingQueue = pendingQueue.filter(filter);
            return buffer;
          }
        };
      }
    };
    return medium;
  }
  function createSidecarMedium(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    var medium = innerCreateMedium(null);
    medium.options = __assign({ async: true, ssr: false }, options2);
    return medium;
  }

  // ../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/exports.js
  var SideCar = function(_a) {
    var sideCar = _a.sideCar, rest = __rest(_a, ["sideCar"]);
    if (!sideCar) {
      throw new Error("Sidecar: please provide `sideCar` property to import the right car");
    }
    var Target = sideCar.read();
    if (!Target) {
      throw new Error("Sidecar medium not found");
    }
    return createElement(Target, __assign({}, rest));
  };
  SideCar.isSideCarExport = true;
  function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
  }

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = forwardRef(function(props, parentRef) {
    var ref = useRef(null);
    var _a = useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a[0], setCallbacks = _a[1];
    var forwardProps = props.forwardProps, children = props.children, className = props.className, removeScrollBar = props.removeScrollBar, enabled = props.enabled, shards = props.shards, sideCar = props.sideCar, noRelative = props.noRelative, noIsolation = props.noIsolation, inert = props.inert, allowPinchZoom = props.allowPinchZoom, _b = props.as, Container = _b === void 0 ? "div" : _b, gapMode = props.gapMode, rest = __rest(props, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]);
    var SideCar2 = sideCar;
    var containerRef = useMergeRefs([ref, parentRef]);
    var containerProps = __assign(__assign({}, rest), callbacks);
    return createElement(
      Fragment,
      null,
      enabled && createElement(SideCar2, { sideCar: effectCar, removeScrollBar, shards, noRelative, noIsolation, inert, setCallbacks, allowPinchZoom: !!allowPinchZoom, lockRef: ref, gapMode }),
      forwardProps ? cloneElement(Children.only(children), __assign(__assign({}, containerProps), { ref: containerRef })) : createElement(Container, __assign({}, containerProps, { className, ref: containerRef }), children)
    );
  });
  RemoveScroll.defaultProps = {
    enabled: true,
    removeScrollBar: true,
    inert: false
  };
  RemoveScroll.classNames = {
    fullWidth: fullWidthClassName,
    zeroRight: zeroRightClassName
  };

  // ../../node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
  var currentNonce;
  var getNonce = function() {
    if (currentNonce) {
      return currentNonce;
    }
    if (typeof __webpack_nonce__ !== "undefined") {
      return __webpack_nonce__;
    }
    return void 0;
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/singleton.js
  function makeStyleTag() {
    if (!document)
      return null;
    var tag = document.createElement("style");
    tag.type = "text/css";
    var nonce = getNonce();
    if (nonce) {
      tag.setAttribute("nonce", nonce);
    }
    return tag;
  }
  function injectStyles(tag, css) {
    if (tag.styleSheet) {
      tag.styleSheet.cssText = css;
    } else {
      tag.appendChild(document.createTextNode(css));
    }
  }
  function insertStyleTag(tag) {
    var head = document.head || document.getElementsByTagName("head")[0];
    head.appendChild(tag);
  }
  var stylesheetSingleton = function() {
    var counter = 0;
    var stylesheet = null;
    return {
      add: function(style) {
        if (counter == 0) {
          if (stylesheet = makeStyleTag()) {
            injectStyles(stylesheet, style);
            insertStyleTag(stylesheet);
          }
        }
        counter++;
      },
      remove: function() {
        counter--;
        if (!counter && stylesheet) {
          stylesheet.parentNode && stylesheet.parentNode.removeChild(stylesheet);
          stylesheet = null;
        }
      }
    };
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/hook.js
  var styleHookSingleton = function() {
    var sheet = stylesheetSingleton();
    return function(styles, isDynamic) {
      useEffect(function() {
        sheet.add(styles);
        return function() {
          sheet.remove();
        };
      }, [styles && isDynamic]);
    };
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet = function(_a) {
      var styles = _a.styles, dynamic = _a.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet;
  };

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
  var zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0
  };
  var parse = function(x) {
    return parseInt(x || "", 10) || 0;
  };
  var getOffset = function(gapMode) {
    var cs = window.getComputedStyle(document.body);
    var left = cs[gapMode === "padding" ? "paddingLeft" : "marginLeft"];
    var top = cs[gapMode === "padding" ? "paddingTop" : "marginTop"];
    var right = cs[gapMode === "padding" ? "paddingRight" : "marginRight"];
    return [parse(left), parse(top), parse(right)];
  };
  var getGapWidth = function(gapMode) {
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    if (typeof window === "undefined") {
      return zeroGap;
    }
    var offsets = getOffset(gapMode);
    var documentWidth = document.documentElement.clientWidth;
    var windowWidth = window.innerWidth;
    return {
      left: offsets[0],
      top: offsets[1],
      right: offsets[2],
      gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0])
    };
  };

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a, allowRelative, gapMode, important) {
    var left = _a.left, top = _a.top, right = _a.right, gap = _a.gap;
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    return "\n  .".concat(noScrollbarsClassName, " {\n   overflow: hidden ").concat(important, ";\n   padding-right: ").concat(gap, "px ").concat(important, ";\n  }\n  body[").concat(lockAttribute, "] {\n    overflow: hidden ").concat(important, ";\n    overscroll-behavior: contain;\n    ").concat([
      allowRelative && "position: relative ".concat(important, ";"),
      gapMode === "margin" && "\n    padding-left: ".concat(left, "px;\n    padding-top: ").concat(top, "px;\n    padding-right: ").concat(right, "px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ").concat(gap, "px ").concat(important, ";\n    "),
      gapMode === "padding" && "padding-right: ".concat(gap, "px ").concat(important, ";")
    ].filter(Boolean).join(""), "\n  }\n  \n  .").concat(zeroRightClassName, " {\n    right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " {\n    margin-right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(zeroRightClassName, " .").concat(zeroRightClassName, " {\n    right: 0 ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " .").concat(fullWidthClassName, " {\n    margin-right: 0 ").concat(important, ";\n  }\n  \n  body[").concat(lockAttribute, "] {\n    ").concat(removedBarSizeVariable, ": ").concat(gap, "px;\n  }\n");
  };
  var getCurrentUseCounter = function() {
    var counter = parseInt(document.body.getAttribute(lockAttribute) || "0", 10);
    return isFinite(counter) ? counter : 0;
  };
  var useLockAttribute = function() {
    useEffect(function() {
      document.body.setAttribute(lockAttribute, (getCurrentUseCounter() + 1).toString());
      return function() {
        var newCounter = getCurrentUseCounter() - 1;
        if (newCounter <= 0) {
          document.body.removeAttribute(lockAttribute);
        } else {
          document.body.setAttribute(lockAttribute, newCounter.toString());
        }
      };
    }, []);
  };
  var RemoveScrollBar = function(_a) {
    var noRelative = _a.noRelative, noImportant = _a.noImportant, _b = _a.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
  var passiveSupported = false;
  if (typeof window !== "undefined") {
    try {
      options = Object.defineProperty({}, "passive", {
        get: function() {
          passiveSupported = true;
          return true;
        }
      });
      window.addEventListener("test", options, options);
      window.removeEventListener("test", options, options);
    } catch (err) {
      passiveSupported = false;
    }
  }
  var options;
  var nonPassive = passiveSupported ? { passive: false } : false;

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
  var alwaysContainsScroll = function(node) {
    return node.tagName === "TEXTAREA";
  };
  var elementCanBeScrolled = function(node, overflow) {
    if (!(node instanceof Element)) {
      return false;
    }
    var styles = window.getComputedStyle(node);
    return (
      // not-not-scrollable
      styles[overflow] !== "hidden" && // contains scroll inside self
      !(styles.overflowY === styles.overflowX && !alwaysContainsScroll(node) && styles[overflow] === "visible")
    );
  };
  var elementCouldBeVScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowY");
  };
  var elementCouldBeHScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowX");
  };
  var locationCouldBeScrolled = function(axis, node) {
    var ownerDocument = node.ownerDocument;
    var current = node;
    do {
      if (typeof ShadowRoot !== "undefined" && current instanceof ShadowRoot) {
        current = current.host;
      }
      var isScrollable = elementCouldBeScrolled(axis, current);
      if (isScrollable) {
        var _a = getScrollVariables(axis, current), scrollHeight = _a[1], clientHeight = _a[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a) {
    var scrollTop = _a.scrollTop, scrollHeight = _a.scrollHeight, clientHeight = _a.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a) {
    var scrollLeft = _a.scrollLeft, scrollWidth = _a.scrollWidth, clientWidth = _a.clientWidth;
    return [
      scrollLeft,
      scrollWidth,
      clientWidth
    ];
  };
  var elementCouldBeScrolled = function(axis, node) {
    return axis === "v" ? elementCouldBeVScrolled(node) : elementCouldBeHScrolled(node);
  };
  var getScrollVariables = function(axis, node) {
    return axis === "v" ? getVScrollVariables(node) : getHScrollVariables(node);
  };
  var getDirectionFactor = function(axis, direction) {
    return axis === "h" && direction === "rtl" ? -1 : 1;
  };
  var handleScroll = function(axis, endTarget, event, sourceDelta, noOverscroll) {
    var directionFactor = getDirectionFactor(axis, window.getComputedStyle(endTarget).direction);
    var delta = directionFactor * sourceDelta;
    var target = event.target;
    var targetInLock = endTarget.contains(target);
    var shouldCancelScroll = false;
    var isDeltaPositive = delta > 0;
    var availableScroll = 0;
    var availableScrollTop = 0;
    do {
      if (!target) {
        break;
      }
      var _a = getScrollVariables(axis, target), position = _a[0], scroll_1 = _a[1], capacity = _a[2];
      var elementScroll = scroll_1 - capacity - directionFactor * position;
      if (position || elementScroll) {
        if (elementCouldBeScrolled(axis, target)) {
          availableScroll += elementScroll;
          availableScrollTop += position;
        }
      }
      var parent_1 = target.parentNode;
      target = parent_1 && parent_1.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent_1.host : parent_1;
    } while (
      // portaled content
      !targetInLock && target !== document.body || // self content
      targetInLock && (endTarget.contains(target) || endTarget === target)
    );
    if (isDeltaPositive && (noOverscroll && Math.abs(availableScroll) < 1 || !noOverscroll && delta > availableScroll)) {
      shouldCancelScroll = true;
    } else if (!isDeltaPositive && (noOverscroll && Math.abs(availableScrollTop) < 1 || !noOverscroll && -delta > availableScrollTop)) {
      shouldCancelScroll = true;
    }
    return shouldCancelScroll;
  };

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  var getTouchXY = function(event) {
    return "changedTouches" in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
  };
  var getDeltaXY = function(event) {
    return [event.deltaX, event.deltaY];
  };
  var extractRef = function(ref) {
    return ref && "current" in ref ? ref.current : ref;
  };
  var deltaCompare = function(x, y) {
    return x[0] === y[0] && x[1] === y[1];
  };
  var generateStyle = function(id) {
    return "\n  .block-interactivity-".concat(id, " {pointer-events: none;}\n  .allow-interactivity-").concat(id, " {pointer-events: all;}\n");
  };
  var idCounter = 0;
  var lockStack = [];
  function RemoveScrollSideCar(props) {
    var shouldPreventQueue = useRef([]);
    var touchStartRef = useRef([0, 0]);
    var activeAxis = useRef();
    var id = useState(idCounter++)[0];
    var Style2 = useState(styleSingleton)[0];
    var lastProps = useRef(props);
    useEffect(function() {
      lastProps.current = props;
    }, [props]);
    useEffect(function() {
      if (props.inert) {
        document.body.classList.add("block-interactivity-".concat(id));
        var allow_1 = __spreadArray([props.lockRef.current], (props.shards || []).map(extractRef), true).filter(Boolean);
        allow_1.forEach(function(el) {
          return el.classList.add("allow-interactivity-".concat(id));
        });
        return function() {
          document.body.classList.remove("block-interactivity-".concat(id));
          allow_1.forEach(function(el) {
            return el.classList.remove("allow-interactivity-".concat(id));
          });
        };
      }
      return;
    }, [props.inert, props.lockRef.current, props.shards]);
    var shouldCancelEvent = useCallback(function(event, parent) {
      if ("touches" in event && event.touches.length === 2 || event.type === "wheel" && event.ctrlKey) {
        return !lastProps.current.allowPinchZoom;
      }
      var touch = getTouchXY(event);
      var touchStart = touchStartRef.current;
      var deltaX = "deltaX" in event ? event.deltaX : touchStart[0] - touch[0];
      var deltaY = "deltaY" in event ? event.deltaY : touchStart[1] - touch[1];
      var currentAxis;
      var target = event.target;
      var moveDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if ("touches" in event && moveDirection === "h" && target.type === "range") {
        return false;
      }
      var selection = window.getSelection();
      var anchorNode = selection && selection.anchorNode;
      var isTouchingSelection = anchorNode ? anchorNode === target || anchorNode.contains(target) : false;
      if (isTouchingSelection) {
        return false;
      }
      var canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      if (!canBeScrolledInMainDirection) {
        return true;
      }
      if (canBeScrolledInMainDirection) {
        currentAxis = moveDirection;
      } else {
        currentAxis = moveDirection === "v" ? "h" : "v";
        canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      }
      if (!canBeScrolledInMainDirection) {
        return false;
      }
      if (!activeAxis.current && "changedTouches" in event && (deltaX || deltaY)) {
        activeAxis.current = currentAxis;
      }
      if (!currentAxis) {
        return true;
      }
      var cancelingAxis = activeAxis.current || currentAxis;
      return handleScroll(cancelingAxis, parent, event, cancelingAxis === "h" ? deltaX : deltaY, true);
    }, []);
    var shouldPrevent = useCallback(function(_event) {
      var event = _event;
      if (!lockStack.length || lockStack[lockStack.length - 1] !== Style2) {
        return;
      }
      var delta = "deltaY" in event ? getDeltaXY(event) : getTouchXY(event);
      var sourceEvent = shouldPreventQueue.current.filter(function(e) {
        return e.name === event.type && (e.target === event.target || event.target === e.shadowParent) && deltaCompare(e.delta, delta);
      })[0];
      if (sourceEvent && sourceEvent.should) {
        if (event.cancelable) {
          event.preventDefault();
        }
        return;
      }
      if (!sourceEvent) {
        var shardNodes = (lastProps.current.shards || []).map(extractRef).filter(Boolean).filter(function(node) {
          return node.contains(event.target);
        });
        var shouldStop = shardNodes.length > 0 ? shouldCancelEvent(event, shardNodes[0]) : !lastProps.current.noIsolation;
        if (shouldStop) {
          if (event.cancelable) {
            event.preventDefault();
          }
        }
      }
    }, []);
    var shouldCancel = useCallback(function(name, delta, target, should) {
      var event = { name, delta, target, should, shadowParent: getOutermostShadowParent(target) };
      shouldPreventQueue.current.push(event);
      setTimeout(function() {
        shouldPreventQueue.current = shouldPreventQueue.current.filter(function(e) {
          return e !== event;
        });
      }, 1);
    }, []);
    var scrollTouchStart = useCallback(function(event) {
      touchStartRef.current = getTouchXY(event);
      activeAxis.current = void 0;
    }, []);
    var scrollWheel = useCallback(function(event) {
      shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    var scrollTouchMove = useCallback(function(event) {
      shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    useEffect(function() {
      lockStack.push(Style2);
      props.setCallbacks({
        onScrollCapture: scrollWheel,
        onWheelCapture: scrollWheel,
        onTouchMoveCapture: scrollTouchMove
      });
      document.addEventListener("wheel", shouldPrevent, nonPassive);
      document.addEventListener("touchmove", shouldPrevent, nonPassive);
      document.addEventListener("touchstart", scrollTouchStart, nonPassive);
      return function() {
        lockStack = lockStack.filter(function(inst) {
          return inst !== Style2;
        });
        document.removeEventListener("wheel", shouldPrevent, nonPassive);
        document.removeEventListener("touchmove", shouldPrevent, nonPassive);
        document.removeEventListener("touchstart", scrollTouchStart, nonPassive);
      };
    }, []);
    var removeScrollBar = props.removeScrollBar, inert = props.inert;
    return createElement(
      Fragment,
      null,
      inert ? createElement(Style2, { styles: generateStyle(id) }) : null,
      removeScrollBar ? createElement(RemoveScrollBar, { noRelative: props.noRelative, gapMode: props.gapMode }) : null
    );
  }
  function getOutermostShadowParent(node) {
    var shadowParent = null;
    while (node !== null) {
      if (node instanceof ShadowRoot) {
        shadowParent = node.host;
        node = node.host;
      }
      node = node.parentNode;
    }
    return shadowParent;
  }

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = forwardRef(function(props, ref) {
    return createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // ../../node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
  var getDefaultParent = function(originalTarget) {
    if (typeof document === "undefined") {
      return null;
    }
    var sampleTarget = Array.isArray(originalTarget) ? originalTarget[0] : originalTarget;
    return sampleTarget.ownerDocument.body;
  };
  var counterMap = /* @__PURE__ */ new WeakMap();
  var uncontrolledNodes = /* @__PURE__ */ new WeakMap();
  var markerMap = {};
  var lockCount = 0;
  var unwrapHost = function(node) {
    return node && (node.host || unwrapHost(node.parentNode));
  };
  var correctTargets = function(parent, targets) {
    return targets.map(function(target) {
      if (parent.contains(target)) {
        return target;
      }
      var correctedTarget = unwrapHost(target);
      if (correctedTarget && parent.contains(correctedTarget)) {
        return correctedTarget;
      }
      console.error("aria-hidden", target, "in not contained inside", parent, ". Doing nothing");
      return null;
    }).filter(function(x) {
      return Boolean(x);
    });
  };
  var applyAttributeToOthers = function(originalTarget, parentNode, markerName, controlAttribute) {
    var targets = correctTargets(parentNode, Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    if (!markerMap[markerName]) {
      markerMap[markerName] = /* @__PURE__ */ new WeakMap();
    }
    var markerCounter = markerMap[markerName];
    var hiddenNodes = [];
    var elementsToKeep = /* @__PURE__ */ new Set();
    var elementsToStop = new Set(targets);
    var keep = function(el) {
      if (!el || elementsToKeep.has(el)) {
        return;
      }
      elementsToKeep.add(el);
      keep(el.parentNode);
    };
    targets.forEach(keep);
    var deep = function(parent) {
      if (!parent || elementsToStop.has(parent)) {
        return;
      }
      Array.prototype.forEach.call(parent.children, function(node) {
        if (elementsToKeep.has(node)) {
          deep(node);
        } else {
          try {
            var attr = node.getAttribute(controlAttribute);
            var alreadyHidden = attr !== null && attr !== "false";
            var counterValue = (counterMap.get(node) || 0) + 1;
            var markerValue = (markerCounter.get(node) || 0) + 1;
            counterMap.set(node, counterValue);
            markerCounter.set(node, markerValue);
            hiddenNodes.push(node);
            if (counterValue === 1 && alreadyHidden) {
              uncontrolledNodes.set(node, true);
            }
            if (markerValue === 1) {
              node.setAttribute(markerName, "true");
            }
            if (!alreadyHidden) {
              node.setAttribute(controlAttribute, "true");
            }
          } catch (e) {
            console.error("aria-hidden: cannot operate on ", node, e);
          }
        }
      });
    };
    deep(parentNode);
    elementsToKeep.clear();
    lockCount++;
    return function() {
      hiddenNodes.forEach(function(node) {
        var counterValue = counterMap.get(node) - 1;
        var markerValue = markerCounter.get(node) - 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        if (!counterValue) {
          if (!uncontrolledNodes.has(node)) {
            node.removeAttribute(controlAttribute);
          }
          uncontrolledNodes.delete(node);
        }
        if (!markerValue) {
          node.removeAttribute(markerName);
        }
      });
      lockCount--;
      if (!lockCount) {
        counterMap = /* @__PURE__ */ new WeakMap();
        counterMap = /* @__PURE__ */ new WeakMap();
        uncontrolledNodes = /* @__PURE__ */ new WeakMap();
        markerMap = {};
      }
    };
  };
  var hideOthers = function(originalTarget, parentNode, markerName) {
    if (markerName === void 0) {
      markerName = "data-aria-hidden";
    }
    var targets = Array.from(Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    var activeParentNode = parentNode || getDefaultParent(originalTarget);
    if (!activeParentNode) {
      return function() {
        return null;
      };
    }
    targets.push.apply(targets, Array.from(activeParentNode.querySelectorAll("[aria-live], script")));
    return applyAttributeToOthers(targets, activeParentNode, markerName, "aria-hidden");
  };

  // ../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var DIALOG_NAME = "Dialog";
  var [createDialogContext, createDialogScope] = createContextScope(DIALOG_NAME);
  var [DialogProvider, useDialogContext] = createDialogContext(DIALOG_NAME);
  var Dialog = (props) => {
    const {
      __scopeDialog,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const triggerRef = useRef(null);
    const contentRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DIALOG_NAME
    });
    return /* @__PURE__ */ jsx(
      DialogProvider,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId2(),
        titleId: useId2(),
        descriptionId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  };
  Dialog.displayName = DIALOG_NAME;
  var TRIGGER_NAME = "DialogTrigger";
  var DialogTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...triggerProps } = props;
      const context = useDialogContext(TRIGGER_NAME, __scopeDialog);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
    }
  );
  DialogTrigger.displayName = TRIGGER_NAME;
  var PORTAL_NAME2 = "DialogPortal";
  var [PortalProvider, usePortalContext] = createDialogContext(PORTAL_NAME2, {
    forceMount: void 0
  });
  var DialogPortal = (props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext(PORTAL_NAME2, __scopeDialog);
    return /* @__PURE__ */ jsx(PortalProvider, { scope: __scopeDialog, forceMount, children: Children.map(children, (child) => /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children: child }) })) });
  };
  DialogPortal.displayName = PORTAL_NAME2;
  var OVERLAY_NAME = "DialogOverlay";
  var DialogOverlay = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(OVERLAY_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(DialogOverlayImpl, { ...overlayProps, ref: forwardedRef }) }) : null;
    }
  );
  DialogOverlay.displayName = OVERLAY_NAME;
  var Slot2 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, __scopeDialog);
      const registerDismissableSurface = useDismissableLayerSurface();
      const composedRefs = useComposedRefs(forwardedRef, registerDismissableSurface);
      return (
        // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
        // ie. when `Overlay` and `Content` are siblings
        /* @__PURE__ */ jsx(Combination_default, { as: Slot2, allowPinchZoom: true, shards: [context.contentRef], children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-state": getState(context.open),
            ...overlayProps,
            ref: composedRefs,
            style: { pointerEvents: "auto", ...overlayProps.style }
          }
        ) })
      );
    }
  );
  var CONTENT_NAME = "DialogContent";
  var DialogContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(CONTENT_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(DialogContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(DialogContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }
  );
  DialogContent.displayName = CONTENT_NAME;
  var DialogContentModal = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, context.contentRef, contentRef);
      useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (isRightClick) event.preventDefault();
          }),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault()
          )
        }
      );
    }
  );
  var DialogContentNonModal = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const hasInteractedOutsideRef = useRef(false);
      const hasPointerDownOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }
  );
  var DialogContentImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, __scopeDialog);
      useFocusGuards();
      return /* @__PURE__ */ jsx(Fragment2, { children: /* @__PURE__ */ jsx(
        FocusScope,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ jsx(
            DismissableLayer,
            {
              role: "dialog",
              id: context.contentId,
              "aria-describedby": context.descriptionId,
              "aria-labelledby": context.titleId,
              "data-state": getState(context.open),
              ...contentProps,
              ref: forwardedRef,
              deferPointerDownOutside: true,
              onDismiss: () => context.onOpenChange(false)
            }
          )
        }
      ) });
    }
  );
  var TITLE_NAME = "DialogTitle";
  var DialogTitle = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext(TITLE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }
  );
  DialogTitle.displayName = TITLE_NAME;
  var DESCRIPTION_NAME = "DialogDescription";
  var DialogDescription = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext(DESCRIPTION_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }
  );
  DialogDescription.displayName = DESCRIPTION_NAME;
  var CLOSE_NAME = "DialogClose";
  var DialogClose = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...closeProps } = props;
      const context = useDialogContext(CLOSE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }
  );
  DialogClose.displayName = CLOSE_NAME;
  var WarningProvider = (props) => {
    return props.children;
  };
  function getState(open) {
    return open ? "open" : "closed";
  }

  // ../../node_modules/.pnpm/@radix-ui+react-checkbox@1.3.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-checkbox/dist/index.mjs
  var dist_exports3 = {};
  __export(dist_exports3, {
    Checkbox: () => Checkbox,
    CheckboxIndicator: () => CheckboxIndicator,
    Indicator: () => CheckboxIndicator,
    Root: () => Checkbox,
    createCheckboxScope: () => createCheckboxScope,
    unstable_BubbleInput: () => CheckboxBubbleInput,
    unstable_CheckboxBubbleInput: () => CheckboxBubbleInput,
    unstable_CheckboxProvider: () => CheckboxProvider,
    unstable_CheckboxTrigger: () => CheckboxTrigger,
    unstable_Provider: () => CheckboxProvider,
    unstable_Trigger: () => CheckboxTrigger
  });

  // ../../node_modules/.pnpm/@radix-ui+react-use-previous@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-previous/dist/index.mjs
  function usePrevious(value) {
    const ref = useRef({ value, previous: value });
    return useMemo(() => {
      if (ref.current.value !== value) {
        ref.current.previous = ref.current.value;
        ref.current.value = value;
      }
      return ref.current.previous;
    }, [value]);
  }

  // ../../node_modules/.pnpm/@radix-ui+react-use-size@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-size/dist/index.mjs
  function useSize(element) {
    const [size4, setSize] = useState(void 0);
    useLayoutEffect2(() => {
      if (element) {
        setSize({ width: element.offsetWidth, height: element.offsetHeight });
        const resizeObserver = new ResizeObserver((entries) => {
          if (!Array.isArray(entries)) {
            return;
          }
          if (!entries.length) {
            return;
          }
          const entry = entries[0];
          let width;
          let height;
          if ("borderBoxSize" in entry) {
            const borderSizeEntry = entry["borderBoxSize"];
            const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
            width = borderSize["inlineSize"];
            height = borderSize["blockSize"];
          } else {
            width = element.offsetWidth;
            height = element.offsetHeight;
          }
          setSize({ width, height });
        });
        resizeObserver.observe(element, { box: "border-box" });
        return () => resizeObserver.unobserve(element);
      } else {
        setSize(void 0);
      }
    }, [element]);
    return size4;
  }

  // ../../node_modules/.pnpm/@radix-ui+react-checkbox@1.3.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-checkbox/dist/index.mjs
  var CHECKBOX_NAME = "Checkbox";
  var [createCheckboxContext, createCheckboxScope] = createContextScope(CHECKBOX_NAME);
  var [CheckboxProviderImpl, useCheckboxContext] = createCheckboxContext(CHECKBOX_NAME);
  function CheckboxProvider(props) {
    const {
      __scopeCheckbox,
      checked: checkedProp,
      children,
      defaultChecked,
      disabled,
      form,
      name,
      onCheckedChange,
      required,
      value = "on",
      // @ts-expect-error
      internal_do_not_use_render
    } = props;
    const [checked, setChecked] = useControllableState({
      prop: checkedProp,
      defaultProp: defaultChecked ?? false,
      onChange: onCheckedChange,
      caller: CHECKBOX_NAME
    });
    const [control, setControl] = useState(null);
    const [bubbleInput, setBubbleInput] = useState(null);
    const hasConsumerStoppedPropagationRef = useRef(false);
    const isFormControl = control ? !!form || !!control.closest("form") : (
      // We set this to true by default so that events bubble to forms without JS (SSR)
      true
    );
    const context = {
      checked,
      disabled,
      setChecked,
      control,
      setControl,
      name,
      form,
      value,
      hasConsumerStoppedPropagationRef,
      required,
      defaultChecked: isIndeterminate(defaultChecked) ? false : defaultChecked,
      isFormControl,
      bubbleInput,
      setBubbleInput
    };
    return /* @__PURE__ */ jsx(
      CheckboxProviderImpl,
      {
        scope: __scopeCheckbox,
        ...context,
        children: isFunction2(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    );
  }
  var TRIGGER_NAME2 = "CheckboxTrigger";
  var CheckboxTrigger = forwardRef(
    ({ __scopeCheckbox, onKeyDown, onClick, ...checkboxProps }, forwardedRef) => {
      const {
        control,
        value,
        disabled,
        checked,
        required,
        setControl,
        setChecked,
        hasConsumerStoppedPropagationRef,
        isFormControl,
        bubbleInput
      } = useCheckboxContext(TRIGGER_NAME2, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setControl);
      const initialCheckedStateRef = useRef(checked);
      useEffect(() => {
        const form = control?.form;
        if (form) {
          const reset = () => setChecked(initialCheckedStateRef.current);
          form.addEventListener("reset", reset);
          return () => form.removeEventListener("reset", reset);
        }
      }, [control, setChecked]);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "checkbox",
          "aria-checked": isIndeterminate(checked) ? "mixed" : checked,
          "aria-required": required,
          "data-state": getState2(checked),
          "data-disabled": disabled ? "" : void 0,
          disabled,
          value,
          ...checkboxProps,
          ref: composedRefs,
          onKeyDown: composeEventHandlers(onKeyDown, (event) => {
            if (event.key === "Enter") event.preventDefault();
          }),
          onClick: composeEventHandlers(onClick, (event) => {
            setChecked((prevChecked) => isIndeterminate(prevChecked) ? true : !prevChecked);
            if (bubbleInput && isFormControl) {
              hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
              if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
          })
        }
      );
    }
  );
  CheckboxTrigger.displayName = TRIGGER_NAME2;
  var Checkbox = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeCheckbox,
        name,
        checked,
        defaultChecked,
        required,
        disabled,
        value,
        onCheckedChange,
        form,
        ...checkboxProps
      } = props;
      return /* @__PURE__ */ jsx(
        CheckboxProvider,
        {
          __scopeCheckbox,
          checked,
          defaultChecked,
          disabled,
          required,
          onCheckedChange,
          name,
          form,
          value,
          internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
            /* @__PURE__ */ jsx(
              CheckboxTrigger,
              {
                ...checkboxProps,
                ref: forwardedRef,
                __scopeCheckbox
              }
            ),
            isFormControl && /* @__PURE__ */ jsx(
              CheckboxBubbleInput,
              {
                __scopeCheckbox
              }
            )
          ] })
        }
      );
    }
  );
  Checkbox.displayName = CHECKBOX_NAME;
  var INDICATOR_NAME = "CheckboxIndicator";
  var CheckboxIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeCheckbox, forceMount, ...indicatorProps } = props;
      const context = useCheckboxContext(INDICATOR_NAME, __scopeCheckbox);
      return /* @__PURE__ */ jsx(
        Presence,
        {
          present: forceMount || isIndeterminate(context.checked) || context.checked === true,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              "data-state": getState2(context.checked),
              "data-disabled": context.disabled ? "" : void 0,
              ...indicatorProps,
              ref: forwardedRef,
              style: { pointerEvents: "none", ...props.style }
            }
          )
        }
      );
    }
  );
  CheckboxIndicator.displayName = INDICATOR_NAME;
  var BUBBLE_INPUT_NAME = "CheckboxBubbleInput";
  var CheckboxBubbleInput = forwardRef(
    ({ __scopeCheckbox, ...props }, forwardedRef) => {
      const {
        control,
        hasConsumerStoppedPropagationRef,
        checked,
        defaultChecked,
        required,
        disabled,
        name,
        value,
        form,
        bubbleInput,
        setBubbleInput
      } = useCheckboxContext(BUBBLE_INPUT_NAME, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setBubbleInput);
      const prevChecked = usePrevious(checked);
      const controlSize = useSize(control);
      useEffect(() => {
        const input = bubbleInput;
        if (!input) return;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          inputProto,
          "checked"
        );
        const setChecked = descriptor.set;
        const bubbles = !hasConsumerStoppedPropagationRef.current;
        if (prevChecked !== checked && setChecked) {
          const event = new Event("click", { bubbles });
          input.indeterminate = isIndeterminate(checked);
          setChecked.call(input, isIndeterminate(checked) ? false : checked);
          input.dispatchEvent(event);
        }
      }, [bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef]);
      const defaultCheckedRef = useRef(isIndeterminate(checked) ? false : checked);
      return /* @__PURE__ */ jsx(
        Primitive.input,
        {
          type: "checkbox",
          "aria-hidden": true,
          defaultChecked: defaultChecked ?? defaultCheckedRef.current,
          required,
          disabled,
          name,
          value,
          form,
          ...props,
          tabIndex: -1,
          ref: composedRefs,
          style: {
            ...props.style,
            ...controlSize,
            position: "absolute",
            pointerEvents: "none",
            opacity: 0,
            margin: 0,
            // We transform because the input is absolutely positioned but we have
            // rendered it **after** the button. This pulls it back to sit on top
            // of the button.
            transform: "translateX(-100%)"
          }
        }
      );
    }
  );
  CheckboxBubbleInput.displayName = BUBBLE_INPUT_NAME;
  function isFunction2(value) {
    return typeof value === "function";
  }
  function isIndeterminate(checked) {
    return checked === "indeterminate";
  }
  function getState2(checked) {
    return isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }

  // ../../node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var sides = ["top", "right", "bottom", "left"];
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v) => ({
    x: v,
    y: v
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...padding
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x,
      y,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      x,
      y
    };
  }

  // ../../node_modules/.pnpm/@floating-ui+core@1.7.5/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    switch (getAlignment(placement)) {
      case "start":
        coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
        break;
      case "end":
        coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
        break;
    }
    return coords;
  }
  async function detectOverflow(state, options2) {
    var _await$platform$isEle;
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      x,
      y,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options2, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x,
      y,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    } : {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x,
      y
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i = 0; i < middleware.length; i++) {
      const currentMiddleware = middleware[i];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x,
        y,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x = nextX != null ? nextX : x;
      y = nextY != null ? nextY : y;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x,
            y
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i = -1;
      }
    }
    return {
      x,
      y,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options2) => ({
    name: "arrow",
    options: options2,
    async fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options2, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x,
        y
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const min$1 = minPadding;
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset4 = clamp(min$1, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < min$1 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < min$1 ? center - min$1 : center - max2 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset4,
          centerOffset: center - offset4 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "flip",
      options: options2,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options2, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  function getSideOffsets(overflow, rect) {
    return {
      top: overflow.top - rect.height,
      right: overflow.right - rect.width,
      bottom: overflow.bottom - rect.height,
      left: overflow.left - rect.width
    };
  }
  function isAnySideFullyClipped(overflow) {
    return sides.some((side) => overflow[side] >= 0);
  }
  var hide = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "hide",
      options: options2,
      async fn(state) {
        const {
          rects,
          platform: platform2
        } = state;
        const {
          strategy = "referenceHidden",
          ...detectOverflowOptions
        } = evaluate(options2, state);
        switch (strategy) {
          case "referenceHidden": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              elementContext: "reference"
            });
            const offsets = getSideOffsets(overflow, rects.reference);
            return {
              data: {
                referenceHiddenOffsets: offsets,
                referenceHidden: isAnySideFullyClipped(offsets)
              }
            };
          }
          case "escaped": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              altBoundary: true
            });
            const offsets = getSideOffsets(overflow, rects.floating);
            return {
              data: {
                escapedOffsets: offsets,
                escaped: isAnySideFullyClipped(offsets)
              }
            };
          }
          default: {
            return {};
          }
        }
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options2) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options2, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options2) {
    if (options2 === void 0) {
      options2 = 0;
    }
    return {
      name: "offset",
      options: options2,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x,
          y,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options2);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x + diffCoords.x,
          y: y + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "shift",
      options: options2,
      async fn(state) {
        const {
          x,
          y,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x2,
                y: y2
              } = _ref;
              return {
                x: x2,
                y: y2
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(getSide(placement));
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        if (checkMainAxis) {
          const minSide = mainAxis === "y" ? "top" : "left";
          const maxSide = mainAxis === "y" ? "bottom" : "right";
          const min2 = mainAxisCoord + overflow[minSide];
          const max2 = mainAxisCoord - overflow[maxSide];
          mainAxisCoord = clamp(min2, mainAxisCoord, max2);
        }
        if (checkCrossAxis) {
          const minSide = crossAxis === "y" ? "top" : "left";
          const maxSide = crossAxis === "y" ? "bottom" : "right";
          const min2 = crossAxisCoord + overflow[minSide];
          const max2 = crossAxisCoord - overflow[maxSide];
          crossAxisCoord = clamp(min2, crossAxisCoord, max2);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x,
            y: limitedCoords.y - y,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var limitShift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      options: options2,
      fn(state) {
        const {
          x,
          y,
          placement,
          rects,
          middlewareData
        } = state;
        const {
          offset: offset4 = 0,
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const rawOffset = evaluate(offset4, state);
        const computedOffset = typeof rawOffset === "number" ? {
          mainAxis: rawOffset,
          crossAxis: 0
        } : {
          mainAxis: 0,
          crossAxis: 0,
          ...rawOffset
        };
        if (checkMainAxis) {
          const len = mainAxis === "y" ? "height" : "width";
          const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
          const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
          if (mainAxisCoord < limitMin) {
            mainAxisCoord = limitMin;
          } else if (mainAxisCoord > limitMax) {
            mainAxisCoord = limitMax;
          }
        }
        if (checkCrossAxis) {
          var _middlewareData$offse, _middlewareData$offse2;
          const len = mainAxis === "y" ? "width" : "height";
          const isOriginSide = originSides.has(getSide(placement));
          const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
          const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
          if (crossAxisCoord < limitMin) {
            crossAxisCoord = limitMin;
          } else if (crossAxisCoord > limitMax) {
            crossAxisCoord = limitMax;
          }
        }
        return {
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        };
      }
    };
  };
  var size = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "size",
      options: options2,
      async fn(state) {
        var _state$middlewareData, _state$middlewareData2;
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const noShift = !state.middlewareData.shift;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if ((_state$middlewareData = state.middlewareData.shift) != null && _state$middlewareData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if ((_state$middlewareData2 = state.middlewareData.shift) != null && _state$middlewareData2.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          const xMin = max(overflow.left, 0);
          const xMax = max(overflow.right, 0);
          const yMin = max(overflow.top, 0);
          const yMax = max(overflow.bottom, 0);
          if (isYAxis) {
            availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : max(overflow.left, overflow.right));
          } else {
            availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : max(overflow.top, overflow.bottom));
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // ../../node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName(node) {
    if (isNode(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow(value).Node;
  }
  function isElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow(value).Element;
  }
  function isHTMLElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
  }
  function isShadowRoot(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e5) {
    }
    try {
      return element.matches(":modal");
    } catch (_e5) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    const parentNode = getParentNode(node);
    if (isLastTraversableNode(parentNode)) {
      return node.ownerDocument ? node.ownerDocument.body : node.body;
    }
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // ../../node_modules/.pnpm/@floating-ui+dom@1.7.6/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle2(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $: $2
    } = getCssDimensions(domElement);
    let x = ($2 ? round(rect.width) : rect.width) / width;
    let y = ($2 ? round(rect.height) : rect.height) / height;
    if (!x || !Number.isFinite(x)) {
      x = 1;
    }
    if (!y || !Number.isFinite(y)) {
      y = 1;
    }
    return {
      x,
      y
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element)) {
      return false;
    }
    return isFixed;
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x = (clientRect.left + visualOffsets.x) / scale.x;
    let y = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement) {
      const win = getWindow(domElement);
      const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetParent && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle2(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x *= iframeScale.x;
        y *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x += left;
        y += top;
        currentWin = getWindow(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x,
      y
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y = htmlRect.top + scroll.scrollTop;
    return {
      x,
      y
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return Array.from(element.getClientRects());
  }
  function getDocumentRect(element) {
    const html = getDocumentElement(element);
    const scroll = getNodeScroll(element);
    const body = element.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(element);
    const y = -scroll.scrollTop;
    if (getComputedStyle2(body).direction === "rtl") {
      x += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy) {
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      width = visualViewport.width;
      height = visualViewport.height;
      const visualViewportBased = isWebKit();
      if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
        x = visualViewport.offsetLeft;
        y = visualViewport.offsetTop;
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
        width -= clippingStableScrollbarWidth;
      }
    } else if (windowScrollbarX <= SCROLLBAR_MAX) {
      width += windowScrollbarX;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = isHTMLElement(element) ? getScale(element) : createCoords(1);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x = left * scale.x;
    const y = top * scale.y;
    return {
      width,
      height,
      x,
      y
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport") {
      rect = getViewportRect(element, strategy);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement(element));
    } else if (isElement(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function hasFixedPositionAncestor(element, stopNode) {
    const parentNode = getParentNode(element);
    if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
      return false;
    }
    return getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let currentContainingBlockComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      if (!currentNodeIsContaining && computedStyle.position === "fixed") {
        currentContainingBlockComputedStyle = null;
      }
      const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        currentContainingBlockComputedStyle = computedStyle;
      }
      currentNode = getParentNode(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i = 1; i < clippingAncestors.length; i++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    const documentElement = getDocumentElement(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    function setLeftRTLScrollbarOffset() {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      } else if (documentElement) {
        setLeftRTLScrollbarOffset();
      }
    }
    if (isFixed && !isOffsetParentAnElement && documentElement) {
      setLeftRTLScrollbarOffset();
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  function observeMove(element, onMove) {
    let io = null;
    let timeoutId;
    const root2 = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root2.clientWidth - (left + width));
      const insetBottom = floor(root2.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options2 = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          refresh();
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options2,
          // Handle <iframe>s
          root: root2.ownerDocument
        });
      } catch (_e5) {
        io = new IntersectionObserver(handleObserve, options2);
      }
      io.observe(element);
    }
    refresh(true);
    return cleanup;
  }
  function autoUpdate(reference, floating, update, options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options2;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update, {
        passive: true
      });
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update);
        ancestorResize && ancestor.removeEventListener("resize", update);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var hide2 = hide;
  var arrow2 = arrow;
  var limitShift2 = limitShift;
  var computePosition2 = (reference, floating, options2) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = {
      platform,
      ...options2
    };
    const platformWithCache = {
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // ../../node_modules/.pnpm/@floating-ui+react-dom@2.1.8_react-dom@18.3.1_react@18.3.1/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
  var isClient = typeof document !== "undefined";
  var noop = function noop2() {
  };
  var index = isClient ? useLayoutEffect : noop;
  function deepEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (typeof a === "function" && a.toString() === b.toString()) {
      return true;
    }
    let length;
    let i;
    let keys;
    if (a && b && typeof a === "object") {
      if (Array.isArray(a)) {
        length = a.length;
        if (length !== b.length) return false;
        for (i = length; i-- !== 0; ) {
          if (!deepEqual(a[i], b[i])) {
            return false;
          }
        }
        return true;
      }
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) {
        return false;
      }
      for (i = length; i-- !== 0; ) {
        if (!{}.hasOwnProperty.call(b, keys[i])) {
          return false;
        }
      }
      for (i = length; i-- !== 0; ) {
        const key = keys[i];
        if (key === "_owner" && a.$$typeof) {
          continue;
        }
        if (!deepEqual(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }
    return a !== a && b !== b;
  }
  function getDPR(element) {
    if (typeof window === "undefined") {
      return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
  }
  function roundByDPR(element, value) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
  }
  function useLatestRef(value) {
    const ref = useRef(value);
    index(() => {
      ref.current = value;
    });
    return ref;
  }
  function useFloating(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2,
      elements: {
        reference: externalReference,
        floating: externalFloating
      } = {},
      transform = true,
      whileElementsMounted,
      open
    } = options2;
    const [data, setData] = useState({
      x: 0,
      y: 0,
      strategy,
      placement,
      middlewareData: {},
      isPositioned: false
    });
    const [latestMiddleware, setLatestMiddleware] = useState(middleware);
    if (!deepEqual(latestMiddleware, middleware)) {
      setLatestMiddleware(middleware);
    }
    const [_reference, _setReference] = useState(null);
    const [_floating, _setFloating] = useState(null);
    const setReference = useCallback((node) => {
      if (node !== referenceRef.current) {
        referenceRef.current = node;
        _setReference(node);
      }
    }, []);
    const setFloating = useCallback((node) => {
      if (node !== floatingRef.current) {
        floatingRef.current = node;
        _setFloating(node);
      }
    }, []);
    const referenceEl = externalReference || _reference;
    const floatingEl = externalFloating || _floating;
    const referenceRef = useRef(null);
    const floatingRef = useRef(null);
    const dataRef = useRef(data);
    const hasWhileElementsMounted = whileElementsMounted != null;
    const whileElementsMountedRef = useLatestRef(whileElementsMounted);
    const platformRef = useLatestRef(platform2);
    const openRef = useLatestRef(open);
    const update = useCallback(() => {
      if (!referenceRef.current || !floatingRef.current) {
        return;
      }
      const config = {
        placement,
        strategy,
        middleware: latestMiddleware
      };
      if (platformRef.current) {
        config.platform = platformRef.current;
      }
      computePosition2(referenceRef.current, floatingRef.current, config).then((data2) => {
        const fullData = {
          ...data2,
          // The floating element's position may be recomputed while it's closed
          // but still mounted (such as when transitioning out). To ensure
          // `isPositioned` will be `false` initially on the next open, avoid
          // setting it to `true` when `open === false` (must be specified).
          isPositioned: openRef.current !== false
        };
        if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
          dataRef.current = fullData;
          flushSync(() => {
            setData(fullData);
          });
        }
      });
    }, [latestMiddleware, placement, strategy, platformRef, openRef]);
    index(() => {
      if (open === false && dataRef.current.isPositioned) {
        dataRef.current.isPositioned = false;
        setData((data2) => ({
          ...data2,
          isPositioned: false
        }));
      }
    }, [open]);
    const isMountedRef = useRef(false);
    index(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);
    index(() => {
      if (referenceEl) referenceRef.current = referenceEl;
      if (floatingEl) floatingRef.current = floatingEl;
      if (referenceEl && floatingEl) {
        if (whileElementsMountedRef.current) {
          return whileElementsMountedRef.current(referenceEl, floatingEl, update);
        }
        update();
      }
    }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
    const refs = useMemo(() => ({
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating
    }), [setReference, setFloating]);
    const elements = useMemo(() => ({
      reference: referenceEl,
      floating: floatingEl
    }), [referenceEl, floatingEl]);
    const floatingStyles = useMemo(() => {
      const initialStyles = {
        position: strategy,
        left: 0,
        top: 0
      };
      if (!elements.floating) {
        return initialStyles;
      }
      const x = roundByDPR(elements.floating, data.x);
      const y = roundByDPR(elements.floating, data.y);
      if (transform) {
        return {
          ...initialStyles,
          transform: "translate(" + x + "px, " + y + "px)",
          ...getDPR(elements.floating) >= 1.5 && {
            willChange: "transform"
          }
        };
      }
      return {
        position: strategy,
        left: x,
        top: y
      };
    }, [strategy, transform, elements.floating, data.x, data.y]);
    return useMemo(() => ({
      ...data,
      update,
      refs,
      elements,
      floatingStyles
    }), [data, update, refs, elements, floatingStyles]);
  }
  var arrow$1 = (options2) => {
    function isRef(value) {
      return {}.hasOwnProperty.call(value, "current");
    }
    return {
      name: "arrow",
      options: options2,
      fn(state) {
        const {
          element,
          padding
        } = typeof options2 === "function" ? options2(state) : options2;
        if (element && isRef(element)) {
          if (element.current != null) {
            return arrow2({
              element: element.current,
              padding
            }).fn(state);
          }
          return {};
        }
        if (element) {
          return arrow2({
            element,
            padding
          }).fn(state);
        }
        return {};
      }
    };
  };
  var offset3 = (options2, deps) => {
    const result = offset2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var shift3 = (options2, deps) => {
    const result = shift2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var limitShift3 = (options2, deps) => {
    const result = limitShift2(options2);
    return {
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var flip3 = (options2, deps) => {
    const result = flip2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var size3 = (options2, deps) => {
    const result = size2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var hide3 = (options2, deps) => {
    const result = hide2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var arrow3 = (options2, deps) => {
    const result = arrow$1(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };

  // ../../node_modules/.pnpm/@radix-ui+react-arrow@1.1.11_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-arrow/dist/index.mjs
  var NAME2 = "Arrow";
  var Arrow = forwardRef((props, forwardedRef) => {
    const { children, width = 10, height = 5, ...arrowProps } = props;
    return /* @__PURE__ */ jsx(
      Primitive.svg,
      {
        ...arrowProps,
        ref: forwardedRef,
        width,
        height,
        viewBox: "0 0 30 10",
        preserveAspectRatio: "none",
        children: props.asChild ? children : /* @__PURE__ */ jsx("polygon", { points: "0,0 30,0 15,10" })
      }
    );
  });
  Arrow.displayName = NAME2;
  var Root = Arrow;

  // ../../node_modules/.pnpm/@radix-ui+react-popper@1.3.3_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-popper/dist/index.mjs
  var POPPER_NAME = "Popper";
  var [createPopperContext, createPopperScope] = createContextScope(POPPER_NAME);
  var [PopperProvider, usePopperContext] = createPopperContext(POPPER_NAME);
  var Popper = (props) => {
    const { __scopePopper, children } = props;
    const [anchor, setAnchor] = useState(null);
    const [placementState, setPlacementState] = useState(void 0);
    return /* @__PURE__ */ jsx(
      PopperProvider,
      {
        scope: __scopePopper,
        anchor,
        onAnchorChange: setAnchor,
        placementState,
        setPlacementState,
        children
      }
    );
  };
  Popper.displayName = POPPER_NAME;
  var ANCHOR_NAME = "PopperAnchor";
  var PopperAnchor = forwardRef(
    (props, forwardedRef) => {
      const { __scopePopper, virtualRef, ...anchorProps } = props;
      const context = usePopperContext(ANCHOR_NAME, __scopePopper);
      const ref = useRef(null);
      const onAnchorChange = context.onAnchorChange;
      const callbackRef = useCallback(
        (node) => {
          ref.current = node;
          if (node) {
            onAnchorChange(node);
          }
        },
        [onAnchorChange]
      );
      const composedRefs = useComposedRefs(forwardedRef, callbackRef);
      const anchorRef = useRef(null);
      useEffect(() => {
        if (!virtualRef) {
          return;
        }
        const previousAnchor = anchorRef.current;
        anchorRef.current = virtualRef.current;
        if (previousAnchor !== anchorRef.current) {
          onAnchorChange(anchorRef.current);
        }
      });
      const sideAndAlign = context.placementState && getSideAndAlignFromPlacement(context.placementState);
      const placedSide = sideAndAlign?.[0];
      const placedAlign = sideAndAlign?.[1];
      return virtualRef ? null : /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-radix-popper-side": placedSide,
          "data-radix-popper-align": placedAlign,
          ...anchorProps,
          ref: composedRefs
        }
      );
    }
  );
  PopperAnchor.displayName = ANCHOR_NAME;
  var CONTENT_NAME2 = "PopperContent";
  var [PopperContentProvider, useContentContext] = createPopperContext(CONTENT_NAME2);
  var PopperContent = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopePopper,
        side = "bottom",
        sideOffset = 0,
        align = "center",
        alignOffset = 0,
        arrowPadding = 0,
        avoidCollisions = true,
        collisionBoundary = [],
        collisionPadding: collisionPaddingProp = 0,
        sticky = "partial",
        hideWhenDetached = false,
        updatePositionStrategy = "optimized",
        onPlaced,
        ...contentProps
      } = props;
      const context = usePopperContext(CONTENT_NAME2, __scopePopper);
      const [content, setContent] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [arrow4, setArrow] = useState(null);
      const arrowSize = useSize(arrow4);
      const arrowWidth = arrowSize?.width ?? 0;
      const arrowHeight = arrowSize?.height ?? 0;
      const desiredPlacement = side + (align !== "center" ? "-" + align : "");
      const collisionPadding = typeof collisionPaddingProp === "number" ? collisionPaddingProp : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp };
      const boundary = Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary];
      const hasExplicitBoundaries = boundary.length > 0;
      const detectOverflowOptions = {
        padding: collisionPadding,
        boundary: boundary.filter(isNotNull),
        // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
        altBoundary: hasExplicitBoundaries
      };
      const { refs, floatingStyles, placement, isPositioned, middlewareData } = useFloating({
        // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
        strategy: "fixed",
        placement: desiredPlacement,
        whileElementsMounted: (...args) => {
          const cleanup = autoUpdate(...args, {
            animationFrame: updatePositionStrategy === "always"
          });
          return cleanup;
        },
        elements: {
          reference: context.anchor
        },
        middleware: [
          offset3({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
          avoidCollisions && shift3({
            mainAxis: true,
            crossAxis: false,
            limiter: sticky === "partial" ? limitShift3() : void 0,
            ...detectOverflowOptions
          }),
          avoidCollisions && flip3({ ...detectOverflowOptions }),
          size3({
            ...detectOverflowOptions,
            apply: ({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } = rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty("--radix-popper-available-width", `${availableWidth}px`);
              contentStyle.setProperty("--radix-popper-available-height", `${availableHeight}px`);
              contentStyle.setProperty("--radix-popper-anchor-width", `${anchorWidth}px`);
              contentStyle.setProperty("--radix-popper-anchor-height", `${anchorHeight}px`);
            }
          }),
          arrow4 && arrow3({ element: arrow4, padding: arrowPadding }),
          transformOrigin({ arrowWidth, arrowHeight }),
          hideWhenDetached && hide3({
            strategy: "referenceHidden",
            ...detectOverflowOptions,
            // `hide` detects whether the anchor (reference) is clipped, so when
            // no explicit `collisionBoundary` is set we fall back to Floating
            // UI's default clipping ancestors (e.g. a scrollable menu). This
            // lets an occluded submenu hide once its anchor scrolls out of view
            // (#3237). The collision/size middlewares deliberately keep the
            // viewport-based default to avoid clamping content rendered inside
            // transformed or overflow-clipping portal containers.
            boundary: hasExplicitBoundaries ? detectOverflowOptions.boundary : void 0
          })
        ]
      });
      const setPlacementState = context.setPlacementState;
      useLayoutEffect2(() => {
        setPlacementState(placement);
        return () => {
          setPlacementState(void 0);
        };
      }, [placement, setPlacementState]);
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const handlePlaced = useCallbackRef(onPlaced);
      useLayoutEffect2(() => {
        if (isPositioned) {
          handlePlaced?.();
        }
      }, [isPositioned, handlePlaced]);
      const arrowX = middlewareData.arrow?.x;
      const arrowY = middlewareData.arrow?.y;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const [contentZIndex, setContentZIndex] = useState();
      useLayoutEffect2(() => {
        if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
      }, [content]);
      return /* @__PURE__ */ jsx(
        "div",
        {
          ref: refs.setFloating,
          "data-radix-popper-content-wrapper": "",
          style: {
            ...floatingStyles,
            transform: isPositioned ? floatingStyles.transform : "translate(0, -200%)",
            // keep off the page when measuring
            minWidth: "max-content",
            zIndex: contentZIndex,
            "--radix-popper-transform-origin": [
              middlewareData.transformOrigin?.x,
              middlewareData.transformOrigin?.y
            ].join(" "),
            // hide the content if using the hide middleware and should be hidden
            // set visibility to hidden and disable pointer events so the UI behaves
            // as if the PopperContent isn't there at all
            ...middlewareData.hide?.referenceHidden && {
              visibility: "hidden",
              pointerEvents: "none"
            }
          },
          dir: props.dir,
          children: /* @__PURE__ */ jsx(
            PopperContentProvider,
            {
              scope: __scopePopper,
              placedSide,
              placedAlign,
              onArrowChange: setArrow,
              arrowX,
              arrowY,
              shouldHideArrow: cannotCenterArrow,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  "data-side": placedSide,
                  "data-align": placedAlign,
                  ...contentProps,
                  ref: composedRefs,
                  style: {
                    ...contentProps.style,
                    // if the PopperContent hasn't been placed yet (not all measurements done)
                    // we prevent animations so that users's animation don't kick in too early referring wrong sides
                    animation: !isPositioned ? "none" : void 0
                  }
                }
              )
            }
          )
        }
      );
    }
  );
  PopperContent.displayName = CONTENT_NAME2;
  var ARROW_NAME = "PopperArrow";
  var OPPOSITE_SIDE = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right"
  };
  var PopperArrow = forwardRef(function PopperArrow2(props, forwardedRef) {
    const { __scopePopper, ...arrowProps } = props;
    const contentContext = useContentContext(ARROW_NAME, __scopePopper);
    const baseSide = OPPOSITE_SIDE[contentContext.placedSide];
    return (
      // we have to use an extra wrapper because `ResizeObserver` (used by `useSize`)
      // doesn't report size as we'd expect on SVG elements.
      // it reports their bounding box which is effectively the largest path inside the SVG.
      /* @__PURE__ */ jsx(
        "span",
        {
          ref: contentContext.onArrowChange,
          style: {
            position: "absolute",
            left: contentContext.arrowX,
            top: contentContext.arrowY,
            [baseSide]: 0,
            transformOrigin: {
              top: "",
              right: "0 0",
              bottom: "center 0",
              left: "100% 0"
            }[contentContext.placedSide],
            transform: {
              top: "translateY(100%)",
              right: "translateY(50%) rotate(90deg) translateX(-50%)",
              bottom: `rotate(180deg)`,
              left: "translateY(50%) rotate(-90deg) translateX(50%)"
            }[contentContext.placedSide],
            visibility: contentContext.shouldHideArrow ? "hidden" : void 0
          },
          children: /* @__PURE__ */ jsx(
            Root,
            {
              ...arrowProps,
              ref: forwardedRef,
              style: {
                ...arrowProps.style,
                // ensures the element can be measured correctly (mostly for if SVG)
                display: "block"
              }
            }
          )
        }
      )
    );
  });
  PopperArrow.displayName = ARROW_NAME;
  function isNotNull(value) {
    return value !== null;
  }
  var transformOrigin = (options2) => ({
    name: "transformOrigin",
    options: options2,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options2.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options2.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  });
  function getSideAndAlignFromPlacement(placement) {
    const [side, align = "center"] = placement.split("-");
    return [side, align];
  }
  var Root2 = Popper;
  var Anchor = PopperAnchor;
  var Content = PopperContent;
  var Arrow2 = PopperArrow;

  // ../../node_modules/.pnpm/@radix-ui+react-use-is-hydrated@0.1.1_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-is-hydrated/dist/index.mjs
  var _isHydrated = false;
  function useIsHydrated() {
    const [isHydrated, setIsHydrated] = useState(_isHydrated);
    useEffect(() => {
      if (!_isHydrated) {
        _isHydrated = true;
        setIsHydrated(true);
      }
    }, []);
    return isHydrated;
  }
  var useReactSyncExternalStore = react_shim_exports[" useSyncExternalStore ".trim().toString()];
  function subscribe() {
    return () => {
    };
  }
  function useIsHydratedModern() {
    return useReactSyncExternalStore(
      subscribe,
      () => true,
      () => false
    );
  }
  var useIsHydrated2 = typeof useReactSyncExternalStore === "function" ? useIsHydratedModern : useIsHydrated;

  // ../../node_modules/.pnpm/@radix-ui+react-roving-focus@1.1.15_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
  var EVENT_OPTIONS2 = { bubbles: false, cancelable: true };
  var GROUP_NAME = "RovingFocusGroup";
  var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
  var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
    GROUP_NAME,
    [createCollectionScope]
  );
  var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
  var RovingFocusGroup = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(Collection.Provider, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(Collection.Slot, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(RovingFocusGroupImpl, { ...props, ref: forwardedRef }) }) });
    }
  );
  RovingFocusGroup.displayName = GROUP_NAME;
  var RovingFocusGroupImpl = forwardRef((props, forwardedRef) => {
    const {
      __scopeRovingFocusGroup,
      orientation,
      loop = false,
      dir,
      currentTabStopId: currentTabStopIdProp,
      defaultCurrentTabStopId,
      onCurrentTabStopIdChange,
      onEntryFocus,
      preventScrollOnEntryFocus = false,
      ...groupProps
    } = props;
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const direction = useDirection(dir);
    const [currentTabStopId, setCurrentTabStopId] = useControllableState({
      prop: currentTabStopIdProp,
      defaultProp: defaultCurrentTabStopId ?? null,
      onChange: onCurrentTabStopIdChange,
      caller: GROUP_NAME
    });
    const [isTabbingBackOut, setIsTabbingBackOut] = useState(false);
    const handleEntryFocus = useCallbackRef(onEntryFocus);
    const getItems = useCollection(__scopeRovingFocusGroup);
    const isClickFocusRef = useRef(false);
    const [focusableItemsCount, setFocusableItemsCount] = useState(0);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
        return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
      }
    }, [handleEntryFocus]);
    return /* @__PURE__ */ jsx(
      RovingFocusProvider,
      {
        scope: __scopeRovingFocusGroup,
        orientation,
        dir: direction,
        loop,
        currentTabStopId,
        onItemFocus: useCallback(
          (tabStopId) => setCurrentTabStopId(tabStopId),
          [setCurrentTabStopId]
        ),
        onItemShiftTab: useCallback(() => setIsTabbingBackOut(true), []),
        onFocusableItemAdd: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount + 1),
          []
        ),
        onFocusableItemRemove: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount - 1),
          []
        ),
        children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
            "data-orientation": orientation,
            ...groupProps,
            ref: composedRefs,
            style: { outline: "none", ...props.style },
            onMouseDown: composeEventHandlers(props.onMouseDown, () => {
              isClickFocusRef.current = true;
            }),
            onFocus: composeEventHandlers(props.onFocus, (event) => {
              const isKeyboardFocus = !isClickFocusRef.current;
              if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
                const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS2);
                event.currentTarget.dispatchEvent(entryFocusEvent);
                if (!entryFocusEvent.defaultPrevented) {
                  const items = getItems().filter((item) => item.focusable);
                  const activeItem = items.find((item) => item.active);
                  const currentItem = items.find((item) => item.id === currentTabStopId);
                  const candidateItems = [activeItem, currentItem, ...items].filter(
                    Boolean
                  );
                  const candidateNodes = candidateItems.map((item) => item.ref.current);
                  focusFirst2(candidateNodes, preventScrollOnEntryFocus);
                }
              }
              isClickFocusRef.current = false;
            }),
            onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false))
          }
        )
      }
    );
  });
  var ITEM_NAME = "RovingFocusGroupItem";
  var RovingFocusGroupItem = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeRovingFocusGroup,
        focusable = true,
        active = false,
        tabStopId,
        children,
        ...itemProps
      } = props;
      const autoId = useId2();
      const id = tabStopId || autoId;
      const context = useRovingFocusContext(ITEM_NAME, __scopeRovingFocusGroup);
      const isCurrentTabStop = context.currentTabStopId === id;
      const getItems = useCollection(__scopeRovingFocusGroup);
      const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;
      const isHydrated = useIsHydrated2();
      useLayoutEffect2(() => {
        if (!isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      useEffect(() => {
        if (isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      return /* @__PURE__ */ jsx(
        Collection.ItemSlot,
        {
          scope: __scopeRovingFocusGroup,
          id,
          focusable,
          active,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              tabIndex: isCurrentTabStop ? 0 : -1,
              "data-orientation": context.orientation,
              ...itemProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!focusable) event.preventDefault();
                else context.onItemFocus(id);
              }),
              onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (event.key === "Tab" && event.shiftKey) {
                  context.onItemShiftTab();
                  return;
                }
                if (event.target !== event.currentTarget) return;
                const focusIntent = getFocusIntent(event, context.orientation, context.dir);
                if (focusIntent !== void 0) {
                  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  const items = getItems().filter((item) => item.focusable);
                  let candidateNodes = items.map((item) => item.ref.current);
                  if (focusIntent === "last") candidateNodes.reverse();
                  else if (focusIntent === "prev" || focusIntent === "next") {
                    if (focusIntent === "prev") candidateNodes.reverse();
                    const currentIndex = candidateNodes.indexOf(event.currentTarget);
                    candidateNodes = context.loop ? wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
                  }
                  setTimeout(() => focusFirst2(candidateNodes));
                }
              }),
              children: typeof children === "function" ? children({ isCurrentTabStop, hasTabStop: currentTabStopId != null }) : children
            }
          )
        }
      );
    }
  );
  RovingFocusGroupItem.displayName = ITEM_NAME;
  var MAP_KEY_TO_FOCUS_INTENT = {
    ArrowLeft: "prev",
    ArrowUp: "prev",
    ArrowRight: "next",
    ArrowDown: "next",
    PageUp: "first",
    Home: "first",
    PageDown: "last",
    End: "last"
  };
  function getDirectionAwareKey(key, dir) {
    if (dir !== "rtl") return key;
    return key === "ArrowLeft" ? "ArrowRight" : key === "ArrowRight" ? "ArrowLeft" : key;
  }
  function getFocusIntent(event, orientation, dir) {
    const key = getDirectionAwareKey(event.key, dir);
    if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
    if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
    return MAP_KEY_TO_FOCUS_INTENT[key];
  }
  function focusFirst2(candidates, preventScroll = false) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus({ preventScroll });
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  var Root3 = RovingFocusGroup;
  var Item = RovingFocusGroupItem;

  // ../../node_modules/.pnpm/@radix-ui+react-menu@2.1.20_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-menu/dist/index.mjs
  var SELECTION_KEYS = ["Enter", " "];
  var FIRST_KEYS = ["ArrowDown", "PageUp", "Home"];
  var LAST_KEYS = ["ArrowUp", "PageDown", "End"];
  var FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
  var SUB_OPEN_KEYS = {
    ltr: [...SELECTION_KEYS, "ArrowRight"],
    rtl: [...SELECTION_KEYS, "ArrowLeft"]
  };
  var SUB_CLOSE_KEYS = {
    ltr: ["ArrowLeft"],
    rtl: ["ArrowRight"]
  };
  var MENU_NAME = "Menu";
  var [Collection2, useCollection2, createCollectionScope2] = createCollection(MENU_NAME);
  var [createMenuContext, createMenuScope] = createContextScope(MENU_NAME, [
    createCollectionScope2,
    createPopperScope,
    createRovingFocusGroupScope
  ]);
  var usePopperScope = createPopperScope();
  var useRovingFocusGroupScope = createRovingFocusGroupScope();
  var [MenuProvider, useMenuContext] = createMenuContext(MENU_NAME);
  var [MenuRootProvider, useMenuRootContext] = createMenuContext(MENU_NAME);
  var Menu = (props) => {
    const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props;
    const popperScope = usePopperScope(__scopeMenu);
    const [content, setContent] = useState(null);
    const isUsingKeyboardRef = useRef(false);
    const handleOpenChange = useCallbackRef(onOpenChange);
    const direction = useDirection(dir);
    useEffect(() => {
      const handleKeyDown = () => {
        isUsingKeyboardRef.current = true;
        document.addEventListener("pointerdown", handlePointer, { capture: true, once: true });
        document.addEventListener("pointermove", handlePointer, { capture: true, once: true });
      };
      const handlePointer = () => isUsingKeyboardRef.current = false;
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, { capture: true });
        document.removeEventListener("pointerdown", handlePointer, { capture: true });
        document.removeEventListener("pointermove", handlePointer, { capture: true });
      };
    }, []);
    useEffect(() => {
      if (!open) {
        return;
      }
      const handleBlur = () => handleOpenChange(false);
      window.addEventListener("blur", handleBlur);
      return () => window.removeEventListener("blur", handleBlur);
    }, [open, handleOpenChange]);
    return /* @__PURE__ */ jsx(Root2, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuRootProvider,
          {
            scope: __scopeMenu,
            onClose: useCallback(() => handleOpenChange(false), [handleOpenChange]),
            isUsingKeyboardRef,
            dir: direction,
            modal,
            children
          }
        )
      }
    ) });
  };
  Menu.displayName = MENU_NAME;
  var ANCHOR_NAME2 = "MenuAnchor";
  var MenuAnchor = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...anchorProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }
  );
  MenuAnchor.displayName = ANCHOR_NAME2;
  var PORTAL_NAME3 = "MenuPortal";
  var [PortalProvider2, usePortalContext2] = createMenuContext(PORTAL_NAME3, {
    forceMount: void 0
  });
  var MenuPortal = (props) => {
    const { __scopeMenu, forceMount, children, container } = props;
    const context = useMenuContext(PORTAL_NAME3, __scopeMenu);
    return /* @__PURE__ */ jsx(PortalProvider2, { scope: __scopeMenu, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  };
  MenuPortal.displayName = PORTAL_NAME3;
  var CONTENT_NAME3 = "MenuContent";
  var [MenuContentProvider, useMenuContentContext] = createMenuContext(CONTENT_NAME3);
  var MenuContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: rootContext.modal ? /* @__PURE__ */ jsx(MenuRootContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(MenuRootContentNonModal, { ...contentProps, ref: forwardedRef }) }) }) });
    }
  );
  var MenuRootContentModal = forwardRef(
    (props, forwardedRef) => {
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      useEffect(() => {
        const content = ref.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          disableOutsideScroll: true,
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          ),
          onDismiss: () => context.onOpenChange(false)
        }
      );
    }
  );
  var MenuRootContentNonModal = forwardRef((props, forwardedRef) => {
    const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
    return /* @__PURE__ */ jsx(
      MenuContentImpl,
      {
        ...props,
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        onDismiss: () => context.onOpenChange(false)
      }
    );
  });
  var Slot3 = createSlot("MenuContent.ScrollLock");
  var MenuContentImpl = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeMenu,
        loop = false,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEntryFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        disableOutsideScroll,
        ...contentProps
      } = props;
      const context = useMenuContext(CONTENT_NAME3, __scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, __scopeMenu);
      const popperScope = usePopperScope(__scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const getItems = useCollection2(__scopeMenu);
      const [currentItemId, setCurrentItemId] = useState(null);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef, context.onContentChange);
      const timerRef = useRef(0);
      const searchRef = useRef("");
      const pointerGraceTimerRef = useRef(0);
      const pointerGraceIntentRef = useRef(null);
      const pointerDirRef = useRef("right");
      const lastPointerXRef = useRef(0);
      const ScrollLockWrapper = disableOutsideScroll ? Combination_default : Fragment;
      const scrollLockWrapperProps = disableOutsideScroll ? { as: Slot3, allowPinchZoom: true } : void 0;
      const handleTypeaheadSearch = (key) => {
        const search = searchRef.current + key;
        const items = getItems().filter((item) => !item.disabled);
        const currentItem = document.activeElement;
        const currentMatch = items.find((item) => item.ref.current === currentItem)?.textValue;
        const values = items.map((item) => item.textValue);
        const nextMatch = getNextMatch(values, search, currentMatch);
        const newItem = items.find((item) => item.textValue === nextMatch)?.ref.current;
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
        if (newItem) {
          setTimeout(() => newItem.focus());
        }
      };
      useEffect(() => {
        return () => window.clearTimeout(timerRef.current);
      }, []);
      useFocusGuards();
      const isPointerMovingToSubmenu = useCallback((event) => {
        const isMovingTowards = pointerDirRef.current === pointerGraceIntentRef.current?.side;
        return isMovingTowards && isPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentProvider,
        {
          scope: __scopeMenu,
          searchRef,
          onItemEnter: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          onItemLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) return;
              contentRef.current?.focus();
              setCurrentItemId(null);
            },
            [isPointerMovingToSubmenu]
          ),
          onTriggerLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          pointerGraceTimerRef,
          onPointerGraceIntentChange: useCallback((intent) => {
            pointerGraceIntentRef.current = intent;
          }, []),
          children: /* @__PURE__ */ jsx(ScrollLockWrapper, { ...scrollLockWrapperProps, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: trapFocus,
              onMountAutoFocus: composeEventHandlers(onOpenAutoFocus, (event) => {
                event.preventDefault();
                contentRef.current?.focus({ preventScroll: true });
              }),
              onUnmountAutoFocus: onCloseAutoFocus,
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside,
                  onInteractOutside,
                  onDismiss,
                  children: /* @__PURE__ */ jsx(
                    Root3,
                    {
                      asChild: true,
                      ...rovingFocusGroupScope,
                      dir: rootContext.dir,
                      orientation: "vertical",
                      loop,
                      currentTabStopId: currentItemId,
                      onCurrentTabStopIdChange: setCurrentItemId,
                      onEntryFocus: composeEventHandlers(onEntryFocus, (event) => {
                        if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
                      }),
                      preventScrollOnEntryFocus: true,
                      children: /* @__PURE__ */ jsx(
                        Content,
                        {
                          role: "menu",
                          "aria-orientation": "vertical",
                          "data-state": getOpenState(context.open),
                          "data-radix-menu-content": "",
                          dir: rootContext.dir,
                          ...popperScope,
                          ...contentProps,
                          ref: composedRefs,
                          style: { outline: "none", ...contentProps.style },
                          onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                            const target = event.target;
                            const isKeyDownInside = target.closest("[data-radix-menu-content]") === event.currentTarget;
                            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                            const isCharacterKey = event.key.length === 1;
                            if (isKeyDownInside) {
                              if (event.key === "Tab") event.preventDefault();
                              if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
                            }
                            const content = contentRef.current;
                            if (event.target !== content) return;
                            if (!FIRST_LAST_KEYS.includes(event.key)) return;
                            event.preventDefault();
                            const items = getItems().filter((item) => !item.disabled);
                            const candidateNodes = items.map((item) => item.ref.current);
                            if (LAST_KEYS.includes(event.key)) candidateNodes.reverse();
                            focusFirst3(candidateNodes);
                          }),
                          onBlur: composeEventHandlers(props.onBlur, (event) => {
                            if (!event.currentTarget.contains(event.target)) {
                              window.clearTimeout(timerRef.current);
                              searchRef.current = "";
                            }
                          }),
                          onPointerMove: composeEventHandlers(
                            props.onPointerMove,
                            whenMouse((event) => {
                              const target = event.target;
                              const pointerXHasChanged = lastPointerXRef.current !== event.clientX;
                              if (event.currentTarget.contains(target) && pointerXHasChanged) {
                                const newDir = event.clientX > lastPointerXRef.current ? "right" : "left";
                                pointerDirRef.current = newDir;
                                lastPointerXRef.current = event.clientX;
                              }
                            })
                          )
                        }
                      )
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }
  );
  MenuContent.displayName = CONTENT_NAME3;
  var GROUP_NAME2 = "MenuGroup";
  var MenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...groupProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { role: "group", ...groupProps, ref: forwardedRef });
    }
  );
  MenuGroup.displayName = GROUP_NAME2;
  var LABEL_NAME = "MenuLabel";
  var MenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...labelProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { ...labelProps, ref: forwardedRef });
    }
  );
  MenuLabel.displayName = LABEL_NAME;
  var ITEM_NAME2 = "MenuItem";
  var ITEM_SELECT = "menu.itemSelect";
  var MenuItem = forwardRef(
    (props, forwardedRef) => {
      const { disabled = false, onSelect, ...itemProps } = props;
      const ref = useRef(null);
      const rootContext = useMenuRootContext(ITEM_NAME2, props.__scopeMenu);
      const contentContext = useMenuContentContext(ITEM_NAME2, props.__scopeMenu);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const isPointerDownRef = useRef(false);
      const handleSelect = () => {
        const menuItem = ref.current;
        if (!disabled && menuItem) {
          const itemSelectEvent = new CustomEvent(ITEM_SELECT, { bubbles: true, cancelable: true });
          menuItem.addEventListener(ITEM_SELECT, (event) => onSelect?.(event), { once: true });
          dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
          if (itemSelectEvent.defaultPrevented) {
            isPointerDownRef.current = false;
          } else {
            rootContext.onClose();
          }
        }
      };
      return /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          ...itemProps,
          ref: composedRefs,
          disabled,
          onClick: composeEventHandlers(props.onClick, handleSelect),
          onPointerDown: (event) => {
            props.onPointerDown?.(event);
            isPointerDownRef.current = true;
          },
          onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
            if (!isPointerDownRef.current) event.currentTarget?.click();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SELECTION_KEYS.includes(event.key)) {
              event.currentTarget.click();
              event.preventDefault();
            }
          })
        }
      );
    }
  );
  MenuItem.displayName = ITEM_NAME2;
  var MenuItemImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, disabled = false, textValue, ...itemProps } = props;
      const contentContext = useMenuContentContext(ITEM_NAME2, __scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const [isFocused, setIsFocused] = useState(false);
      const [textContent, setTextContent] = useState("");
      useEffect(() => {
        const menuItem = ref.current;
        if (menuItem) {
          setTextContent((menuItem.textContent ?? "").trim());
        }
      }, [itemProps.children]);
      return /* @__PURE__ */ jsx(
        Collection2.ItemSlot,
        {
          scope: __scopeMenu,
          disabled,
          textValue: textValue ?? textContent,
          children: /* @__PURE__ */ jsx(Item, { asChild: true, ...rovingFocusGroupScope, focusable: !disabled, children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              role: "menuitem",
              "data-highlighted": isFocused ? "" : void 0,
              "aria-disabled": disabled || void 0,
              "data-disabled": disabled ? "" : void 0,
              ...itemProps,
              ref: composedRefs,
              onPointerMove: composeEventHandlers(
                props.onPointerMove,
                whenMouse((event) => {
                  if (disabled) {
                    contentContext.onItemLeave(event);
                  } else {
                    contentContext.onItemEnter(event);
                    if (!event.defaultPrevented) {
                      const item = event.currentTarget;
                      item.focus({ preventScroll: true });
                    }
                  }
                })
              ),
              onPointerLeave: composeEventHandlers(
                props.onPointerLeave,
                whenMouse((event) => contentContext.onItemLeave(event))
              ),
              onFocus: composeEventHandlers(props.onFocus, () => setIsFocused(true)),
              onBlur: composeEventHandlers(props.onBlur, () => setIsFocused(false))
            }
          ) })
        }
      );
    }
  );
  var CHECKBOX_ITEM_NAME = "MenuCheckboxItem";
  var MenuCheckboxItem = forwardRef(
    (props, forwardedRef) => {
      const { checked = false, onCheckedChange, ...checkboxItemProps } = props;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemcheckbox",
          "aria-checked": isIndeterminate2(checked) ? "mixed" : checked,
          ...checkboxItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            checkboxItemProps.onSelect,
            () => onCheckedChange?.(isIndeterminate2(checked) ? true : !checked),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }
  );
  MenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME;
  var RADIO_GROUP_NAME = "MenuRadioGroup";
  var [RadioGroupProvider, useRadioGroupContext] = createMenuContext(
    RADIO_GROUP_NAME,
    { value: void 0, onValueChange: () => {
    } }
  );
  var MenuRadioGroup = forwardRef(
    (props, forwardedRef) => {
      const { value, onValueChange, ...groupProps } = props;
      const handleValueChange = useCallbackRef(onValueChange);
      return /* @__PURE__ */ jsx(RadioGroupProvider, { scope: props.__scopeMenu, value, onValueChange: handleValueChange, children: /* @__PURE__ */ jsx(MenuGroup, { ...groupProps, ref: forwardedRef }) });
    }
  );
  MenuRadioGroup.displayName = RADIO_GROUP_NAME;
  var RADIO_ITEM_NAME = "MenuRadioItem";
  var MenuRadioItem = forwardRef(
    (props, forwardedRef) => {
      const { value, ...radioItemProps } = props;
      const context = useRadioGroupContext(RADIO_ITEM_NAME, props.__scopeMenu);
      const checked = value === context.value;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemradio",
          "aria-checked": checked,
          ...radioItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            radioItemProps.onSelect,
            () => context.onValueChange?.(value),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }
  );
  MenuRadioItem.displayName = RADIO_ITEM_NAME;
  var ITEM_INDICATOR_NAME = "MenuItemIndicator";
  var [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext(
    ITEM_INDICATOR_NAME,
    { checked: false }
  );
  var MenuItemIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, forceMount, ...itemIndicatorProps } = props;
      const indicatorContext = useItemIndicatorContext(ITEM_INDICATOR_NAME, __scopeMenu);
      return /* @__PURE__ */ jsx(
        Presence,
        {
          present: forceMount || isIndeterminate2(indicatorContext.checked) || indicatorContext.checked === true,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              ...itemIndicatorProps,
              ref: forwardedRef,
              "data-state": getCheckedState(indicatorContext.checked)
            }
          )
        }
      );
    }
  );
  MenuItemIndicator.displayName = ITEM_INDICATOR_NAME;
  var SEPARATOR_NAME = "MenuSeparator";
  var MenuSeparator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          role: "separator",
          "aria-orientation": "horizontal",
          ...separatorProps,
          ref: forwardedRef
        }
      );
    }
  );
  MenuSeparator.displayName = SEPARATOR_NAME;
  var ARROW_NAME2 = "MenuArrow";
  var MenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...arrowProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }
  );
  MenuArrow.displayName = ARROW_NAME2;
  var SUB_NAME = "MenuSub";
  var [MenuSubProvider, useMenuSubContext] = createMenuContext(SUB_NAME);
  var MenuSub = (props) => {
    const { __scopeMenu, children, open = false, onOpenChange } = props;
    const parentMenuContext = useMenuContext(SUB_NAME, __scopeMenu);
    const popperScope = usePopperScope(__scopeMenu);
    const [trigger, setTrigger] = useState(null);
    const [content, setContent] = useState(null);
    const handleOpenChange = useCallbackRef(onOpenChange);
    useEffect(() => {
      if (parentMenuContext.open === false) handleOpenChange(false);
      return () => handleOpenChange(false);
    }, [parentMenuContext.open, handleOpenChange]);
    return /* @__PURE__ */ jsx(Root2, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuSubProvider,
          {
            scope: __scopeMenu,
            contentId: useId2(),
            triggerId: useId2(),
            trigger,
            onTriggerChange: setTrigger,
            children
          }
        )
      }
    ) });
  };
  MenuSub.displayName = SUB_NAME;
  var SUB_TRIGGER_NAME = "MenuSubTrigger";
  var MenuSubTrigger = forwardRef(
    (props, forwardedRef) => {
      const context = useMenuContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const rootContext = useMenuRootContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const contentContext = useMenuContentContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const openTimerRef = useRef(null);
      const { pointerGraceTimerRef, onPointerGraceIntentChange } = contentContext;
      const scope = { __scopeMenu: props.__scopeMenu };
      const clearOpenTimer = useCallback(() => {
        if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }, []);
      useEffect(() => clearOpenTimer, [clearOpenTimer]);
      useEffect(() => {
        const pointerGraceTimer = pointerGraceTimerRef.current;
        return () => {
          window.clearTimeout(pointerGraceTimer);
          onPointerGraceIntentChange(null);
        };
      }, [pointerGraceTimerRef, onPointerGraceIntentChange]);
      const composedRefs = useComposedRefs(forwardedRef, subContext.onTriggerChange);
      return /* @__PURE__ */ jsx(MenuAnchor, { asChild: true, ...scope, children: /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          id: subContext.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? subContext.contentId : void 0,
          "data-state": getOpenState(context.open),
          ...props,
          ref: composedRefs,
          onClick: (event) => {
            props.onClick?.(event);
            if (props.disabled || event.defaultPrevented) return;
            event.currentTarget.focus();
            if (!context.open) context.onOpenChange(true);
          },
          onPointerMove: composeEventHandlers(
            props.onPointerMove,
            whenMouse((event) => {
              contentContext.onItemEnter(event);
              if (event.defaultPrevented) return;
              if (!props.disabled && !context.open && !openTimerRef.current) {
                contentContext.onPointerGraceIntentChange(null);
                openTimerRef.current = window.setTimeout(() => {
                  context.onOpenChange(true);
                  clearOpenTimer();
                }, 100);
              }
            })
          ),
          onPointerLeave: composeEventHandlers(
            props.onPointerLeave,
            whenMouse((event) => {
              clearOpenTimer();
              const contentRect = context.content?.getBoundingClientRect();
              if (contentRect) {
                const side = context.content?.dataset.side;
                const rightSide = side === "right";
                const bleed = rightSide ? -5 : 5;
                const contentNearEdge = contentRect[rightSide ? "left" : "right"];
                const contentFarEdge = contentRect[rightSide ? "right" : "left"];
                contentContext.onPointerGraceIntentChange({
                  area: [
                    // Apply a bleed on clientX to ensure that our exit point is
                    // consistently within polygon bounds
                    { x: event.clientX + bleed, y: event.clientY },
                    { x: contentNearEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.bottom },
                    { x: contentNearEdge, y: contentRect.bottom }
                  ],
                  side
                });
                window.clearTimeout(pointerGraceTimerRef.current);
                pointerGraceTimerRef.current = window.setTimeout(
                  () => contentContext.onPointerGraceIntentChange(null),
                  300
                );
              } else {
                contentContext.onTriggerLeave(event);
                if (event.defaultPrevented) return;
                contentContext.onPointerGraceIntentChange(null);
              }
            })
          ),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (props.disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
              context.onOpenChange(true);
              context.content?.focus();
              event.preventDefault();
            }
          })
        }
      ) });
    }
  );
  MenuSubTrigger.displayName = SUB_TRIGGER_NAME;
  var SUB_CONTENT_NAME = "MenuSubContent";
  var MenuSubContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, align = "start", ...subContentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_CONTENT_NAME, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          id: subContext.contentId,
          "aria-labelledby": subContext.triggerId,
          ...subContentProps,
          ref: composedRefs,
          align,
          side: rootContext.dir === "rtl" ? "left" : "right",
          disableOutsidePointerEvents: false,
          disableOutsideScroll: false,
          trapFocus: false,
          onOpenAutoFocus: (event) => {
            if (rootContext.isUsingKeyboardRef.current) ref.current?.focus();
            event.preventDefault();
          },
          onCloseAutoFocus: (event) => event.preventDefault(),
          onFocusOutside: composeEventHandlers(props.onFocusOutside, (event) => {
            if (event.target !== subContext.trigger) context.onOpenChange(false);
          }),
          onEscapeKeyDown: composeEventHandlers(props.onEscapeKeyDown, (event) => {
            rootContext.onClose();
            event.preventDefault();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isKeyDownInside = event.currentTarget.contains(event.target);
            const isCloseKey = SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
            if (isKeyDownInside && isCloseKey) {
              context.onOpenChange(false);
              subContext.trigger?.focus();
              event.preventDefault();
            }
          })
        }
      ) }) }) });
    }
  );
  MenuSubContent.displayName = SUB_CONTENT_NAME;
  function getOpenState(open) {
    return open ? "open" : "closed";
  }
  function isIndeterminate2(checked) {
    return checked === "indeterminate";
  }
  function getCheckedState(checked) {
    return isIndeterminate2(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  function focusFirst3(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray2(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  function getNextMatch(values, search, currentMatch) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
    let wrappedValues = wrapArray2(values, Math.max(currentMatchIndex, 0));
    const excludeCurrentMatch = normalizedSearch.length === 1;
    if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
    const nextMatch = wrappedValues.find(
      (value) => value.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextMatch !== currentMatch ? nextMatch : void 0;
  }
  function isPointInPolygon(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j2 = polygon.length - 1; i < polygon.length; j2 = i++) {
      const ii = polygon[i];
      const jj = polygon[j2];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = { x: event.clientX, y: event.clientY };
    return isPointInPolygon(cursorPos, area);
  }
  function whenMouse(handler) {
    return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
  }
  var Root32 = Menu;
  var Anchor2 = MenuAnchor;
  var Portal2 = MenuPortal;
  var Content2 = MenuContent;
  var Group = MenuGroup;
  var Label = MenuLabel;
  var Item2 = MenuItem;
  var CheckboxItem = MenuCheckboxItem;
  var RadioGroup = MenuRadioGroup;
  var RadioItem = MenuRadioItem;
  var ItemIndicator = MenuItemIndicator;
  var Separator = MenuSeparator;
  var Arrow22 = MenuArrow;
  var Sub = MenuSub;
  var SubTrigger = MenuSubTrigger;
  var SubContent = MenuSubContent;

  // ../../node_modules/.pnpm/@radix-ui+react-dropdown-menu@2.1.20_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs
  var dist_exports7 = {};
  __export(dist_exports7, {
    Arrow: () => Arrow23,
    CheckboxItem: () => CheckboxItem2,
    Content: () => Content22,
    DropdownMenu: () => DropdownMenu,
    DropdownMenuArrow: () => DropdownMenuArrow,
    DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem,
    DropdownMenuContent: () => DropdownMenuContent,
    DropdownMenuGroup: () => DropdownMenuGroup,
    DropdownMenuItem: () => DropdownMenuItem,
    DropdownMenuItemIndicator: () => DropdownMenuItemIndicator,
    DropdownMenuLabel: () => DropdownMenuLabel,
    DropdownMenuPortal: () => DropdownMenuPortal,
    DropdownMenuRadioGroup: () => DropdownMenuRadioGroup,
    DropdownMenuRadioItem: () => DropdownMenuRadioItem,
    DropdownMenuSeparator: () => DropdownMenuSeparator,
    DropdownMenuSub: () => DropdownMenuSub,
    DropdownMenuSubContent: () => DropdownMenuSubContent,
    DropdownMenuSubTrigger: () => DropdownMenuSubTrigger,
    DropdownMenuTrigger: () => DropdownMenuTrigger,
    Group: () => Group2,
    Item: () => Item22,
    ItemIndicator: () => ItemIndicator2,
    Label: () => Label2,
    Portal: () => Portal22,
    RadioGroup: () => RadioGroup2,
    RadioItem: () => RadioItem2,
    Root: () => Root22,
    Separator: () => Separator2,
    Sub: () => Sub2,
    SubContent: () => SubContent2,
    SubTrigger: () => SubTrigger2,
    Trigger: () => Trigger,
    createDropdownMenuScope: () => createDropdownMenuScope
  });
  var DROPDOWN_MENU_NAME = "DropdownMenu";
  var [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
    DROPDOWN_MENU_NAME,
    [createMenuScope]
  );
  var useMenuScope = createMenuScope();
  var [DropdownMenuProvider, useDropdownMenuContext] = createDropdownMenuContext(DROPDOWN_MENU_NAME);
  var DropdownMenu = (props) => {
    const {
      __scopeDropdownMenu,
      children,
      dir,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const triggerRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DROPDOWN_MENU_NAME
    });
    return /* @__PURE__ */ jsx(
      DropdownMenuProvider,
      {
        scope: __scopeDropdownMenu,
        triggerId: useId2(),
        triggerRef,
        contentId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children: /* @__PURE__ */ jsx(Root32, { ...menuScope, open, onOpenChange: setOpen, dir, modal, children })
      }
    );
  };
  DropdownMenu.displayName = DROPDOWN_MENU_NAME;
  var TRIGGER_NAME3 = "DropdownMenuTrigger";
  var DropdownMenuTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, disabled = false, ...triggerProps } = props;
      const context = useDropdownMenuContext(TRIGGER_NAME3, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const composedRefs = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(Anchor2, { asChild: true, ...menuScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          id: context.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": context.open ? "open" : "closed",
          "data-disabled": disabled ? "" : void 0,
          disabled,
          ...triggerProps,
          ref: composedRefs,
          onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
              context.onOpenToggle();
              if (!context.open) event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled) return;
            if (["Enter", " "].includes(event.key)) context.onOpenToggle();
            if (event.key === "ArrowDown") context.onOpenChange(true);
            if (["Enter", " ", "ArrowDown"].includes(event.key)) event.preventDefault();
          })
        }
      ) });
    }
  );
  DropdownMenuTrigger.displayName = TRIGGER_NAME3;
  var PORTAL_NAME4 = "DropdownMenuPortal";
  var DropdownMenuPortal = (props) => {
    const { __scopeDropdownMenu, ...portalProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Portal2, { ...menuScope, ...portalProps });
  };
  DropdownMenuPortal.displayName = PORTAL_NAME4;
  var CONTENT_NAME4 = "DropdownMenuContent";
  var DropdownMenuContent = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...contentProps } = props;
      const context = useDropdownMenuContext(CONTENT_NAME4, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const hasInteractedOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        Content2,
        {
          id: context.contentId,
          "aria-labelledby": context.triggerId,
          ...menuScope,
          ...contentProps,
          ref: forwardedRef,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
            hasInteractedOutsideRef.current = false;
            event.preventDefault();
          }),
          onInteractOutside: composeEventHandlers(props.onInteractOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
          }),
          style: {
            ...props.style,
            // re-namespace exposed content custom properties
            ...{
              "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
              "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
              "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
              "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
              "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
            }
          }
        }
      );
    }
  );
  DropdownMenuContent.displayName = CONTENT_NAME4;
  var GROUP_NAME3 = "DropdownMenuGroup";
  var DropdownMenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...groupProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Group, { ...menuScope, ...groupProps, ref: forwardedRef });
    }
  );
  DropdownMenuGroup.displayName = GROUP_NAME3;
  var LABEL_NAME2 = "DropdownMenuLabel";
  var DropdownMenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...labelProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Label, { ...menuScope, ...labelProps, ref: forwardedRef });
    }
  );
  DropdownMenuLabel.displayName = LABEL_NAME2;
  var ITEM_NAME3 = "DropdownMenuItem";
  var DropdownMenuItem = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...itemProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Item2, { ...menuScope, ...itemProps, ref: forwardedRef });
    }
  );
  DropdownMenuItem.displayName = ITEM_NAME3;
  var CHECKBOX_ITEM_NAME2 = "DropdownMenuCheckboxItem";
  var DropdownMenuCheckboxItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...checkboxItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(CheckboxItem, { ...menuScope, ...checkboxItemProps, ref: forwardedRef });
  });
  DropdownMenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME2;
  var RADIO_GROUP_NAME2 = "DropdownMenuRadioGroup";
  var DropdownMenuRadioGroup = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioGroupProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioGroup, { ...menuScope, ...radioGroupProps, ref: forwardedRef });
  });
  DropdownMenuRadioGroup.displayName = RADIO_GROUP_NAME2;
  var RADIO_ITEM_NAME2 = "DropdownMenuRadioItem";
  var DropdownMenuRadioItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioItem, { ...menuScope, ...radioItemProps, ref: forwardedRef });
  });
  DropdownMenuRadioItem.displayName = RADIO_ITEM_NAME2;
  var INDICATOR_NAME2 = "DropdownMenuItemIndicator";
  var DropdownMenuItemIndicator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...itemIndicatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(ItemIndicator, { ...menuScope, ...itemIndicatorProps, ref: forwardedRef });
  });
  DropdownMenuItemIndicator.displayName = INDICATOR_NAME2;
  var SEPARATOR_NAME2 = "DropdownMenuSeparator";
  var DropdownMenuSeparator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...separatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Separator, { ...menuScope, ...separatorProps, ref: forwardedRef });
  });
  DropdownMenuSeparator.displayName = SEPARATOR_NAME2;
  var ARROW_NAME3 = "DropdownMenuArrow";
  var DropdownMenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...arrowProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Arrow22, { ...menuScope, ...arrowProps, ref: forwardedRef });
    }
  );
  DropdownMenuArrow.displayName = ARROW_NAME3;
  var DropdownMenuSub = (props) => {
    const { __scopeDropdownMenu, children, open: openProp, onOpenChange, defaultOpen } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: "DropdownMenuSub"
    });
    return /* @__PURE__ */ jsx(Sub, { ...menuScope, open, onOpenChange: setOpen, children });
  };
  var SUB_TRIGGER_NAME2 = "DropdownMenuSubTrigger";
  var DropdownMenuSubTrigger = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...subTriggerProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(SubTrigger, { ...menuScope, ...subTriggerProps, ref: forwardedRef });
  });
  DropdownMenuSubTrigger.displayName = SUB_TRIGGER_NAME2;
  var SUB_CONTENT_NAME2 = "DropdownMenuSubContent";
  var DropdownMenuSubContent = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...subContentProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(
      SubContent,
      {
        ...menuScope,
        ...subContentProps,
        ref: forwardedRef,
        style: {
          ...props.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
            "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
            "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  });
  DropdownMenuSubContent.displayName = SUB_CONTENT_NAME2;
  var Root22 = DropdownMenu;
  var Trigger = DropdownMenuTrigger;
  var Portal22 = DropdownMenuPortal;
  var Content22 = DropdownMenuContent;
  var Group2 = DropdownMenuGroup;
  var Label2 = DropdownMenuLabel;
  var Item22 = DropdownMenuItem;
  var CheckboxItem2 = DropdownMenuCheckboxItem;
  var RadioGroup2 = DropdownMenuRadioGroup;
  var RadioItem2 = DropdownMenuRadioItem;
  var ItemIndicator2 = DropdownMenuItemIndicator;
  var Separator2 = DropdownMenuSeparator;
  var Arrow23 = DropdownMenuArrow;
  var Sub2 = DropdownMenuSub;
  var SubTrigger2 = DropdownMenuSubTrigger;
  var SubContent2 = DropdownMenuSubContent;

  // ../../node_modules/.pnpm/@radix-ui+number@1.1.2/node_modules/@radix-ui/number/dist/index.mjs
  function clamp2(value, [min2, max2]) {
    return Math.min(max2, Math.max(min2, value));
  }

  // ../../node_modules/.pnpm/@radix-ui+react-select@2.3.3_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-select/dist/index.mjs
  var dist_exports9 = {};
  __export(dist_exports9, {
    Arrow: () => SelectArrow,
    Content: () => SelectContent,
    Group: () => SelectGroup,
    Icon: () => SelectIcon,
    Item: () => SelectItem,
    ItemIndicator: () => SelectItemIndicator,
    ItemText: () => SelectItemText,
    Label: () => SelectLabel,
    Portal: () => SelectPortal,
    Root: () => Select,
    ScrollDownButton: () => SelectScrollDownButton,
    ScrollUpButton: () => SelectScrollUpButton,
    Select: () => Select,
    SelectArrow: () => SelectArrow,
    SelectContent: () => SelectContent,
    SelectGroup: () => SelectGroup,
    SelectIcon: () => SelectIcon,
    SelectItem: () => SelectItem,
    SelectItemIndicator: () => SelectItemIndicator,
    SelectItemText: () => SelectItemText,
    SelectLabel: () => SelectLabel,
    SelectPortal: () => SelectPortal,
    SelectScrollDownButton: () => SelectScrollDownButton,
    SelectScrollUpButton: () => SelectScrollUpButton,
    SelectSeparator: () => SelectSeparator,
    SelectTrigger: () => SelectTrigger,
    SelectValue: () => SelectValue,
    SelectViewport: () => SelectViewport,
    Separator: () => SelectSeparator,
    Trigger: () => SelectTrigger,
    Value: () => SelectValue,
    Viewport: () => SelectViewport,
    createSelectScope: () => createSelectScope,
    unstable_BubbleInput: () => SelectBubbleInput,
    unstable_Provider: () => SelectProvider,
    unstable_SelectBubbleInput: () => SelectBubbleInput,
    unstable_SelectProvider: () => SelectProvider
  });
  var OPEN_KEYS = [" ", "Enter", "ArrowUp", "ArrowDown"];
  var SELECTION_KEYS2 = [" ", "Enter"];
  var SELECT_NAME = "Select";
  var [Collection3, useCollection3, createCollectionScope3] = createCollection(SELECT_NAME);
  var [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
    createCollectionScope3,
    createPopperScope
  ]);
  var usePopperScope2 = createPopperScope();
  var [SelectProviderImpl, useSelectContext] = createSelectContext(SELECT_NAME);
  var [SelectNativeOptionsProvider, useSelectNativeOptionsContext] = createSelectContext(SELECT_NAME);
  var PROVIDER_NAME = "SelectProvider";
  function SelectProvider(props) {
    const {
      __scopeSelect,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      value: valueProp,
      defaultValue,
      onValueChange,
      dir,
      name,
      autoComplete,
      disabled,
      required,
      form,
      // @ts-expect-error internal render prop used by `Select` to compose its default parts
      internal_do_not_use_render
    } = props;
    const popperScope = usePopperScope2(__scopeSelect);
    const [trigger, setTrigger] = useState(null);
    const [valueNode, setValueNode] = useState(null);
    const [valueNodeHasChildren, setValueNodeHasChildren] = useState(false);
    const direction = useDirection(dir);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: SELECT_NAME
    });
    const [value, setValue] = useControllableState({
      prop: valueProp,
      defaultProp: defaultValue,
      onChange: onValueChange,
      caller: SELECT_NAME
    });
    const triggerPointerDownPosRef = useRef(null);
    const initialValueRef = useRef(value);
    useEffect(() => {
      const associatedForm = form ? trigger?.ownerDocument.getElementById(form) : trigger?.form;
      if (associatedForm instanceof HTMLFormElement) {
        const reset = () => setValue(initialValueRef.current);
        associatedForm.addEventListener("reset", reset);
        return () => associatedForm.removeEventListener("reset", reset);
      }
    }, [form, trigger, setValue]);
    const isFormControl = trigger ? !!form || !!trigger.closest("form") : true;
    const [nativeOptionsSet, setNativeOptionsSet] = useState(/* @__PURE__ */ new Set());
    const contentId = useId2();
    const nativeSelectKey = Array.from(nativeOptionsSet).map((option) => option.props.value).join(";");
    const handleNativeOptionAdd = useCallback((option) => {
      setNativeOptionsSet((prev) => new Set(prev).add(option));
    }, []);
    const handleNativeOptionRemove = useCallback((option) => {
      setNativeOptionsSet((prev) => {
        const optionsSet = new Set(prev);
        optionsSet.delete(option);
        return optionsSet;
      });
    }, []);
    const context = {
      required,
      trigger,
      onTriggerChange: setTrigger,
      valueNode,
      onValueNodeChange: setValueNode,
      valueNodeHasChildren,
      onValueNodeHasChildrenChange: setValueNodeHasChildren,
      contentId,
      value,
      onValueChange: setValue,
      open,
      onOpenChange: setOpen,
      dir: direction,
      triggerPointerDownPosRef,
      disabled,
      name,
      autoComplete,
      form,
      nativeOptions: nativeOptionsSet,
      nativeSelectKey,
      isFormControl
    };
    return /* @__PURE__ */ jsx(Root2, { ...popperScope, children: /* @__PURE__ */ jsx(SelectProviderImpl, { scope: __scopeSelect, ...context, children: /* @__PURE__ */ jsx(Collection3.Provider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
      SelectNativeOptionsProvider,
      {
        scope: __scopeSelect,
        onNativeOptionAdd: handleNativeOptionAdd,
        onNativeOptionRemove: handleNativeOptionRemove,
        children: isFunction3(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    ) }) }) });
  }
  SelectProvider.displayName = PROVIDER_NAME;
  var Select = (props) => {
    const { __scopeSelect, children, ...providerProps } = props;
    return /* @__PURE__ */ jsx(
      SelectProvider,
      {
        __scopeSelect,
        ...providerProps,
        internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
          children,
          isFormControl ? /* @__PURE__ */ jsx(
            SelectBubbleInput,
            {
              __scopeSelect
            }
          ) : null
        ] })
      }
    );
  };
  Select.displayName = SELECT_NAME;
  var TRIGGER_NAME4 = "SelectTrigger";
  var SelectTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, disabled = false, ...triggerProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
      const context = useSelectContext(TRIGGER_NAME4, __scopeSelect);
      const isDisabled = context.disabled || disabled;
      const composedRefs = useComposedRefs(forwardedRef, context.onTriggerChange);
      const getItems = useCollection3(__scopeSelect);
      const pointerTypeRef = useRef("touch");
      const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.value === context.value);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem !== void 0) {
          context.onValueChange(nextItem.value);
        }
      });
      const handleOpen = (pointerEvent) => {
        if (!isDisabled) {
          context.onOpenChange(true);
          resetTypeahead();
        }
        if (pointerEvent) {
          context.triggerPointerDownPosRef.current = {
            x: Math.round(pointerEvent.pageX),
            y: Math.round(pointerEvent.pageY)
          };
        }
      };
      return /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "combobox",
          "aria-controls": context.open ? context.contentId : void 0,
          "aria-expanded": context.open,
          "aria-required": context.required,
          "aria-autocomplete": "none",
          dir: context.dir,
          "data-state": context.open ? "open" : "closed",
          disabled: isDisabled,
          "data-disabled": isDisabled ? "" : void 0,
          "data-placeholder": shouldShowPlaceholder(context.value) ? "" : void 0,
          ...triggerProps,
          ref: composedRefs,
          onClick: composeEventHandlers(triggerProps.onClick, (event) => {
            event.currentTarget.focus();
            if (pointerTypeRef.current !== "mouse") {
              handleOpen(event);
            }
          }),
          onPointerDown: composeEventHandlers(triggerProps.onPointerDown, (event) => {
            pointerTypeRef.current = event.pointerType;
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
              target.releasePointerCapture(event.pointerId);
            }
            if (event.button === 0 && event.ctrlKey === false && event.pointerType === "mouse") {
              handleOpen(event);
              event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event) => {
            const isTypingAhead = searchRef.current !== "";
            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
            if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
            if (isTypingAhead && event.key === " ") return;
            if (OPEN_KEYS.includes(event.key)) {
              handleOpen();
              event.preventDefault();
            }
          })
        }
      ) });
    }
  );
  SelectTrigger.displayName = TRIGGER_NAME4;
  var VALUE_NAME = "SelectValue";
  var SelectValue = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, className, style, children, placeholder = "", ...valueProps } = props;
      const context = useSelectContext(VALUE_NAME, __scopeSelect);
      const { onValueNodeHasChildrenChange } = context;
      const hasChildren = children !== void 0;
      const composedRefs = useComposedRefs(forwardedRef, context.onValueNodeChange);
      useLayoutEffect2(() => {
        onValueNodeHasChildrenChange(hasChildren);
      }, [onValueNodeHasChildrenChange, hasChildren]);
      const showPlaceholder = shouldShowPlaceholder(context.value);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...valueProps,
          asChild: showPlaceholder ? false : valueProps.asChild,
          ref: composedRefs,
          style: { pointerEvents: "none" },
          children: /* @__PURE__ */ jsx(Fragment, { children: showPlaceholder ? placeholder : children }, showPlaceholder ? "placeholder" : "value")
        }
      );
    }
  );
  SelectValue.displayName = VALUE_NAME;
  var ICON_NAME = "SelectIcon";
  var SelectIcon = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, children, ...iconProps } = props;
      return /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...iconProps, ref: forwardedRef, children: children || "\u25BC" });
    }
  );
  SelectIcon.displayName = ICON_NAME;
  var PORTAL_NAME5 = "SelectPortal";
  var [PortalProvider3, usePortalContext3] = createSelectContext(PORTAL_NAME5, {
    forceMount: void 0
  });
  var SelectPortal = (props) => {
    const { __scopeSelect, forceMount, ...portalProps } = props;
    return /* @__PURE__ */ jsx(PortalProvider3, { scope: props.__scopeSelect, forceMount, children: /* @__PURE__ */ jsx(Portal, { asChild: true, ...portalProps }) });
  };
  SelectPortal.displayName = PORTAL_NAME5;
  var CONTENT_NAME5 = "SelectContent";
  var SelectContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext3(CONTENT_NAME5, props.__scopeSelect);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useSelectContext(CONTENT_NAME5, props.__scopeSelect);
      const [fragment, setFragment] = useState();
      useLayoutEffect2(() => {
        setFragment(new DocumentFragment());
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => present ? /* @__PURE__ */ jsx(SelectContentImpl, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(SelectContentFragment, { ...contentProps, fragment }) });
    }
  );
  SelectContent.displayName = CONTENT_NAME5;
  var SelectContentFragment = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, children, fragment } = props;
    if (!fragment) return null;
    return createPortal(
      /* @__PURE__ */ jsx(SelectContentProvider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx("div", { ref: forwardedRef, children }) }) }),
      fragment
    );
  });
  SelectContentFragment.displayName = "SelectContentFragment";
  var CONTENT_MARGIN = 10;
  var [SelectContentProvider, useSelectContentContext] = createSelectContext(CONTENT_NAME5);
  var CONTENT_IMPL_NAME = "SelectContentImpl";
  var Slot4 = createSlot("SelectContent.RemoveScroll");
  var SelectContentImpl = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect } = props;
      const {
        position = "item-aligned",
        onCloseAutoFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        //
        // PopperContent props
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions,
        //
        ...contentProps
      } = props;
      const context = useSelectContext(CONTENT_NAME5, __scopeSelect);
      const [content, setContent] = useState(null);
      const [viewport, setViewport] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [selectedItem, setSelectedItem] = useState(null);
      const [selectedItemText, setSelectedItemText] = useState(
        null
      );
      const getItems = useCollection3(__scopeSelect);
      const [isPositioned, setIsPositioned] = useState(false);
      const firstValidItemFoundRef = useRef(false);
      useEffect(() => {
        if (content) return hideOthers(content);
      }, [content]);
      useFocusGuards();
      const focusFirst5 = useCallback(
        (candidates) => {
          const [firstItem, ...restItems] = getItems().map((item) => item.ref.current);
          const [lastItem] = restItems.slice(-1);
          const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
          for (const candidate of candidates) {
            if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
            candidate?.scrollIntoView({ block: "nearest" });
            if (candidate === firstItem && viewport) viewport.scrollTop = 0;
            if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
            candidate?.focus();
            if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
          }
        },
        [getItems, viewport]
      );
      const focusSelectedItem = useCallback(
        () => focusFirst5([selectedItem, content]),
        [focusFirst5, selectedItem, content]
      );
      useEffect(() => {
        if (isPositioned) {
          focusSelectedItem();
        }
      }, [isPositioned, focusSelectedItem]);
      const { onOpenChange, triggerPointerDownPosRef } = context;
      useEffect(() => {
        if (content) {
          let pointerMoveDelta = { x: 0, y: 0 };
          const handlePointerMove = (event) => {
            pointerMoveDelta = {
              x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
              y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0))
            };
          };
          const handlePointerUp = (event) => {
            if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
              event.preventDefault();
            } else {
              if (!event.composedPath().includes(content)) {
                onOpenChange(false);
              }
            }
            document.removeEventListener("pointermove", handlePointerMove);
            triggerPointerDownPosRef.current = null;
          };
          if (triggerPointerDownPosRef.current !== null) {
            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp, { capture: true, once: true });
          }
          return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp, { capture: true });
          };
        }
      }, [content, onOpenChange, triggerPointerDownPosRef]);
      useEffect(() => {
        const close = () => onOpenChange(false);
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        return () => {
          window.removeEventListener("blur", close);
          window.removeEventListener("resize", close);
        };
      }, [onOpenChange]);
      const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.ref.current === document.activeElement);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem) {
          setTimeout(() => nextItem.ref.current?.focus());
        }
      });
      const itemRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItem(node);
            if (isFirstValidItem) firstValidItemFoundRef.current = true;
          }
        },
        [context.value]
      );
      const handleItemLeave = useCallback(() => content?.focus(), [content]);
      const itemTextRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItemText(node);
          }
        },
        [context.value]
      );
      const SelectPosition = position === "popper" ? SelectPopperPosition : SelectItemAlignedPosition;
      const popperContentProps = SelectPosition === SelectPopperPosition ? {
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions
      } : {};
      return /* @__PURE__ */ jsx(
        SelectContentProvider,
        {
          scope: __scopeSelect,
          content,
          viewport,
          onViewportChange: setViewport,
          itemRefCallback,
          selectedItem,
          onItemLeave: handleItemLeave,
          itemTextRefCallback,
          focusSelectedItem,
          selectedItemText,
          position,
          isPositioned,
          searchRef,
          children: /* @__PURE__ */ jsx(Combination_default, { as: Slot4, allowPinchZoom: true, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: context.open,
              onMountAutoFocus: (event) => {
                event.preventDefault();
              },
              onUnmountAutoFocus: composeEventHandlers(onCloseAutoFocus, (event) => {
                context.trigger?.focus({ preventScroll: true });
                event.preventDefault();
              }),
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents: true,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside: (event) => event.preventDefault(),
                  onDismiss: () => context.onOpenChange(false),
                  children: /* @__PURE__ */ jsx(
                    SelectPosition,
                    {
                      role: "listbox",
                      id: context.contentId,
                      "data-state": context.open ? "open" : "closed",
                      dir: context.dir,
                      onContextMenu: (event) => event.preventDefault(),
                      ...contentProps,
                      ...popperContentProps,
                      onPlaced: () => setIsPositioned(true),
                      ref: composedRefs,
                      style: {
                        // flex layout so we can place the scroll buttons properly
                        display: "flex",
                        flexDirection: "column",
                        // reset the outline by default as the content MAY get focused
                        outline: "none",
                        ...contentProps.style
                      },
                      onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                        const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                        if (event.key === "Tab") event.preventDefault();
                        if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          const items = getItems().filter((item) => !item.disabled);
                          let candidateNodes = items.map((item) => item.ref.current);
                          if (["ArrowUp", "End"].includes(event.key)) {
                            candidateNodes = candidateNodes.slice().reverse();
                          }
                          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                            const currentElement = event.target;
                            const currentIndex = candidateNodes.indexOf(currentElement);
                            candidateNodes = candidateNodes.slice(currentIndex + 1);
                          }
                          setTimeout(() => focusFirst5(candidateNodes));
                          event.preventDefault();
                        }
                      })
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }
  );
  SelectContentImpl.displayName = CONTENT_IMPL_NAME;
  var ITEM_ALIGNED_POSITION_NAME = "SelectItemAlignedPosition";
  var SelectItemAlignedPosition = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, onPlaced, ...popperProps } = props;
    const context = useSelectContext(CONTENT_NAME5, __scopeSelect);
    const contentContext = useSelectContentContext(CONTENT_NAME5, __scopeSelect);
    const [contentWrapper, setContentWrapper] = useState(null);
    const [content, setContent] = useState(null);
    const composedRefs = useComposedRefs(forwardedRef, setContent);
    const getItems = useCollection3(__scopeSelect);
    const shouldExpandOnScrollRef = useRef(false);
    const shouldRepositionRef = useRef(true);
    const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
    const position = useCallback(() => {
      if (context.trigger && context.valueNode && contentWrapper && content && viewport && selectedItem && selectedItemText) {
        const triggerRect = context.trigger.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const valueNodeRect = context.valueNode.getBoundingClientRect();
        const itemTextRect = selectedItemText.getBoundingClientRect();
        if (context.dir !== "rtl") {
          const itemTextOffset = itemTextRect.left - contentRect.left;
          const left = valueNodeRect.left - itemTextOffset;
          const leftDelta = triggerRect.left - left;
          const minContentWidth = triggerRect.width + leftDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const rightEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedLeft = clamp2(left, [
            CONTENT_MARGIN,
            // Prevents the content from going off the starting edge of the
            // viewport. It may still go off the ending edge, but this can be
            // controlled by the user since they may want to manage overflow in a
            // specific way.
            // https://github.com/radix-ui/primitives/issues/2049
            Math.max(CONTENT_MARGIN, rightEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.left = clampedLeft + "px";
        } else {
          const itemTextOffset = contentRect.right - itemTextRect.right;
          const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
          const rightDelta = window.innerWidth - triggerRect.right - right;
          const minContentWidth = triggerRect.width + rightDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const leftEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedRight = clamp2(right, [
            CONTENT_MARGIN,
            Math.max(CONTENT_MARGIN, leftEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.right = clampedRight + "px";
        }
        const items = getItems();
        const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
        const itemsHeight = viewport.scrollHeight;
        const contentStyles = window.getComputedStyle(content);
        const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
        const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
        const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
        const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
        const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth;
        const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);
        const viewportStyles = window.getComputedStyle(viewport);
        const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
        const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);
        const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
        const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
        const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
        const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
        const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
        const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
        const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;
        if (willAlignWithoutTopOverflow) {
          const isLastItem = items.length > 0 && selectedItem === items[items.length - 1].ref.current;
          contentWrapper.style.bottom = "0px";
          const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
          const clampedTriggerMiddleToBottomEdge = Math.max(
            triggerMiddleToBottomEdge,
            selectedItemHalfHeight + // viewport might have padding bottom, include it to avoid a scrollable viewport
            (isLastItem ? viewportPaddingBottom : 0) + viewportOffsetBottom + contentBorderBottomWidth
          );
          const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
          contentWrapper.style.height = height + "px";
        } else {
          const isFirstItem = items.length > 0 && selectedItem === items[0].ref.current;
          contentWrapper.style.top = "0px";
          const clampedTopEdgeToTriggerMiddle = Math.max(
            topEdgeToTriggerMiddle,
            contentBorderTopWidth + viewport.offsetTop + // viewport might have padding top, include it to avoid a scrollable viewport
            (isFirstItem ? viewportPaddingTop : 0) + selectedItemHalfHeight
          );
          const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
          contentWrapper.style.height = height + "px";
          viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
        }
        contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
        contentWrapper.style.minHeight = minContentHeight + "px";
        contentWrapper.style.maxHeight = availableHeight + "px";
        onPlaced?.();
        requestAnimationFrame(() => shouldExpandOnScrollRef.current = true);
      }
    }, [
      getItems,
      context.trigger,
      context.valueNode,
      contentWrapper,
      content,
      viewport,
      selectedItem,
      selectedItemText,
      context.dir,
      onPlaced
    ]);
    useLayoutEffect2(() => position(), [position]);
    const [contentZIndex, setContentZIndex] = useState();
    useLayoutEffect2(() => {
      if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
    }, [content]);
    const handleScrollButtonChange = useCallback(
      (node) => {
        if (node && shouldRepositionRef.current === true) {
          position();
          focusSelectedItem?.();
          shouldRepositionRef.current = false;
        }
      },
      [position, focusSelectedItem]
    );
    return /* @__PURE__ */ jsx(
      SelectViewportProvider,
      {
        scope: __scopeSelect,
        contentWrapper,
        shouldExpandOnScrollRef,
        onScrollButtonChange: handleScrollButtonChange,
        children: /* @__PURE__ */ jsx(
          "div",
          {
            ref: setContentWrapper,
            style: {
              display: "flex",
              flexDirection: "column",
              position: "fixed",
              zIndex: contentZIndex
            },
            children: /* @__PURE__ */ jsx(
              Primitive.div,
              {
                ...popperProps,
                ref: composedRefs,
                style: {
                  // When we get the height of the content, it includes borders. If we were to set
                  // the height without having `boxSizing: 'border-box'` it would be too big.
                  boxSizing: "border-box",
                  // We need to ensure the content doesn't get taller than the wrapper
                  maxHeight: "100%",
                  ...popperProps.style
                }
              }
            )
          }
        )
      }
    );
  });
  SelectItemAlignedPosition.displayName = ITEM_ALIGNED_POSITION_NAME;
  var POPPER_POSITION_NAME = "SelectPopperPosition";
  var SelectPopperPosition = forwardRef((props, forwardedRef) => {
    const {
      __scopeSelect,
      align = "start",
      collisionPadding = CONTENT_MARGIN,
      ...popperProps
    } = props;
    const popperScope = usePopperScope2(__scopeSelect);
    return /* @__PURE__ */ jsx(
      Content,
      {
        ...popperScope,
        ...popperProps,
        ref: forwardedRef,
        align,
        collisionPadding,
        style: {
          // Ensure border-box for floating-ui calculations
          boxSizing: "border-box",
          ...popperProps.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-select-content-available-width": "var(--radix-popper-available-width)",
            "--radix-select-content-available-height": "var(--radix-popper-available-height)",
            "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  });
  SelectPopperPosition.displayName = POPPER_POSITION_NAME;
  var [SelectViewportProvider, useSelectViewportContext] = createSelectContext(CONTENT_NAME5, {});
  var VIEWPORT_NAME = "SelectViewport";
  var SelectViewport = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, nonce, ...viewportProps } = props;
      const contentContext = useSelectContentContext(VIEWPORT_NAME, __scopeSelect);
      const viewportContext = useSelectViewportContext(VIEWPORT_NAME, __scopeSelect);
      const composedRefs = useComposedRefs(forwardedRef, contentContext.onViewportChange);
      const prevScrollTopRef = useRef(0);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`
            },
            nonce
          }
        ),
        /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-radix-select-viewport": "",
            role: "presentation",
            ...viewportProps,
            ref: composedRefs,
            style: {
              // we use position: 'relative' here on the `viewport` so that when we call
              // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
              // (independent of the scrollUpButton).
              position: "relative",
              flex: 1,
              // Viewport should only be scrollable in the vertical direction.
              // This won't work in vertical writing modes, so we'll need to
              // revisit this if/when that is supported
              // https://developer.chrome.com/blog/vertical-form-controls
              overflow: "hidden auto",
              ...viewportProps.style
            },
            onScroll: composeEventHandlers(viewportProps.onScroll, (event) => {
              const viewport = event.currentTarget;
              const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
              if (shouldExpandOnScrollRef?.current && contentWrapper) {
                const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
                if (scrolledBy > 0) {
                  const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
                  const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
                  const cssHeight = parseFloat(contentWrapper.style.height);
                  const prevHeight = Math.max(cssMinHeight, cssHeight);
                  if (prevHeight < availableHeight) {
                    const nextHeight = prevHeight + scrolledBy;
                    const clampedNextHeight = Math.min(availableHeight, nextHeight);
                    const heightDiff = nextHeight - clampedNextHeight;
                    contentWrapper.style.height = clampedNextHeight + "px";
                    if (contentWrapper.style.bottom === "0px") {
                      viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
                      contentWrapper.style.justifyContent = "flex-end";
                    }
                  }
                }
              }
              prevScrollTopRef.current = viewport.scrollTop;
            })
          }
        ) })
      ] });
    }
  );
  SelectViewport.displayName = VIEWPORT_NAME;
  var GROUP_NAME4 = "SelectGroup";
  var [SelectGroupContextProvider, useSelectGroupContext] = createSelectContext(GROUP_NAME4);
  var SelectGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...groupProps } = props;
      const groupId = useId2();
      return /* @__PURE__ */ jsx(SelectGroupContextProvider, { scope: __scopeSelect, id: groupId, children: /* @__PURE__ */ jsx(Primitive.div, { role: "group", "aria-labelledby": groupId, ...groupProps, ref: forwardedRef }) });
    }
  );
  SelectGroup.displayName = GROUP_NAME4;
  var LABEL_NAME3 = "SelectLabel";
  var SelectLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...labelProps } = props;
      const groupContext = useSelectGroupContext(LABEL_NAME3, __scopeSelect);
      return /* @__PURE__ */ jsx(Primitive.div, { id: groupContext.id, ...labelProps, ref: forwardedRef });
    }
  );
  SelectLabel.displayName = LABEL_NAME3;
  var ITEM_NAME4 = "SelectItem";
  var [SelectItemContextProvider, useSelectItemContext] = createSelectContext(ITEM_NAME4);
  var SelectItem = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeSelect,
        value,
        disabled = false,
        textValue: textValueProp,
        ...itemProps
      } = props;
      const context = useSelectContext(ITEM_NAME4, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_NAME4, __scopeSelect);
      const isSelected = context.value === value;
      const [textValue, setTextValue] = useState(textValueProp ?? "");
      const [isFocused, setIsFocused] = useState(false);
      const handleItemRefCallback = useCallbackRef(
        (node) => contentContext.itemRefCallback?.(node, value, disabled)
      );
      const composedRefs = useComposedRefs(forwardedRef, handleItemRefCallback);
      const textId = useId2();
      const pointerTypeRef = useRef("touch");
      const handleSelect = () => {
        if (!disabled) {
          context.onValueChange(value);
          context.onOpenChange(false);
        }
      };
      return /* @__PURE__ */ jsx(
        SelectItemContextProvider,
        {
          scope: __scopeSelect,
          value,
          disabled,
          textId,
          isSelected,
          onItemTextChange: useCallback((node) => {
            setTextValue((prevTextValue) => prevTextValue || (node?.textContent ?? "").trim());
          }, []),
          children: /* @__PURE__ */ jsx(
            Collection3.ItemSlot,
            {
              scope: __scopeSelect,
              value,
              disabled,
              textValue,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  role: "option",
                  "aria-labelledby": textId,
                  "data-highlighted": isFocused ? "" : void 0,
                  "aria-selected": isSelected && isFocused,
                  "data-state": isSelected ? "checked" : "unchecked",
                  "aria-disabled": disabled || void 0,
                  "data-disabled": disabled ? "" : void 0,
                  tabIndex: disabled ? void 0 : -1,
                  ...itemProps,
                  ref: composedRefs,
                  onFocus: composeEventHandlers(itemProps.onFocus, () => setIsFocused(true)),
                  onBlur: composeEventHandlers(itemProps.onBlur, () => setIsFocused(false)),
                  onClick: composeEventHandlers(itemProps.onClick, () => {
                    if (pointerTypeRef.current !== "mouse") handleSelect();
                  }),
                  onPointerUp: composeEventHandlers(itemProps.onPointerUp, () => {
                    if (pointerTypeRef.current === "mouse") handleSelect();
                  }),
                  onPointerDown: composeEventHandlers(itemProps.onPointerDown, (event) => {
                    pointerTypeRef.current = event.pointerType;
                  }),
                  onPointerMove: composeEventHandlers(itemProps.onPointerMove, (event) => {
                    pointerTypeRef.current = event.pointerType;
                    if (disabled) {
                      contentContext.onItemLeave?.();
                    } else if (pointerTypeRef.current === "mouse") {
                      event.currentTarget.focus({ preventScroll: true });
                    }
                  }),
                  onPointerLeave: composeEventHandlers(itemProps.onPointerLeave, (event) => {
                    if (event.currentTarget === document.activeElement) {
                      contentContext.onItemLeave?.();
                    }
                  }),
                  onKeyDown: composeEventHandlers(itemProps.onKeyDown, (event) => {
                    if (disabled || event.target !== event.currentTarget) {
                      return;
                    }
                    const isTypingAhead = contentContext.searchRef?.current !== "";
                    if (isTypingAhead && event.key === " ") {
                      return;
                    }
                    if (SELECTION_KEYS2.includes(event.key)) {
                      handleSelect();
                    }
                    if (event.key === " ") {
                      event.preventDefault();
                    }
                  })
                }
              )
            }
          )
        }
      );
    }
  );
  SelectItem.displayName = ITEM_NAME4;
  var ITEM_TEXT_NAME = "SelectItemText";
  var SelectItemText = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, className, style, ...itemTextProps } = props;
      const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
      const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
      const nativeOptionsContext = useSelectNativeOptionsContext(ITEM_TEXT_NAME, __scopeSelect);
      const [itemTextNode, setItemTextNode] = useState(null);
      const handleItemTextRefCallback = useCallbackRef(
        (node) => contentContext.itemTextRefCallback?.(node, itemContext.value, itemContext.disabled)
      );
      const composedRefs = useComposedRefs(
        forwardedRef,
        setItemTextNode,
        itemContext.onItemTextChange,
        handleItemTextRefCallback
      );
      const textContent = itemTextNode?.textContent;
      const nativeOption = useMemo(
        () => /* @__PURE__ */ jsx("option", { value: itemContext.value, disabled: itemContext.disabled, children: textContent }, itemContext.value),
        [itemContext.disabled, itemContext.value, textContent]
      );
      const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
      useLayoutEffect2(() => {
        onNativeOptionAdd(nativeOption);
        return () => onNativeOptionRemove(nativeOption);
      }, [onNativeOptionAdd, onNativeOptionRemove, nativeOption]);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(Primitive.span, { id: itemContext.textId, ...itemTextProps, ref: composedRefs }),
        itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren && !shouldShowPlaceholder(context.value) ? createPortal(itemTextProps.children, context.valueNode) : null
      ] });
    }
  );
  SelectItemText.displayName = ITEM_TEXT_NAME;
  var ITEM_INDICATOR_NAME2 = "SelectItemIndicator";
  var SelectItemIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...itemIndicatorProps } = props;
      const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME2, __scopeSelect);
      return itemContext.isSelected ? /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...itemIndicatorProps, ref: forwardedRef }) : null;
    }
  );
  SelectItemIndicator.displayName = ITEM_INDICATOR_NAME2;
  var SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
  var SelectScrollUpButton = forwardRef((props, forwardedRef) => {
    const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const canScrollUp2 = viewport.scrollTop > 0;
          setCanScrollUp(canScrollUp2);
        };
        var handleScroll2 = handleScroll22;
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollUp ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  });
  SelectScrollUpButton.displayName = SCROLL_UP_BUTTON_NAME;
  var SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
  var SelectScrollDownButton = forwardRef((props, forwardedRef) => {
    const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const maxScroll = viewport.scrollHeight - viewport.clientHeight;
          const canScrollDown2 = Math.ceil(viewport.scrollTop) < maxScroll;
          setCanScrollDown(canScrollDown2);
        };
        var handleScroll2 = handleScroll22;
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollDown ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  });
  SelectScrollDownButton.displayName = SCROLL_DOWN_BUTTON_NAME;
  var SelectScrollButtonImpl = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
    const contentContext = useSelectContentContext("SelectScrollButton", __scopeSelect);
    const autoScrollTimerRef = useRef(null);
    const getItems = useCollection3(__scopeSelect);
    const clearAutoScrollTimer = useCallback(() => {
      if (autoScrollTimerRef.current !== null) {
        window.clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    }, []);
    useEffect(() => {
      return () => clearAutoScrollTimer();
    }, [clearAutoScrollTimer]);
    useLayoutEffect2(() => {
      const activeItem = getItems().find((item) => item.ref.current === document.activeElement);
      activeItem?.ref.current?.scrollIntoView({ block: "nearest" });
    }, [getItems]);
    return /* @__PURE__ */ jsx(
      Primitive.div,
      {
        "aria-hidden": true,
        ...scrollIndicatorProps,
        ref: forwardedRef,
        style: { flexShrink: 0, ...scrollIndicatorProps.style },
        onPointerDown: composeEventHandlers(scrollIndicatorProps.onPointerDown, () => {
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerMove: composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
          contentContext.onItemLeave?.();
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerLeave: composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
          clearAutoScrollTimer();
        })
      }
    );
  });
  var SEPARATOR_NAME3 = "SelectSeparator";
  var SelectSeparator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { "aria-hidden": true, ...separatorProps, ref: forwardedRef });
    }
  );
  SelectSeparator.displayName = SEPARATOR_NAME3;
  var ARROW_NAME4 = "SelectArrow";
  var SelectArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...arrowProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
      const contentContext = useSelectContentContext(ARROW_NAME4, __scopeSelect);
      return contentContext.position === "popper" ? /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef }) : null;
    }
  );
  SelectArrow.displayName = ARROW_NAME4;
  var BUBBLE_INPUT_NAME2 = "SelectBubbleInput";
  var SelectBubbleInput = forwardRef(
    ({ __scopeSelect, ...props }, forwardedRef) => {
      const context = useSelectContext(BUBBLE_INPUT_NAME2, __scopeSelect);
      const { value, onValueChange, required, disabled, name, autoComplete, form } = context;
      const { nativeOptions, nativeSelectKey } = context;
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const selectValue = value ?? "";
      const prevValue = usePrevious(selectValue);
      const hasEmptyValueOption = Array.from(nativeOptions).some(
        (option) => (option.props.value ?? "") === ""
      );
      useEffect(() => {
        const select = ref.current;
        if (!select) return;
        const selectProto = window.HTMLSelectElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          selectProto,
          "value"
        );
        const setValue = descriptor.set;
        if (prevValue !== selectValue && setValue) {
          const event = new Event("change", { bubbles: true });
          setValue.call(select, selectValue);
          select.dispatchEvent(event);
        }
      }, [prevValue, selectValue]);
      return /* @__PURE__ */ jsxs(
        Primitive.select,
        {
          "aria-hidden": true,
          required,
          tabIndex: -1,
          name,
          autoComplete,
          disabled,
          form,
          onChange: (event) => onValueChange(event.target.value),
          ...props,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style },
          ref: composedRefs,
          defaultValue: selectValue,
          children: [
            shouldShowPlaceholder(value) && !hasEmptyValueOption ? /* @__PURE__ */ jsx("option", { value: "" }) : null,
            Array.from(nativeOptions)
          ]
        },
        nativeSelectKey
      );
    }
  );
  SelectBubbleInput.displayName = BUBBLE_INPUT_NAME2;
  function isFunction3(value) {
    return typeof value === "function";
  }
  function shouldShowPlaceholder(value) {
    return value === "" || value === void 0;
  }
  function useTypeaheadSearch(onSearchChange) {
    const handleSearchChange = useCallbackRef(onSearchChange);
    const searchRef = useRef("");
    const timerRef = useRef(0);
    const handleTypeaheadSearch = useCallback(
      (key) => {
        const search = searchRef.current + key;
        handleSearchChange(search);
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
      },
      [handleSearchChange]
    );
    const resetTypeahead = useCallback(() => {
      searchRef.current = "";
      window.clearTimeout(timerRef.current);
    }, []);
    useEffect(() => {
      return () => window.clearTimeout(timerRef.current);
    }, []);
    return [searchRef, handleTypeaheadSearch, resetTypeahead];
  }
  function findNextItem(items, search, currentItem) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
    let wrappedItems = wrapArray3(items, Math.max(currentItemIndex, 0));
    const excludeCurrentItem = normalizedSearch.length === 1;
    if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
    const nextItem = wrappedItems.find(
      (item) => item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextItem !== currentItem ? nextItem : void 0;
  }
  function wrapArray3(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }

  // ../../node_modules/.pnpm/@radix-ui+react-separator@1.1.11_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-separator/dist/index.mjs
  var dist_exports10 = {};
  __export(dist_exports10, {
    Root: () => Root4,
    Separator: () => Separator3
  });
  var NAME3 = "Separator";
  var DEFAULT_ORIENTATION = "horizontal";
  var ORIENTATIONS = ["horizontal", "vertical"];
  var Separator3 = forwardRef((props, forwardedRef) => {
    const { decorative, orientation: orientationProp = DEFAULT_ORIENTATION, ...domProps } = props;
    const orientation = isValidOrientation(orientationProp) ? orientationProp : DEFAULT_ORIENTATION;
    const ariaOrientation = orientation === "vertical" ? orientation : void 0;
    const semanticProps = decorative ? { role: "none" } : { "aria-orientation": ariaOrientation, role: "separator" };
    return /* @__PURE__ */ jsx(
      Primitive.div,
      {
        "data-orientation": orientation,
        ...semanticProps,
        ...domProps,
        ref: forwardedRef
      }
    );
  });
  Separator3.displayName = NAME3;
  function isValidOrientation(orientation) {
    return ORIENTATIONS.includes(orientation);
  }
  var Root4 = Separator3;

  // ../../node_modules/.pnpm/@radix-ui+react-tabs@1.1.17_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-tabs/dist/index.mjs
  var dist_exports11 = {};
  __export(dist_exports11, {
    Content: () => Content3,
    List: () => List,
    Root: () => Root23,
    Tabs: () => Tabs,
    TabsContent: () => TabsContent,
    TabsList: () => TabsList,
    TabsTrigger: () => TabsTrigger,
    Trigger: () => Trigger2,
    createTabsScope: () => createTabsScope
  });
  var TABS_NAME = "Tabs";
  var [createTabsContext, createTabsScope] = createContextScope(TABS_NAME, [
    createRovingFocusGroupScope
  ]);
  var useRovingFocusGroupScope2 = createRovingFocusGroupScope();
  var [TabsProvider, useTabsContext] = createTabsContext(TABS_NAME);
  var Tabs = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeTabs,
        value: valueProp,
        onValueChange,
        defaultValue,
        orientation = "horizontal",
        dir,
        activationMode = "automatic",
        ...tabsProps
      } = props;
      const direction = useDirection(dir);
      const [value, setValue] = useControllableState({
        prop: valueProp,
        onChange: onValueChange,
        defaultProp: defaultValue ?? "",
        caller: TABS_NAME
      });
      return /* @__PURE__ */ jsx(
        TabsProvider,
        {
          scope: __scopeTabs,
          baseId: useId2(),
          value,
          onValueChange: setValue,
          orientation,
          dir: direction,
          activationMode,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              dir: direction,
              "data-orientation": orientation,
              ...tabsProps,
              ref: forwardedRef
            }
          )
        }
      );
    }
  );
  Tabs.displayName = TABS_NAME;
  var TAB_LIST_NAME = "TabsList";
  var TabsList = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, loop = true, ...listProps } = props;
      const context = useTabsContext(TAB_LIST_NAME, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      return /* @__PURE__ */ jsx(
        Root3,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          orientation: context.orientation,
          dir: context.dir,
          loop,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              role: "tablist",
              "aria-orientation": context.orientation,
              ...listProps,
              ref: forwardedRef
            }
          )
        }
      );
    }
  );
  TabsList.displayName = TAB_LIST_NAME;
  var TRIGGER_NAME5 = "TabsTrigger";
  var TabsTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, value, disabled = false, ...triggerProps } = props;
      const context = useTabsContext(TRIGGER_NAME5, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      return /* @__PURE__ */ jsx(
        Item,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          focusable: !disabled,
          active: isSelected,
          children: /* @__PURE__ */ jsx(
            Primitive.button,
            {
              type: "button",
              role: "tab",
              "aria-selected": isSelected,
              "aria-controls": contentId,
              "data-state": isSelected ? "active" : "inactive",
              "data-disabled": disabled ? "" : void 0,
              disabled,
              id: triggerId,
              ...triggerProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!disabled && event.button === 0 && event.ctrlKey === false) {
                  context.onValueChange(value);
                } else {
                  event.preventDefault();
                }
              }),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (disabled || event.target !== event.currentTarget) {
                  return;
                }
                if ([" ", "Enter"].includes(event.key)) {
                  context.onValueChange(value);
                }
              }),
              onFocus: composeEventHandlers(props.onFocus, () => {
                const isAutomaticActivation = context.activationMode !== "manual";
                if (!isSelected && !disabled && isAutomaticActivation) {
                  context.onValueChange(value);
                }
              })
            }
          )
        }
      );
    }
  );
  TabsTrigger.displayName = TRIGGER_NAME5;
  var CONTENT_NAME6 = "TabsContent";
  var TabsContent = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTabs, value, forceMount, children, ...contentProps } = props;
      const context = useTabsContext(CONTENT_NAME6, __scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      const isMountAnimationPreventedRef = useRef(isSelected);
      useEffect(() => {
        const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
        return () => cancelAnimationFrame(rAF);
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || isSelected, children: ({ present }) => /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-state": isSelected ? "active" : "inactive",
          "data-orientation": context.orientation,
          role: "tabpanel",
          "aria-labelledby": triggerId,
          hidden: !present,
          id: contentId,
          tabIndex: 0,
          ...contentProps,
          ref: forwardedRef,
          style: {
            ...props.style,
            animationDuration: isMountAnimationPreventedRef.current ? "0s" : void 0
          },
          children: present && children
        }
      ) });
    }
  );
  TabsContent.displayName = CONTENT_NAME6;
  function makeTriggerId(baseId, value) {
    return `${baseId}-trigger-${value}`;
  }
  function makeContentId(baseId, value) {
    return `${baseId}-content-${value}`;
  }
  var Root23 = Tabs;
  var List = TabsList;
  var Trigger2 = TabsTrigger;
  var Content3 = TabsContent;

  // ../../node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
  var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
  var cx = clsx;
  var cva = (base, config) => (props) => {
    var _config_compoundVariants;
    if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    const { variants, defaultVariants } = config;
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = props === null || props === void 0 ? void 0 : props[variant];
      const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
      if (variantProp === null) return null;
      const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
      return variants[variant][variantKey];
    });
    const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
      let [key, value] = param;
      if (value === void 0) {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
    const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
      let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
      return Object.entries(compoundVariantOptions).every((param2) => {
        let [key, value] = param2;
        return Array.isArray(value) ? value.includes({
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key]) : {
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key] === value;
      }) ? [
        ...acc,
        cvClass,
        cvClassName
      ] : acc;
    }, []);
    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  };

  // ../../node_modules/.pnpm/cmdk@1.1.1_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/cmdk/dist/chunk-NZJY6EH4.mjs
  var U = 1;
  var Y = 0.9;
  var H = 0.8;
  var J = 0.17;
  var p = 0.1;
  var u = 0.999;
  var $ = 0.9999;
  var k = 0.99;
  var m = /[\\\/_+.#"@\[\(\{&]/;
  var B = /[\\\/_+.#"@\[\(\{&]/g;
  var K = /[\s-]/;
  var X2 = /[\s-]/g;
  function G(_, C2, h, P2, A2, f, O) {
    if (f === C2.length) return A2 === _.length ? U : k;
    var T3 = `${A2},${f}`;
    if (O[T3] !== void 0) return O[T3];
    for (var L2 = P2.charAt(f), c = h.indexOf(L2, A2), S = 0, E, N2, R, M; c >= 0; ) E = G(_, C2, h, P2, c + 1, f + 1, O), E > S && (c === A2 ? E *= U : m.test(_.charAt(c - 1)) ? (E *= H, R = _.slice(A2, c - 1).match(B), R && A2 > 0 && (E *= Math.pow(u, R.length))) : K.test(_.charAt(c - 1)) ? (E *= Y, M = _.slice(A2, c - 1).match(X2), M && A2 > 0 && (E *= Math.pow(u, M.length))) : (E *= J, A2 > 0 && (E *= Math.pow(u, c - A2))), _.charAt(c) !== C2.charAt(f) && (E *= $)), (E < p && h.charAt(c - 1) === P2.charAt(f + 1) || P2.charAt(f + 1) === P2.charAt(f) && h.charAt(c - 1) !== P2.charAt(f)) && (N2 = G(_, C2, h, P2, c + 1, f + 2, O), N2 * p > E && (E = N2 * p)), E > S && (S = E), c = h.indexOf(L2, c + 1);
    return O[T3] = S, S;
  }
  function D(_) {
    return _.toLowerCase().replace(X2, " ");
  }
  function W(_, C2, h) {
    return _ = h && h.length > 0 ? `${_ + " " + h.join(" ")}` : _, G(_, C2, D(_), D(C2), 0, 0, {});
  }

  // ../../node_modules/.pnpm/@radix-ui+primitive@1.1.4/node_modules/@radix-ui/primitive/dist/index.mjs
  var canUseDOM2 = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers2(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    };
  }

  // ../../node_modules/.pnpm/@radix-ui+react-context@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-context/dist/index.mjs
  function createContextScope2(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider = (props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      };
      Provider.displayName = rootComponentName + "Provider";
      function useContext2(consumerName, scope) {
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const context = useContext(Context);
        if (context) return context;
        if (defaultContext !== void 0) return defaultContext;
        throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
      }
      return [Provider, useContext2];
    }
    const createScope = () => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return createContext(defaultContext);
      });
      return function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      };
    };
    createScope.scopeName = scopeName;
    return [createContext3, composeContextScopes2(createScope, ...createContextScopeDeps)];
  }
  function composeContextScopes2(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = () => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      };
    };
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }

  // ../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.6_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-primitive/dist/index.mjs
  var NODES2 = [
    "a",
    "button",
    "div",
    "form",
    "h2",
    "h3",
    "img",
    "input",
    "label",
    "li",
    "nav",
    "ol",
    "p",
    "select",
    "span",
    "svg",
    "ul"
  ];
  var Primitive2 = NODES2.reduce((primitive, node) => {
    const Slot6 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot6 : node;
      if (typeof window !== "undefined") {
        window[/* @__PURE__ */ Symbol.for("radix-ui")] = true;
      }
      return /* @__PURE__ */ jsx(Comp, { ...primitiveProps, ref: forwardedRef });
    });
    Node2.displayName = `Primitive.${node}`;
    return { ...primitive, [node]: Node2 };
  }, {});
  function dispatchDiscreteCustomEvent2(target, event) {
    if (target) flushSync(() => target.dispatchEvent(event));
  }

  // ../../node_modules/.pnpm/@radix-ui+react-use-escape-keydown@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-escape-keydown/dist/index.mjs
  function useEscapeKeydown(onEscapeKeyDownProp, ownerDocument = globalThis?.document) {
    const onEscapeKeyDown = useCallbackRef(onEscapeKeyDownProp);
    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          onEscapeKeyDown(event);
        }
      };
      ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [onEscapeKeyDown, ownerDocument]);
  }

  // ../../node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.13_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var DISMISSABLE_LAYER_NAME2 = "DismissableLayer";
  var CONTEXT_UPDATE2 = "dismissableLayer.update";
  var POINTER_DOWN_OUTSIDE2 = "dismissableLayer.pointerDownOutside";
  var FOCUS_OUTSIDE2 = "dismissableLayer.focusOutside";
  var originalBodyPointerEvents2;
  var DismissableLayerContext2 = createContext({
    layers: /* @__PURE__ */ new Set(),
    layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
    branches: /* @__PURE__ */ new Set(),
    // Outside elements that belong to a layer's own dismiss affordance (eg, a
    // dialog overlay). Pressing them should dismiss the layer regardless of
    // whether or not they stop propagation.
    //
    // See https://github.com/radix-ui/primitives/issues/3346
    dismissableSurfaces: /* @__PURE__ */ new Set()
  });
  var DismissableLayer2 = forwardRef(
    (props, forwardedRef) => {
      const {
        disableOutsidePointerEvents = false,
        deferPointerDownOutside = false,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        ...layerProps
      } = props;
      const context = useContext(DismissableLayerContext2);
      const [node, setNode] = useState(null);
      const ownerDocument = node?.ownerDocument ?? globalThis?.document;
      const [, force] = useState({});
      const composedRefs = useComposedRefs(forwardedRef, (node2) => setNode(node2));
      const layers = Array.from(context.layers);
      const [highestLayerWithOutsidePointerEventsDisabled] = [...context.layersWithOutsidePointerEventsDisabled].slice(-1);
      const highestLayerWithOutsidePointerEventsDisabledIndex = layers.indexOf(highestLayerWithOutsidePointerEventsDisabled);
      const index2 = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index2 >= highestLayerWithOutsidePointerEventsDisabledIndex;
      const isDeferredPointerDownOutsideRef = useRef(false);
      const pointerDownOutside = usePointerDownOutside2(
        (event) => {
          const target = event.target;
          if (!(target instanceof Node)) {
            return;
          }
          const isPointerDownOnBranch = [...context.branches].some(
            (branch) => branch.contains(target)
          );
          if (!isPointerEventsEnabled || isPointerDownOnBranch) return;
          onPointerDownOutside?.(event);
          onInteractOutside?.(event);
          if (!event.defaultPrevented) onDismiss?.();
        },
        {
          ownerDocument,
          deferPointerDownOutside,
          isDeferredPointerDownOutsideRef,
          dismissableSurfaces: context.dismissableSurfaces
        }
      );
      const focusOutside = useFocusOutside2((event) => {
        if (deferPointerDownOutside && isDeferredPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
        if (isFocusInBranch) return;
        onFocusOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      useEscapeKeydown((event) => {
        const isHighestLayer = index2 === context.layers.size - 1;
        if (!isHighestLayer) return;
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented && onDismiss) {
          event.preventDefault();
          onDismiss();
        }
      }, ownerDocument);
      useEffect(() => {
        if (!node) return;
        if (disableOutsidePointerEvents) {
          if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
            originalBodyPointerEvents2 = ownerDocument.body.style.pointerEvents;
            ownerDocument.body.style.pointerEvents = "none";
          }
          context.layersWithOutsidePointerEventsDisabled.add(node);
        }
        context.layers.add(node);
        dispatchUpdate2();
        return () => {
          if (disableOutsidePointerEvents) {
            context.layersWithOutsidePointerEventsDisabled.delete(node);
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
              ownerDocument.body.style.pointerEvents = originalBodyPointerEvents2;
            }
          }
        };
      }, [node, ownerDocument, disableOutsidePointerEvents, context]);
      useEffect(() => {
        return () => {
          if (!node) return;
          context.layers.delete(node);
          context.layersWithOutsidePointerEventsDisabled.delete(node);
          dispatchUpdate2();
        };
      }, [node, context]);
      useEffect(() => {
        const handleUpdate = () => force({});
        document.addEventListener(CONTEXT_UPDATE2, handleUpdate);
        return () => document.removeEventListener(CONTEXT_UPDATE2, handleUpdate);
      }, []);
      return /* @__PURE__ */ jsx(
        Primitive2.div,
        {
          ...layerProps,
          ref: composedRefs,
          style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? "auto" : "none" : void 0,
            ...props.style
          },
          onFocusCapture: composeEventHandlers2(props.onFocusCapture, focusOutside.onFocusCapture),
          onBlurCapture: composeEventHandlers2(props.onBlurCapture, focusOutside.onBlurCapture),
          onPointerDownCapture: composeEventHandlers2(
            props.onPointerDownCapture,
            pointerDownOutside.onPointerDownCapture
          )
        }
      );
    }
  );
  DismissableLayer2.displayName = DISMISSABLE_LAYER_NAME2;
  var BRANCH_NAME2 = "DismissableLayerBranch";
  var DismissableLayerBranch2 = forwardRef((props, forwardedRef) => {
    const context = useContext(DismissableLayerContext2);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        context.branches.add(node);
        return () => {
          context.branches.delete(node);
        };
      }
    }, [context.branches]);
    return /* @__PURE__ */ jsx(Primitive2.div, { ...props, ref: composedRefs });
  });
  DismissableLayerBranch2.displayName = BRANCH_NAME2;
  function useDismissableLayerSurface2() {
    const context = useContext(DismissableLayerContext2);
    const [node, setNode] = useState(null);
    useEffect(() => {
      if (!node) {
        return;
      }
      context.dismissableSurfaces.add(node);
      return () => {
        context.dismissableSurfaces.delete(node);
      };
    }, [node, context.dismissableSurfaces]);
    return setNode;
  }
  function usePointerDownOutside2(onPointerDownOutside, args) {
    const {
      ownerDocument = globalThis?.document,
      deferPointerDownOutside = false,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces
    } = args;
    const handlePointerDownOutside = useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = useRef(false);
    const isPointerDownOutsideRef = useRef(false);
    const interceptedOutsideInteractionEventsRef = useRef(/* @__PURE__ */ new Map());
    const handleClickRef = useRef(() => {
    });
    useEffect(() => {
      function resetOutsideInteraction() {
        isPointerDownOutsideRef.current = false;
        isDeferredPointerDownOutsideRef.current = false;
        interceptedOutsideInteractionEventsRef.current.clear();
      }
      function isOutsideInteractionIntercepted() {
        return Array.from(interceptedOutsideInteractionEventsRef.current.values()).some(Boolean);
      }
      function handleInteractionCapture(event) {
        if (!isPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isDismissableSurface = target instanceof Node && [...dismissableSurfaces].some((surface) => surface.contains(target));
        if (!isDismissableSurface) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, true);
        }
        if (event.type === "click") {
          window.setTimeout(() => {
            if (isPointerDownOutsideRef.current) {
              handleClickRef.current();
            }
          }, 0);
        }
      }
      function handleInteractionBubble(event) {
        if (isPointerDownOutsideRef.current) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, false);
        }
      }
      const handlePointerDown = (event) => {
        if (event.target && !isPointerInsideReactTreeRef.current) {
          let handleAndDispatchPointerDownOutsideEvent2 = function() {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            const wasOutsideInteractionIntercepted = isOutsideInteractionIntercepted();
            resetOutsideInteraction();
            if (!wasOutsideInteractionIntercepted) {
              handleAndDispatchCustomEvent2(
                POINTER_DOWN_OUTSIDE2,
                handlePointerDownOutside,
                eventDetail,
                { discrete: true }
              );
            }
          };
          var handleAndDispatchPointerDownOutsideEvent = handleAndDispatchPointerDownOutsideEvent2;
          const eventDetail = { originalEvent: event };
          isPointerDownOutsideRef.current = true;
          isDeferredPointerDownOutsideRef.current = deferPointerDownOutside && event.button === 0;
          interceptedOutsideInteractionEventsRef.current.clear();
          if (!deferPointerDownOutside || event.button !== 0) {
            handleAndDispatchPointerDownOutsideEvent2();
          } else {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            handleClickRef.current = handleAndDispatchPointerDownOutsideEvent2;
            ownerDocument.addEventListener("click", handleClickRef.current, { once: true });
          }
        } else {
          ownerDocument.removeEventListener("click", handleClickRef.current);
          resetOutsideInteraction();
        }
        isPointerInsideReactTreeRef.current = false;
      };
      const outsideInteractionEvents = [
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "click"
      ];
      for (const eventName of outsideInteractionEvents) {
        ownerDocument.addEventListener(eventName, handleInteractionCapture, true);
        ownerDocument.addEventListener(eventName, handleInteractionBubble);
      }
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener("pointerdown", handlePointerDown);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener("pointerdown", handlePointerDown);
        ownerDocument.removeEventListener("click", handleClickRef.current);
        for (const eventName of outsideInteractionEvents) {
          ownerDocument.removeEventListener(eventName, handleInteractionCapture, true);
          ownerDocument.removeEventListener(eventName, handleInteractionBubble);
        }
      };
    }, [
      ownerDocument,
      handlePointerDownOutside,
      deferPointerDownOutside,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces
    ]);
    return {
      // ensures we check React component tree (not just DOM tree)
      onPointerDownCapture: () => isPointerInsideReactTreeRef.current = true
    };
  }
  function useFocusOutside2(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = useRef(false);
    useEffect(() => {
      const handleFocus = (event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent2(FOCUS_OUTSIDE2, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      };
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: () => isFocusInsideReactTreeRef.current = true,
      onBlurCapture: () => isFocusInsideReactTreeRef.current = false
    };
  }
  function dispatchUpdate2() {
    const event = new CustomEvent(CONTEXT_UPDATE2);
    document.dispatchEvent(event);
  }
  function handleAndDispatchCustomEvent2(name, handler, detail, { discrete }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
    if (handler) target.addEventListener(name, handler, { once: true });
    if (discrete) {
      dispatchDiscreteCustomEvent2(target, event);
    } else {
      target.dispatchEvent(event);
    }
  }

  // ../../node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.10_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  var AUTOFOCUS_ON_MOUNT2 = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT2 = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS3 = { bubbles: false, cancelable: true };
  var FOCUS_SCOPE_NAME2 = "FocusScope";
  var FocusScope2 = forwardRef((props, forwardedRef) => {
    const {
      loop = false,
      trapped = false,
      onMountAutoFocus: onMountAutoFocusProp,
      onUnmountAutoFocus: onUnmountAutoFocusProp,
      ...scopeProps
    } = props;
    const [container, setContainer] = useState(null);
    const onMountAutoFocus = useCallbackRef(onMountAutoFocusProp);
    const onUnmountAutoFocus = useCallbackRef(onUnmountAutoFocusProp);
    const lastFocusedElementRef = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, (node) => setContainer(node));
    const focusScope = useRef({
      paused: false,
      pause() {
        this.paused = true;
      },
      resume() {
        this.paused = false;
      }
    }).current;
    useEffect(() => {
      if (trapped) {
        let handleFocusIn2 = function(event) {
          if (focusScope.paused || !container) return;
          const target = event.target;
          if (container.contains(target)) {
            lastFocusedElementRef.current = target;
          } else {
            focus2(lastFocusedElementRef.current, { select: true });
          }
        }, handleFocusOut2 = function(event) {
          if (focusScope.paused || !container) return;
          const relatedTarget = event.relatedTarget;
          if (relatedTarget === null) return;
          if (!container.contains(relatedTarget)) {
            focus2(lastFocusedElementRef.current, { select: true });
          }
        }, handleMutations2 = function(mutations) {
          const focusedElement = document.activeElement;
          if (focusedElement !== document.body) return;
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) focus2(container);
          }
        };
        var handleFocusIn = handleFocusIn2, handleFocusOut = handleFocusOut2, handleMutations = handleMutations2;
        document.addEventListener("focusin", handleFocusIn2);
        document.addEventListener("focusout", handleFocusOut2);
        const mutationObserver = new MutationObserver(handleMutations2);
        if (container) mutationObserver.observe(container, { childList: true, subtree: true });
        return () => {
          document.removeEventListener("focusin", handleFocusIn2);
          document.removeEventListener("focusout", handleFocusOut2);
          mutationObserver.disconnect();
        };
      }
    }, [trapped, container, focusScope.paused]);
    useEffect(() => {
      if (container) {
        focusScopesStack2.add(focusScope);
        const previouslyFocusedElement = document.activeElement;
        const hasFocusedCandidate = container.contains(previouslyFocusedElement);
        if (!hasFocusedCandidate) {
          const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT2, EVENT_OPTIONS3);
          container.addEventListener(AUTOFOCUS_ON_MOUNT2, onMountAutoFocus);
          container.dispatchEvent(mountEvent);
          if (!mountEvent.defaultPrevented) {
            focusFirst4(removeLinks2(getTabbableCandidates2(container)), { select: true });
            if (document.activeElement === previouslyFocusedElement) {
              focus2(container);
            }
          }
        }
        return () => {
          container.removeEventListener(AUTOFOCUS_ON_MOUNT2, onMountAutoFocus);
          setTimeout(() => {
            const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT2, EVENT_OPTIONS3);
            container.addEventListener(AUTOFOCUS_ON_UNMOUNT2, onUnmountAutoFocus);
            container.dispatchEvent(unmountEvent);
            if (!unmountEvent.defaultPrevented) {
              focus2(previouslyFocusedElement ?? document.body, { select: true });
            }
            container.removeEventListener(AUTOFOCUS_ON_UNMOUNT2, onUnmountAutoFocus);
            focusScopesStack2.remove(focusScope);
          }, 0);
        };
      }
    }, [container, onMountAutoFocus, onUnmountAutoFocus, focusScope]);
    const handleKeyDown = useCallback(
      (event) => {
        if (!loop && !trapped) return;
        if (focusScope.paused) return;
        const isTabKey = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
        const focusedElement = document.activeElement;
        if (isTabKey && focusedElement) {
          const container2 = event.currentTarget;
          const [first, last] = getTabbableEdges2(container2);
          const hasTabbableElementsInside = first && last;
          if (!hasTabbableElementsInside) {
            if (focusedElement === container2) event.preventDefault();
          } else {
            if (!event.shiftKey && focusedElement === last) {
              event.preventDefault();
              if (loop) focus2(first, { select: true });
            } else if (event.shiftKey && focusedElement === first) {
              event.preventDefault();
              if (loop) focus2(last, { select: true });
            }
          }
        }
      },
      [loop, trapped, focusScope.paused]
    );
    return /* @__PURE__ */ jsx(Primitive2.div, { tabIndex: -1, ...scopeProps, ref: composedRefs, onKeyDown: handleKeyDown });
  });
  FocusScope2.displayName = FOCUS_SCOPE_NAME2;
  function focusFirst4(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus2(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  function getTabbableEdges2(container) {
    const candidates = getTabbableCandidates2(container);
    const first = findVisible2(candidates, container);
    const last = findVisible2(candidates.reverse(), container);
    return [first, last];
  }
  function getTabbableCandidates2(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function findVisible2(elements, container) {
    for (const element of elements) {
      if (!isHidden2(element, { upTo: container })) return element;
    }
  }
  function isHidden2(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  function isSelectableInput2(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  function focus2(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput2(element) && select)
        element.select();
    }
  }
  var focusScopesStack2 = createFocusScopesStack2();
  function createFocusScopesStack2() {
    let stack = [];
    return {
      add(focusScope) {
        const activeFocusScope = stack[0];
        if (focusScope !== activeFocusScope) {
          activeFocusScope?.pause();
        }
        stack = arrayRemove2(stack, focusScope);
        stack.unshift(focusScope);
      },
      remove(focusScope) {
        stack = arrayRemove2(stack, focusScope);
        stack[0]?.resume();
      }
    };
  }
  function arrayRemove2(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  function removeLinks2(items) {
    return items.filter((item) => item.tagName !== "A");
  }

  // ../../node_modules/.pnpm/@radix-ui+react-portal@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-portal/dist/index.mjs
  var PORTAL_NAME6 = "Portal";
  var Portal3 = forwardRef((props, forwardedRef) => {
    const { container: containerProp, ...portalProps } = props;
    const [mounted, setMounted] = useState(false);
    useLayoutEffect2(() => setMounted(true), []);
    const container = containerProp || mounted && globalThis?.document?.body;
    return container ? createPortal(/* @__PURE__ */ jsx(Primitive2.div, { ...portalProps, ref: forwardedRef }), container) : null;
  });
  Portal3.displayName = PORTAL_NAME6;

  // ../../node_modules/.pnpm/@radix-ui+react-presence@1.1.6_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-presence/dist/index.mjs
  function useStateMachine2(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var Presence2 = (props) => {
    const { present, children } = props;
    const presence = usePresence2(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : Children.only(children);
    const ref = useStableComposedRefs2(presence.ref, getElementRef3(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? cloneElement(child, { ref }) : null;
  };
  Presence2.displayName = "Presence";
  function usePresence2(present) {
    const [node, setNode] = useState();
    const stylesRef = useRef(null);
    const prevPresentRef = useRef(present);
    const prevAnimationNameRef = useRef("none");
    const initialState = present ? "mounted" : "unmounted";
    const [state, send] = useStateMachine2(initialState, {
      mounted: {
        UNMOUNT: "unmounted",
        ANIMATION_OUT: "unmountSuspended"
      },
      unmountSuspended: {
        MOUNT: "mounted",
        ANIMATION_END: "unmounted"
      },
      unmounted: {
        MOUNT: "mounted"
      }
    });
    useEffect(() => {
      const currentAnimationName = getAnimationName2(stylesRef.current);
      prevAnimationNameRef.current = state === "mounted" ? currentAnimationName : "none";
    }, [state]);
    useLayoutEffect2(() => {
      const styles = stylesRef.current;
      const wasPresent = prevPresentRef.current;
      const hasPresentChanged = wasPresent !== present;
      if (hasPresentChanged) {
        const prevAnimationName = prevAnimationNameRef.current;
        const currentAnimationName = getAnimationName2(styles);
        if (present) {
          send("MOUNT");
        } else if (currentAnimationName === "none" || styles?.display === "none") {
          send("UNMOUNT");
        } else {
          const isAnimating = prevAnimationName !== currentAnimationName;
          if (wasPresent && isAnimating) {
            send("ANIMATION_OUT");
          } else {
            send("UNMOUNT");
          }
        }
        prevPresentRef.current = present;
      }
    }, [present, send]);
    useLayoutEffect2(() => {
      if (node) {
        let timeoutId;
        const ownerWindow = node.ownerDocument.defaultView ?? window;
        const handleAnimationEnd = (event) => {
          const currentAnimationName = getAnimationName2(stylesRef.current);
          const isCurrentAnimation = currentAnimationName.includes(CSS.escape(event.animationName));
          if (event.target === node && isCurrentAnimation) {
            send("ANIMATION_END");
            if (!prevPresentRef.current) {
              const currentFillMode = node.style.animationFillMode;
              node.style.animationFillMode = "forwards";
              timeoutId = ownerWindow.setTimeout(() => {
                if (node.style.animationFillMode === "forwards") {
                  node.style.animationFillMode = currentFillMode;
                }
              });
            }
          }
        };
        const handleAnimationStart = (event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName2(stylesRef.current);
          }
        };
        node.addEventListener("animationstart", handleAnimationStart);
        node.addEventListener("animationcancel", handleAnimationEnd);
        node.addEventListener("animationend", handleAnimationEnd);
        return () => {
          ownerWindow.clearTimeout(timeoutId);
          node.removeEventListener("animationstart", handleAnimationStart);
          node.removeEventListener("animationcancel", handleAnimationEnd);
          node.removeEventListener("animationend", handleAnimationEnd);
        };
      } else {
        send("ANIMATION_END");
      }
    }, [node, send]);
    return {
      isPresent: ["mounted", "unmountSuspended"].includes(state),
      ref: useCallback((node2) => {
        stylesRef.current = node2 ? getComputedStyle(node2) : null;
        setNode(node2);
      }, [])
    };
  }
  function setRef3(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function useStableComposedRefs2(...refs) {
    const refsRef = useRef(refs);
    refsRef.current = refs;
    return useCallback((node) => {
      const currentRefs = refsRef.current;
      let hasCleanup = false;
      const cleanups = currentRefs.map((ref) => {
        const cleanup = setRef3(ref, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup === "function") {
              cleanup();
            } else {
              setRef3(currentRefs[i], null);
            }
          }
        };
      }
    }, []);
  }
  function getAnimationName2(styles) {
    return styles?.animationName || "none";
  }
  function getElementRef3(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }

  // ../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.17_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var DIALOG_NAME2 = "Dialog";
  var [createDialogContext2, createDialogScope2] = createContextScope2(DIALOG_NAME2);
  var [DialogProvider2, useDialogContext2] = createDialogContext2(DIALOG_NAME2);
  var Dialog2 = (props) => {
    const {
      __scopeDialog,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const triggerRef = useRef(null);
    const contentRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DIALOG_NAME2
    });
    return /* @__PURE__ */ jsx(
      DialogProvider2,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId2(),
        titleId: useId2(),
        descriptionId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  };
  Dialog2.displayName = DIALOG_NAME2;
  var TRIGGER_NAME6 = "DialogTrigger";
  var DialogTrigger2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...triggerProps } = props;
      const context = useDialogContext2(TRIGGER_NAME6, __scopeDialog);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(
        Primitive2.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState3(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers2(props.onClick, context.onOpenToggle)
        }
      );
    }
  );
  DialogTrigger2.displayName = TRIGGER_NAME6;
  var PORTAL_NAME7 = "DialogPortal";
  var [PortalProvider4, usePortalContext4] = createDialogContext2(PORTAL_NAME7, {
    forceMount: void 0
  });
  var DialogPortal2 = (props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext2(PORTAL_NAME7, __scopeDialog);
    return /* @__PURE__ */ jsx(PortalProvider4, { scope: __scopeDialog, forceMount, children: Children.map(children, (child) => /* @__PURE__ */ jsx(Presence2, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal3, { asChild: true, container, children: child }) })) });
  };
  DialogPortal2.displayName = PORTAL_NAME7;
  var OVERLAY_NAME2 = "DialogOverlay";
  var DialogOverlay2 = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext4(OVERLAY_NAME2, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext2(OVERLAY_NAME2, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ jsx(Presence2, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(DialogOverlayImpl2, { ...overlayProps, ref: forwardedRef }) }) : null;
    }
  );
  DialogOverlay2.displayName = OVERLAY_NAME2;
  var Slot5 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...overlayProps } = props;
      const context = useDialogContext2(OVERLAY_NAME2, __scopeDialog);
      const registerDismissableSurface = useDismissableLayerSurface2();
      const composedRefs = useComposedRefs(forwardedRef, registerDismissableSurface);
      return (
        // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
        // ie. when `Overlay` and `Content` are siblings
        /* @__PURE__ */ jsx(Combination_default, { as: Slot5, allowPinchZoom: true, shards: [context.contentRef], children: /* @__PURE__ */ jsx(
          Primitive2.div,
          {
            "data-state": getState3(context.open),
            ...overlayProps,
            ref: composedRefs,
            style: { pointerEvents: "auto", ...overlayProps.style }
          }
        ) })
      );
    }
  );
  var CONTENT_NAME7 = "DialogContent";
  var DialogContent2 = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext4(CONTENT_NAME7, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext2(CONTENT_NAME7, props.__scopeDialog);
      return /* @__PURE__ */ jsx(Presence2, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(DialogContentModal2, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(DialogContentNonModal2, { ...contentProps, ref: forwardedRef }) });
    }
  );
  DialogContent2.displayName = CONTENT_NAME7;
  var DialogContentModal2 = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext2(CONTENT_NAME7, props.__scopeDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, context.contentRef, contentRef);
      useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        DialogContentImpl2,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          onCloseAutoFocus: composeEventHandlers2(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers2(props.onPointerDownOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (isRightClick) event.preventDefault();
          }),
          onFocusOutside: composeEventHandlers2(
            props.onFocusOutside,
            (event) => event.preventDefault()
          )
        }
      );
    }
  );
  var DialogContentNonModal2 = forwardRef(
    (props, forwardedRef) => {
      const context = useDialogContext2(CONTENT_NAME7, props.__scopeDialog);
      const hasInteractedOutsideRef = useRef(false);
      const hasPointerDownOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        DialogContentImpl2,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }
  );
  var DialogContentImpl2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
      const context = useDialogContext2(CONTENT_NAME7, __scopeDialog);
      useFocusGuards();
      return /* @__PURE__ */ jsx(Fragment2, { children: /* @__PURE__ */ jsx(
        FocusScope2,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ jsx(
            DismissableLayer2,
            {
              role: "dialog",
              id: context.contentId,
              "aria-describedby": context.descriptionId,
              "aria-labelledby": context.titleId,
              "data-state": getState3(context.open),
              ...contentProps,
              ref: forwardedRef,
              deferPointerDownOutside: true,
              onDismiss: () => context.onOpenChange(false)
            }
          )
        }
      ) });
    }
  );
  var TITLE_NAME2 = "DialogTitle";
  var DialogTitle2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext2(TITLE_NAME2, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive2.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }
  );
  DialogTitle2.displayName = TITLE_NAME2;
  var DESCRIPTION_NAME2 = "DialogDescription";
  var DialogDescription2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext2(DESCRIPTION_NAME2, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive2.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }
  );
  DialogDescription2.displayName = DESCRIPTION_NAME2;
  var CLOSE_NAME2 = "DialogClose";
  var DialogClose2 = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...closeProps } = props;
      const context = useDialogContext2(CLOSE_NAME2, __scopeDialog);
      return /* @__PURE__ */ jsx(
        Primitive2.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers2(props.onClick, () => context.onOpenChange(false))
        }
      );
    }
  );
  DialogClose2.displayName = CLOSE_NAME2;
  function getState3(open) {
    return open ? "open" : "closed";
  }

  // ../../node_modules/.pnpm/cmdk@1.1.1_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/cmdk/dist/index.mjs
  var N = '[cmdk-group=""]';
  var Y2 = '[cmdk-group-items=""]';
  var be = '[cmdk-group-heading=""]';
  var le = '[cmdk-item=""]';
  var ce = `${le}:not([aria-disabled="true"])`;
  var Z = "cmdk-item-select";
  var T = "data-value";
  var Re = (r3, o, n) => W(r3, o, n);
  var ue = createContext(void 0);
  var K2 = () => useContext(ue);
  var de = createContext(void 0);
  var ee = () => useContext(de);
  var fe = createContext(void 0);
  var me = forwardRef((r3, o) => {
    let n = L(() => {
      var e, a;
      return { search: "", value: (a = (e = r3.value) != null ? e : r3.defaultValue) != null ? a : "", selectedItemId: void 0, filtered: { count: 0, items: /* @__PURE__ */ new Map(), groups: /* @__PURE__ */ new Set() } };
    }), u2 = L(() => /* @__PURE__ */ new Set()), c = L(() => /* @__PURE__ */ new Map()), d = L(() => /* @__PURE__ */ new Map()), f = L(() => /* @__PURE__ */ new Set()), p2 = pe(r3), { label: b, children: m2, value: R, onValueChange: x, filter: C2, shouldFilter: S, loop: A2, disablePointerSelection: ge = false, vimBindings: j2 = true, ...O } = r3, $2 = useId2(), q2 = useId2(), _ = useId2(), I2 = useRef(null), v = ke();
    k2(() => {
      if (R !== void 0) {
        let e = R.trim();
        n.current.value = e, E.emit();
      }
    }, [R]), k2(() => {
      v(6, ne2);
    }, []);
    let E = useMemo(() => ({ subscribe: (e) => (f.current.add(e), () => f.current.delete(e)), snapshot: () => n.current, setState: (e, a, s) => {
      var i, l, g, y;
      if (!Object.is(n.current[e], a)) {
        if (n.current[e] = a, e === "search") J4(), z(), v(1, W4);
        else if (e === "value") {
          if (document.activeElement.hasAttribute("cmdk-input") || document.activeElement.hasAttribute("cmdk-root")) {
            let h = document.getElementById(_);
            h ? h.focus() : (i = document.getElementById($2)) == null || i.focus();
          }
          if (v(7, () => {
            var h;
            n.current.selectedItemId = (h = M()) == null ? void 0 : h.id, E.emit();
          }), s || v(5, ne2), ((l = p2.current) == null ? void 0 : l.value) !== void 0) {
            let h = a != null ? a : "";
            (y = (g = p2.current).onValueChange) == null || y.call(g, h);
            return;
          }
        }
        E.emit();
      }
    }, emit: () => {
      f.current.forEach((e) => e());
    } }), []), U3 = useMemo(() => ({ value: (e, a, s) => {
      var i;
      a !== ((i = d.current.get(e)) == null ? void 0 : i.value) && (d.current.set(e, { value: a, keywords: s }), n.current.filtered.items.set(e, te2(a, s)), v(2, () => {
        z(), E.emit();
      }));
    }, item: (e, a) => (u2.current.add(e), a && (c.current.has(a) ? c.current.get(a).add(e) : c.current.set(a, /* @__PURE__ */ new Set([e]))), v(3, () => {
      J4(), z(), n.current.value || W4(), E.emit();
    }), () => {
      d.current.delete(e), u2.current.delete(e), n.current.filtered.items.delete(e);
      let s = M();
      v(4, () => {
        J4(), (s == null ? void 0 : s.getAttribute("id")) === e && W4(), E.emit();
      });
    }), group: (e) => (c.current.has(e) || c.current.set(e, /* @__PURE__ */ new Set()), () => {
      d.current.delete(e), c.current.delete(e);
    }), filter: () => p2.current.shouldFilter, label: b || r3["aria-label"], getDisablePointerSelection: () => p2.current.disablePointerSelection, listId: $2, inputId: _, labelId: q2, listInnerRef: I2 }), []);
    function te2(e, a) {
      var i, l;
      let s = (l = (i = p2.current) == null ? void 0 : i.filter) != null ? l : Re;
      return e ? s(e, n.current.search, a) : 0;
    }
    function z() {
      if (!n.current.search || p2.current.shouldFilter === false) return;
      let e = n.current.filtered.items, a = [];
      n.current.filtered.groups.forEach((i) => {
        let l = c.current.get(i), g = 0;
        l.forEach((y) => {
          let h = e.get(y);
          g = Math.max(h, g);
        }), a.push([i, g]);
      });
      let s = I2.current;
      V().sort((i, l) => {
        var h, F2;
        let g = i.getAttribute("id"), y = l.getAttribute("id");
        return ((h = e.get(y)) != null ? h : 0) - ((F2 = e.get(g)) != null ? F2 : 0);
      }).forEach((i) => {
        let l = i.closest(Y2);
        l ? l.appendChild(i.parentElement === l ? i : i.closest(`${Y2} > *`)) : s.appendChild(i.parentElement === s ? i : i.closest(`${Y2} > *`));
      }), a.sort((i, l) => l[1] - i[1]).forEach((i) => {
        var g;
        let l = (g = I2.current) == null ? void 0 : g.querySelector(`${N}[${T}="${encodeURIComponent(i[0])}"]`);
        l == null || l.parentElement.appendChild(l);
      });
    }
    function W4() {
      let e = V().find((s) => s.getAttribute("aria-disabled") !== "true"), a = e == null ? void 0 : e.getAttribute(T);
      E.setState("value", a || void 0);
    }
    function J4() {
      var a, s, i, l;
      if (!n.current.search || p2.current.shouldFilter === false) {
        n.current.filtered.count = u2.current.size;
        return;
      }
      n.current.filtered.groups = /* @__PURE__ */ new Set();
      let e = 0;
      for (let g of u2.current) {
        let y = (s = (a = d.current.get(g)) == null ? void 0 : a.value) != null ? s : "", h = (l = (i = d.current.get(g)) == null ? void 0 : i.keywords) != null ? l : [], F2 = te2(y, h);
        n.current.filtered.items.set(g, F2), F2 > 0 && e++;
      }
      for (let [g, y] of c.current) for (let h of y) if (n.current.filtered.items.get(h) > 0) {
        n.current.filtered.groups.add(g);
        break;
      }
      n.current.filtered.count = e;
    }
    function ne2() {
      var a, s, i;
      let e = M();
      e && (((a = e.parentElement) == null ? void 0 : a.firstChild) === e && ((i = (s = e.closest(N)) == null ? void 0 : s.querySelector(be)) == null || i.scrollIntoView({ block: "nearest" })), e.scrollIntoView({ block: "nearest" }));
    }
    function M() {
      var e;
      return (e = I2.current) == null ? void 0 : e.querySelector(`${le}[aria-selected="true"]`);
    }
    function V() {
      var e;
      return Array.from(((e = I2.current) == null ? void 0 : e.querySelectorAll(ce)) || []);
    }
    function X5(e) {
      let s = V()[e];
      s && E.setState("value", s.getAttribute(T));
    }
    function Q(e) {
      var g;
      let a = M(), s = V(), i = s.findIndex((y) => y === a), l = s[i + e];
      (g = p2.current) != null && g.loop && (l = i + e < 0 ? s[s.length - 1] : i + e === s.length ? s[0] : s[i + e]), l && E.setState("value", l.getAttribute(T));
    }
    function re(e) {
      let a = M(), s = a == null ? void 0 : a.closest(N), i;
      for (; s && !i; ) s = e > 0 ? we(s, N) : De(s, N), i = s == null ? void 0 : s.querySelector(ce);
      i ? E.setState("value", i.getAttribute(T)) : Q(e);
    }
    let oe = () => X5(V().length - 1), ie2 = (e) => {
      e.preventDefault(), e.metaKey ? oe() : e.altKey ? re(1) : Q(1);
    }, se3 = (e) => {
      e.preventDefault(), e.metaKey ? X5(0) : e.altKey ? re(-1) : Q(-1);
    };
    return createElement(Primitive2.div, { ref: o, tabIndex: -1, ...O, "cmdk-root": "", onKeyDown: (e) => {
      var s;
      (s = O.onKeyDown) == null || s.call(O, e);
      let a = e.nativeEvent.isComposing || e.keyCode === 229;
      if (!(e.defaultPrevented || a)) switch (e.key) {
        case "n":
        case "j": {
          j2 && e.ctrlKey && ie2(e);
          break;
        }
        case "ArrowDown": {
          ie2(e);
          break;
        }
        case "p":
        case "k": {
          j2 && e.ctrlKey && se3(e);
          break;
        }
        case "ArrowUp": {
          se3(e);
          break;
        }
        case "Home": {
          e.preventDefault(), X5(0);
          break;
        }
        case "End": {
          e.preventDefault(), oe();
          break;
        }
        case "Enter": {
          e.preventDefault();
          let i = M();
          if (i) {
            let l = new Event(Z);
            i.dispatchEvent(l);
          }
        }
      }
    } }, createElement("label", { "cmdk-label": "", htmlFor: U3.inputId, id: U3.labelId, style: Te }, b), B2(r3, (e) => createElement(de.Provider, { value: E }, createElement(ue.Provider, { value: U3 }, e))));
  });
  var he = forwardRef((r3, o) => {
    var _, I2;
    let n = useId2(), u2 = useRef(null), c = useContext(fe), d = K2(), f = pe(r3), p2 = (I2 = (_ = f.current) == null ? void 0 : _.forceMount) != null ? I2 : c == null ? void 0 : c.forceMount;
    k2(() => {
      if (!p2) return d.item(n, c == null ? void 0 : c.id);
    }, [p2]);
    let b = ve(n, u2, [r3.value, r3.children, u2], r3.keywords), m2 = ee(), R = P((v) => v.value && v.value === b.current), x = P((v) => p2 || d.filter() === false ? true : v.search ? v.filtered.items.get(n) > 0 : true);
    useEffect(() => {
      let v = u2.current;
      if (!(!v || r3.disabled)) return v.addEventListener(Z, C2), () => v.removeEventListener(Z, C2);
    }, [x, r3.onSelect, r3.disabled]);
    function C2() {
      var v, E;
      S(), (E = (v = f.current).onSelect) == null || E.call(v, b.current);
    }
    function S() {
      m2.setState("value", b.current, true);
    }
    if (!x) return null;
    let { disabled: A2, value: ge, onSelect: j2, forceMount: O, keywords: $2, ...q2 } = r3;
    return createElement(Primitive2.div, { ref: composeRefs(u2, o), ...q2, id: n, "cmdk-item": "", role: "option", "aria-disabled": !!A2, "aria-selected": !!R, "data-disabled": !!A2, "data-selected": !!R, onPointerMove: A2 || d.getDisablePointerSelection() ? void 0 : S, onClick: A2 ? void 0 : C2 }, r3.children);
  });
  var Ee = forwardRef((r3, o) => {
    let { heading: n, children: u2, forceMount: c, ...d } = r3, f = useId2(), p2 = useRef(null), b = useRef(null), m2 = useId2(), R = K2(), x = P((S) => c || R.filter() === false ? true : S.search ? S.filtered.groups.has(f) : true);
    k2(() => R.group(f), []), ve(f, p2, [r3.value, r3.heading, b]);
    let C2 = useMemo(() => ({ id: f, forceMount: c }), [c]);
    return createElement(Primitive2.div, { ref: composeRefs(p2, o), ...d, "cmdk-group": "", role: "presentation", hidden: x ? void 0 : true }, n && createElement("div", { ref: b, "cmdk-group-heading": "", "aria-hidden": true, id: m2 }, n), B2(r3, (S) => createElement("div", { "cmdk-group-items": "", role: "group", "aria-labelledby": n ? m2 : void 0 }, createElement(fe.Provider, { value: C2 }, S))));
  });
  var ye = forwardRef((r3, o) => {
    let { alwaysRender: n, ...u2 } = r3, c = useRef(null), d = P((f) => !f.search);
    return !n && !d ? null : createElement(Primitive2.div, { ref: composeRefs(c, o), ...u2, "cmdk-separator": "", role: "separator" });
  });
  var Se = forwardRef((r3, o) => {
    let { onValueChange: n, ...u2 } = r3, c = r3.value != null, d = ee(), f = P((m2) => m2.search), p2 = P((m2) => m2.selectedItemId), b = K2();
    return useEffect(() => {
      r3.value != null && d.setState("search", r3.value);
    }, [r3.value]), createElement(Primitive2.input, { ref: o, ...u2, "cmdk-input": "", autoComplete: "off", autoCorrect: "off", spellCheck: false, "aria-autocomplete": "list", role: "combobox", "aria-expanded": true, "aria-controls": b.listId, "aria-labelledby": b.labelId, "aria-activedescendant": p2, id: b.inputId, type: "text", value: c ? r3.value : f, onChange: (m2) => {
      c || d.setState("search", m2.target.value), n == null || n(m2.target.value);
    } });
  });
  var Ce = forwardRef((r3, o) => {
    let { children: n, label: u2 = "Suggestions", ...c } = r3, d = useRef(null), f = useRef(null), p2 = P((m2) => m2.selectedItemId), b = K2();
    return useEffect(() => {
      if (f.current && d.current) {
        let m2 = f.current, R = d.current, x, C2 = new ResizeObserver(() => {
          x = requestAnimationFrame(() => {
            let S = m2.offsetHeight;
            R.style.setProperty("--cmdk-list-height", S.toFixed(1) + "px");
          });
        });
        return C2.observe(m2), () => {
          cancelAnimationFrame(x), C2.unobserve(m2);
        };
      }
    }, []), createElement(Primitive2.div, { ref: composeRefs(d, o), ...c, "cmdk-list": "", role: "listbox", tabIndex: -1, "aria-activedescendant": p2, "aria-label": u2, id: b.listId }, B2(r3, (m2) => createElement("div", { ref: composeRefs(f, b.listInnerRef), "cmdk-list-sizer": "" }, m2)));
  });
  var xe = forwardRef((r3, o) => {
    let { open: n, onOpenChange: u2, overlayClassName: c, contentClassName: d, container: f, ...p2 } = r3;
    return createElement(Dialog2, { open: n, onOpenChange: u2 }, createElement(DialogPortal2, { container: f }, createElement(DialogOverlay2, { "cmdk-overlay": "", className: c }), createElement(DialogContent2, { "aria-label": r3.label, "cmdk-dialog": "", className: d }, createElement(me, { ref: o, ...p2 }))));
  });
  var Ie = forwardRef((r3, o) => P((u2) => u2.filtered.count === 0) ? createElement(Primitive2.div, { ref: o, ...r3, "cmdk-empty": "", role: "presentation" }) : null);
  var Pe = forwardRef((r3, o) => {
    let { progress: n, children: u2, label: c = "Loading...", ...d } = r3;
    return createElement(Primitive2.div, { ref: o, ...d, "cmdk-loading": "", role: "progressbar", "aria-valuenow": n, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": c }, B2(r3, (f) => createElement("div", { "aria-hidden": true }, f)));
  });
  var _e = Object.assign(me, { List: Ce, Item: he, Input: Se, Group: Ee, Separator: ye, Dialog: xe, Empty: Ie, Loading: Pe });
  function we(r3, o) {
    let n = r3.nextElementSibling;
    for (; n; ) {
      if (n.matches(o)) return n;
      n = n.nextElementSibling;
    }
  }
  function De(r3, o) {
    let n = r3.previousElementSibling;
    for (; n; ) {
      if (n.matches(o)) return n;
      n = n.previousElementSibling;
    }
  }
  function pe(r3) {
    let o = useRef(r3);
    return k2(() => {
      o.current = r3;
    }), o;
  }
  var k2 = typeof window == "undefined" ? useEffect : useLayoutEffect;
  function L(r3) {
    let o = useRef();
    return o.current === void 0 && (o.current = r3()), o;
  }
  function P(r3) {
    let o = ee(), n = () => r3(o.snapshot());
    return useSyncExternalStore(o.subscribe, n, n);
  }
  function ve(r3, o, n, u2 = []) {
    let c = useRef(), d = K2();
    return k2(() => {
      var b;
      let f = (() => {
        var m2;
        for (let R of n) {
          if (typeof R == "string") return R.trim();
          if (typeof R == "object" && "current" in R) return R.current ? (m2 = R.current.textContent) == null ? void 0 : m2.trim() : c.current;
        }
      })(), p2 = u2.map((m2) => m2.trim());
      d.value(r3, f, p2), (b = o.current) == null || b.setAttribute(T, f), c.current = f;
    }), c;
  }
  var ke = () => {
    let [r3, o] = useState(), n = L(() => /* @__PURE__ */ new Map());
    return k2(() => {
      n.current.forEach((u2) => u2()), n.current = /* @__PURE__ */ new Map();
    }, [r3]), (u2, c) => {
      n.current.set(u2, c), o({});
    };
  };
  function Me(r3) {
    let o = r3.type;
    return typeof o == "function" ? o(r3.props) : "render" in o ? o.render(r3.props) : r3;
  }
  function B2({ asChild: r3, children: o }, n) {
    return r3 && isValidElement(o) ? cloneElement(Me(o), { ref: o.ref }, n(o.props.children)) : n(o);
  }
  var Te = { position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: "0" };

  // ../../node_modules/.pnpm/react-resizable-panels@4.12.1_react-dom@18.3.1_react@18.3.1/node_modules/react-resizable-panels/dist/react-resizable-panels.js
  function St(e, t) {
    const n = getComputedStyle(e), o = parseFloat(n.fontSize);
    return t * o;
  }
  function vt(e, t) {
    const n = getComputedStyle(e.ownerDocument.documentElement), o = parseFloat(n.fontSize);
    return t * o;
  }
  function bt(e) {
    return e / 100 * window.innerHeight;
  }
  function zt(e) {
    return e / 100 * window.innerWidth;
  }
  function xt(e) {
    switch (typeof e) {
      case "number":
        return [e, "px"];
      case "string": {
        const t = parseFloat(e);
        return e.endsWith("%") ? [t, "%"] : e.endsWith("px") ? [t, "px"] : e.endsWith("rem") ? [t, "rem"] : e.endsWith("em") ? [t, "em"] : e.endsWith("vh") ? [t, "vh"] : e.endsWith("vw") ? [t, "vw"] : [t, "%"];
      }
    }
  }
  function ie({
    groupSize: e,
    panelElement: t,
    styleProp: n
  }) {
    let o;
    const [i, s] = xt(n);
    switch (s) {
      case "%": {
        o = i / 100 * e;
        break;
      }
      case "px": {
        o = i;
        break;
      }
      case "rem": {
        o = vt(t, i);
        break;
      }
      case "em": {
        o = St(t, i);
        break;
      }
      case "vh": {
        o = bt(i);
        break;
      }
      case "vw": {
        o = zt(i);
        break;
      }
    }
    return o;
  }
  function T2(e) {
    return parseFloat(e.toFixed(3));
  }
  function ne({
    group: e
  }) {
    const { orientation: t, panels: n } = e;
    return n.reduce((o, i) => (o += t === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, o), 0);
  }
  function ve2(e) {
    const { panels: t } = e, n = ne({ group: e });
    return n === 0 ? t.map((o) => ({
      groupResizeBehavior: o.panelConstraints.groupResizeBehavior,
      collapsedSize: 0,
      collapsible: o.panelConstraints.collapsible === true,
      defaultSize: void 0,
      disabled: o.panelConstraints.disabled,
      minSize: 0,
      maxSize: 100,
      panelId: o.id
    })) : t.map((o) => {
      const { element: i, panelConstraints: s } = o;
      let u2 = 0;
      if (s.collapsedSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.collapsedSize
        });
        u2 = T2(c / n * 100);
      }
      let a;
      if (s.defaultSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.defaultSize
        });
        a = T2(c / n * 100);
      }
      let r3 = 0;
      if (s.minSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.minSize
        });
        r3 = T2(c / n * 100);
      }
      let l = 100;
      if (s.maxSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.maxSize
        });
        l = T2(c / n * 100);
      }
      return {
        groupResizeBehavior: s.groupResizeBehavior,
        collapsedSize: u2,
        collapsible: s.collapsible === true,
        defaultSize: a,
        disabled: s.disabled,
        minSize: r3,
        maxSize: l,
        panelId: o.id
      };
    });
  }
  function C(e, t = "Assertion error") {
    if (!e)
      throw Error(t);
  }
  function be2(e, t) {
    return Array.from(t).sort(
      e === "horizontal" ? Pt : wt
    );
  }
  function Pt(e, t) {
    const n = e.element.offsetLeft - t.element.offsetLeft;
    return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
  }
  function wt(e, t) {
    const n = e.element.offsetTop - t.element.offsetTop;
    return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
  }
  function Ye(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
  }
  function Je(e, t) {
    return {
      x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(
        Math.abs(e.x - t.left),
        Math.abs(e.x - t.right)
      ),
      y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(
        Math.abs(e.y - t.top),
        Math.abs(e.y - t.bottom)
      )
    };
  }
  function Lt({
    orientation: e,
    rects: t,
    targetRect: n
  }) {
    const o = {
      x: n.x + n.width / 2,
      y: n.y + n.height / 2
    };
    let i, s = Number.MAX_VALUE;
    for (const u2 of t) {
      const { x: a, y: r3 } = Je(o, u2), l = e === "horizontal" ? a : r3;
      l < s && (s = l, i = u2);
    }
    return C(i, "No rect found"), i;
  }
  var fe2;
  function Ct() {
    return fe2 === void 0 && (typeof matchMedia == "function" ? fe2 = !!matchMedia("(pointer:coarse)").matches : fe2 = false), fe2;
  }
  function Ze(e) {
    const { element: t, orientation: n, panels: o, separators: i } = e, s = be2(
      n,
      Array.from(t.children).filter(Ye).map((z) => ({ element: z }))
    ).map(({ element: z }) => z), u2 = [];
    let a = false, r3 = false, l = -1, c = -1, m2 = 0, p2, S = [];
    {
      let z = -1;
      for (const f of s)
        f.hasAttribute("data-panel") && (z++, f.hasAttribute("data-disabled") || (m2++, l === -1 && (l = z), c = z));
    }
    if (m2 > 1) {
      let z = -1;
      for (const f of s)
        if (f.hasAttribute("data-panel")) {
          z++;
          const d = o.find(
            (h) => h.element === f
          );
          if (d) {
            if (p2) {
              const h = p2.element.getBoundingClientRect(), y = f.getBoundingClientRect();
              let b;
              if (r3) {
                const v = n === "horizontal" ? new DOMRect(
                  h.right,
                  h.top,
                  0,
                  h.height
                ) : new DOMRect(
                  h.left,
                  h.bottom,
                  h.width,
                  0
                ), g = n === "horizontal" ? new DOMRect(y.left, y.top, 0, y.height) : new DOMRect(y.left, y.top, y.width, 0);
                switch (S.length) {
                  case 0: {
                    b = [
                      v,
                      g
                    ];
                    break;
                  }
                  case 1: {
                    const w = S[0], M = Lt({
                      orientation: n,
                      rects: [h, y],
                      targetRect: w.element.getBoundingClientRect()
                    });
                    b = [
                      w,
                      M === h ? g : v
                    ];
                    break;
                  }
                  default: {
                    b = S;
                    break;
                  }
                }
              } else
                S.length ? b = S : b = [
                  n === "horizontal" ? new DOMRect(
                    h.right,
                    y.top,
                    y.left - h.right,
                    y.height
                  ) : new DOMRect(
                    y.left,
                    h.bottom,
                    y.width,
                    y.top - h.bottom
                  )
                ];
              for (const v of b) {
                let g = "width" in v ? v : v.element.getBoundingClientRect();
                const w = Ct() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
                if (g.width < w) {
                  const L2 = w - g.width;
                  g = new DOMRect(
                    g.x - L2 / 2,
                    g.y,
                    g.width + L2,
                    g.height
                  );
                }
                if (g.height < w) {
                  const L2 = w - g.height;
                  g = new DOMRect(
                    g.x,
                    g.y - L2 / 2,
                    g.width,
                    g.height + L2
                  );
                }
                const M = z <= l || z > c;
                !a && !M && u2.push({
                  group: e,
                  groupSize: ne({ group: e }),
                  panels: [p2, d],
                  separator: "width" in v ? void 0 : v,
                  rect: g
                }), a = false;
              }
            }
            r3 = false, p2 = d, S = [];
          }
        } else if (f.hasAttribute("data-separator")) {
          f.ariaDisabled !== null && (a = true);
          const d = i.find(
            (h) => h.element === f
          );
          d ? S.push(d) : (p2 = void 0, S = []);
        } else
          r3 = true;
    }
    return u2;
  }
  var _e2;
  var Qe = class {
    constructor() {
      __privateAdd(this, _e2, {});
    }
    addListener(t, n) {
      const o = __privateGet(this, _e2)[t];
      return o === void 0 ? __privateGet(this, _e2)[t] = [n] : o.includes(n) || o.push(n), () => {
        this.removeListener(t, n);
      };
    }
    emit(t, n) {
      const o = __privateGet(this, _e2)[t];
      if (o !== void 0)
        if (o.length === 1)
          o[0].call(null, n);
        else {
          let i = false, s = null;
          const u2 = Array.from(o);
          for (let a = 0; a < u2.length; a++) {
            const r3 = u2[a];
            try {
              r3.call(null, n);
            } catch (l) {
              s === null && (i = true, s = l);
            }
          }
          if (i)
            throw s;
        }
    }
    removeAllListeners() {
      __privateSet(this, _e2, {});
    }
    removeListener(t, n) {
      const o = __privateGet(this, _e2)[t];
      if (o !== void 0) {
        const i = o.indexOf(n);
        i >= 0 && o.splice(i, 1);
      }
    }
  };
  _e2 = new WeakMap();
  var ee2 = {
    cursorFlags: 0,
    state: "inactive"
  };
  var ze = new Qe();
  function B3() {
    return ee2;
  }
  function Rt(e) {
    return ze.addListener("change", e);
  }
  function Mt(e) {
    const t = ee2, n = { ...ee2 };
    n.cursorFlags = e, ee2 = n, ze.emit("change", {
      prev: t,
      next: n
    });
  }
  function te(e) {
    const t = ee2;
    ee2 = e, ze.emit("change", {
      prev: t,
      next: e
    });
  }
  var Et = (e) => e;
  var ye2 = () => {
  };
  var et = 1;
  var tt = 2;
  var nt = 4;
  var ot = 8;
  var Ie2 = 3;
  var ke2 = 12;
  var de2;
  function De2() {
    return de2 === void 0 && (de2 = false, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (de2 = true)), de2;
  }
  function It({
    cursorFlags: e,
    groups: t,
    state: n
  }) {
    let o = 0, i = 0;
    switch (n) {
      case "active":
      case "hover":
        t.forEach((s) => {
          if (!s.mutableState.disableCursor)
            switch (s.orientation) {
              case "horizontal": {
                o++;
                break;
              }
              case "vertical": {
                i++;
                break;
              }
            }
        });
    }
    if (!(o === 0 && i === 0)) {
      switch (n) {
        case "active": {
          if (e && De2()) {
            const s = (e & et) !== 0, u2 = (e & tt) !== 0, a = (e & nt) !== 0, r3 = (e & ot) !== 0;
            if (s)
              return a ? "se-resize" : r3 ? "ne-resize" : "e-resize";
            if (u2)
              return a ? "sw-resize" : r3 ? "nw-resize" : "w-resize";
            if (a)
              return "s-resize";
            if (r3)
              return "n-resize";
          }
          break;
        }
      }
      return De2() ? o > 0 && i > 0 ? "move" : o > 0 ? "ew-resize" : "ns-resize" : o > 0 && i > 0 ? "grab" : o > 0 ? "col-resize" : "row-resize";
    }
  }
  var Te2 = /* @__PURE__ */ new WeakMap();
  function xe2(e) {
    if (e.defaultView === null || e.defaultView === void 0)
      return;
    let { prevStyle: t, styleSheet: n } = Te2.get(e) ?? {};
    n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
      ...e.adoptedStyleSheets,
      n
    ]));
    const o = B3();
    switch (o.state) {
      case "active":
      case "hover": {
        const i = It({
          cursorFlags: o.cursorFlags,
          groups: o.hitRegions.map((u2) => u2.group),
          state: o.state
        }), s = `*, *:hover {cursor: ${i} !important; }`;
        if (t === s)
          return;
        t = s, i ? n.cssRules.length === 0 ? n.insertRule(s) : n.replaceSync(s) : n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
      case "inactive": {
        t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
    }
    Te2.set(e, {
      prevStyle: t,
      styleSheet: n
    });
  }
  var F = /* @__PURE__ */ new Map();
  var it = new Qe();
  function kt(e) {
    F = new Map(F), F.delete(e);
  }
  function Oe(e, t) {
    for (const [n] of F)
      if (n.id === e)
        return n;
  }
  function H2(e, t) {
    for (const [n, o] of F)
      if (n.id === e)
        return o;
    if (t)
      throw Error(`Could not find data for Group with id ${e}`);
  }
  function X3() {
    return F;
  }
  function Pe2(e, t) {
    return it.addListener("groupChange", (n) => {
      n.group.id === e && t(n);
    });
  }
  function j(e, t, n) {
    const o = F.get(e);
    F = new Map(F), F.set(e, t), it.emit("groupChange", {
      group: e,
      isUserInteraction: n?.isUserInteraction === true,
      prev: o,
      next: t
    });
  }
  function rt(e) {
    const t = B3();
    let n = false;
    switch (t.state) {
      case "active":
        te({
          cursorFlags: 0,
          state: "inactive"
        }), t.hitRegions.length > 0 && (xe2(e), n = true, t.hitRegions.forEach((o) => {
          const i = H2(o.group.id, true);
          j(o.group, i, {
            isUserInteraction: true
          });
        }));
    }
    return n;
  }
  function Ge(e) {
    e.defaultPrevented || rt(e.currentTarget);
  }
  function Dt(e, t, n) {
    let o, i = {
      x: 1 / 0,
      y: 1 / 0
    };
    for (const s of t) {
      const u2 = Je(n, s.rect);
      switch (e) {
        case "horizontal": {
          u2.x <= i.x && (o = s, i = u2);
          break;
        }
        case "vertical": {
          u2.y <= i.y && (o = s, i = u2);
          break;
        }
      }
    }
    return o ? {
      distance: i,
      hitRegion: o
    } : void 0;
  }
  function Tt(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  }
  function Ot(e, t) {
    if (e === t) throw new Error("Cannot compare node with itself");
    const n = {
      a: Ne(e),
      b: Ne(t)
    };
    let o;
    for (; n.a.at(-1) === n.b.at(-1); )
      o = n.a.pop(), n.b.pop();
    C(
      o,
      "Stacking order can only be calculated for elements with a common ancestor"
    );
    const i = {
      a: Fe(Ae(n.a)),
      b: Fe(Ae(n.b))
    };
    if (i.a === i.b) {
      const s = o.childNodes, u2 = {
        a: n.a.at(-1),
        b: n.b.at(-1)
      };
      let a = s.length;
      for (; a--; ) {
        const r3 = s[a];
        if (r3 === u2.a) return 1;
        if (r3 === u2.b) return -1;
      }
    }
    return Math.sign(i.a - i.b);
  }
  var Gt = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
  function At(e) {
    const t = getComputedStyle(st(e) ?? e).display;
    return t === "flex" || t === "inline-flex";
  }
  function Ft(e) {
    const t = getComputedStyle(e);
    return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || At(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || Gt.test(t.willChange) || t.webkitOverflowScrolling === "touch");
  }
  function Ae(e) {
    let t = e.length;
    for (; t--; ) {
      const n = e[t];
      if (C(n, "Missing node"), Ft(n)) return n;
    }
    return null;
  }
  function Fe(e) {
    return e && Number(getComputedStyle(e).zIndex) || 0;
  }
  function Ne(e) {
    const t = [];
    for (; e; )
      t.push(e), e = st(e);
    return t;
  }
  function st(e) {
    const { parentNode: t } = e;
    return Tt(t) ? t.host : t;
  }
  function Nt(e, t) {
    return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
  }
  function _t({
    groupElement: e,
    hitRegion: t,
    pointerEventTarget: n
  }) {
    if (!Ye(n) || n.contains(e) || e.contains(n))
      return true;
    if (Ot(n, e) > 0) {
      let o = n;
      for (; o; ) {
        if (o.contains(e))
          return true;
        if (Nt(o.getBoundingClientRect(), t))
          return false;
        o = o.parentElement;
      }
    }
    return true;
  }
  function we2(e, t) {
    const n = [];
    return t.forEach((o, i) => {
      if (i.disabled)
        return;
      const s = Ze(i), u2 = Dt(i.orientation, s, {
        x: e.clientX,
        y: e.clientY
      });
      u2 && u2.distance.x <= 0 && u2.distance.y <= 0 && _t({
        groupElement: i.element,
        hitRegion: u2.hitRegion.rect,
        pointerEventTarget: e.target
      }) && n.push(u2.hitRegion);
    }), n;
  }
  function $t(e, t) {
    if (e.length !== t.length)
      return false;
    for (let n = 0; n < e.length; n++)
      if (e[n] != t[n])
        return false;
    return true;
  }
  function k3(e, t, n = 0) {
    return Math.abs(T2(e) - T2(t)) <= n;
  }
  function A(e, t) {
    return k3(e, t) ? 0 : e > t ? 1 : -1;
  }
  function Z2({
    overrideDisabledPanels: e,
    panelConstraints: t,
    prevSize: n,
    size: o
  }) {
    const {
      collapsedSize: i = 0,
      collapsible: s,
      disabled: u2,
      maxSize: a = 100,
      minSize: r3 = 0
    } = t;
    if (u2 && !e)
      return n;
    if (A(o, r3) < 0)
      if (s) {
        const l = (i + r3) / 2;
        A(o, l) < 0 ? o = i : o = r3;
      } else
        o = r3;
    return o = Math.min(a, o), o = T2(o), o;
  }
  function le2({
    delta: e,
    initialLayout: t,
    panelConstraints: n,
    pivotIndices: o,
    prevLayout: i,
    trigger: s
  }) {
    if (k3(e, 0))
      return t;
    const u2 = s === "imperative-api", a = Object.values(t), r3 = Object.values(i), l = [...a], [c, m2] = o;
    C(c != null, "Invalid first pivot index"), C(m2 != null, "Invalid second pivot index");
    let p2 = 0;
    switch (s) {
      case "keyboard": {
        {
          const f = e < 0 ? m2 : c, d = n[f];
          C(
            d,
            `Panel constraints not found for index ${f}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y,
            minSize: b = 0
          } = d;
          if (y) {
            const v = a[f];
            if (C(
              v != null,
              `Previous layout not found for panel index ${f}`
            ), k3(v, h)) {
              const g = b - v;
              A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
            }
          }
        }
        {
          const f = e < 0 ? c : m2, d = n[f];
          C(
            d,
            `No panel constraints found for index ${f}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y,
            minSize: b = 0
          } = d;
          if (y) {
            const v = a[f];
            if (C(
              v != null,
              `Previous layout not found for panel index ${f}`
            ), k3(v, b)) {
              const g = v - h;
              A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
            }
          }
        }
        break;
      }
      default: {
        const f = e < 0 ? m2 : c, d = n[f];
        C(
          d,
          `Panel constraints not found for index ${f}`
        );
        const h = a[f], { collapsible: y, collapsedSize: b, minSize: v } = d;
        if (y && A(h, v) < 0)
          if (e > 0) {
            const g = v - b, w = g / 2, M = h + e;
            A(M, v) < 0 && (e = A(e, w) <= 0 ? 0 : g);
          } else {
            const g = v - b, w = 100 - g / 2, M = h - e;
            A(M, v) < 0 && (e = A(100 + e, w) > 0 ? 0 : -g);
          }
        break;
      }
    }
    {
      const f = e < 0 ? 1 : -1;
      let d = e < 0 ? m2 : c, h = 0;
      for (; ; ) {
        const b = a[d];
        C(
          b != null,
          `Previous layout not found for panel index ${d}`
        );
        const g = Z2({
          overrideDisabledPanels: u2,
          panelConstraints: n[d],
          prevSize: b,
          size: 100
        }) - b;
        if (h += g, d += f, d < 0 || d >= n.length)
          break;
      }
      const y = Math.min(Math.abs(e), Math.abs(h));
      e = e < 0 ? 0 - y : y;
    }
    {
      let d = e < 0 ? c : m2;
      for (; d >= 0 && d < n.length; ) {
        const h = Math.abs(e) - Math.abs(p2), y = a[d];
        C(
          y != null,
          `Previous layout not found for panel index ${d}`
        );
        const b = y - h, v = Z2({
          overrideDisabledPanels: u2,
          panelConstraints: n[d],
          prevSize: y,
          size: b
        });
        if (!k3(y, v) && (p2 += y - v, l[d] = v, p2.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
          numeric: true
        }) >= 0))
          break;
        e < 0 ? d-- : d++;
      }
    }
    if ($t(r3, l))
      return i;
    {
      const f = e < 0 ? m2 : c, d = a[f];
      C(
        d != null,
        `Previous layout not found for panel index ${f}`
      );
      const h = d + p2, y = Z2({
        overrideDisabledPanels: u2,
        panelConstraints: n[f],
        prevSize: d,
        size: h
      });
      if (l[f] = y, !k3(y, h)) {
        let b = h - y, g = e < 0 ? m2 : c;
        for (; g >= 0 && g < n.length; ) {
          const w = l[g];
          C(
            w != null,
            `Previous layout not found for panel index ${g}`
          );
          const M = w + b, L2 = Z2({
            overrideDisabledPanels: u2,
            panelConstraints: n[g],
            prevSize: w,
            size: M
          });
          if (k3(w, L2) || (b -= L2 - w, l[g] = L2), k3(b, 0))
            break;
          e > 0 ? g-- : g++;
        }
      }
    }
    const S = Object.values(l).reduce(
      (f, d) => d + f,
      0
    );
    if (!k3(S, 100, 0.1))
      return i;
    const z = Object.keys(i);
    return l.reduce((f, d, h) => (f[z[h]] = d, f), {});
  }
  function W2(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const n in e)
      if (t[n] === void 0 || A(e[n], t[n]) !== 0)
        return false;
    return true;
  }
  function K3({
    layout: e,
    panelConstraints: t
  }) {
    const n = Object.values(e), o = [...n], i = o.reduce(
      (a, r3) => a + r3,
      0
    );
    if (o.length !== t.length)
      throw Error(
        `Invalid ${t.length} panel layout: ${o.map((a) => `${a}%`).join(", ")}`
      );
    if (!k3(i, 100) && o.length > 0)
      for (let a = 0; a < t.length; a++) {
        const r3 = o[a];
        C(r3 != null, `No layout data found for index ${a}`);
        const l = 100 / i * r3;
        o[a] = l;
      }
    let s = 0;
    for (let a = 0; a < t.length; a++) {
      const r3 = n[a];
      C(r3 != null, `No layout data found for index ${a}`);
      const l = o[a];
      C(l != null, `No layout data found for index ${a}`);
      const c = Z2({
        overrideDisabledPanels: true,
        panelConstraints: t[a],
        prevSize: r3,
        size: l
      });
      l != c && (s += l - c, o[a] = c);
    }
    if (!k3(s, 0))
      for (let a = 0; a < t.length; a++) {
        const r3 = o[a];
        C(r3 != null, `No layout data found for index ${a}`);
        const l = r3 + s, c = Z2({
          overrideDisabledPanels: true,
          panelConstraints: t[a],
          prevSize: r3,
          size: l
        });
        if (r3 !== c && (s -= c - r3, o[a] = c, k3(s, 0)))
          break;
      }
    const u2 = Object.keys(e);
    return o.reduce((a, r3, l) => (a[u2[l]] = r3, a), {});
  }
  function at({
    groupId: e,
    panelId: t
  }) {
    const n = () => {
      const r3 = X3();
      for (const [
        l,
        {
          defaultLayoutDeferred: c,
          derivedPanelConstraints: m2,
          layout: p2,
          groupSize: S,
          separatorToPanels: z
        }
      ] of r3)
        if (l.id === e)
          return {
            defaultLayoutDeferred: c,
            derivedPanelConstraints: m2,
            group: l,
            groupSize: S,
            layout: p2,
            separatorToPanels: z
          };
      throw Error(`Group ${e} not found`);
    }, o = () => {
      const r3 = n().derivedPanelConstraints.find(
        (l) => l.panelId === t
      );
      if (r3 !== void 0)
        return r3;
      throw Error(`Panel constraints not found for Panel ${t}`);
    }, i = () => {
      const r3 = n().group.panels.find((l) => l.id === t);
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t}`);
    }, s = () => {
      const r3 = n().layout[t];
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t}`);
    }, u2 = ({
      nextSize: r3,
      panels: l,
      prevLayout: c,
      derivedPanelConstraints: m2
    }) => {
      const p2 = s(), S = l.findIndex((h) => h.id === t), z = S === 0, f = S === l.length - 1;
      if (f && r3 < p2 && (z || l.slice(0, S).every((h, y) => {
        const b = m2[y];
        return b?.collapsible && k3(b.collapsedSize, c[b.panelId]);
      }))) {
        const h = l.slice(0, S).reduce((y, b) => y + c[b.id], 0);
        return {
          ...c,
          [t]: T2(100 - h)
        };
      }
      return le2({
        delta: f ? p2 - r3 : r3 - p2,
        initialLayout: c,
        panelConstraints: m2,
        pivotIndices: f ? [S - 1, S] : [S, S + 1],
        prevLayout: c,
        trigger: "imperative-api"
      });
    }, a = (r3) => {
      const l = s();
      if (r3 === l)
        return;
      const {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m2,
        group: p2,
        groupSize: S,
        layout: z,
        separatorToPanels: f
      } = n(), d = u2({
        nextSize: r3,
        panels: p2.panels,
        prevLayout: z,
        derivedPanelConstraints: m2
      }), h = K3({
        layout: d,
        panelConstraints: m2
      });
      W2(z, h) || j(p2, {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m2,
        groupSize: S,
        layout: h,
        separatorToPanels: f
      });
    };
    return {
      collapse: () => {
        const { collapsible: r3, collapsedSize: l } = o(), { mutableValues: c } = i(), m2 = s();
        r3 && m2 !== l && (c.expandToSize = m2, a(l));
      },
      expand: () => {
        const { collapsible: r3, collapsedSize: l, minSize: c } = o(), { mutableValues: m2 } = i(), p2 = s();
        if (r3 && p2 === l) {
          let S = m2.expandToSize ?? c;
          S === 0 && (S = 1), a(S);
        }
      },
      getSize: () => {
        const { group: r3 } = n(), l = s(), { element: c } = i(), m2 = r3.orientation === "horizontal" ? c.offsetWidth : c.offsetHeight;
        return {
          asPercentage: l,
          inPixels: m2
        };
      },
      isCollapsed: () => {
        const { collapsible: r3, collapsedSize: l } = o(), c = s();
        return r3 && k3(l, c);
      },
      resize: (r3) => {
        const { group: l } = n(), { element: c } = i(), m2 = ne({ group: l }), p2 = ie({
          groupSize: m2,
          panelElement: c,
          styleProp: r3
        }), S = T2(p2 / m2 * 100);
        a(S);
      }
    };
  }
  function _e3(e) {
    if (e.defaultPrevented)
      return;
    const t = X3();
    we2(e, t).forEach((o) => {
      if (o.separator && !o.separator.disableDoubleClick) {
        const i = o.panels.find(
          (s) => s.panelConstraints.defaultSize !== void 0
        );
        if (i) {
          const s = i.panelConstraints.defaultSize, u2 = at({
            groupId: o.group.id,
            panelId: i.id
          });
          u2 && s !== void 0 && (u2.resize(s), e.preventDefault());
        }
      }
    });
  }
  function pe2(e) {
    const t = X3();
    for (const [n] of t)
      if (n.separators.some(
        (o) => o.element === e
      ))
        return n;
    throw Error("Could not find parent Group for separator element");
  }
  function lt({
    groupId: e
  }) {
    const t = () => {
      const n = X3();
      for (const [o, i] of n)
        if (o.id === e)
          return { group: o, ...i };
      throw Error(`Could not find Group with id "${e}"`);
    };
    return {
      getLayout() {
        const { defaultLayoutDeferred: n, layout: o } = t();
        return n ? {} : o;
      },
      setLayout(n) {
        const {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: i,
          group: s,
          groupSize: u2,
          layout: a,
          separatorToPanels: r3
        } = t(), l = K3({
          layout: n,
          panelConstraints: i
        });
        return o ? a : (W2(a, l) || j(s, {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: i,
          groupSize: u2,
          layout: l,
          separatorToPanels: r3
        }), l);
      }
    };
  }
  function U2(e, t) {
    const n = pe2(e), o = H2(n.id, true), i = n.separators.find(
      (m2) => m2.element === e
    );
    C(i, "Matching separator not found");
    const s = o.separatorToPanels.get(i);
    C(s, "Matching panels not found");
    const u2 = s.map((m2) => n.panels.indexOf(m2)), r3 = lt({ groupId: n.id }).getLayout(), l = le2({
      delta: t,
      initialLayout: r3,
      panelConstraints: o.derivedPanelConstraints,
      pivotIndices: u2,
      prevLayout: r3,
      trigger: "keyboard"
    }), c = K3({
      layout: l,
      panelConstraints: o.derivedPanelConstraints
    });
    W2(r3, c) || j(
      n,
      {
        defaultLayoutDeferred: o.defaultLayoutDeferred,
        derivedPanelConstraints: o.derivedPanelConstraints,
        groupSize: o.groupSize,
        layout: c,
        separatorToPanels: o.separatorToPanels
      },
      // Keyboard resizes (arrow keys, Home/End, Enter collapse/expand) originate
      // from a real DOM event on the separator, so they are user interactions
      // just like pointer drags. This function is only reached from
      // onDocumentKeyDown. See #716.
      { isUserInteraction: true }
    );
  }
  function $e(e) {
    if (e.defaultPrevented)
      return;
    const t = e.currentTarget, n = pe2(t);
    if (!n.disabled)
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault(), n.orientation === "vertical" && U2(t, 5);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault(), n.orientation === "horizontal" && U2(t, -5);
          break;
        }
        case "ArrowRight": {
          e.preventDefault(), n.orientation === "horizontal" && U2(t, 5);
          break;
        }
        case "ArrowUp": {
          e.preventDefault(), n.orientation === "vertical" && U2(t, -5);
          break;
        }
        case "End": {
          e.preventDefault(), U2(t, 100);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const o = pe2(t), i = H2(o.id, true), { derivedPanelConstraints: s, layout: u2, separatorToPanels: a } = i, r3 = o.separators.find(
            (p2) => p2.element === t
          );
          C(r3, "Matching separator not found");
          const l = a.get(r3);
          C(l, "Matching panels not found");
          const c = l[0], m2 = s.find(
            (p2) => p2.panelId === c.id
          );
          if (C(m2, "Panel metadata not found"), m2.collapsible) {
            const p2 = u2[c.id], S = m2.collapsedSize === p2 ? o.mutableState.expandedPanelSizes[c.id] ?? m2.minSize : m2.collapsedSize;
            U2(t, S - p2);
          }
          break;
        }
        case "F6": {
          e.preventDefault();
          const i = pe2(t).separators.map(
            (r3) => r3.element
          ), s = Array.from(i).findIndex(
            (r3) => r3 === e.currentTarget
          );
          C(s !== null, "Index not found");
          const u2 = e.shiftKey ? s > 0 ? s - 1 : i.length - 1 : s + 1 < i.length ? s + 1 : 0;
          i[u2].focus({
            preventScroll: true
          });
          break;
        }
        case "Home": {
          e.preventDefault(), U2(t, -100);
          break;
        }
      }
  }
  function je(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    const t = X3(), n = we2(e, t), o = /* @__PURE__ */ new Map();
    let i = false;
    n.forEach((s) => {
      s.separator && (i || (i = true, s.separator.element.focus({
        // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
        focusVisible: false,
        preventScroll: true
      })));
      const u2 = t.get(s.group);
      u2 && o.set(s.group, u2.layout);
    }), te({
      cursorFlags: 0,
      hitRegions: n,
      initialLayoutMap: o,
      pointerDownAtPoint: { x: e.clientX, y: e.clientY },
      state: "active"
    }), n.length && e.preventDefault();
  }
  function ut({
    document: e,
    event: t,
    hitRegions: n,
    initialLayoutMap: o,
    mountedGroups: i,
    pointerDownAtPoint: s,
    prevCursorFlags: u2
  }) {
    let a = 0;
    n.forEach((l) => {
      const { group: c, groupSize: m2 } = l, { orientation: p2, panels: S } = c, { disableCursor: z } = c.mutableState;
      let f = 0;
      s ? p2 === "horizontal" ? f = (t.clientX - s.x) / m2 * 100 : f = (t.clientY - s.y) / m2 * 100 : p2 === "horizontal" ? f = t.clientX < 0 ? -100 : 100 : f = t.clientY < 0 ? -100 : 100;
      const d = o.get(c), h = i.get(c);
      if (!d || !h)
        return;
      const {
        defaultLayoutDeferred: y,
        derivedPanelConstraints: b,
        groupSize: v,
        layout: g,
        separatorToPanels: w
      } = h;
      if (b && g && w) {
        const M = le2({
          delta: f,
          initialLayout: d,
          panelConstraints: b,
          pivotIndices: l.panels.map((L2) => S.indexOf(L2)),
          prevLayout: g,
          trigger: "mouse-or-touch"
        });
        if (W2(M, g)) {
          if (f !== 0 && !z)
            switch (p2) {
              case "horizontal": {
                a |= f < 0 ? et : tt;
                break;
              }
              case "vertical": {
                a |= f < 0 ? nt : ot;
                break;
              }
            }
        } else
          j(l.group, {
            defaultLayoutDeferred: y,
            derivedPanelConstraints: b,
            groupSize: v,
            layout: M,
            separatorToPanels: w
          });
      }
    });
    let r3 = 0;
    t.movementX === 0 ? r3 |= u2 & Ie2 : r3 |= a & Ie2, t.movementY === 0 ? r3 |= u2 & ke2 : r3 |= a & ke2, Mt(r3), xe2(e);
  }
  function He(e) {
    const t = X3(), n = B3();
    switch (n.state) {
      case "active":
        ut({
          document: e.currentTarget,
          event: e,
          hitRegions: n.hitRegions,
          initialLayoutMap: n.initialLayoutMap,
          mountedGroups: t,
          prevCursorFlags: n.cursorFlags
        });
    }
  }
  function Ve(e) {
    if (e.defaultPrevented)
      return;
    const t = B3(), n = X3();
    switch (t.state) {
      case "active": {
        if (
          // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
          e.buttons === 0
        ) {
          te({
            cursorFlags: 0,
            state: "inactive"
          }), t.hitRegions.forEach((o) => {
            const i = H2(o.group.id, true);
            j(o.group, i, {
              isUserInteraction: true
            });
          });
          return;
        }
        for (const o of t.hitRegions)
          if (o.separator) {
            const { element: i } = o.separator;
            i.hasPointerCapture?.(e.pointerId) || i.setPointerCapture?.(e.pointerId);
          }
        ut({
          document: e.currentTarget,
          event: e,
          hitRegions: t.hitRegions,
          initialLayoutMap: t.initialLayoutMap,
          mountedGroups: n,
          pointerDownAtPoint: t.pointerDownAtPoint,
          prevCursorFlags: t.cursorFlags
        });
        break;
      }
      default: {
        const o = we2(e, n);
        o.length === 0 ? t.state !== "inactive" && te({
          cursorFlags: 0,
          state: "inactive"
        }) : te({
          cursorFlags: 0,
          hitRegions: o,
          state: "hover"
        }), xe2(e.currentTarget);
        break;
      }
    }
  }
  function Ue(e) {
    if (e.relatedTarget instanceof HTMLIFrameElement)
      switch (B3().state) {
        case "hover":
          te({
            cursorFlags: 0,
            state: "inactive"
          });
      }
  }
  function Be(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    rt(e.currentTarget) && e.preventDefault();
  }
  function We(e) {
    let t = 0, n = 0;
    const o = {};
    for (const s of e)
      if (s.defaultSize !== void 0) {
        t++;
        const u2 = T2(s.defaultSize);
        n += u2, o[s.panelId] = u2;
      } else
        o[s.panelId] = void 0;
    const i = e.length - t;
    if (i !== 0) {
      const s = T2((100 - n) / i);
      for (const u2 of e)
        u2.defaultSize === void 0 && (o[u2.panelId] = s);
    }
    return o;
  }
  function jt(e, t, n) {
    if (!n[0])
      return;
    const i = e.panels.find((l) => l.element === t);
    if (!i || !i.onResize)
      return;
    const s = ne({ group: e }), u2 = e.orientation === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, a = i.mutableValues.prevSize, r3 = {
      asPercentage: T2(u2 / s * 100),
      inPixels: u2
    };
    i.mutableValues.prevSize = r3, i.onResize(r3, i.id, a);
  }
  function Ht(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const o in e)
      if (e[o] !== t[o])
        return false;
    return true;
  }
  function Vt({
    group: e,
    nextGroupSize: t,
    prevGroupSize: n,
    prevLayout: o
  }) {
    if (n <= 0 || t <= 0 || n === t)
      return o;
    let i = 0, s = 0, u2 = false;
    const a = /* @__PURE__ */ new Map(), r3 = [];
    for (const m2 of e.panels) {
      const p2 = o[m2.id] ?? 0;
      switch (m2.panelConstraints.groupResizeBehavior) {
        case "preserve-pixel-size": {
          u2 = true;
          const S = p2 / 100 * n, z = T2(
            S / t * 100
          );
          a.set(m2.id, z), i += z;
          break;
        }
        case "preserve-relative-size":
        default: {
          r3.push(m2.id), s += p2;
          break;
        }
      }
    }
    if (!u2 || r3.length === 0)
      return o;
    const l = 100 - i, c = { ...o };
    if (a.forEach((m2, p2) => {
      c[p2] = m2;
    }), s > 0)
      for (const m2 of r3) {
        const p2 = o[m2] ?? 0;
        c[m2] = T2(
          p2 / s * l
        );
      }
    else {
      const m2 = T2(
        l / r3.length
      );
      for (const p2 of r3)
        c[p2] = m2;
    }
    return c;
  }
  function Ut(e, t) {
    const n = e.map((i) => i.id), o = Object.keys(t);
    if (n.length !== o.length)
      return false;
    for (const i of n)
      if (!o.includes(i))
        return false;
    return true;
  }
  var J2 = /* @__PURE__ */ new Map();
  function Bt(e) {
    let t = true;
    C(
      e.element.ownerDocument.defaultView,
      "Cannot register an unmounted Group"
    );
    const n = e.element.ownerDocument.defaultView.ResizeObserver, o = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), s = new n((f) => {
      for (const d of f) {
        const { borderBoxSize: h, target: y } = d;
        if (y === e.element) {
          if (t) {
            const b = ne({ group: e });
            if (b === 0)
              return;
            const v = H2(e.id);
            if (!v)
              return;
            const g = ve2(e), w = v.defaultLayoutDeferred ? We(g) : v.layout, M = Vt({
              group: e,
              nextGroupSize: b,
              prevGroupSize: v.groupSize,
              prevLayout: w
            }), L2 = K3({
              layout: M,
              panelConstraints: g
            });
            if (!v.defaultLayoutDeferred && W2(v.layout, L2) && Ht(
              v.derivedPanelConstraints,
              g
            ) && v.groupSize === b)
              return;
            j(e, {
              defaultLayoutDeferred: false,
              derivedPanelConstraints: g,
              groupSize: b,
              layout: L2,
              separatorToPanels: v.separatorToPanels
            });
          }
        } else
          jt(e, y, h);
      }
    });
    s.observe(e.element), e.panels.forEach((f) => {
      C(
        !o.has(f.id),
        `Panel ids must be unique; id "${f.id}" was used more than once`
      ), o.add(f.id), f.onResize && s.observe(f.element);
    });
    const u2 = ne({ group: e }), a = ve2(e), r3 = e.panels.map(({ id: f }) => f).join(",");
    let l = e.mutableState.defaultLayout;
    l && (Ut(e.panels, l) || (l = void 0));
    const c = e.mutableState.layouts[r3] ?? l ?? We(a), m2 = K3({
      layout: c,
      panelConstraints: a
    }), p2 = e.element.ownerDocument;
    J2.set(
      p2,
      (J2.get(p2) ?? 0) + 1
    );
    const S = /* @__PURE__ */ new Map();
    return Ze(e).forEach((f) => {
      f.separator && S.set(f.separator, f.panels);
    }), j(e, {
      defaultLayoutDeferred: u2 === 0,
      derivedPanelConstraints: a,
      groupSize: u2,
      layout: m2,
      separatorToPanels: S
    }), e.separators.forEach((f) => {
      C(
        !i.has(f.id),
        `Separator ids must be unique; id "${f.id}" was used more than once`
      ), i.add(f.id), f.element.addEventListener("keydown", $e);
    }), J2.get(p2) === 1 && (p2.addEventListener("contextmenu", Ge, true), p2.addEventListener("dblclick", _e3, true), p2.addEventListener("pointerdown", je, true), p2.addEventListener("pointerleave", He), p2.addEventListener("pointermove", Ve), p2.addEventListener("pointerout", Ue), p2.addEventListener("pointerup", Be, true)), function() {
      t = false, J2.set(
        p2,
        Math.max(0, (J2.get(p2) ?? 0) - 1)
      ), kt(e), e.separators.forEach((d) => {
        d.element.removeEventListener("keydown", $e);
      }), J2.get(p2) || (p2.removeEventListener(
        "contextmenu",
        Ge,
        true
      ), p2.removeEventListener(
        "dblclick",
        _e3,
        true
      ), p2.removeEventListener(
        "pointerdown",
        je,
        true
      ), p2.removeEventListener("pointerleave", He), p2.removeEventListener("pointermove", Ve), p2.removeEventListener("pointerout", Ue), p2.removeEventListener("pointerup", Be, true)), s.disconnect();
    };
  }
  function Wt() {
    const [e, t] = useState({}), n = useCallback(() => t({}), []);
    return [e, n];
  }
  function Le(e) {
    const t = useId();
    return `${e ?? t}`;
  }
  var q = typeof window < "u" ? useLayoutEffect : useEffect;
  function se(e) {
    const t = useRef(e);
    return q(() => {
      t.current = e;
    }, [e]), useCallback(
      (...n) => t.current?.(...n),
      [t]
    );
  }
  function Ce2(...e) {
    return se((t) => {
      e.forEach((n) => {
        if (n)
          switch (typeof n) {
            case "function": {
              n(t);
              break;
            }
            case "object": {
              n.current = t;
              break;
            }
          }
      });
    });
  }
  function Re2(e) {
    const t = useRef({ ...e });
    return q(() => {
      for (const n in e)
        t.current[n] = e[n];
    }, [e]), t.current;
  }
  var ct = createContext(null);
  function Kt(e, t) {
    const n = useRef({
      getLayout: () => ({}),
      setLayout: Et
    });
    useImperativeHandle(t, () => n.current, []), q(() => {
      Object.assign(
        n.current,
        lt({ groupId: e })
      );
    });
  }
  function Xt({
    children: e,
    className: t,
    defaultLayout: n,
    disableCursor: o,
    disabled: i,
    elementRef: s,
    groupRef: u2,
    id: a,
    onLayoutChange: r3,
    onLayoutChanged: l,
    orientation: c = "horizontal",
    resizeTargetMinimumSize: m2 = {
      coarse: 20,
      fine: 10
    },
    style: p2,
    ...S
  }) {
    const z = useRef({
      onLayoutChange: {},
      onLayoutChanged: {}
    }), f = se((x) => {
      W2(z.current.onLayoutChange, x) || (z.current.onLayoutChange = x, r3?.(x));
    }), d = se(
      (x, P2) => {
        W2(z.current.onLayoutChanged, x) || (z.current.onLayoutChanged = x, l?.(x, { isUserInteraction: P2 }));
      }
    ), h = Le(a), y = useRef(null), [b, v] = Wt(), g = useRef({
      lastExpandedPanelSizes: {},
      layouts: {},
      panels: [],
      resizeTargetMinimumSize: m2,
      separators: []
    }), w = Ce2(y, s);
    Kt(h, u2);
    const M = se(
      (x, P2) => {
        const I2 = B3(), R = Oe(x), E = H2(x);
        if (E) {
          let D2 = false;
          switch (I2.state) {
            case "active": {
              D2 = I2.hitRegions.some(
                (V) => V.group === R
              );
              break;
            }
          }
          return {
            flexGrow: E.layout[P2] ?? 1,
            pointerEvents: D2 ? "none" : void 0
          };
        }
        if (n?.[P2])
          return {
            flexGrow: n?.[P2]
          };
      }
    ), L2 = Re2({
      defaultLayout: n,
      disableCursor: o
    }), G2 = useMemo(
      () => ({
        get disableCursor() {
          return !!L2.disableCursor;
        },
        getPanelStyles: M,
        id: h,
        orientation: c,
        registerPanel: (x) => {
          const P2 = g.current;
          return P2.panels = be2(c, [
            ...P2.panels,
            x
          ]), v(), () => {
            P2.panels = P2.panels.filter(
              (I2) => I2 !== x
            ), v();
          };
        },
        registerSeparator: (x) => {
          const P2 = g.current;
          return P2.separators = be2(c, [
            ...P2.separators,
            x
          ]), v(), () => {
            P2.separators = P2.separators.filter(
              (I2) => I2 !== x
            ), v();
          };
        },
        updatePanelProps: (x, { disabled: P2 }) => {
          const R = g.current.panels.find(
            (V) => V.id === x
          );
          R && (R.panelConstraints.disabled = P2);
          const E = Oe(h), D2 = H2(h);
          E && D2 && j(E, {
            ...D2,
            derivedPanelConstraints: ve2(E)
          });
        },
        updateSeparatorProps: (x, {
          disabled: P2,
          disableDoubleClick: I2
        }) => {
          const E = g.current.separators.find(
            (D2) => D2.id === x
          );
          E && (E.disabled = P2, E.disableDoubleClick = I2);
        }
      }),
      [M, h, v, c, L2]
    ), N2 = useRef(null);
    return q(() => {
      const x = y.current;
      if (x === null)
        return;
      const P2 = g.current;
      let I2;
      if (L2.defaultLayout !== void 0 && Object.keys(L2.defaultLayout).length === P2.panels.length) {
        I2 = {};
        for (const _ of P2.panels) {
          const Y3 = L2.defaultLayout[_.id];
          Y3 !== void 0 && (I2[_.id] = Y3);
        }
      }
      const R = {
        disabled: !!i,
        element: x,
        id: h,
        mutableState: {
          defaultLayout: I2,
          disableCursor: !!L2.disableCursor,
          expandedPanelSizes: g.current.lastExpandedPanelSizes,
          layouts: g.current.layouts
        },
        orientation: c,
        panels: P2.panels,
        resizeTargetMinimumSize: P2.resizeTargetMinimumSize,
        separators: P2.separators
      };
      N2.current = R;
      const E = Bt(R), { defaultLayoutDeferred: D2, derivedPanelConstraints: V, layout: ue2 } = H2(R.id, true);
      !D2 && V.length > 0 && (f(ue2), d(ue2, false));
      const oe = Pe2(h, (_) => {
        const { defaultLayoutDeferred: Y3, derivedPanelConstraints: Ee2, layout: ce2 } = _.next;
        if (Y3 || Ee2.length === 0)
          return;
        const ft = R.panels.map(({ id: $2 }) => $2).join(",");
        R.mutableState.layouts[ft] = ce2, Ee2.forEach(($2) => {
          if ($2.collapsible) {
            const { layout: ge } = _.prev ?? {};
            if (ge) {
              const pt = k3(
                $2.collapsedSize,
                ce2[$2.panelId]
              ), ht = k3(
                $2.collapsedSize,
                ge[$2.panelId]
              );
              pt && !ht && (R.mutableState.expandedPanelSizes[$2.panelId] = ge[$2.panelId]);
            }
          }
        });
        const dt = B3().state !== "active";
        f(ce2), dt && d(ce2, _.isUserInteraction);
      });
      return () => {
        N2.current = null, E(), oe();
      };
    }, [
      i,
      h,
      d,
      f,
      c,
      b,
      L2
    ]), useEffect(() => {
      const x = N2.current;
      x && (x.mutableState.defaultLayout = n, x.mutableState.disableCursor = !!o);
    }), /* @__PURE__ */ jsx(ct.Provider, { value: G2, children: /* @__PURE__ */ jsx(
      "div",
      {
        ...S,
        className: t,
        "data-group": true,
        "data-testid": h,
        id: h,
        ref: w,
        style: {
          height: "100%",
          width: "100%",
          overflow: "hidden",
          ...p2,
          display: "flex",
          flexDirection: c === "horizontal" ? "row" : "column",
          flexWrap: "nowrap",
          // Inform the browser that the library is handling touch events for this element
          // but still allow users to scroll content within panels in the non-resizing direction
          // NOTE This is not an inherited style
          // See github.com/bvaughn/react-resizable-panels/issues/662
          touchAction: c === "horizontal" ? "pan-y" : "pan-x"
        },
        children: e
      }
    ) });
  }
  Xt.displayName = "Group";
  function Me2() {
    const e = useContext(ct);
    return C(
      e,
      "Group Context not found; did you render a Panel or Separator outside of a Group?"
    ), e;
  }
  function Jt(e, t) {
    const { id: n } = Me2(), o = useRef({
      collapse: ye2,
      expand: ye2,
      getSize: () => ({
        asPercentage: 0,
        inPixels: 0
      }),
      isCollapsed: () => false,
      resize: ye2
    });
    useImperativeHandle(t, () => o.current, []), q(() => {
      Object.assign(
        o.current,
        at({ groupId: n, panelId: e })
      );
    });
  }
  function Zt({
    children: e,
    className: t,
    collapsedSize: n = "0%",
    collapsible: o = false,
    defaultSize: i,
    disabled: s,
    elementRef: u2,
    groupResizeBehavior: a = "preserve-relative-size",
    id: r3,
    maxSize: l = "100%",
    minSize: c = "0%",
    onResize: m2,
    panelRef: p2,
    style: S,
    ...z
  }) {
    const f = !!r3, d = Le(r3), h = Re2({
      disabled: s
    }), y = useRef(null), b = Ce2(y, u2), {
      getPanelStyles: v,
      id: g,
      orientation: w,
      registerPanel: M,
      updatePanelProps: L2
    } = Me2(), G2 = m2 !== null, N2 = se(
      (R, E, D2) => {
        m2?.(R, r3, D2);
      }
    );
    q(() => {
      const R = y.current;
      if (R !== null) {
        const E = {
          element: R,
          id: d,
          idIsStable: f,
          mutableValues: {
            expandToSize: void 0,
            prevSize: void 0
          },
          onResize: G2 ? N2 : void 0,
          panelConstraints: {
            groupResizeBehavior: a,
            collapsedSize: n,
            collapsible: o,
            defaultSize: i,
            disabled: h.disabled,
            maxSize: l,
            minSize: c
          }
        };
        return M(E);
      }
    }, [
      a,
      n,
      o,
      i,
      G2,
      d,
      f,
      l,
      c,
      N2,
      M,
      h
    ]), useEffect(() => {
      L2(d, { disabled: s });
    }, [s, d, L2]), Jt(d, p2);
    const x = () => {
      const R = v(g, d);
      if (R)
        return JSON.stringify(R);
    }, P2 = useSyncExternalStore(
      (R) => Pe2(g, R),
      x,
      x
    );
    let I2;
    return P2 ? I2 = JSON.parse(P2) : i !== void 0 ? I2 = {
      flexGrow: void 0,
      flexShrink: void 0,
      flexBasis: i
    } : I2 = { flexGrow: 1 }, /* @__PURE__ */ jsx(
      "div",
      {
        ...z,
        "data-disabled": s || void 0,
        "data-panel": true,
        "data-testid": d,
        id: d,
        ref: b,
        style: {
          ...Qt,
          display: "flex",
          flexBasis: 0,
          flexShrink: 1,
          overflow: "visible",
          ...I2
        },
        children: /* @__PURE__ */ jsx(
          "div",
          {
            className: t,
            style: {
              maxHeight: "100%",
              maxWidth: "100%",
              flexGrow: 1,
              overflow: "auto",
              ...S,
              // Inform the browser that the library is handling touch events for this element
              // but still allow users to scroll content within panels in the non-resizing direction
              // NOTE This is not an inherited style
              // See github.com/bvaughn/react-resizable-panels/issues/662
              touchAction: w === "horizontal" ? "pan-y" : "pan-x"
            },
            children: e
          }
        )
      }
    );
  }
  Zt.displayName = "Panel";
  var Qt = {
    minHeight: 0,
    maxHeight: "100%",
    height: "auto",
    minWidth: 0,
    maxWidth: "100%",
    width: "auto",
    border: "none",
    borderWidth: 0,
    padding: 0,
    margin: 0
  };
  function en({
    layout: e,
    panelConstraints: t,
    panelId: n,
    panelIndex: o
  }) {
    let i, s;
    const u2 = e[n], a = t.find(
      (r3) => r3.panelId === n
    );
    if (a) {
      const r3 = a.maxSize, l = a.collapsible ? a.collapsedSize : a.minSize, c = [o, o + 1];
      s = K3({
        layout: le2({
          delta: l - u2,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t
      })[n], i = K3({
        layout: le2({
          delta: r3 - u2,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t
      })[n];
    }
    return {
      valueControls: n,
      valueMax: i,
      valueMin: s,
      valueNow: u2
    };
  }
  function tn({
    children: e,
    className: t,
    disabled: n,
    disableDoubleClick: o,
    elementRef: i,
    id: s,
    style: u2,
    ...a
  }) {
    const r3 = Le(s), l = Re2({
      disabled: n,
      disableDoubleClick: o
    }), [c, m2] = useState({}), [p2, S] = useState("inactive"), [z, f] = useState(false), d = useRef(null), h = Ce2(d, i), {
      disableCursor: y,
      id: b,
      orientation: v,
      registerSeparator: g,
      updateSeparatorProps: w
    } = Me2(), M = v === "horizontal" ? "vertical" : "horizontal";
    q(() => {
      const N2 = d.current;
      if (N2 !== null) {
        const x = {
          disabled: l.disabled,
          disableDoubleClick: l.disableDoubleClick,
          element: N2,
          id: r3
        }, P2 = g(x), I2 = Rt(
          (E) => {
            S(
              E.next.state !== "inactive" && E.next.hitRegions.some(
                (D2) => D2.separator === x
              ) ? E.next.state : "inactive"
            );
          }
        ), R = Pe2(
          b,
          (E) => {
            const { derivedPanelConstraints: D2, layout: V, separatorToPanels: ue2 } = E.next, oe = ue2.get(x);
            if (oe) {
              const _ = oe[0], Y3 = oe.indexOf(_);
              m2(
                en({
                  layout: V,
                  panelConstraints: D2,
                  panelId: _.id,
                  panelIndex: Y3
                })
              );
            }
          }
        );
        return () => {
          I2(), R(), P2();
        };
      }
    }, [b, r3, g, l]), useEffect(() => {
      w(r3, { disabled: n, disableDoubleClick: o });
    }, [n, o, r3, w]);
    let L2;
    n && !y && (L2 = "not-allowed");
    let G2;
    if (n)
      G2 = "disabled";
    else
      switch (p2) {
        case "active": {
          G2 = "active";
          break;
        }
        default:
          z ? G2 = "focus" : G2 = p2;
      }
    return /* @__PURE__ */ jsx(
      "div",
      {
        ...a,
        "aria-controls": c.valueControls,
        "aria-disabled": n || void 0,
        "aria-orientation": M,
        "aria-valuemax": c.valueMax,
        "aria-valuemin": c.valueMin,
        "aria-valuenow": c.valueNow,
        children: e,
        className: t,
        "data-separator": G2,
        "data-testid": r3,
        id: r3,
        onBlur: () => f(false),
        onFocus: () => f(true),
        ref: h,
        role: "separator",
        style: {
          flexBasis: "auto",
          cursor: L2,
          ...u2,
          flexGrow: 0,
          flexShrink: 0,
          // Inform the browser that the library is handling touch events for this element
          // See github.com/bvaughn/react-resizable-panels/issues/662
          touchAction: "none"
        },
        tabIndex: n ? void 0 : 0
      }
    );
  }
  tn.displayName = "Separator";

  // ../../../packages/shadcn-ui/dist/index.js
  function r2(...e) {
    return twMerge(clsx(e));
  }
  var de3 = cva(
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
          secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
          destructive: "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
          outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
          ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
          link: "text-primary underline-offset-4 hover:underline"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  function rt2({
    className: e,
    variant: t = "default",
    asChild: o = false,
    ...n
  }) {
    const i = o ? dist_exports.Root : "span";
    return /* @__PURE__ */ jsx(
      i,
      {
        "data-slot": "badge",
        "data-variant": t,
        className: r2(de3({ variant: t }), e),
        ...n
      }
    );
  }
  var se2 = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground hover:bg-primary/80",
          outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
          secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
          destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
          link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
          default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
          sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          icon: "size-8",
          "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
          "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
          "icon-lg": "size-9"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  function I({
    className: e,
    variant: t = "default",
    size: o = "default",
    asChild: n = false,
    ...i
  }) {
    const s = n ? dist_exports.Root : "button";
    return /* @__PURE__ */ jsx(
      s,
      {
        "data-slot": "button",
        "data-variant": t,
        "data-size": o,
        className: r2(se2({ variant: t, size: o, className: e })),
        ...i
      }
    );
  }
  function ct2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Root,
      {
        "data-slot": "checkbox",
        className: r2(
          "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
          e
        ),
        ...t,
        children: /* @__PURE__ */ jsx(
          dist_exports3.Indicator,
          {
            "data-slot": "checkbox-indicator",
            className: "grid place-content-center text-current transition-none [&>svg]:size-3.5",
            children: /* @__PURE__ */ jsx(
              Check,
              {}
            )
          }
        )
      }
    );
  }
  function W3({ className: e, type: t, ...o }) {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type: t,
        "data-slot": "input",
        className: r2(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...o
      }
    );
  }
  function be3({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "textarea",
      {
        "data-slot": "textarea",
        className: r2(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...t
      }
    );
  }
  function ve3({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "input-group",
        role: "group",
        className: r2(
          "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
          e
        ),
        ...t
      }
    );
  }
  var he2 = cva(
    "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
    {
      variants: {
        align: {
          "inline-start": "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
          "inline-end": "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
          "block-start": "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
          "block-end": "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2"
        }
      },
      defaultVariants: {
        align: "inline-start"
      }
    }
  );
  function xe3({
    className: e,
    align: t = "inline-start",
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        role: "group",
        "data-slot": "input-group-addon",
        "data-align": t,
        className: r2(he2({ align: t }), e),
        onClick: (n) => {
          n.target.closest("button") || n.currentTarget.parentElement?.querySelector("input")?.focus();
        },
        ...o
      }
    );
  }
  var we3 = cva(
    "flex items-center gap-2 text-sm shadow-none",
    {
      variants: {
        size: {
          xs: "h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
          sm: "",
          "icon-xs": "size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0",
          "icon-sm": "size-8 p-0 has-[>svg]:p-0"
        }
      },
      defaultVariants: {
        size: "xs"
      }
    }
  );
  function yt({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      _e,
      {
        "data-slot": "command",
        className: r2(
          "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
          e
        ),
        ...t
      }
    );
  }
  function Nt2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx("div", { "data-slot": "command-input-wrapper", className: "p-1 pb-0", children: /* @__PURE__ */ jsxs(ve3, { className: "h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!", children: [
      /* @__PURE__ */ jsx(
        _e.Input,
        {
          "data-slot": "command-input",
          className: r2(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            e
          ),
          ...t
        }
      ),
      /* @__PURE__ */ jsx(xe3, { children: /* @__PURE__ */ jsx(Search, { className: "size-4 shrink-0 opacity-50" }) })
    ] }) });
  }
  function Ct2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      _e.List,
      {
        "data-slot": "command-list",
        className: r2(
          "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
          e
        ),
        ...t
      }
    );
  }
  function St2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      _e.Empty,
      {
        "data-slot": "command-empty",
        className: r2("py-6 text-center text-sm", e),
        ...t
      }
    );
  }
  function _t2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      _e.Group,
      {
        "data-slot": "command-group",
        className: r2(
          "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
          e
        ),
        ...t
      }
    );
  }
  function It2({
    className: e,
    children: t,
    ...o
  }) {
    return /* @__PURE__ */ jsxs(
      _e.Item,
      {
        "data-slot": "command-item",
        className: r2(
          "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
          e
        ),
        ...o,
        children: [
          t,
          /* @__PURE__ */ jsx(Check, { className: "ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" })
        ]
      }
    );
  }
  function Ut2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports7.Root, { "data-slot": "dropdown-menu", ...e });
  }
  function Wt2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports7.Trigger,
      {
        "data-slot": "dropdown-menu-trigger",
        ...e
      }
    );
  }
  function Xt2({
    className: e,
    align: t = "start",
    sideOffset: o = 4,
    ...n
  }) {
    return /* @__PURE__ */ jsx(dist_exports7.Portal, { children: /* @__PURE__ */ jsx(
      dist_exports7.Content,
      {
        "data-slot": "dropdown-menu-content",
        sideOffset: o,
        align: t,
        className: r2("z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", e),
        ...n
      }
    ) });
  }
  function Jt2({
    className: e,
    inset: t,
    variant: o = "default",
    ...n
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports7.Item,
      {
        "data-slot": "dropdown-menu-item",
        "data-inset": t,
        "data-variant": o,
        className: r2(
          "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
          e
        ),
        ...n
      }
    );
  }
  function Yt({
    className: e,
    children: t,
    checked: o,
    inset: n,
    ...i
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports7.CheckboxItem,
      {
        "data-slot": "dropdown-menu-checkbox-item",
        "data-inset": n,
        className: r2(
          "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        checked: o,
        ...i,
        children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: "pointer-events-none absolute right-2 flex items-center justify-center",
              "data-slot": "dropdown-menu-checkbox-item-indicator",
              children: /* @__PURE__ */ jsx(dist_exports7.ItemIndicator, { children: /* @__PURE__ */ jsx(
                Check,
                {}
              ) })
            }
          ),
          t
        ]
      }
    );
  }
  function Qt2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports7.RadioGroup,
      {
        "data-slot": "dropdown-menu-radio-group",
        ...e
      }
    );
  }
  function ea({
    className: e,
    children: t,
    inset: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports7.RadioItem,
      {
        "data-slot": "dropdown-menu-radio-item",
        "data-inset": o,
        className: r2(
          "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...n,
        children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: "pointer-events-none absolute right-2 flex items-center justify-center",
              "data-slot": "dropdown-menu-radio-item-indicator",
              children: /* @__PURE__ */ jsx(dist_exports7.ItemIndicator, { children: /* @__PURE__ */ jsx(
                Check,
                {}
              ) })
            }
          ),
          t
        ]
      }
    );
  }
  function ta({
    className: e,
    inset: t,
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports7.Label,
      {
        "data-slot": "dropdown-menu-label",
        "data-inset": t,
        className: r2(
          "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
          e
        ),
        ...o
      }
    );
  }
  function aa({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports7.Separator,
      {
        "data-slot": "dropdown-menu-separator",
        className: r2("-mx-1 my-1 h-px bg-border", e),
        ...t
      }
    );
  }
  function xa({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports9.Root, { "data-slot": "select", ...e });
  }
  function za({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports9.Value, { "data-slot": "select-value", ...e });
  }
  function ya({
    className: e,
    size: t = "default",
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports9.Trigger,
      {
        "data-slot": "select-trigger",
        "data-size": t,
        className: r2(
          "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...n,
        children: [
          o,
          /* @__PURE__ */ jsx(dist_exports9.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDown, { className: "pointer-events-none size-4 text-muted-foreground" }) })
        ]
      }
    );
  }
  function ka({
    className: e,
    children: t,
    position: o = "item-aligned",
    align: n = "center",
    ...i
  }) {
    return /* @__PURE__ */ jsx(dist_exports9.Portal, { children: /* @__PURE__ */ jsxs(
      dist_exports9.Content,
      {
        "data-slot": "select-content",
        "data-align-trigger": o === "item-aligned",
        className: r2("relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", o === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", e),
        position: o,
        align: n,
        ...i,
        children: [
          /* @__PURE__ */ jsx(ye3, {}),
          /* @__PURE__ */ jsx(
            dist_exports9.Viewport,
            {
              "data-position": o,
              className: r2(
                "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
                o === "popper" && ""
              ),
              children: t
            }
          ),
          /* @__PURE__ */ jsx(ke3, {})
        ]
      }
    ) });
  }
  function Ca({
    className: e,
    children: t,
    ...o
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports9.Item,
      {
        "data-slot": "select-item",
        className: r2(
          "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          e
        ),
        ...o,
        children: [
          /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center", children: /* @__PURE__ */ jsx(dist_exports9.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "pointer-events-none" }) }) }),
          /* @__PURE__ */ jsx(dist_exports9.ItemText, { children: t })
        ]
      }
    );
  }
  function ye3({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports9.ScrollUpButton,
      {
        "data-slot": "select-scroll-up-button",
        className: r2(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...t,
        children: /* @__PURE__ */ jsx(
          ChevronUp,
          {}
        )
      }
    );
  }
  function ke3({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports9.ScrollDownButton,
      {
        "data-slot": "select-scroll-down-button",
        className: r2(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...t,
        children: /* @__PURE__ */ jsx(
          ChevronDown,
          {}
        )
      }
    );
  }
  function Ne2({
    className: e,
    orientation: t = "horizontal",
    decorative: o = true,
    ...n
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports10.Root,
      {
        "data-slot": "separator",
        decorative: o,
        orientation: t,
        className: r2(
          "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
          e
        ),
        ...n
      }
    );
  }
  function Ce3({ ...e }) {
    return /* @__PURE__ */ jsx(dist_exports2.Root, { "data-slot": "sheet", ...e });
  }
  function Se2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports2.Portal, { "data-slot": "sheet-portal", ...e });
  }
  function _e4({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.Overlay,
      {
        "data-slot": "sheet-overlay",
        className: r2(
          "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          e
        ),
        ...t
      }
    );
  }
  function Te3({
    className: e,
    children: t,
    side: o = "right",
    showCloseButton: n = true,
    ...i
  }) {
    return /* @__PURE__ */ jsxs(Se2, { children: [
      /* @__PURE__ */ jsx(_e4, {}),
      /* @__PURE__ */ jsxs(
        dist_exports2.Content,
        {
          "data-slot": "sheet-content",
          "data-side": o,
          className: r2(
            "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
            e
          ),
          ...i,
          children: [
            t,
            n && /* @__PURE__ */ jsx(dist_exports2.Close, { "data-slot": "sheet-close", asChild: true, children: /* @__PURE__ */ jsxs(
              I,
              {
                variant: "ghost",
                className: "absolute top-3 right-3",
                size: "icon-sm",
                children: [
                  /* @__PURE__ */ jsx(
                    X,
                    {}
                  ),
                  /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
                ]
              }
            ) })
          ]
        }
      )
    ] });
  }
  var Be2 = 3600 * 24 * 7;
  var X4 = createContext(null);
  var Ve2 = cva(
    "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
    {
      variants: {
        variant: {
          default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          outline: "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]"
        },
        size: {
          default: "h-8 text-sm",
          sm: "h-7 text-xs",
          lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  function ar({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "table-container",
        className: "relative w-full overflow-x-auto",
        children: /* @__PURE__ */ jsx(
          "table",
          {
            "data-slot": "table",
            className: r2("w-full caption-bottom text-sm", e),
            ...t
          }
        )
      }
    );
  }
  function rr({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "thead",
      {
        "data-slot": "table-header",
        className: r2("[&_tr]:border-b", e),
        ...t
      }
    );
  }
  function or({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "tbody",
      {
        "data-slot": "table-body",
        className: r2("[&_tr:last-child]:border-0", e),
        ...t
      }
    );
  }
  function ir({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "tr",
      {
        "data-slot": "table-row",
        className: r2(
          "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
          e
        ),
        ...t
      }
    );
  }
  function dr({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "th",
      {
        "data-slot": "table-head",
        className: r2(
          "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
          e
        ),
        ...t
      }
    );
  }
  function sr({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "td",
      {
        "data-slot": "table-cell",
        className: r2(
          "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
          e
        ),
        ...t
      }
    );
  }
  function ur({
    className: e,
    orientation: t = "horizontal",
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports11.Root,
      {
        "data-slot": "tabs",
        "data-orientation": t,
        className: r2(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          e
        ),
        ...o
      }
    );
  }
  var He2 = cva(
    "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
    {
      variants: {
        variant: {
          default: "bg-muted",
          line: "gap-1 bg-transparent"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  function cr({
    className: e,
    variant: t = "default",
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports11.List,
      {
        "data-slot": "tabs-list",
        "data-variant": t,
        className: r2(He2({ variant: t }), e),
        ...o
      }
    );
  }
  function gr({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports11.Trigger,
      {
        "data-slot": "tabs-trigger",
        className: r2(
          "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
          "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
          "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
          e
        ),
        ...t
      }
    );
  }
  function pr({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports11.Content,
      {
        "data-slot": "tabs-content",
        className: r2("flex-1 text-sm outline-none", e),
        ...t
      }
    );
  }
  var Z3 = cva(
    "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default: "bg-transparent",
          outline: "border border-input bg-transparent hover:bg-muted"
        },
        size: {
          default: "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  var J3 = createContext({
    size: "default",
    variant: "default",
    spacing: 2,
    orientation: "horizontal"
  });

  // src/lib/remote-components/crm-workbench/src/icons.tsx
  function Icon2({ name }) {
    const path = iconPath(name);
    return /* @__PURE__ */ React.createElement("svg", { className: "crm20-icon", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, path);
  }
  function iconPath(name) {
    switch (name) {
      case "home":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 11.4 12 5l8 6.4v7.1a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20H5.5A1.5 1.5 0 0 1 4 18.5v-7.1Z" });
      case "message":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" });
      case "message-plus":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.5v4M10 9.5h4" }));
      case "building":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20M4.5 20h15M9 8h2M13 8h2M9 11h2M13 11h2M9 14h2M13 14h2" });
      case "person":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" });
      case "target":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h8" });
      case "check":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 12.5 9.2 17 19 7" });
      case "note":
        return /* @__PURE__ */ React.createElement("path", { d: "M7 4h7l3 3v13H7V4ZM14 4v4h4M9.5 12h5M9.5 15h5" });
      case "grid":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h5v5h-5v-5Z" });
      case "workflow":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 7h5M13 7h5M6 17h5M13 17h5M11 7v10M13 7v10" });
      case "search":
        return /* @__PURE__ */ React.createElement("path", { d: "m16.5 16.5 3.5 3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" });
      case "list":
        return /* @__PURE__ */ React.createElement("path", { d: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" });
      case "plus":
        return /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" });
      case "refresh":
        return /* @__PURE__ */ React.createElement("path", { d: "M19 8a7 7 0 0 0-12.1-2.8L5 7M5 4v3h3M5 16a7 7 0 0 0 12.1 2.8L19 17M19 20v-3h-3" });
      case "more":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 12h.01M12 12h.01M18 12h.01" });
      case "chevron":
        return /* @__PURE__ */ React.createElement("path", { d: "m8 10 4 4 4-4" });
      case "close":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 6 18 18M18 6 6 18" });
      case "save":
        return /* @__PURE__ */ React.createElement("path", { d: "M6 4h10l2 2v14H6V4ZM9 4v6h6V4M9 17h6" });
      case "edit":
        return /* @__PURE__ */ React.createElement("path", { d: "M5 19h4l10-10-4-4L5 15v4ZM13.5 6.5l4 4" });
      case "table":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 6h16v12H4V6ZM4 10h16M9 6v12M15 6v12" });
      case "link":
        return /* @__PURE__ */ React.createElement("path", { d: "M10 14a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7L11 7.3M14 10a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7L13 16.7" });
      case "mail":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 6h16v12H4V6ZM5 7l7 6 7-6" });
      case "phone":
        return /* @__PURE__ */ React.createElement("path", { d: "M8 5h3l1 4-2 1a9 9 0 0 0 4 4l1-2 4 1v3a2 2 0 0 1-2 2A11 11 0 0 1 6 7a2 2 0 0 1 2-2Z" });
      case "calendar":
        return /* @__PURE__ */ React.createElement("path", { d: "M7 4v3M17 4v3M5 8h14M6 6h12a1 1 0 0 1 1 1v12H5V7a1 1 0 0 1 1-1Z" });
      case "money":
        return /* @__PURE__ */ React.createElement("path", { d: "M4 7h16v10H4V7ZM7 10h.01M17 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" });
      case "hash":
        return /* @__PURE__ */ React.createElement("path", { d: "M9 4 7 20M17 4l-2 16M5 9h14M4 15h14" });
      default:
        return /* @__PURE__ */ React.createElement("path", { d: "M5 5h14v14H5V5Z" });
    }
  }

  // src/lib/remote-components/crm-workbench/src/i18n.ts
  var TEXT = {
    zh_Hans: {
      loading: "\u6B63\u5728\u521D\u59CB\u5316 CRM \u5DE5\u4F5C\u53F0...",
      workspace: "Xpert CRM",
      nativeCrm: "\u539F\u751F CRM",
      newChat: "New chat",
      allRecords: "\u5168\u90E8",
      records: "\u8BB0\u5F55",
      record: "\u8BB0\u5F55",
      objects: "\u5BF9\u8C61",
      searchPlaceholder: "\u641C\u7D22\u5F53\u524D\u5BF9\u8C61",
      filter: "\u7B5B\u9009",
      sort: "\u6392\u5E8F",
      options: "\u9009\u9879",
      refresh: "\u5237\u65B0",
      addNew: "Add New",
      newRecord: "\u65B0\u5EFA\u8BB0\u5F55",
      create: "\u65B0\u5EFA",
      edit: "\u7F16\u8F91",
      save: "\u4FDD\u5B58",
      saving: "\u4FDD\u5B58\u4E2D...",
      cancel: "\u53D6\u6D88",
      close: "\u5173\u95ED",
      details: "\u8BE6\u60C5",
      empty: "\u6682\u65E0\u8BB0\u5F55",
      noValue: "-",
      countAll: "\u603B\u8BA1",
      calculate: "\u8BA1\u7B97",
      notEmpty: "\u975E\u7A7A",
      updated: "\u66F4\u65B0",
      created: "\u521B\u5EFA",
      fields: "\u5B57\u6BB5",
      required: "\u5FC5\u586B",
      untitled: "\u672A\u547D\u540D",
      saved: "CRM \u8BB0\u5F55\u5DF2\u4FDD\u5B58",
      loadFailed: "CRM \u6570\u636E\u52A0\u8F7D\u5931\u8D25",
      saveFailed: "\u4FDD\u5B58\u5931\u8D25",
      showCompact: "\u7D27\u51D1\u5BC6\u5EA6",
      showComfortable: "\u8212\u9002\u5BC6\u5EA6",
      viewMode: "\u89C6\u56FE",
      selectedCount: "\u5DF2\u9009\u62E9",
      clearSelection: "\u6E05\u9664\u9009\u62E9",
      selectAll: "\u5168\u9009\u5F53\u524D\u9875",
      sortBy: "\u6392\u5E8F\u5B57\u6BB5",
      noSorting: "\u9ED8\u8BA4\u987A\u5E8F",
      ascending: "\u5347\u5E8F",
      descending: "\u964D\u5E8F",
      tableDensity: "\u8868\u683C\u5BC6\u5EA6",
      compactDensity: "\u7D27\u51D1",
      comfortableDensity: "\u8212\u9002",
      visibleRows: "\u5F53\u524D\u53EF\u89C1",
      relationReference: "\u5173\u8054\u8BB0\u5F55 ID",
      searchActive: "\u641C\u7D22\u4E2D",
      fieldsMenu: "\u5B57\u6BB5",
      visibleFields: "\u663E\u793A\u5B57\u6BB5",
      viewSaved: "\u89C6\u56FE\u5DF2\u4FDD\u5B58",
      atLeastOneColumn: "\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u663E\u793A\u5B57\u6BB5",
      searchRelation: "\u641C\u7D22\u5173\u8054\u8BB0\u5F55",
      relatedRecords: "\u5173\u8054\u8BB0\u5F55",
      relationNoResults: "\u6CA1\u6709\u627E\u5230\u5173\u8054\u8BB0\u5F55",
      clearRelation: "\u6E05\u9664\u5173\u8054",
      loadingRelatedRecords: "\u6B63\u5728\u52A0\u8F7D\u5173\u8054\u8BB0\u5F55...",
      linkedBy: "\u901A\u8FC7",
      openRelatedRecord: "\u6253\u5F00\u5173\u8054\u8BB0\u5F55",
      moreRelatedRecords: "\u66F4\u591A\u5173\u8054\u8BB0\u5F55",
      timeline: "\u65F6\u95F4\u7EBF",
      properties: "\u5B57\u6BB5",
      noTimelineItems: "\u6682\u65E0\u65F6\u95F4\u7EBF",
      activity: "\u6D3B\u52A8",
      note: "\u5907\u6CE8",
      task: "\u4EFB\u52A1",
      due: "\u622A\u6B62"
    },
    en_US: {
      loading: "Initializing CRM workbench...",
      workspace: "Xpert CRM",
      nativeCrm: "Native CRM",
      newChat: "New chat",
      allRecords: "All",
      records: "records",
      record: "Record",
      objects: "Objects",
      searchPlaceholder: "Search this object",
      filter: "Filter",
      sort: "Sort",
      options: "Options",
      refresh: "Refresh",
      addNew: "Add New",
      newRecord: "New record",
      create: "Create",
      edit: "Edit",
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      close: "Close",
      details: "Details",
      empty: "No records yet",
      noValue: "-",
      countAll: "Count all",
      calculate: "Calculate",
      notEmpty: "Not empty",
      updated: "Updated",
      created: "Created",
      fields: "Fields",
      required: "Required",
      untitled: "Untitled",
      saved: "CRM record saved",
      loadFailed: "CRM data failed to load",
      saveFailed: "Save failed",
      showCompact: "Compact density",
      showComfortable: "Comfortable density",
      viewMode: "View",
      selectedCount: "selected",
      clearSelection: "Clear selection",
      selectAll: "Select visible",
      sortBy: "Sort by",
      noSorting: "Default order",
      ascending: "Ascending",
      descending: "Descending",
      tableDensity: "Table density",
      compactDensity: "Compact",
      comfortableDensity: "Comfortable",
      visibleRows: "Visible",
      relationReference: "Related record ID",
      searchActive: "Search active",
      fieldsMenu: "Fields",
      visibleFields: "Visible fields",
      viewSaved: "View saved",
      atLeastOneColumn: "Keep at least one visible field",
      searchRelation: "Search related records",
      relatedRecords: "Related records",
      relationNoResults: "No related records found",
      clearRelation: "Clear relation",
      loadingRelatedRecords: "Loading related records...",
      linkedBy: "Linked by",
      openRelatedRecord: "Open related record",
      moreRelatedRecords: "more related records",
      timeline: "Timeline",
      properties: "Properties",
      noTimelineItems: "No timeline items",
      activity: "Activity",
      note: "Note",
      task: "Task",
      due: "Due"
    }
  };
  function resolveLocale(locale) {
    return locale && locale.toLowerCase().startsWith("zh") ? "zh_Hans" : "en_US";
  }

  // src/lib/remote-components/crm-workbench/src/components/field-value.tsx
  function NameCell({
    field,
    fields,
    record,
    objectKey,
    locale,
    relationLabels,
    t
  }) {
    const title = displayRecordTitle(record, fields, t);
    return /* @__PURE__ */ React2.createElement("span", { className: "crm20-name-cell" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${objectKey}` }, recordInitial(title)), /* @__PURE__ */ React2.createElement("span", { className: "crm20-name-text" }, /* @__PURE__ */ React2.createElement(FieldValue, { value: record.values?.[field.fieldKey] ?? title, field, fields, locale, relationLabels, t })));
  }
  function FieldValue({
    value,
    field,
    fields,
    locale,
    t,
    relationLabels
  }) {
    if (value === void 0 || value === null || value === "") {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-muted-value" }, t.noValue);
    }
    if (field.type === "currency") {
      return /* @__PURE__ */ React2.createElement("span", null, formatCurrency(value, locale));
    }
    if (field.type === "boolean") {
      return /* @__PURE__ */ React2.createElement("span", null, value ? locale === "zh_Hans" ? "\u662F" : "Yes" : locale === "zh_Hans" ? "\u5426" : "No");
    }
    if (field.type === "select" && Array.isArray(field.options)) {
      const option = field.options.find((item) => item.value === String(value));
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-chip", style: { "--chip-color": option?.color || "#64748b" } }, /* @__PURE__ */ React2.createElement("span", null), option?.label || String(value));
    }
    if (field.type === "multi_select") {
      const items = Array.isArray(value) ? value : String(value).split(/[,，、;；\n]+/).filter(Boolean);
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-multi-value" }, items.slice(0, 2).map((item) => /* @__PURE__ */ React2.createElement("span", { className: "crm20-pill", key: String(item) }, String(item))), items.length > 2 ? /* @__PURE__ */ React2.createElement("span", { className: "crm20-muted-value" }, "+", items.length - 2) : null);
    }
    if (field.type === "url" || isUrlLike(String(value))) {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-link-pill" }, shortUrl(String(value)));
    }
    if (field.type === "email") {
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-link-value" }, String(value));
    }
    if (field.type === "date" || field.type === "datetime") {
      return /* @__PURE__ */ React2.createElement("span", null, formatDate(value, locale));
    }
    if (field.type === "relation") {
      const relationId = String(value);
      const relationLabel = relationLabels?.[field.fieldKey]?.[relationId];
      return /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-value" }, relationLabel || `#${relationId.slice(0, 8)}`);
    }
    return /* @__PURE__ */ React2.createElement("span", null, formatText(value, field, fields, t));
  }

  // src/lib/remote-components/crm-workbench/src/components/relation-picker.tsx
  var { useCallback: useCallback2, useEffect: useEffect2, useMemo: useMemo2, useState: useState2 } = React2;
  var RELATION_PAGE_SIZE = 8;
  function RelationPicker({
    field,
    value,
    locale,
    t,
    onChange
  }) {
    const targetObjectKey = field.relationObjectKey || "";
    const valueText = value === void 0 || value === null ? "" : String(value);
    const [open, setOpen] = useState2(false);
    const [query, setQuery] = useState2("");
    const [busy, setBusy] = useState2(false);
    const [targetFields, setTargetFields] = useState2([]);
    const [records, setRecords] = useState2([]);
    const [selectedRecord, setSelectedRecord] = useState2(null);
    const selectedTitle = useMemo2(() => {
      if (selectedRecord) return displayRecordTitle(selectedRecord, targetFields, t);
      if (valueText) return `#${valueText.slice(0, 8)}`;
      return t.noValue;
    }, [selectedRecord, t, targetFields, valueText]);
    const loadRecords = useCallback2(
      async (search, recordId) => {
        if (!targetObjectKey) return;
        setBusy(true);
        try {
          const response = await requestData({
            page: 1,
            pageSize: RELATION_PAGE_SIZE,
            search: search.trim() || void 0,
            parameters: {
              objectKey: targetObjectKey,
              recordId: recordId || void 0
            }
          });
          const result = normalizeData(unwrap(response));
          const items = [...result.table.items];
          if (result.selectedRecord && !items.some((item) => item.id === result.selectedRecord?.id)) {
            items.unshift(result.selectedRecord);
          }
          setTargetFields(result.fields);
          setRecords(items);
          if (valueText) {
            const selected = items.find((item) => item.id === valueText) ?? null;
            setSelectedRecord(selected);
          }
        } finally {
          setBusy(false);
        }
      },
      [targetObjectKey, valueText]
    );
    useEffect2(() => {
      if (!targetObjectKey) return;
      loadRecords("", valueText || void 0);
    }, [loadRecords, targetObjectKey, valueText]);
    useEffect2(() => {
      if (!open) return;
      const timeout = window.setTimeout(() => {
        loadRecords(query, valueText || void 0);
      }, 220);
      return () => window.clearTimeout(timeout);
    }, [loadRecords, open, query, valueText]);
    function selectRecord(record) {
      setSelectedRecord(record);
      onChange(record.id);
      setOpen(false);
      setQuery("");
    }
    function clearRelation() {
      setSelectedRecord(null);
      onChange("");
      setOpen(false);
      setQuery("");
    }
    if (!targetObjectKey) {
      return /* @__PURE__ */ React2.createElement(I, { variant: "outline", className: "crm20-relation-trigger", disabled: true }, t.relationReference);
    }
    return /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-picker" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-row" }, /* @__PURE__ */ React2.createElement(I, { variant: "outline", className: "crm20-relation-trigger", onClick: () => setOpen((current) => !current) }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${targetObjectKey}` }, selectedRecord ? recordInitial(selectedTitle) : "#"), /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-title" }, selectedTitle), /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, targetObjectKey)), valueText ? /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", title: t.clearRelation, onClick: clearRelation }, /* @__PURE__ */ React2.createElement(Icon2, { name: "close" })) : null), open ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-relation-command" }, /* @__PURE__ */ React2.createElement(yt, { shouldFilter: false }, /* @__PURE__ */ React2.createElement(Nt2, { value: query, onValueChange: setQuery, placeholder: t.searchRelation }), /* @__PURE__ */ React2.createElement(Ct2, null, /* @__PURE__ */ React2.createElement(St2, null, busy ? t.loadingRelatedRecords : t.relationNoResults), /* @__PURE__ */ React2.createElement(_t2, { heading: t.relatedRecords }, records.map((record) => {
      const title = displayRecordTitle(record, targetFields, t);
      return /* @__PURE__ */ React2.createElement(It2, { key: record.id, value: `${record.id} ${title}`, onSelect: () => selectRecord(record) }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${record.objectKey || targetObjectKey}` }, recordInitial(title)), /* @__PURE__ */ React2.createElement("span", { className: "crm20-relation-option-text" }, /* @__PURE__ */ React2.createElement("strong", null, title), /* @__PURE__ */ React2.createElement("small", null, locale === "zh_Hans" ? "\u8BB0\u5F55" : "Record", " #", record.id.slice(0, 8))));
    }))))) : null);
  }

  // src/lib/remote-components/crm-workbench/src/components/related-records-panel.tsx
  function RelatedRecordsPanel({
    sections,
    locale,
    t,
    onOpenRecord
  }) {
    if (!sections.length) return null;
    return /* @__PURE__ */ React2.createElement("section", { className: "crm20-related-panel" }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-related-heading" }, /* @__PURE__ */ React2.createElement("strong", null, t.relatedRecords)), sections.map((section, index2) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-section", key: `${section.objectKey}-${section.relationFieldKey}` }, index2 > 0 ? /* @__PURE__ */ React2.createElement(Ne2, null) : null, /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-section-header" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-object-icon crm20-object-${section.objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: objectIcon({ objectKey: section.objectKey }) })), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("strong", null, section.objectPluralLabel || section.objectLabel || section.objectKey), /* @__PURE__ */ React2.createElement("small", null, t.linkedBy, " ", section.relationFieldLabel || section.relationFieldKey)), /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, section.total)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-related-list" }, section.items.map((record) => {
      const title = displayRecordTitle(record, section.fields, t);
      const subtitle = relatedSubtitle(record, section.fields, section.relationFieldKey, locale, t);
      return /* @__PURE__ */ React2.createElement(
        I,
        {
          variant: "ghost",
          className: "crm20-related-record",
          key: record.id,
          title: t.openRelatedRecord,
          onClick: () => onOpenRecord(section.objectKey, record.id)
        },
        /* @__PURE__ */ React2.createElement("span", { className: `crm20-record-mark crm20-object-${section.objectKey}` }, recordInitial(title)),
        /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement("strong", null, title), subtitle ? /* @__PURE__ */ React2.createElement("small", null, subtitle) : null),
        /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })
      );
    }), section.total > section.items.length ? /* @__PURE__ */ React2.createElement("span", { className: "crm20-related-more" }, "+", section.total - section.items.length, " ", t.moreRelatedRecords) : null))));
  }
  function relatedSubtitle(record, fields, relationFieldKey, locale, t) {
    const values = record.values ?? {};
    const skipped = /* @__PURE__ */ new Set(["name", "firstName", "lastName", "title", relationFieldKey]);
    const field = fields.find((item) => {
      const value2 = values[item.fieldKey];
      return !skipped.has(item.fieldKey) && value2 !== void 0 && value2 !== null && String(value2).trim() !== "";
    });
    if (!field) return "";
    const value = values[field.fieldKey];
    if (field.type === "date" || field.type === "datetime") return formatDate(value, locale);
    return formatText(resolveOptionLabel(value, field), field, fields, t);
  }
  function resolveOptionLabel(value, field) {
    if ((field.type === "select" || field.type === "multi_select") && Array.isArray(field.options)) {
      if (Array.isArray(value)) {
        return value.map((item) => field.options?.find((option) => option.value === String(item))?.label || String(item)).join(", ");
      }
      return field.options.find((option) => option.value === String(value))?.label || value;
    }
    return value;
  }

  // src/lib/remote-components/crm-workbench/src/components/timeline-panel.tsx
  function TimelinePanel({
    items,
    locale,
    t,
    onOpenRecord
  }) {
    if (!items.length) {
      return /* @__PURE__ */ React2.createElement("section", { className: "crm20-timeline-empty" }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-timeline-dot" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "workflow" })), /* @__PURE__ */ React2.createElement("strong", null, t.noTimelineItems));
    }
    return /* @__PURE__ */ React2.createElement("section", { className: "crm20-timeline-panel" }, items.map((item, index2) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-item", key: `${item.type}-${item.id}` }, index2 > 0 ? /* @__PURE__ */ React2.createElement(Ne2, null) : null, /* @__PURE__ */ React2.createElement("div", { className: `crm20-timeline-dot crm20-timeline-${item.type}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: timelineIcon(item.type) })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-content" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-meta" }, /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, timelineLabel(item.type, t)), item.status ? /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, item.status) : null, /* @__PURE__ */ React2.createElement("time", null, formatDate(item.occurredAt || item.updatedAt || item.createdAt, locale))), item.type === "note" || item.type === "task" ? /* @__PURE__ */ React2.createElement(
      I,
      {
        variant: "ghost",
        className: "crm20-timeline-record",
        onClick: () => onOpenRecord(item.objectKey || item.type, item.id)
      },
      /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement("strong", null, item.title), item.body ? /* @__PURE__ */ React2.createElement("small", null, itemBody(item, t)) : null),
      /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })
    ) : /* @__PURE__ */ React2.createElement("div", { className: "crm20-timeline-activity-body" }, /* @__PURE__ */ React2.createElement("strong", null, item.title), item.body ? /* @__PURE__ */ React2.createElement("small", null, item.body) : null)))));
  }
  function timelineIcon(type) {
    if (type === "note") return "note";
    if (type === "task") return "check";
    return "edit";
  }
  function timelineLabel(type, t) {
    if (type === "note") return t.note;
    if (type === "task") return t.task;
    return t.activity;
  }
  function itemBody(item, t) {
    if (item.type === "task" && item.body?.startsWith("Due ")) {
      return `${t.due} ${item.body.slice(4)}`;
    }
    return item.body;
  }

  // src/lib/remote-components/crm-workbench/src/components/inspector.tsx
  var EMPTY_SELECT_VALUE = "__empty__";
  function Inspector({
    mode,
    record,
    fields,
    draft,
    locale,
    t,
    objectLabel,
    objectKey,
    relationLabels,
    relatedSections,
    timelineItems,
    busy,
    onChange,
    onEdit,
    onClose,
    onCancel,
    onOpenRelatedRecord,
    onSave
  }) {
    const isEditing = mode === "edit" || mode === "create";
    const title = mode === "create" ? t.newRecord : record ? displayRecordTitle(record, fields, t) : t.details;
    return /* @__PURE__ */ React2.createElement(Ce3, { open: mode !== "closed", onOpenChange: (open) => !open && onClose() }, /* @__PURE__ */ React2.createElement(Te3, { className: "crm20-inspector-content", side: "right", showCloseButton: false }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-inspector-header" }, /* @__PURE__ */ React2.createElement("div", { className: `crm20-inspector-avatar crm20-object-${objectKey}` }, mode === "create" ? /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }) : /* @__PURE__ */ React2.createElement("span", null, recordInitial(title))), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("span", null, objectLabel), /* @__PURE__ */ React2.createElement("strong", null, title)), /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", title: t.close, onClick: onClose }, /* @__PURE__ */ React2.createElement(Icon2, { name: "close" }))), /* @__PURE__ */ React2.createElement("div", { className: "crm20-inspector-meta" }, /* @__PURE__ */ React2.createElement("span", null, t.created, ": ", record?.createdAt ? formatDate(record.createdAt, locale) : t.noValue), /* @__PURE__ */ React2.createElement("span", null, t.updated, ": ", record?.updatedAt ? formatDate(record.updatedAt, locale) : t.noValue)), isEditing ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-form" }, fields.map((field) => /* @__PURE__ */ React2.createElement("label", { className: "crm20-field", key: field.fieldKey }, /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey, field.required ? /* @__PURE__ */ React2.createElement("em", null, t.required) : null, /* @__PURE__ */ React2.createElement("small", null, field.type || "text")), /* @__PURE__ */ React2.createElement(FieldInput, { field, value: draft[field.fieldKey], locale, t, onChange: (value) => onChange(field.fieldKey, value) })))) : /* @__PURE__ */ React2.createElement(ur, { className: "crm20-inspector-tabs", defaultValue: "properties" }, /* @__PURE__ */ React2.createElement(cr, null, /* @__PURE__ */ React2.createElement(gr, { value: "properties" }, t.properties), /* @__PURE__ */ React2.createElement(gr, { value: "timeline" }, t.timeline)), /* @__PURE__ */ React2.createElement(pr, { value: "properties" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-read-fields" }, fields.map((field) => /* @__PURE__ */ React2.createElement("div", { className: "crm20-read-field", key: field.fieldKey }, /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey), /* @__PURE__ */ React2.createElement("strong", null, /* @__PURE__ */ React2.createElement(FieldValue, { value: record?.values?.[field.fieldKey], field, fields, locale, relationLabels, t })))), /* @__PURE__ */ React2.createElement(RelatedRecordsPanel, { sections: relatedSections, locale, t, onOpenRecord: onOpenRelatedRecord }))), /* @__PURE__ */ React2.createElement(pr, { value: "timeline" }, /* @__PURE__ */ React2.createElement(TimelinePanel, { items: timelineItems, locale, t, onOpenRecord: onOpenRelatedRecord }))), /* @__PURE__ */ React2.createElement("footer", { className: "crm20-inspector-actions" }, isEditing ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(I, { variant: "outline", onClick: onCancel, disabled: busy }, t.cancel), /* @__PURE__ */ React2.createElement(I, { onClick: onSave, disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "save" }), /* @__PURE__ */ React2.createElement("span", null, busy ? t.saving : t.save))) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(I, { variant: "outline", onClick: onClose }, t.close), /* @__PURE__ */ React2.createElement(I, { onClick: onEdit }, /* @__PURE__ */ React2.createElement(Icon2, { name: "edit" }), /* @__PURE__ */ React2.createElement("span", null, t.edit))))));
  }
  function FieldInput({
    field,
    value,
    locale,
    t,
    onChange
  }) {
    if (field.type === "select" && Array.isArray(field.options)) {
      const selectedValue = value === void 0 || value === null || value === "" ? EMPTY_SELECT_VALUE : String(value);
      return /* @__PURE__ */ React2.createElement(xa, { value: selectedValue, onValueChange: (next) => onChange(next === EMPTY_SELECT_VALUE ? "" : next) }, /* @__PURE__ */ React2.createElement(ya, null, /* @__PURE__ */ React2.createElement(za, { placeholder: "-" })), /* @__PURE__ */ React2.createElement(ka, null, /* @__PURE__ */ React2.createElement(Ca, { value: EMPTY_SELECT_VALUE }, "-"), field.options.map((option) => /* @__PURE__ */ React2.createElement(Ca, { key: option.value, value: option.value }, option.label || option.value))));
    }
    if (field.type === "boolean") {
      return /* @__PURE__ */ React2.createElement("label", { className: "crm20-checkbox-field" }, /* @__PURE__ */ React2.createElement(ct2, { checked: Boolean(value), onCheckedChange: (checked) => onChange(checked === true) }));
    }
    if (field.type === "rich_text") {
      return /* @__PURE__ */ React2.createElement(be3, { rows: 5, value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "date") {
      return /* @__PURE__ */ React2.createElement(W3, { type: "date", value: value === void 0 || value === null ? "" : String(value).slice(0, 10), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "datetime") {
      return /* @__PURE__ */ React2.createElement(W3, { type: "datetime-local", value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "number" || field.type === "currency") {
      return /* @__PURE__ */ React2.createElement(W3, { type: "number", value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
    }
    if (field.type === "relation") {
      return /* @__PURE__ */ React2.createElement(RelationPicker, { field, value, locale, t, onChange });
    }
    return /* @__PURE__ */ React2.createElement(W3, { value: value === void 0 || value === null ? "" : String(value), onChange: (event) => onChange(event.currentTarget.value) });
  }

  // src/lib/remote-components/crm-workbench/src/components/record-grid.tsx
  function RecordGrid({
    columns,
    fields,
    records,
    selectedId,
    checkedIds,
    objectKey,
    locale,
    relationLabels,
    t,
    busy,
    onSelect,
    onToggleRecord,
    onToggleAll,
    onCreate
  }) {
    const allVisibleChecked = records.length > 0 && records.every((record) => checkedIds.has(record.id));
    if (!records.length && !busy) {
      return /* @__PURE__ */ React2.createElement("div", { className: "crm20-empty-table" }, /* @__PURE__ */ React2.createElement("div", { className: `crm20-empty-icon crm20-object-${objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: "table" })), /* @__PURE__ */ React2.createElement("strong", null, t.empty), /* @__PURE__ */ React2.createElement(I, { onClick: onCreate }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, t.newRecord)));
    }
    return /* @__PURE__ */ React2.createElement("div", { className: "crm20-grid-scroll" }, /* @__PURE__ */ React2.createElement(ar, { className: "crm20-grid" }, /* @__PURE__ */ React2.createElement("colgroup", null, /* @__PURE__ */ React2.createElement("col", { className: "crm20-check-col" }), columns.map((field, index2) => /* @__PURE__ */ React2.createElement("col", { key: field.fieldKey, style: { width: `${columnWidth(field, index2)}px` } })), /* @__PURE__ */ React2.createElement("col", { className: "crm20-extra-col" })), /* @__PURE__ */ React2.createElement(rr, null, /* @__PURE__ */ React2.createElement(ir, null, /* @__PURE__ */ React2.createElement(dr, { className: "crm20-check-cell" }, /* @__PURE__ */ React2.createElement(
      ct2,
      {
        "aria-label": t.selectAll,
        checked: allVisibleChecked,
        onClick: (event) => event.stopPropagation(),
        onCheckedChange: (checked) => onToggleAll(checked === true)
      }
    )), columns.map((field) => /* @__PURE__ */ React2.createElement(dr, { key: field.fieldKey, title: field.label || field.fieldKey }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-th-content" }, /* @__PURE__ */ React2.createElement(Icon2, { name: fieldIcon(field) }), /* @__PURE__ */ React2.createElement("span", null, field.label || field.fieldKey)))), /* @__PURE__ */ React2.createElement(dr, { className: "crm20-extra-cell" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" })))), /* @__PURE__ */ React2.createElement(or, null, records.map((record) => {
      const isChecked = checkedIds.has(record.id);
      const className = [record.id === selectedId ? "is-selected" : "", isChecked ? "is-checked" : ""].filter(Boolean).join(" ");
      return /* @__PURE__ */ React2.createElement(ir, { key: record.id, className, onClick: () => onSelect(record), onDoubleClick: () => onSelect(record) }, /* @__PURE__ */ React2.createElement(sr, { className: "crm20-check-cell" }, /* @__PURE__ */ React2.createElement(
        ct2,
        {
          "aria-label": "Select row",
          checked: isChecked,
          onClick: (event) => event.stopPropagation(),
          onCheckedChange: (checked) => onToggleRecord(record.id, checked === true)
        }
      )), columns.map((field, index2) => /* @__PURE__ */ React2.createElement(sr, { key: field.fieldKey }, index2 === 0 ? /* @__PURE__ */ React2.createElement(
        NameCell,
        {
          field,
          fields,
          record,
          objectKey: record.objectKey || objectKey,
          locale,
          relationLabels,
          t
        }
      ) : /* @__PURE__ */ React2.createElement(FieldValue, { value: record.values?.[field.fieldKey], field, fields, locale, relationLabels, t }))), /* @__PURE__ */ React2.createElement(sr, { className: "crm20-extra-cell" }));
    }))), busy ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-loading-line" }) : null);
  }

  // src/lib/remote-components/crm-workbench/src/components/workbench.tsx
  var { useCallback: useCallback3, useEffect: useEffect3, useMemo: useMemo3, useRef: useRef2, useState: useState3 } = React2;
  function CrmWorkbench({ context }) {
    const locale = resolveLocale(context.locale);
    const t = TEXT[locale];
    const searchRef = useRef2(null);
    const initialObjectKey = getInitialObjectKey(context);
    const [objectKey, setObjectKey] = useState3(initialObjectKey);
    const [searchDraft, setSearchDraft] = useState3(context.initialQuery?.search ?? "");
    const [searchQuery, setSearchQuery] = useState3(context.initialQuery?.search ?? "");
    const [data, setData] = useState3(null);
    const [selected, setSelected] = useState3(null);
    const [draft, setDraft] = useState3({});
    const [mode, setMode] = useState3("closed");
    const [busy, setBusy] = useState3(false);
    const [notice, setNotice] = useState3("");
    const [sortMode, setSortMode] = useState3("server");
    const [density, setDensity] = useState3("comfortable");
    const [checkedIds, setCheckedIds] = useState3(() => /* @__PURE__ */ new Set());
    const [visibleColumnKeys, setVisibleColumnKeys] = useState3([]);
    const selectedRef = useRef2(null);
    const skipNextAutoLoadRef = useRef2(false);
    useEffect3(() => {
      selectedRef.current = selected;
    }, [selected]);
    const loadData = useCallback3(
      async (options2) => {
        if (!options2?.silent) setBusy(true);
        setNotice("");
        try {
          const nextObjectKey = options2?.objectKey ?? objectKey;
          const nextSearchQuery = options2?.searchQuery ?? searchQuery;
          const response = await requestData(buildQuery(context, nextObjectKey, nextSearchQuery, options2?.recordId));
          const result = normalizeData(unwrap(response));
          setData(result);
          const visibleIds = new Set(result.table.items.map((record) => record.id));
          setCheckedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
          const currentSelected = selectedRef.current;
          const nextSelected = resolveNextSelection(result, {
            recordId: options2?.recordId,
            keepSelection: options2?.keepSelection,
            selected: currentSelected
          });
          if (nextSelected && options2?.recordId) {
            openRecord(nextSelected, result.fields, "view");
          } else if (!options2?.keepSelection && !options2?.recordId) {
            setSelected(null);
            setDraft({});
            setMode("closed");
          } else if (nextSelected && currentSelected) {
            setSelected(nextSelected);
            setDraft(toFormValues(result.fields, nextSelected.values ?? {}));
          }
        } catch (error) {
          setNotice(error instanceof Error && error.message ? error.message : t.loadFailed);
        } finally {
          setBusy(false);
        }
      },
      [context, objectKey, searchQuery, t.loadFailed]
    );
    useEffect3(() => {
      window.__crmReload = () => loadData({ keepSelection: true, silent: true });
      return () => {
        delete window.__crmReload;
      };
    }, [loadData]);
    useEffect3(() => {
      if (skipNextAutoLoadRef.current) {
        skipNextAutoLoadRef.current = false;
        return;
      }
      loadData();
    }, [loadData]);
    const objects = data?.objects ?? [];
    const currentObject = objects.find((object) => object.objectKey === objectKey) ?? data?.selectedObject ?? objects[0] ?? null;
    const fields = data?.fields ?? currentObject?.fields ?? [];
    const table = data?.table ?? { key: "records", items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
    const defaultColumnKeys = useMemo3(() => getDefaultColumnKeys(data, fields), [data, fields]);
    const columns = useMemo3(
      () => getColumnsFromKeys(fields, visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys),
      [defaultColumnKeys, fields, visibleColumnKeys]
    );
    const sortedItems = useMemo3(() => sortRecords(table.items, columns[0], sortMode), [table.items, columns, sortMode]);
    const relationLabels = useMemo3(() => getRelationLabels(data), [data]);
    const relatedSections = useMemo3(() => getRelatedRecordSections(data), [data]);
    const timelineItems = useMemo3(() => getTimelineItems(data), [data]);
    const firstMeasureColumn = columns.find((field) => field.type !== "relation") ?? columns[0];
    const objectTitle = currentObject?.pluralLabel || currentObject?.label || objectKey;
    const objectLabel = currentObject?.label || objectKey;
    const activeView = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0] ?? null;
    useEffect3(() => {
      setVisibleColumnKeys(defaultColumnKeys);
    }, [defaultColumnKeys, objectKey]);
    function selectObject(nextObjectKey) {
      setObjectKey(nextObjectKey);
      setSelected(null);
      setDraft({});
      setMode("closed");
      setSearchDraft("");
      setSearchQuery("");
      setSortMode("server");
      setCheckedIds(/* @__PURE__ */ new Set());
      setVisibleColumnKeys([]);
    }
    function openRecord(record, nextFields = fields, nextMode = "view") {
      setSelected(record);
      setDraft(toFormValues(nextFields, record?.values ?? {}));
      setMode(record ? nextMode : "closed");
      setNotice("");
    }
    async function openRelatedRecord(nextObjectKey, recordId) {
      if (!nextObjectKey || !recordId) return;
      if (nextObjectKey !== objectKey || searchQuery) {
        skipNextAutoLoadRef.current = true;
      }
      setObjectKey(nextObjectKey);
      setSearchDraft("");
      setSearchQuery("");
      setSortMode("server");
      setCheckedIds(/* @__PURE__ */ new Set());
      setVisibleColumnKeys([]);
      await loadData({
        objectKey: nextObjectKey,
        searchQuery: "",
        recordId,
        keepSelection: true
      });
    }
    function startCreate() {
      setSelected(null);
      setDraft(toFormValues(fields, {}, true));
      setMode("create");
      setNotice("");
    }
    function updateDraft(fieldKey, value) {
      setDraft((current) => ({ ...current, [fieldKey]: value }));
    }
    async function saveDraft() {
      const values = normalizeFormValues(fields, draft);
      setBusy(true);
      setNotice("");
      try {
        const actionKey = selected?.id ? "update_record" : "create_record";
        const response = await executeAction(
          actionKey,
          selected?.id ?? null,
          selected?.id ? { recordId: selected.id, objectKey, values } : { objectKey, values },
          { objectKey }
        );
        const result = unwrap(response);
        if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed);
        const savedRecord = result.data && isObject(result.data) ? result.data : result;
        const message = resolveText(result.message, locale) || t.saved;
        notify(message);
        setNotice(message);
        await loadData({ recordId: typeof savedRecord.id === "string" ? savedRecord.id : void 0, keepSelection: true, silent: true });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t.saveFailed;
        setNotice(message);
        notify(message, "error");
      } finally {
        setBusy(false);
      }
    }
    function applySearch() {
      setSearchQuery(searchDraft.trim());
      setCheckedIds(/* @__PURE__ */ new Set());
    }
    function toggleDensity() {
      setDensity((current) => current === "compact" ? "comfortable" : "compact");
    }
    function toggleRecordChecked(recordId, checked) {
      setCheckedIds((current) => {
        const next = new Set(current);
        if (checked) {
          next.add(recordId);
        } else {
          next.delete(recordId);
        }
        return next;
      });
    }
    function toggleAllVisible(checked) {
      setCheckedIds((current) => {
        const next = new Set(current);
        sortedItems.forEach((record) => {
          if (checked) {
            next.add(record.id);
          } else {
            next.delete(record.id);
          }
        });
        return next;
      });
    }
    async function updateVisibleColumns(fieldKey, checked) {
      const currentKeys = visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys;
      const nextKeys = checked ? [...currentKeys, fieldKey] : currentKeys.filter((key) => key !== fieldKey);
      const uniqueKeys = [...new Set(nextKeys)].filter((key) => fields.some((field) => field.fieldKey === key));
      if (!uniqueKeys.length) {
        setNotice(t.atLeastOneColumn);
        notify(t.atLeastOneColumn, "error");
        return;
      }
      setVisibleColumnKeys(uniqueKeys);
      setNotice("");
      try {
        const response = await executeAction(
          "update_view_columns",
          activeView?.viewKey ?? null,
          {
            objectKey,
            viewKey: activeView?.viewKey || "all",
            columns: uniqueKeys
          },
          { objectKey }
        );
        const result = unwrap(response);
        if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed);
        const message = resolveText(result.message, locale) || t.viewSaved;
        setNotice(message);
        notify(message);
        await loadData({ keepSelection: true, silent: true });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t.saveFailed;
        setNotice(message);
        notify(message, "error");
        setVisibleColumnKeys(currentKeys);
      }
    }
    const selectedCount = checkedIds.size;
    const sortTarget = columns[0]?.label || columns[0]?.fieldKey || objectLabel;
    const sortLabel = sortMode === "asc" ? t.ascending : sortMode === "desc" ? t.descending : t.noSorting;
    return /* @__PURE__ */ React2.createElement("main", { className: `crm20-shell crm20-${density}` }, /* @__PURE__ */ React2.createElement("aside", { className: "crm20-sidebar", "aria-label": t.objects }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-workspace" }, /* @__PURE__ */ React2.createElement("span", { className: "crm20-workspace-mark" }, "X"), /* @__PURE__ */ React2.createElement("span", { className: "crm20-workspace-name" }, t.workspace), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-sidebar-switcher", "aria-label": t.viewMode }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", className: "crm20-switcher-active", title: "Home" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "home" })), /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", title: t.searchPlaceholder, onClick: () => searchRef.current?.focus() }, /* @__PURE__ */ React2.createElement(Icon2, { name: "message" }))), /* @__PURE__ */ React2.createElement(I, { variant: "outline", className: "crm20-chat-button" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "message-plus" }), /* @__PURE__ */ React2.createElement("span", null, t.newChat)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-nav-section" }, t.nativeCrm), /* @__PURE__ */ React2.createElement("nav", { className: "crm20-object-nav" }, objects.map((object) => /* @__PURE__ */ React2.createElement(
      I,
      {
        variant: "ghost",
        key: object.objectKey,
        className: object.objectKey === objectKey ? "is-active" : "",
        onClick: () => selectObject(object.objectKey)
      },
      /* @__PURE__ */ React2.createElement("span", { className: `crm20-object-icon crm20-object-${object.objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: objectIcon(object) })),
      /* @__PURE__ */ React2.createElement("span", null, object.pluralLabel || object.label || object.objectKey)
    )))), /* @__PURE__ */ React2.createElement("section", { className: "crm20-main" }, /* @__PURE__ */ React2.createElement("header", { className: "crm20-object-header" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-object-title" }, /* @__PURE__ */ React2.createElement("span", { className: `crm20-title-icon crm20-object-${objectKey}` }, /* @__PURE__ */ React2.createElement(Icon2, { name: currentObject ? objectIcon(currentObject) : "grid" })), /* @__PURE__ */ React2.createElement("strong", null, objectTitle)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-header-actions" }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", title: t.refresh, onClick: () => loadData({ keepSelection: true }), disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "refresh" })), /* @__PURE__ */ React2.createElement(I, { onClick: startCreate, disabled: busy }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, locale === "zh_Hans" ? `${t.create} ${objectLabel}` : `New ${objectLabel}`)), /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "icon", title: t.options, onClick: toggleDensity }, /* @__PURE__ */ React2.createElement(Icon2, { name: "more" })))), /* @__PURE__ */ React2.createElement("div", { className: "crm20-viewbar" }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", className: "crm20-view-name" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "list" }), /* @__PURE__ */ React2.createElement("span", null, data?.views?.[0]?.name || `${t.allRecords} ${objectTitle}`), /* @__PURE__ */ React2.createElement("span", { className: "crm20-view-count" }, table.total || 0), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" })), /* @__PURE__ */ React2.createElement("div", { className: "crm20-view-actions" }, /* @__PURE__ */ React2.createElement("label", { className: "crm20-search" }, /* @__PURE__ */ React2.createElement(Icon2, { name: "search" }), /* @__PURE__ */ React2.createElement(
      "input",
      {
        "data-slot": "input",
        ref: searchRef,
        value: searchDraft,
        placeholder: t.searchPlaceholder,
        onChange: (event) => setSearchDraft(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") applySearch();
        }
      }
    )), /* @__PURE__ */ React2.createElement(I, { variant: "ghost", className: "crm20-toolbar-button", onClick: () => searchRef.current?.focus() }, t.filter, searchQuery ? /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, t.searchActive) : null), /* @__PURE__ */ React2.createElement(Ut2, null, /* @__PURE__ */ React2.createElement(Wt2, { asChild: true }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", className: sortMode === "server" ? "crm20-toolbar-button" : "crm20-toolbar-button is-active" }, t.sort, /* @__PURE__ */ React2.createElement("span", { className: "crm20-toolbar-meta" }, sortLabel))), /* @__PURE__ */ React2.createElement(Xt2, { align: "end", className: "crm20-dropdown" }, /* @__PURE__ */ React2.createElement(ta, null, t.sortBy, " ", sortTarget), /* @__PURE__ */ React2.createElement(Qt2, { value: sortMode, onValueChange: (value) => setSortMode(value) }, /* @__PURE__ */ React2.createElement(ea, { value: "server" }, t.noSorting), /* @__PURE__ */ React2.createElement(ea, { value: "asc" }, t.ascending), /* @__PURE__ */ React2.createElement(ea, { value: "desc" }, t.descending)))), /* @__PURE__ */ React2.createElement(Ut2, null, /* @__PURE__ */ React2.createElement(Wt2, { asChild: true }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", className: density === "compact" ? "crm20-toolbar-button is-active" : "crm20-toolbar-button" }, t.options)), /* @__PURE__ */ React2.createElement(Xt2, { align: "end", className: "crm20-dropdown" }, /* @__PURE__ */ React2.createElement(ta, null, t.tableDensity), /* @__PURE__ */ React2.createElement(Jt2, { onSelect: () => setDensity("comfortable") }, t.comfortableDensity), /* @__PURE__ */ React2.createElement(Jt2, { onSelect: () => setDensity("compact") }, t.compactDensity), /* @__PURE__ */ React2.createElement(aa, null), /* @__PURE__ */ React2.createElement(ta, null, t.visibleFields), fields.map((field) => /* @__PURE__ */ React2.createElement(
      Yt,
      {
        key: field.fieldKey,
        checked: (visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys).includes(field.fieldKey),
        onSelect: (event) => event.preventDefault(),
        onCheckedChange: (checked) => updateVisibleColumns(field.fieldKey, checked === true)
      },
      field.label || field.fieldKey
    )), /* @__PURE__ */ React2.createElement(aa, null), /* @__PURE__ */ React2.createElement(Jt2, { onSelect: () => loadData({ keepSelection: true }) }, t.refresh))))), notice ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-notice" }, notice) : null, /* @__PURE__ */ React2.createElement("section", { className: "crm20-content" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-table-panel" }, /* @__PURE__ */ React2.createElement("div", { className: selectedCount ? "crm20-selection-slot is-visible" : "crm20-selection-slot" }, selectedCount ? /* @__PURE__ */ React2.createElement("div", { className: "crm20-selection-bar" }, /* @__PURE__ */ React2.createElement(rt2, { variant: "secondary" }, selectedCount), /* @__PURE__ */ React2.createElement("strong", null, selectedCount, " ", t.selectedCount), /* @__PURE__ */ React2.createElement("span", null, t.visibleRows, " ", sortedItems.length), /* @__PURE__ */ React2.createElement(I, { variant: "ghost", size: "sm", onClick: () => setCheckedIds(/* @__PURE__ */ new Set()) }, t.clearSelection)) : null), /* @__PURE__ */ React2.createElement(
      RecordGrid,
      {
        columns,
        fields,
        records: sortedItems,
        selectedId: selected?.id,
        checkedIds,
        objectKey,
        locale,
        relationLabels,
        t,
        busy,
        onSelect: (record) => openRecord(record),
        onToggleRecord: toggleRecordChecked,
        onToggleAll: toggleAllVisible,
        onCreate: startCreate
      }
    ), /* @__PURE__ */ React2.createElement("footer", { className: "crm20-table-footer" }, /* @__PURE__ */ React2.createElement(I, { variant: "ghost", className: "crm20-add-row", onClick: startCreate }, /* @__PURE__ */ React2.createElement(Icon2, { name: "plus" }), /* @__PURE__ */ React2.createElement("span", null, t.addNew)), /* @__PURE__ */ React2.createElement("div", { className: "crm20-calculation" }, /* @__PURE__ */ React2.createElement("span", null, t.calculate), /* @__PURE__ */ React2.createElement(Icon2, { name: "chevron" }), /* @__PURE__ */ React2.createElement("strong", null, t.countAll, " ", table.total || sortedItems.length), firstMeasureColumn ? /* @__PURE__ */ React2.createElement("strong", null, t.notEmpty, " ", firstMeasureColumn.label || firstMeasureColumn.fieldKey, " ", countNonEmpty(sortedItems, firstMeasureColumn.fieldKey)) : null))), /* @__PURE__ */ React2.createElement(
      Inspector,
      {
        mode,
        record: selected,
        fields,
        draft,
        locale,
        t,
        objectLabel,
        objectKey,
        relationLabels,
        relatedSections,
        timelineItems,
        busy,
        onChange: updateDraft,
        onEdit: () => setMode("edit"),
        onClose: () => setMode("closed"),
        onCancel: () => {
          if (selected) {
            openRecord(selected, fields, "view");
          } else {
            setMode("closed");
          }
        },
        onOpenRelatedRecord: openRelatedRecord,
        onSave: saveDraft
      }
    ))));
  }

  // src/lib/remote-components/crm-workbench/src/styles.ts
  function injectStyles2() {
    if (document.getElementById("crm-workbench-styles")) return;
    const style = document.createElement("style");
    style.id = "crm-workbench-styles";
    style.textContent = `
    :root {
      color-scheme: light;
      --crm20-sidebar: #f4f5f7;
      --crm20-panel: #ffffff;
      --crm20-text: #1f2937;
      --crm20-muted: #6b7280;
      --crm20-soft: #9ca3af;
      --crm20-border: #e5e7eb;
      --crm20-border-soft: #f0f1f3;
      --crm20-hover: #f7f7f8;
      --crm20-active: #f1f5ff;
	      --crm20-primary: var(--primary, var(--xui-color-primary, #2563eb));
	      --xui-radius-md: 0.375rem;
      --xui-control-height: 1.875rem;
      --xui-control-height-sm: 1.75rem;
      --xui-control-height-lg: 2.125rem;
      --xui-control-font-size: 0.8125rem;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--crm20-panel); color: var(--crm20-text); }
    body, button, input, select, textarea { font-family: Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    .crm20-icon { width: 16px; height: 16px; display: inline-block; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .crm20-shell { min-height: 640px; display: grid; grid-template-columns: 260px minmax(0, 1fr); overflow: hidden; background: var(--crm20-panel); }
    .crm20-shell-loading { display: flex; align-items: center; justify-content: center; background: #f8fafc; }
    .crm20-sidebar { min-height: 640px; border-right: 1px solid var(--crm20-border); background: var(--crm20-sidebar); padding: 10px; display: flex; flex-direction: column; gap: 10px; }
    .crm20-workspace { height: 38px; display: grid; grid-template-columns: 26px minmax(0, 1fr) 18px; align-items: center; gap: 8px; padding: 0 4px; color: #374151; font-weight: 650; }
    .crm20-workspace-mark { width: 22px; height: 22px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; background: #9de0e4; color: #1f4b53; font-size: 12px; font-weight: 800; }
    .crm20-workspace-name, .crm20-object-title strong, .crm20-view-name span:first-of-type, .crm20-object-nav button span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-sidebar-switcher { width: 84px; height: 36px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 3px; padding: 3px; border: 1px solid var(--crm20-border); background: var(--crm20-panel); border-radius: 18px; }
    .crm20-sidebar-switcher [data-slot="button"] { height: 28px; min-width: 0; border-radius: 14px; color: var(--crm20-muted); }
    .crm20-sidebar-switcher .crm20-switcher-active, .crm20-sidebar-switcher [data-slot="button"]:hover { background: #f3f4f6; color: #111827; }
    .crm20-chat-button { align-self: flex-end; border-radius: 18px; color: #4b5563; }
    .crm20-nav-section { color: var(--crm20-soft); font-size: 12px; font-weight: 700; padding: 8px 2px 0; }
    .crm20-object-nav { display: grid; gap: 2px; }
    .crm20-object-nav [data-slot="button"] { height: 36px; justify-content: flex-start; border: 0; color: #5f6368; font-weight: 600; padding: 0 8px; }
    .crm20-object-nav [data-slot="button"]:hover, .crm20-object-nav [data-slot="button"].is-active { background: #e9eaec; color: #2f3337; }
    .crm20-object-icon, .crm20-title-icon, .crm20-record-mark, .crm20-empty-icon { display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; background: #e5e7eb; color: #4b5563; }
    .crm20-object-icon { width: 20px; height: 20px; }
    .crm20-title-icon { width: 24px; height: 24px; }
    .crm20-record-mark { width: 20px; height: 20px; color: #fff; font-size: 9px; font-weight: 800; }
    .crm20-object-company { background: #e6edff; color: #4169e1; }
    .crm20-object-person { background: #eef2ff; color: #5b5fc7; }
    .crm20-object-opportunity { background: #ffe8e6; color: #e5484d; }
    .crm20-object-task { background: #dcf7ef; color: #0f9f6e; }
    .crm20-object-note { background: #e8f7f4; color: #0f766e; }
    .crm20-record-mark.crm20-object-company { background: #4169e1; color: #fff; }
    .crm20-record-mark.crm20-object-person { background: #5b5fc7; color: #fff; }
    .crm20-record-mark.crm20-object-opportunity { background: #e5484d; color: #fff; }
    .crm20-record-mark.crm20-object-task { background: #0f9f6e; color: #fff; }
    .crm20-record-mark.crm20-object-note { background: #0f766e; color: #fff; }
	    .crm20-main { min-width: 0; min-height: 640px; display: grid; grid-template-rows: 50px 48px auto 1fr; background: var(--crm20-panel); }
	    .crm20-object-header { height: 50px; border-bottom: 1px solid var(--crm20-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px 0 14px; }
	    .crm20-object-title { min-width: 0; display: flex; align-items: center; gap: 9px; font-size: 16px; color: #374151; }
	    .crm20-header-actions, .crm20-view-actions, .crm20-inspector-actions { display: flex; align-items: center; gap: 8px; }
	    .crm20-viewbar { min-width: 0; height: 48px; border-bottom: 1px solid var(--crm20-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 18px; }
	    .crm20-view-name { min-width: 0; border: 0; background: transparent; color: var(--crm20-muted); display: inline-flex; align-items: center; gap: 7px; padding: 0; font-weight: 700; }
	    .crm20-view-name span:first-of-type { max-width: 280px; }
	    .crm20-view-count { color: #a1a1aa; font-weight: 600; }
	    .crm20-search { height: 32px; min-width: 240px; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid var(--crm20-border); background: #fbfbfc; border-radius: 5px; padding: 0 8px; color: var(--crm20-soft); }
	    .crm20-search:focus-within { border-color: #a9bdf7; box-shadow: 0 0 0 3px rgba(65, 105, 225, 0.12); }
	    .crm20-search [data-slot="input"] { height: 28px; border: 0; padding: 0; background: transparent; box-shadow: none; }
	    .crm20-toolbar-button { color: #5f6368; gap: 6px; }
	    .crm20-toolbar-button.is-active { color: #1f2937; background: #eff3ff; border-color: #ccd8ff; }
	    .crm20-toolbar-meta { color: var(--crm20-soft); font-weight: 600; }
	    .crm20-dropdown[data-slot="dropdown-menu-content"] { min-width: 178px; z-index: 30; }
	    .crm20-toolbar-button [data-slot="badge"] { height: 18px; padding: 0 6px; font-size: 10px; }
	    .crm20-notice { margin: 8px 12px 0; border: 1px solid #f2c94c; background: #fffbeb; color: #7a4d00; padding: 8px 10px; border-radius: 5px; font-size: 13px; }
	    .crm20-content { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; position: relative; overflow: hidden; }
	    .crm20-table-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) 78px; }
	    .crm20-selection-slot { min-height: 0; overflow: hidden; border-bottom: 0 solid transparent; transition: min-height 140ms ease, border-color 140ms ease; }
	    .crm20-selection-slot.is-visible { min-height: 38px; border-bottom-color: var(--crm20-border-soft); }
	    .crm20-selection-bar { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #f8fbff; color: #64748b; }
	    .crm20-selection-bar strong { color: #334155; font-weight: 700; }
	    .crm20-selection-bar [data-slot="badge"] { height: 20px; min-width: 24px; justify-content: center; }
	    .crm20-selection-bar [data-slot="button"] { margin-left: auto; color: #4169e1; }
	    .crm20-grid-scroll { min-width: 0; min-height: 0; overflow: auto; position: relative; background: var(--crm20-panel); }
	    .crm20-grid { width: 100%; min-width: 1040px; table-layout: fixed; }
	    .crm20-grid [data-slot="table-head"], .crm20-grid [data-slot="table-cell"] { height: 39px; border-right: 1px solid var(--crm20-border-soft); border-bottom: 1px solid #eeeeef; text-align: left; vertical-align: middle; padding: 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #4b5563; }
	    .crm20-compact .crm20-grid [data-slot="table-head"], .crm20-compact .crm20-grid [data-slot="table-cell"] { height: 34px; padding: 0 10px; }
	    .crm20-grid [data-slot="table-head"] { position: sticky; top: 0; z-index: 2; background: #fbfbfc; color: var(--crm20-soft); font-weight: 650; }
	    .crm20-grid [data-slot="table-row"]:hover [data-slot="table-cell"] { background: #fafafa; }
	    .crm20-grid [data-slot="table-row"].is-selected [data-slot="table-cell"] { background: var(--crm20-active); }
	    .crm20-grid [data-slot="table-row"].is-checked [data-slot="table-cell"] { background: #f8fbff; }
	    .crm20-grid [data-slot="table-row"].is-selected.is-checked [data-slot="table-cell"] { background: #ecf3ff; }
    .crm20-check-col { width: 44px; }
    .crm20-extra-col { width: 52px; }
    .crm20-check-cell, .crm20-extra-cell { width: 44px; text-align: center !important; padding: 0 !important; color: var(--crm20-soft); }
    .crm20-grid [data-slot="checkbox"] { vertical-align: middle; }
    .crm20-th-content, .crm20-name-cell, .crm20-multi-value { min-width: 0; display: inline-flex; align-items: center; gap: 7px; max-width: 100%; }
    .crm20-th-content span, .crm20-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-name-text { color: #374151; font-weight: 650; }
    .crm20-muted-value { color: #a1a1aa; font-weight: 500; }
    .crm20-link-value { color: #3158c9; }
    .crm20-relation-value { color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    .crm20-link-pill, .crm20-pill, .crm20-chip { max-width: 100%; min-height: 23px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--crm20-border); border-radius: 12px; background: #fff; color: #4b5563; padding: 0 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-chip span { width: 7px; height: 7px; border-radius: 50%; background: var(--chip-color); flex: 0 0 auto; }
    .crm20-pill { background: #f3f4f6; border-color: var(--crm20-border); min-height: 22px; padding: 0 7px; }
    .crm20-loading-line { position: absolute; top: 0; left: 0; height: 2px; width: 35%; background: var(--crm20-primary); animation: crm20-loading 1s ease-in-out infinite; }
    .crm20-table-footer { min-height: 78px; border-top: 1px solid var(--crm20-border); display: grid; grid-template-rows: 38px 40px; color: var(--crm20-soft); background: #fff; }
    .crm20-add-row { height: 38px; border: 0; border-bottom: 1px solid var(--crm20-border-soft); background: #fff; color: var(--crm20-soft); justify-content: flex-start; padding: 0 18px; }
    .crm20-add-row:hover { color: #4b5563; background: #fafafa; }
    .crm20-calculation { display: flex; align-items: center; gap: 16px; padding: 0 18px; min-width: 0; overflow: hidden; }
    .crm20-calculation strong { color: #71717a; font-weight: 650; white-space: nowrap; }
    .crm20-empty-table, .crm20-empty { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--crm20-muted); padding: 28px; text-align: center; }
    .crm20-empty-icon { width: 42px; height: 42px; }
	    .crm20-inspector-content[data-slot="sheet-content"] { width: min(400px, calc(100vw - 24px)); max-width: calc(100vw - 24px); padding: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }
	    .crm20-inspector-header { min-height: 76px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: flex-start; gap: 12px; padding: 14px; }
	    .crm20-inspector-avatar { width: 36px; height: 36px; border-radius: 8px; color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
	    .crm20-inspector-avatar span { display: inline; color: inherit; font-size: 12px; margin: 0; }
	    .crm20-inspector-header div { min-width: 0; }
	    .crm20-inspector-header span { display: block; color: var(--crm20-soft); font-size: 12px; margin-bottom: 4px; }
	    .crm20-inspector-header strong { display: block; color: #1f2937; font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
    .crm20-inspector-meta { min-height: 42px; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 14px; color: var(--crm20-muted); font-size: 12px; }
    .crm20-inspector-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crm20-inspector-tabs { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .crm20-inspector-tabs [data-slot="tabs-list"] { margin: 10px 14px 0; width: calc(100% - 28px); }
    .crm20-inspector-tabs [data-slot="tabs-trigger"] { flex: 1 1 0; }
    .crm20-inspector-tabs [data-slot="tabs-content"] { min-height: 0; overflow: hidden; margin: 0; }
    .crm20-read-fields, .crm20-form { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 10px; }
    .crm20-read-field { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--crm20-border-soft); }
	    .crm20-read-field span, .crm20-field > span { color: var(--crm20-muted); font-size: 12px; font-weight: 650; }
	    .crm20-read-field strong { min-width: 0; color: #1f2937; font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
	    .crm20-related-panel { display: grid; gap: 10px; padding-top: 2px; }
	    .crm20-related-heading { min-height: 24px; display: flex; align-items: center; justify-content: space-between; color: #1f2937; }
	    .crm20-related-heading strong { font-size: 13px; font-weight: 750; }
	    .crm20-related-section { display: grid; gap: 8px; }
	    .crm20-related-section [data-slot="separator"] { background: var(--crm20-border-soft); }
	    .crm20-related-section-header { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
	    .crm20-related-section-header > div { min-width: 0; display: grid; gap: 2px; }
	    .crm20-related-section-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; font-size: 12px; font-weight: 750; }
	    .crm20-related-section-header small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-related-list { display: grid; gap: 4px; }
	    .crm20-related-record[data-slot="button"] { width: 100%; height: auto; min-height: 44px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 8px; justify-content: stretch; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-related-record[data-slot="button"]:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-related-record > span:not(.crm20-record-mark) { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-related-record strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
	    .crm20-related-record small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-related-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-related-more { min-height: 24px; display: inline-flex; align-items: center; color: var(--crm20-muted); font-size: 12px; font-weight: 600; padding: 0 8px; }
	    .crm20-timeline-panel { min-height: 0; overflow: auto; padding: 14px; display: grid; align-content: start; gap: 0; }
	    .crm20-timeline-item { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; padding: 8px 0; }
	    .crm20-timeline-item [data-slot="separator"] { grid-column: 1 / -1; margin-bottom: 8px; background: var(--crm20-border-soft); }
	    .crm20-timeline-dot { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #64748b; }
	    .crm20-timeline-note { background: #e8f7f4; color: #0f766e; }
	    .crm20-timeline-task { background: #dcf7ef; color: #0f9f6e; }
	    .crm20-timeline-activity { background: #eef2ff; color: #5b5fc7; }
	    .crm20-timeline-content { min-width: 0; display: grid; gap: 6px; }
	    .crm20-timeline-meta { min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--crm20-soft); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record[data-slot="button"] { width: 100%; height: auto; min-height: 42px; justify-content: stretch; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 8px; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; color: #374151; }
	    .crm20-timeline-record[data-slot="button"]:hover { border-color: var(--crm20-border); background: var(--crm20-hover); }
	    .crm20-timeline-record span, .crm20-timeline-activity-body { min-width: 0; display: grid; gap: 2px; text-align: left; }
	    .crm20-timeline-record strong, .crm20-timeline-activity-body strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2937; font-size: 12px; font-weight: 720; }
	    .crm20-timeline-record small, .crm20-timeline-activity-body small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-muted); font-size: 11px; font-weight: 600; }
	    .crm20-timeline-record .crm20-icon { color: var(--crm20-soft); }
	    .crm20-timeline-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--crm20-muted); padding: 20px; }
	    .crm20-timeline-empty strong { font-size: 13px; font-weight: 700; }
	    .crm20-field { display: grid; gap: 5px; }
	    .crm20-field em { margin-left: 6px; color: #dc2626; font-style: normal; font-weight: 600; }
	    .crm20-field small { margin-left: 8px; color: var(--crm20-soft); font-size: 11px; font-weight: 600; text-transform: uppercase; }
	    .crm20-field [data-slot="textarea"] { min-height: 88px; resize: vertical; }
	    .crm20-checkbox-field { justify-content: flex-start; }
	    .crm20-relation-picker { display: grid; gap: 6px; position: relative; }
	    .crm20-relation-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
	    .crm20-relation-trigger[data-slot="button"] { width: 100%; justify-content: flex-start; min-width: 0; }
	    .crm20-relation-title { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
	    .crm20-relation-command { border: 1px solid var(--crm20-border); border-radius: var(--radius, 6px); background: var(--popover, #fff); box-shadow: 0 14px 34px color-mix(in srgb, var(--crm20-text) 12%, transparent); overflow: hidden; }
	    .crm20-relation-option-text { min-width: 0; display: grid; gap: 2px; }
	    .crm20-relation-option-text strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--crm20-text); font-size: 13px; }
	    .crm20-relation-option-text small { color: var(--crm20-soft); font-size: 11px; font-weight: 600; text-transform: none; }
	    .crm20-inspector-actions { min-height: 58px; border-top: 1px solid var(--crm20-border); justify-content: flex-end; padding: 12px 14px; background: #fff; }
    @keyframes crm20-loading { 0% { transform: translateX(-100%); } 50% { transform: translateX(160%); } 100% { transform: translateX(360%); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }
    @media (max-width: 960px) {
      .crm20-shell { grid-template-columns: 1fr; }
      .crm20-sidebar { min-height: auto; border-right: 0; border-bottom: 1px solid var(--crm20-border); display: grid; grid-template-columns: minmax(160px, 1fr) auto; align-items: center; }
      .crm20-sidebar-switcher, .crm20-chat-button, .crm20-nav-section { display: none; }
      .crm20-object-nav { grid-column: 1 / -1; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
      .crm20-main { min-height: 620px; }
      .crm20-viewbar { height: auto; min-height: 48px; align-items: stretch; flex-direction: column; padding: 8px 12px; }
      .crm20-view-actions { flex-wrap: wrap; }
      .crm20-search { min-width: min(100%, 320px); flex: 1 1 220px; }
      .crm20-table-panel { grid-template-rows: minmax(0, 1fr) auto; }
      .crm20-calculation { flex-wrap: wrap; gap: 8px 14px; padding: 10px 18px; }
      .crm20-table-footer { grid-template-rows: 38px auto; }
    }
    @media (max-width: 560px) {
      .crm20-object-header { height: auto; min-height: 50px; align-items: stretch; flex-direction: column; padding: 10px; }
      .crm20-header-actions { justify-content: flex-end; }
      .crm20-grid { min-width: 760px; }
    }
  `;
    document.head.appendChild(style);
  }

  // src/lib/remote-components/crm-workbench/src/main.tsx
  var { useEffect: useEffect4, useState: useState4 } = React2;
  injectStyles2();
  function App() {
    const [context, setContext] = useState4(null);
    useEffect4(() => {
      const disposeBridge = installBridgeListener({
        onInit: setContext,
        onHostEvent: () => window.__crmReload?.()
      });
      post("ready");
      return disposeBridge;
    }, []);
    useEffect4(() => {
      const root2 = document.getElementById("root");
      if (!root2 || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root2);
      return () => observer.disconnect();
    }, []);
    useEffect4(() => {
      setTimeout(reportResize, 0);
    });
    if (!context) {
      return /* @__PURE__ */ React2.createElement("main", { className: "crm20-shell crm20-shell-loading" }, /* @__PURE__ */ React2.createElement("div", { className: "crm20-empty" }, TEXT.zh_Hans.loading));
    }
    return /* @__PURE__ */ React2.createElement(CrmWorkbench, { context });
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(/* @__PURE__ */ React2.createElement(App, null));
  } else {
    ReactDOM.render?.(/* @__PURE__ */ React2.createElement(App, null), rootElement);
  }
})();
