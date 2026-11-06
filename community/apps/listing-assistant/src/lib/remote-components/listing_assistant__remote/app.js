"use strict";
var XpertListingWorkbench = (() => {
  var __defProp = Object.defineProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
  function r(e) {
    var t2, f2, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t2 = 0; t2 < o; t2++) e[t2] && (f2 = r(e[t2])) && (n && (n += " "), n += f2);
    } else for (f2 in e) e[f2] && (n && (n += " "), n += f2);
    return n;
  }
  function clsx() {
    for (var e, t2, f2 = 0, n = "", o = arguments.length; f2 < o; f2++) (e = arguments[f2]) && (t2 = r(e)) && (n && (n += " "), n += t2);
    return n;
  }

  // ../../../node_modules/.pnpm/tailwind-merge@3.6.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
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
      for (let index = 0; index < len; index++) {
        const currentCharacter = className[index];
        if (bracketDepth === 0 && parenDepth === 0) {
          if (currentCharacter === MODIFIER_SEPARATOR) {
            modifiers.push(className.slice(modifierStart, index));
            modifierStart = index + 1;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index;
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
    config.orderSensitiveModifiers.forEach((mod, index) => {
      modifierWeights.set(mod, 1e6 + index);
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
    for (let index = classNames.length - 1; index >= 0; index -= 1) {
      const originalClassName = classNames[index];
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
    let index = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index < classLists.length) {
      if (argument = classLists[index++]) {
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
    for (let k2 = 0; k2 < mix.length; k2++) {
      if (mix[k2]) {
        if (resolvedValue = toValue(mix[k2])) {
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

  // src/lib/remote-components/listing_assistant__remote/src/react-shim.ts
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

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
  var mergeClasses = (...classes) => classes.filter((className, index, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
  }).join(" ").trim();

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
  var toCamelCase = (string) => string.replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
  );

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  var toPascalCase = (string) => {
    const camelCase = toCamelCase(string);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  };

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
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

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
  var LucideContext = createContext({});
  var useLucideContext = () => useContext(LucideContext);

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
  var Icon = forwardRef(
    ({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
      const {
        size: contextSize = 24,
        strokeWidth: contextStrokeWidth = 2,
        absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
        color: contextColor = "currentColor",
        className: contextClass = ""
      } = useLucideContext() ?? {};
      const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
      return createElement(
        "svg",
        {
          ref,
          ...defaultAttributes,
          width: size ?? contextSize ?? defaultAttributes.width,
          height: size ?? contextSize ?? defaultAttributes.height,
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

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
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

  // ../../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.mjs
  var __iconNode = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("x", __iconNode);

  // src/lib/remote-components/listing_assistant__remote/src/react-jsx-runtime-shim.ts
  var ReactGlobal2 = window.React;
  var Fragment2 = ReactGlobal2.Fragment;
  function jsx(type, props, key) {
    return ReactGlobal2.createElement(type, key === void 0 ? props : { ...props, key });
  }
  var jsxs = jsx;

  // src/lib/remote-components/listing_assistant__remote/src/react-dom-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createPortal = ReactDOMGlobal.createPortal;
  var flushSync = ReactDOMGlobal.flushSync;
  var findDOMNode = ReactDOMGlobal.findDOMNode;
  var hydrate = ReactDOMGlobal.hydrate;
  var render = ReactDOMGlobal.render;
  var unstable_batchedUpdates = ReactDOMGlobal.unstable_batchedUpdates;
  var unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode;
  var version2 = ReactDOMGlobal.version;

  // ../../../node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  var dist_exports = {};
  __export(dist_exports, {
    Root: () => Slot,
    Slot: () => Slot,
    Slottable: () => Slottable,
    createSlot: () => createSlot,
    createSlottable: () => createSlottable
  });

  // ../../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.7_@types+react-dom@18.3.7_@types+react@18.3.31__@types+re_4c60825657fad9e38f0a4d7b31c9e11d/node_modules/@radix-ui/react-primitive/dist/index.mjs
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
    const Slot3 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot3 : node;
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

  // ../../../node_modules/.pnpm/@radix-ui+react-context@1.2.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-context/dist/index.mjs
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider = (props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      };
      Provider.displayName = rootComponentName + "Provider";
      function useContext2(consumerName, scope, options2 = {}) {
        const { optional = false } = options2;
        const Context = scope?.[scopeName]?.[index] || BaseContext;
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

  // ../../../node_modules/.pnpm/@radix-ui+primitive@1.1.5/node_modules/@radix-ui/primitive/dist/index.mjs
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    };
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-use-layout-effect@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  var useLayoutEffect2 = globalThis?.document ? useLayoutEffect : () => {
  };

  // ../../../node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-presence@1.1.7_@types+react-dom@18.3.7_@types+react@18.3.31__@types+rea_d6843a2439efb57a10ac44d5b494738a/node_modules/@radix-ui/react-presence/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-id@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-id/dist/index.mjs
  var useReactId = react_shim_exports[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId2(deterministicId) {
    const [id, setId] = useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_19e637a1eb439fb7ac9fbd37f3b253ea/node_modules/@radix-ui/react-dialog/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  function useCallbackRef(callback) {
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    });
    return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.15_@types+react-dom@18.3.7_@types+react@18.3.31___52f617dd5f45a8e179b652efa1a9fb2f/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
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
      const index = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index >= highestLayerWithOutsidePointerEventsDisabledIndex;
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
      const isHighestLayer = node ? index === layers.length - 1 : false;
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

  // ../../../node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.12_@types+react-dom@18.3.7_@types+react@18.3.31__@types_ea0a3c5eb186fbaed09fdcf83b961bfb/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
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
    const index = updatedArray.indexOf(item);
    if (index !== -1) {
      updatedArray.splice(index, 1);
    }
    return updatedArray;
  }
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }

  // ../../../node_modules/.pnpm/@radix-ui+react-portal@1.1.13_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_dc7a74c2058d5b681fc692ae2e26f5cd/node_modules/@radix-ui/react-portal/dist/index.mjs
  var PORTAL_NAME = "Portal";
  var Portal = forwardRef((props, forwardedRef) => {
    const { container: containerProp, ...portalProps } = props;
    const [mounted, setMounted] = useState(false);
    useLayoutEffect2(() => setMounted(true), []);
    const container = containerProp || mounted && globalThis?.document?.body;
    return container ? createPortal(/* @__PURE__ */ jsx(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
  });
  Portal.displayName = PORTAL_NAME;

  // ../../../node_modules/.pnpm/@radix-ui+react-focus-guards@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
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

  // ../../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
  var __assign = function() {
    __assign = Object.assign || function __assign2(t2) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t2[p] = s[p];
      }
      return t2;
    };
    return __assign.apply(this, arguments);
  };
  function __rest(s, e) {
    var t2 = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t2[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t2[p[i]] = s[p[i]];
      }
    return t2;
  }
  function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l2 = from.length, ar; i < l2; i++) {
      if (ar || !(i in from)) {
        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
  }

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/assignRef.js
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useRef.js
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

  // ../../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
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

  // ../../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/medium.js
  function ItoI(a2) {
    return a2;
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
          buffer = buffer.filter(function(x2) {
            return x2 !== item;
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
          push: function(x2) {
            return cb(x2);
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
          push: function(x2) {
            pendingQueue.push(x2);
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

  // ../../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/exports.js
  var SideCar = function(_a2) {
    var sideCar = _a2.sideCar, rest = __rest(_a2, ["sideCar"]);
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

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = forwardRef(function(props, parentRef) {
    var ref = useRef(null);
    var _a2 = useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a2[0], setCallbacks = _a2[1];
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

  // ../../../node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
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

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/singleton.js
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

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/hook.js
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

  // ../../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet = function(_a2) {
      var styles = _a2.styles, dynamic = _a2.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet;
  };

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
  var zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0
  };
  var parse = function(x2) {
    return parseInt(x2 || "", 10) || 0;
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

  // ../../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a2, allowRelative, gapMode, important) {
    var left = _a2.left, top = _a2.top, right = _a2.right, gap = _a2.gap;
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
  var RemoveScrollBar = function(_a2) {
    var noRelative = _a2.noRelative, noImportant = _a2.noImportant, _b = _a2.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
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

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
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
        var _a2 = getScrollVariables(axis, current), scrollHeight = _a2[1], clientHeight = _a2[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a2) {
    var scrollTop = _a2.scrollTop, scrollHeight = _a2.scrollHeight, clientHeight = _a2.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a2) {
    var scrollLeft = _a2.scrollLeft, scrollWidth = _a2.scrollWidth, clientWidth = _a2.clientWidth;
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
      var _a2 = getScrollVariables(axis, target), position = _a2[0], scroll_1 = _a2[1], capacity = _a2[2];
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

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  var getTouchXY = function(event) {
    return "changedTouches" in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
  };
  var getDeltaXY = function(event) {
    return [event.deltaX, event.deltaY];
  };
  var extractRef = function(ref) {
    return ref && "current" in ref ? ref.current : ref;
  };
  var deltaCompare = function(x2, y2) {
    return x2[0] === y2[0] && x2[1] === y2[1];
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

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // ../../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = forwardRef(function(props, ref) {
    return createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // ../../../node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
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
    }).filter(function(x2) {
      return Boolean(x2);
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

  // ../../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31__@types+reac_19e637a1eb439fb7ac9fbd37f3b253ea/node_modules/@radix-ui/react-dialog/dist/index.mjs
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

  // ../../../node_modules/.pnpm/@radix-ui+react-label@2.1.11_@types+react-dom@18.3.7_@types+react@18.3.31__@types+react_b52ba80fbc885fa57ca9a4089e26a791/node_modules/@radix-ui/react-label/dist/index.mjs
  var dist_exports3 = {};
  __export(dist_exports3, {
    Label: () => Label,
    Root: () => Root
  });
  var NAME = "Label";
  var Label = forwardRef((props, forwardedRef) => {
    return /* @__PURE__ */ jsx(
      Primitive.label,
      {
        ...props,
        ref: forwardedRef,
        onMouseDown: (event) => {
          const target = event.target;
          if (target.closest("button, input, select, textarea")) return;
          props.onMouseDown?.(event);
          if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
        }
      }
    );
  });
  Label.displayName = NAME;
  var Root = Label;

  // ../../../node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
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

  // ../../../node_modules/.pnpm/i18next@25.6.0_typescript@5.9.3/node_modules/i18next/dist/esm/i18next.js
  var isString = (obj) => typeof obj === "string";
  var defer = () => {
    let res;
    let rej;
    const promise = new Promise((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    promise.resolve = res;
    promise.reject = rej;
    return promise;
  };
  var makeString = (object) => {
    if (object == null) return "";
    return "" + object;
  };
  var copy = (a2, s, t2) => {
    a2.forEach((m) => {
      if (s[m]) t2[m] = s[m];
    });
  };
  var lastOfPathSeparatorRegExp = /###/g;
  var cleanKey = (key) => key && key.indexOf("###") > -1 ? key.replace(lastOfPathSeparatorRegExp, ".") : key;
  var canNotTraverseDeeper = (object) => !object || isString(object);
  var getLastOfPath = (object, path, Empty) => {
    const stack = !isString(path) ? path : path.split(".");
    let stackIndex = 0;
    while (stackIndex < stack.length - 1) {
      if (canNotTraverseDeeper(object)) return {};
      const key = cleanKey(stack[stackIndex]);
      if (!object[key] && Empty) object[key] = new Empty();
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        object = object[key];
      } else {
        object = {};
      }
      ++stackIndex;
    }
    if (canNotTraverseDeeper(object)) return {};
    return {
      obj: object,
      k: cleanKey(stack[stackIndex])
    };
  };
  var setPath = (object, path, newValue) => {
    const {
      obj,
      k: k2
    } = getLastOfPath(object, path, Object);
    if (obj !== void 0 || path.length === 1) {
      obj[k2] = newValue;
      return;
    }
    let e = path[path.length - 1];
    let p = path.slice(0, path.length - 1);
    let last = getLastOfPath(object, p, Object);
    while (last.obj === void 0 && p.length) {
      e = `${p[p.length - 1]}.${e}`;
      p = p.slice(0, p.length - 1);
      last = getLastOfPath(object, p, Object);
      if (last?.obj && typeof last.obj[`${last.k}.${e}`] !== "undefined") {
        last.obj = void 0;
      }
    }
    last.obj[`${last.k}.${e}`] = newValue;
  };
  var pushPath = (object, path, newValue, concat) => {
    const {
      obj,
      k: k2
    } = getLastOfPath(object, path, Object);
    obj[k2] = obj[k2] || [];
    obj[k2].push(newValue);
  };
  var getPath = (object, path) => {
    const {
      obj,
      k: k2
    } = getLastOfPath(object, path);
    if (!obj) return void 0;
    if (!Object.prototype.hasOwnProperty.call(obj, k2)) return void 0;
    return obj[k2];
  };
  var getPathWithDefaults = (data, defaultData, key) => {
    const value = getPath(data, key);
    if (value !== void 0) {
      return value;
    }
    return getPath(defaultData, key);
  };
  var deepExtend = (target, source, overwrite) => {
    for (const prop in source) {
      if (prop !== "__proto__" && prop !== "constructor") {
        if (prop in target) {
          if (isString(target[prop]) || target[prop] instanceof String || isString(source[prop]) || source[prop] instanceof String) {
            if (overwrite) target[prop] = source[prop];
          } else {
            deepExtend(target[prop], source[prop], overwrite);
          }
        } else {
          target[prop] = source[prop];
        }
      }
    }
    return target;
  };
  var regexEscape = (str) => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  var _entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;"
  };
  var escape = (data) => {
    if (isString(data)) {
      return data.replace(/[&<>"'\/]/g, (s) => _entityMap[s]);
    }
    return data;
  };
  var RegExpCache = class {
    constructor(capacity) {
      this.capacity = capacity;
      this.regExpMap = /* @__PURE__ */ new Map();
      this.regExpQueue = [];
    }
    getRegExp(pattern) {
      const regExpFromCache = this.regExpMap.get(pattern);
      if (regExpFromCache !== void 0) {
        return regExpFromCache;
      }
      const regExpNew = new RegExp(pattern);
      if (this.regExpQueue.length === this.capacity) {
        this.regExpMap.delete(this.regExpQueue.shift());
      }
      this.regExpMap.set(pattern, regExpNew);
      this.regExpQueue.push(pattern);
      return regExpNew;
    }
  };
  var chars = [" ", ",", "?", "!", ";"];
  var looksLikeObjectPathRegExpCache = new RegExpCache(20);
  var looksLikeObjectPath = (key, nsSeparator, keySeparator) => {
    nsSeparator = nsSeparator || "";
    keySeparator = keySeparator || "";
    const possibleChars = chars.filter((c) => nsSeparator.indexOf(c) < 0 && keySeparator.indexOf(c) < 0);
    if (possibleChars.length === 0) return true;
    const r3 = looksLikeObjectPathRegExpCache.getRegExp(`(${possibleChars.map((c) => c === "?" ? "\\?" : c).join("|")})`);
    let matched = !r3.test(key);
    if (!matched) {
      const ki = key.indexOf(keySeparator);
      if (ki > 0 && !r3.test(key.substring(0, ki))) {
        matched = true;
      }
    }
    return matched;
  };
  var deepFind = (obj, path, keySeparator = ".") => {
    if (!obj) return void 0;
    if (obj[path]) {
      if (!Object.prototype.hasOwnProperty.call(obj, path)) return void 0;
      return obj[path];
    }
    const tokens = path.split(keySeparator);
    let current = obj;
    for (let i = 0; i < tokens.length; ) {
      if (!current || typeof current !== "object") {
        return void 0;
      }
      let next;
      let nextPath = "";
      for (let j2 = i; j2 < tokens.length; ++j2) {
        if (j2 !== i) {
          nextPath += keySeparator;
        }
        nextPath += tokens[j2];
        next = current[nextPath];
        if (next !== void 0) {
          if (["string", "number", "boolean"].indexOf(typeof next) > -1 && j2 < tokens.length - 1) {
            continue;
          }
          i += j2 - i + 1;
          break;
        }
      }
      current = next;
    }
    return current;
  };
  var getCleanedCode = (code) => code?.replace("_", "-");
  var consoleLogger = {
    type: "logger",
    log(args) {
      this.output("log", args);
    },
    warn(args) {
      this.output("warn", args);
    },
    error(args) {
      this.output("error", args);
    },
    output(type, args) {
      console?.[type]?.apply?.(console, args);
    }
  };
  var Logger = class _Logger {
    constructor(concreteLogger, options2 = {}) {
      this.init(concreteLogger, options2);
    }
    init(concreteLogger, options2 = {}) {
      this.prefix = options2.prefix || "i18next:";
      this.logger = concreteLogger || consoleLogger;
      this.options = options2;
      this.debug = options2.debug;
    }
    log(...args) {
      return this.forward(args, "log", "", true);
    }
    warn(...args) {
      return this.forward(args, "warn", "", true);
    }
    error(...args) {
      return this.forward(args, "error", "");
    }
    deprecate(...args) {
      return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
    }
    forward(args, lvl, prefix, debugOnly) {
      if (debugOnly && !this.debug) return null;
      if (isString(args[0])) args[0] = `${prefix}${this.prefix} ${args[0]}`;
      return this.logger[lvl](args);
    }
    create(moduleName) {
      return new _Logger(this.logger, {
        ...{
          prefix: `${this.prefix}:${moduleName}:`
        },
        ...this.options
      });
    }
    clone(options2) {
      options2 = options2 || this.options;
      options2.prefix = options2.prefix || this.prefix;
      return new _Logger(this.logger, options2);
    }
  };
  var baseLogger = new Logger();
  var EventEmitter = class {
    constructor() {
      this.observers = {};
    }
    on(events, listener) {
      events.split(" ").forEach((event) => {
        if (!this.observers[event]) this.observers[event] = /* @__PURE__ */ new Map();
        const numListeners = this.observers[event].get(listener) || 0;
        this.observers[event].set(listener, numListeners + 1);
      });
      return this;
    }
    off(event, listener) {
      if (!this.observers[event]) return;
      if (!listener) {
        delete this.observers[event];
        return;
      }
      this.observers[event].delete(listener);
    }
    emit(event, ...args) {
      if (this.observers[event]) {
        const cloned = Array.from(this.observers[event].entries());
        cloned.forEach(([observer, numTimesAdded]) => {
          for (let i = 0; i < numTimesAdded; i++) {
            observer(...args);
          }
        });
      }
      if (this.observers["*"]) {
        const cloned = Array.from(this.observers["*"].entries());
        cloned.forEach(([observer, numTimesAdded]) => {
          for (let i = 0; i < numTimesAdded; i++) {
            observer.apply(observer, [event, ...args]);
          }
        });
      }
    }
  };
  var ResourceStore = class extends EventEmitter {
    constructor(data, options2 = {
      ns: ["translation"],
      defaultNS: "translation"
    }) {
      super();
      this.data = data || {};
      this.options = options2;
      if (this.options.keySeparator === void 0) {
        this.options.keySeparator = ".";
      }
      if (this.options.ignoreJSONStructure === void 0) {
        this.options.ignoreJSONStructure = true;
      }
    }
    addNamespaces(ns) {
      if (this.options.ns.indexOf(ns) < 0) {
        this.options.ns.push(ns);
      }
    }
    removeNamespaces(ns) {
      const index = this.options.ns.indexOf(ns);
      if (index > -1) {
        this.options.ns.splice(index, 1);
      }
    }
    getResource(lng, ns, key, options2 = {}) {
      const keySeparator = options2.keySeparator !== void 0 ? options2.keySeparator : this.options.keySeparator;
      const ignoreJSONStructure = options2.ignoreJSONStructure !== void 0 ? options2.ignoreJSONStructure : this.options.ignoreJSONStructure;
      let path;
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
      } else {
        path = [lng, ns];
        if (key) {
          if (Array.isArray(key)) {
            path.push(...key);
          } else if (isString(key) && keySeparator) {
            path.push(...key.split(keySeparator));
          } else {
            path.push(key);
          }
        }
      }
      const result = getPath(this.data, path);
      if (!result && !ns && !key && lng.indexOf(".") > -1) {
        lng = path[0];
        ns = path[1];
        key = path.slice(2).join(".");
      }
      if (result || !ignoreJSONStructure || !isString(key)) return result;
      return deepFind(this.data?.[lng]?.[ns], key, keySeparator);
    }
    addResource(lng, ns, key, value, options2 = {
      silent: false
    }) {
      const keySeparator = options2.keySeparator !== void 0 ? options2.keySeparator : this.options.keySeparator;
      let path = [lng, ns];
      if (key) path = path.concat(keySeparator ? key.split(keySeparator) : key);
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
        value = ns;
        ns = path[1];
      }
      this.addNamespaces(ns);
      setPath(this.data, path, value);
      if (!options2.silent) this.emit("added", lng, ns, key, value);
    }
    addResources(lng, ns, resources, options2 = {
      silent: false
    }) {
      for (const m in resources) {
        if (isString(resources[m]) || Array.isArray(resources[m])) this.addResource(lng, ns, m, resources[m], {
          silent: true
        });
      }
      if (!options2.silent) this.emit("added", lng, ns, resources);
    }
    addResourceBundle(lng, ns, resources, deep, overwrite, options2 = {
      silent: false,
      skipCopy: false
    }) {
      let path = [lng, ns];
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
        deep = resources;
        resources = ns;
        ns = path[1];
      }
      this.addNamespaces(ns);
      let pack = getPath(this.data, path) || {};
      if (!options2.skipCopy) resources = JSON.parse(JSON.stringify(resources));
      if (deep) {
        deepExtend(pack, resources, overwrite);
      } else {
        pack = {
          ...pack,
          ...resources
        };
      }
      setPath(this.data, path, pack);
      if (!options2.silent) this.emit("added", lng, ns, resources);
    }
    removeResourceBundle(lng, ns) {
      if (this.hasResourceBundle(lng, ns)) {
        delete this.data[lng][ns];
      }
      this.removeNamespaces(ns);
      this.emit("removed", lng, ns);
    }
    hasResourceBundle(lng, ns) {
      return this.getResource(lng, ns) !== void 0;
    }
    getResourceBundle(lng, ns) {
      if (!ns) ns = this.options.defaultNS;
      return this.getResource(lng, ns);
    }
    getDataByLanguage(lng) {
      return this.data[lng];
    }
    hasLanguageSomeTranslations(lng) {
      const data = this.getDataByLanguage(lng);
      const n = data && Object.keys(data) || [];
      return !!n.find((v) => data[v] && Object.keys(data[v]).length > 0);
    }
    toJSON() {
      return this.data;
    }
  };
  var postProcessor = {
    processors: {},
    addPostProcessor(module) {
      this.processors[module.name] = module;
    },
    handle(processors, value, key, options2, translator) {
      processors.forEach((processor) => {
        value = this.processors[processor]?.process(value, key, options2, translator) ?? value;
      });
      return value;
    }
  };
  var PATH_KEY = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
  function createProxy() {
    const state = [];
    const handler = /* @__PURE__ */ Object.create(null);
    let proxy;
    handler.get = (target, key) => {
      proxy?.revoke?.();
      if (key === PATH_KEY) return state;
      state.push(key);
      proxy = Proxy.revocable(target, handler);
      return proxy.proxy;
    };
    return Proxy.revocable(/* @__PURE__ */ Object.create(null), handler).proxy;
  }
  function keysFromSelector(selector, opts) {
    const {
      [PATH_KEY]: path
    } = selector(createProxy());
    return path.join(opts?.keySeparator ?? ".");
  }
  var checkedLoadedFor = {};
  var shouldHandleAsObject = (res) => !isString(res) && typeof res !== "boolean" && typeof res !== "number";
  var Translator = class _Translator extends EventEmitter {
    constructor(services, options2 = {}) {
      super();
      copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, this);
      this.options = options2;
      if (this.options.keySeparator === void 0) {
        this.options.keySeparator = ".";
      }
      this.logger = baseLogger.create("translator");
    }
    changeLanguage(lng) {
      if (lng) this.language = lng;
    }
    exists(key, o = {
      interpolation: {}
    }) {
      const opt = {
        ...o
      };
      if (key == null) return false;
      const resolved = this.resolve(key, opt);
      if (resolved?.res === void 0) return false;
      const isObject = shouldHandleAsObject(resolved.res);
      if (opt.returnObjects === false && isObject) {
        return false;
      }
      return true;
    }
    extractFromKey(key, opt) {
      let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
      if (nsSeparator === void 0) nsSeparator = ":";
      const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
      let namespaces = opt.ns || this.options.defaultNS || [];
      const wouldCheckForNsInKey = nsSeparator && key.indexOf(nsSeparator) > -1;
      const seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !opt.keySeparator && !this.options.userDefinedNsSeparator && !opt.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
      if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
        const m = key.match(this.interpolator.nestingRegexp);
        if (m && m.length > 0) {
          return {
            key,
            namespaces: isString(namespaces) ? [namespaces] : namespaces
          };
        }
        const parts = key.split(nsSeparator);
        if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.indexOf(parts[0]) > -1) namespaces = parts.shift();
        key = parts.join(keySeparator);
      }
      return {
        key,
        namespaces: isString(namespaces) ? [namespaces] : namespaces
      };
    }
    translate(keys, o, lastKey) {
      let opt = typeof o === "object" ? {
        ...o
      } : o;
      if (typeof opt !== "object" && this.options.overloadTranslationOptionHandler) {
        opt = this.options.overloadTranslationOptionHandler(arguments);
      }
      if (typeof opt === "object") opt = {
        ...opt
      };
      if (!opt) opt = {};
      if (keys == null) return "";
      if (typeof keys === "function") keys = keysFromSelector(keys, {
        ...this.options,
        ...opt
      });
      if (!Array.isArray(keys)) keys = [String(keys)];
      const returnDetails = opt.returnDetails !== void 0 ? opt.returnDetails : this.options.returnDetails;
      const keySeparator = opt.keySeparator !== void 0 ? opt.keySeparator : this.options.keySeparator;
      const {
        key,
        namespaces
      } = this.extractFromKey(keys[keys.length - 1], opt);
      const namespace = namespaces[namespaces.length - 1];
      let nsSeparator = opt.nsSeparator !== void 0 ? opt.nsSeparator : this.options.nsSeparator;
      if (nsSeparator === void 0) nsSeparator = ":";
      const lng = opt.lng || this.language;
      const appendNamespaceToCIMode = opt.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
      if (lng?.toLowerCase() === "cimode") {
        if (appendNamespaceToCIMode) {
          if (returnDetails) {
            return {
              res: `${namespace}${nsSeparator}${key}`,
              usedKey: key,
              exactUsedKey: key,
              usedLng: lng,
              usedNS: namespace,
              usedParams: this.getUsedParamsDetails(opt)
            };
          }
          return `${namespace}${nsSeparator}${key}`;
        }
        if (returnDetails) {
          return {
            res: key,
            usedKey: key,
            exactUsedKey: key,
            usedLng: lng,
            usedNS: namespace,
            usedParams: this.getUsedParamsDetails(opt)
          };
        }
        return key;
      }
      const resolved = this.resolve(keys, opt);
      let res = resolved?.res;
      const resUsedKey = resolved?.usedKey || key;
      const resExactUsedKey = resolved?.exactUsedKey || key;
      const noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
      const joinArrays = opt.joinArrays !== void 0 ? opt.joinArrays : this.options.joinArrays;
      const handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
      const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
      const hasDefaultValue = _Translator.hasDefaultValue(opt);
      const defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, opt) : "";
      const defaultValueSuffixOrdinalFallback = opt.ordinal && needsPluralHandling ? this.pluralResolver.getSuffix(lng, opt.count, {
        ordinal: false
      }) : "";
      const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
      const defaultValue = needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] || opt[`defaultValue${defaultValueSuffix}`] || opt[`defaultValue${defaultValueSuffixOrdinalFallback}`] || opt.defaultValue;
      let resForObjHndl = res;
      if (handleAsObjectInI18nFormat && !res && hasDefaultValue) {
        resForObjHndl = defaultValue;
      }
      const handleAsObject = shouldHandleAsObject(resForObjHndl);
      const resType = Object.prototype.toString.apply(resForObjHndl);
      if (handleAsObjectInI18nFormat && resForObjHndl && handleAsObject && noObject.indexOf(resType) < 0 && !(isString(joinArrays) && Array.isArray(resForObjHndl))) {
        if (!opt.returnObjects && !this.options.returnObjects) {
          if (!this.options.returnedObjectHandler) {
            this.logger.warn("accessing an object - but returnObjects options is not enabled!");
          }
          const r3 = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, resForObjHndl, {
            ...opt,
            ns: namespaces
          }) : `key '${key} (${this.language})' returned an object instead of string.`;
          if (returnDetails) {
            resolved.res = r3;
            resolved.usedParams = this.getUsedParamsDetails(opt);
            return resolved;
          }
          return r3;
        }
        if (keySeparator) {
          const resTypeIsArray = Array.isArray(resForObjHndl);
          const copy2 = resTypeIsArray ? [] : {};
          const newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
          for (const m in resForObjHndl) {
            if (Object.prototype.hasOwnProperty.call(resForObjHndl, m)) {
              const deepKey = `${newKeyToUse}${keySeparator}${m}`;
              if (hasDefaultValue && !res) {
                copy2[m] = this.translate(deepKey, {
                  ...opt,
                  defaultValue: shouldHandleAsObject(defaultValue) ? defaultValue[m] : void 0,
                  ...{
                    joinArrays: false,
                    ns: namespaces
                  }
                });
              } else {
                copy2[m] = this.translate(deepKey, {
                  ...opt,
                  ...{
                    joinArrays: false,
                    ns: namespaces
                  }
                });
              }
              if (copy2[m] === deepKey) copy2[m] = resForObjHndl[m];
            }
          }
          res = copy2;
        }
      } else if (handleAsObjectInI18nFormat && isString(joinArrays) && Array.isArray(res)) {
        res = res.join(joinArrays);
        if (res) res = this.extendTranslation(res, keys, opt, lastKey);
      } else {
        let usedDefault = false;
        let usedKey = false;
        if (!this.isValidLookup(res) && hasDefaultValue) {
          usedDefault = true;
          res = defaultValue;
        }
        if (!this.isValidLookup(res)) {
          usedKey = true;
          res = key;
        }
        const missingKeyNoValueFallbackToKey = opt.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
        const resForMissing = missingKeyNoValueFallbackToKey && usedKey ? void 0 : res;
        const updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
        if (usedKey || usedDefault || updateMissing) {
          this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, key, updateMissing ? defaultValue : res);
          if (keySeparator) {
            const fk = this.resolve(key, {
              ...opt,
              keySeparator: false
            });
            if (fk && fk.res) this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
          }
          let lngs = [];
          const fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, opt.lng || this.language);
          if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
            for (let i = 0; i < fallbackLngs.length; i++) {
              lngs.push(fallbackLngs[i]);
            }
          } else if (this.options.saveMissingTo === "all") {
            lngs = this.languageUtils.toResolveHierarchy(opt.lng || this.language);
          } else {
            lngs.push(opt.lng || this.language);
          }
          const send = (l2, k2, specificDefaultValue) => {
            const defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
            if (this.options.missingKeyHandler) {
              this.options.missingKeyHandler(l2, namespace, k2, defaultForMissing, updateMissing, opt);
            } else if (this.backendConnector?.saveMissing) {
              this.backendConnector.saveMissing(l2, namespace, k2, defaultForMissing, updateMissing, opt);
            }
            this.emit("missingKey", l2, namespace, k2, res);
          };
          if (this.options.saveMissing) {
            if (this.options.saveMissingPlurals && needsPluralHandling) {
              lngs.forEach((language) => {
                const suffixes = this.pluralResolver.getSuffixes(language, opt);
                if (needsZeroSuffixLookup && opt[`defaultValue${this.options.pluralSeparator}zero`] && suffixes.indexOf(`${this.options.pluralSeparator}zero`) < 0) {
                  suffixes.push(`${this.options.pluralSeparator}zero`);
                }
                suffixes.forEach((suffix) => {
                  send([language], key + suffix, opt[`defaultValue${suffix}`] || defaultValue);
                });
              });
            } else {
              send(lngs, key, defaultValue);
            }
          }
        }
        res = this.extendTranslation(res, keys, opt, resolved, lastKey);
        if (usedKey && res === key && this.options.appendNamespaceToMissingKey) {
          res = `${namespace}${nsSeparator}${key}`;
        }
        if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
          res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${namespace}${nsSeparator}${key}` : key, usedDefault ? res : void 0, opt);
        }
      }
      if (returnDetails) {
        resolved.res = res;
        resolved.usedParams = this.getUsedParamsDetails(opt);
        return resolved;
      }
      return res;
    }
    extendTranslation(res, key, opt, resolved, lastKey) {
      if (this.i18nFormat?.parse) {
        res = this.i18nFormat.parse(res, {
          ...this.options.interpolation.defaultVariables,
          ...opt
        }, opt.lng || this.language || resolved.usedLng, resolved.usedNS, resolved.usedKey, {
          resolved
        });
      } else if (!opt.skipInterpolation) {
        if (opt.interpolation) this.interpolator.init({
          ...opt,
          ...{
            interpolation: {
              ...this.options.interpolation,
              ...opt.interpolation
            }
          }
        });
        const skipOnVariables = isString(res) && (opt?.interpolation?.skipOnVariables !== void 0 ? opt.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
        let nestBef;
        if (skipOnVariables) {
          const nb = res.match(this.interpolator.nestingRegexp);
          nestBef = nb && nb.length;
        }
        let data = opt.replace && !isString(opt.replace) ? opt.replace : opt;
        if (this.options.interpolation.defaultVariables) data = {
          ...this.options.interpolation.defaultVariables,
          ...data
        };
        res = this.interpolator.interpolate(res, data, opt.lng || this.language || resolved.usedLng, opt);
        if (skipOnVariables) {
          const na = res.match(this.interpolator.nestingRegexp);
          const nestAft = na && na.length;
          if (nestBef < nestAft) opt.nest = false;
        }
        if (!opt.lng && resolved && resolved.res) opt.lng = this.language || resolved.usedLng;
        if (opt.nest !== false) res = this.interpolator.nest(res, (...args) => {
          if (lastKey?.[0] === args[0] && !opt.context) {
            this.logger.warn(`It seems you are nesting recursively key: ${args[0]} in key: ${key[0]}`);
            return null;
          }
          return this.translate(...args, key);
        }, opt);
        if (opt.interpolation) this.interpolator.reset();
      }
      const postProcess = opt.postProcess || this.options.postProcess;
      const postProcessorNames = isString(postProcess) ? [postProcess] : postProcess;
      if (res != null && postProcessorNames?.length && opt.applyPostProcessor !== false) {
        res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? {
          i18nResolved: {
            ...resolved,
            usedParams: this.getUsedParamsDetails(opt)
          },
          ...opt
        } : opt, this);
      }
      return res;
    }
    resolve(keys, opt = {}) {
      let found;
      let usedKey;
      let exactUsedKey;
      let usedLng;
      let usedNS;
      if (isString(keys)) keys = [keys];
      keys.forEach((k2) => {
        if (this.isValidLookup(found)) return;
        const extracted = this.extractFromKey(k2, opt);
        const key = extracted.key;
        usedKey = key;
        let namespaces = extracted.namespaces;
        if (this.options.fallbackNS) namespaces = namespaces.concat(this.options.fallbackNS);
        const needsPluralHandling = opt.count !== void 0 && !isString(opt.count);
        const needsZeroSuffixLookup = needsPluralHandling && !opt.ordinal && opt.count === 0;
        const needsContextHandling = opt.context !== void 0 && (isString(opt.context) || typeof opt.context === "number") && opt.context !== "";
        const codes = opt.lngs ? opt.lngs : this.languageUtils.toResolveHierarchy(opt.lng || this.language, opt.fallbackLng);
        namespaces.forEach((ns) => {
          if (this.isValidLookup(found)) return;
          usedNS = ns;
          if (!checkedLoadedFor[`${codes[0]}-${ns}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(usedNS)) {
            checkedLoadedFor[`${codes[0]}-${ns}`] = true;
            this.logger.warn(`key "${usedKey}" for languages "${codes.join(", ")}" won't get resolved as namespace "${usedNS}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
          }
          codes.forEach((code) => {
            if (this.isValidLookup(found)) return;
            usedLng = code;
            const finalKeys = [key];
            if (this.i18nFormat?.addLookupKeys) {
              this.i18nFormat.addLookupKeys(finalKeys, key, code, ns, opt);
            } else {
              let pluralSuffix;
              if (needsPluralHandling) pluralSuffix = this.pluralResolver.getSuffix(code, opt.count, opt);
              const zeroSuffix = `${this.options.pluralSeparator}zero`;
              const ordinalPrefix = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
              if (needsPluralHandling) {
                if (opt.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                  finalKeys.push(key + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                }
                finalKeys.push(key + pluralSuffix);
                if (needsZeroSuffixLookup) {
                  finalKeys.push(key + zeroSuffix);
                }
              }
              if (needsContextHandling) {
                const contextKey = `${key}${this.options.contextSeparator || "_"}${opt.context}`;
                finalKeys.push(contextKey);
                if (needsPluralHandling) {
                  if (opt.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                    finalKeys.push(contextKey + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                  }
                  finalKeys.push(contextKey + pluralSuffix);
                  if (needsZeroSuffixLookup) {
                    finalKeys.push(contextKey + zeroSuffix);
                  }
                }
              }
            }
            let possibleKey;
            while (possibleKey = finalKeys.pop()) {
              if (!this.isValidLookup(found)) {
                exactUsedKey = possibleKey;
                found = this.getResource(code, ns, possibleKey, opt);
              }
            }
          });
        });
      });
      return {
        res: found,
        usedKey,
        exactUsedKey,
        usedLng,
        usedNS
      };
    }
    isValidLookup(res) {
      return res !== void 0 && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
    }
    getResource(code, ns, key, options2 = {}) {
      if (this.i18nFormat?.getResource) return this.i18nFormat.getResource(code, ns, key, options2);
      return this.resourceStore.getResource(code, ns, key, options2);
    }
    getUsedParamsDetails(options2 = {}) {
      const optionsKeys = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"];
      const useOptionsReplaceForData = options2.replace && !isString(options2.replace);
      let data = useOptionsReplaceForData ? options2.replace : options2;
      if (useOptionsReplaceForData && typeof options2.count !== "undefined") {
        data.count = options2.count;
      }
      if (this.options.interpolation.defaultVariables) {
        data = {
          ...this.options.interpolation.defaultVariables,
          ...data
        };
      }
      if (!useOptionsReplaceForData) {
        data = {
          ...data
        };
        for (const key of optionsKeys) {
          delete data[key];
        }
      }
      return data;
    }
    static hasDefaultValue(options2) {
      const prefix = "defaultValue";
      for (const option in options2) {
        if (Object.prototype.hasOwnProperty.call(options2, option) && prefix === option.substring(0, prefix.length) && void 0 !== options2[option]) {
          return true;
        }
      }
      return false;
    }
  };
  var LanguageUtil = class {
    constructor(options2) {
      this.options = options2;
      this.supportedLngs = this.options.supportedLngs || false;
      this.logger = baseLogger.create("languageUtils");
    }
    getScriptPartFromCode(code) {
      code = getCleanedCode(code);
      if (!code || code.indexOf("-") < 0) return null;
      const p = code.split("-");
      if (p.length === 2) return null;
      p.pop();
      if (p[p.length - 1].toLowerCase() === "x") return null;
      return this.formatLanguageCode(p.join("-"));
    }
    getLanguagePartFromCode(code) {
      code = getCleanedCode(code);
      if (!code || code.indexOf("-") < 0) return code;
      const p = code.split("-");
      return this.formatLanguageCode(p[0]);
    }
    formatLanguageCode(code) {
      if (isString(code) && code.indexOf("-") > -1) {
        let formattedCode;
        try {
          formattedCode = Intl.getCanonicalLocales(code)[0];
        } catch (e) {
        }
        if (formattedCode && this.options.lowerCaseLng) {
          formattedCode = formattedCode.toLowerCase();
        }
        if (formattedCode) return formattedCode;
        if (this.options.lowerCaseLng) {
          return code.toLowerCase();
        }
        return code;
      }
      return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
    }
    isSupportedCode(code) {
      if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
        code = this.getLanguagePartFromCode(code);
      }
      return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.indexOf(code) > -1;
    }
    getBestMatchFromCodes(codes) {
      if (!codes) return null;
      let found;
      codes.forEach((code) => {
        if (found) return;
        const cleanedLng = this.formatLanguageCode(code);
        if (!this.options.supportedLngs || this.isSupportedCode(cleanedLng)) found = cleanedLng;
      });
      if (!found && this.options.supportedLngs) {
        codes.forEach((code) => {
          if (found) return;
          const lngScOnly = this.getScriptPartFromCode(code);
          if (this.isSupportedCode(lngScOnly)) return found = lngScOnly;
          const lngOnly = this.getLanguagePartFromCode(code);
          if (this.isSupportedCode(lngOnly)) return found = lngOnly;
          found = this.options.supportedLngs.find((supportedLng) => {
            if (supportedLng === lngOnly) return supportedLng;
            if (supportedLng.indexOf("-") < 0 && lngOnly.indexOf("-") < 0) return;
            if (supportedLng.indexOf("-") > 0 && lngOnly.indexOf("-") < 0 && supportedLng.substring(0, supportedLng.indexOf("-")) === lngOnly) return supportedLng;
            if (supportedLng.indexOf(lngOnly) === 0 && lngOnly.length > 1) return supportedLng;
          });
        });
      }
      if (!found) found = this.getFallbackCodes(this.options.fallbackLng)[0];
      return found;
    }
    getFallbackCodes(fallbacks, code) {
      if (!fallbacks) return [];
      if (typeof fallbacks === "function") fallbacks = fallbacks(code);
      if (isString(fallbacks)) fallbacks = [fallbacks];
      if (Array.isArray(fallbacks)) return fallbacks;
      if (!code) return fallbacks.default || [];
      let found = fallbacks[code];
      if (!found) found = fallbacks[this.getScriptPartFromCode(code)];
      if (!found) found = fallbacks[this.formatLanguageCode(code)];
      if (!found) found = fallbacks[this.getLanguagePartFromCode(code)];
      if (!found) found = fallbacks.default;
      return found || [];
    }
    toResolveHierarchy(code, fallbackCode) {
      const fallbackCodes = this.getFallbackCodes((fallbackCode === false ? [] : fallbackCode) || this.options.fallbackLng || [], code);
      const codes = [];
      const addCode = (c) => {
        if (!c) return;
        if (this.isSupportedCode(c)) {
          codes.push(c);
        } else {
          this.logger.warn(`rejecting language code not found in supportedLngs: ${c}`);
        }
      };
      if (isString(code) && (code.indexOf("-") > -1 || code.indexOf("_") > -1)) {
        if (this.options.load !== "languageOnly") addCode(this.formatLanguageCode(code));
        if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly") addCode(this.getScriptPartFromCode(code));
        if (this.options.load !== "currentOnly") addCode(this.getLanguagePartFromCode(code));
      } else if (isString(code)) {
        addCode(this.formatLanguageCode(code));
      }
      fallbackCodes.forEach((fc) => {
        if (codes.indexOf(fc) < 0) addCode(this.formatLanguageCode(fc));
      });
      return codes;
    }
  };
  var suffixesOrder = {
    zero: 0,
    one: 1,
    two: 2,
    few: 3,
    many: 4,
    other: 5
  };
  var dummyRule = {
    select: (count3) => count3 === 1 ? "one" : "other",
    resolvedOptions: () => ({
      pluralCategories: ["one", "other"]
    })
  };
  var PluralResolver = class {
    constructor(languageUtils, options2 = {}) {
      this.languageUtils = languageUtils;
      this.options = options2;
      this.logger = baseLogger.create("pluralResolver");
      this.pluralRulesCache = {};
    }
    addRule(lng, obj) {
      this.rules[lng] = obj;
    }
    clearCache() {
      this.pluralRulesCache = {};
    }
    getRule(code, options2 = {}) {
      const cleanedCode = getCleanedCode(code === "dev" ? "en" : code);
      const type = options2.ordinal ? "ordinal" : "cardinal";
      const cacheKey = JSON.stringify({
        cleanedCode,
        type
      });
      if (cacheKey in this.pluralRulesCache) {
        return this.pluralRulesCache[cacheKey];
      }
      let rule;
      try {
        rule = new Intl.PluralRules(cleanedCode, {
          type
        });
      } catch (err) {
        if (!Intl) {
          this.logger.error("No Intl support, please use an Intl polyfill!");
          return dummyRule;
        }
        if (!code.match(/-|_/)) return dummyRule;
        const lngPart = this.languageUtils.getLanguagePartFromCode(code);
        rule = this.getRule(lngPart, options2);
      }
      this.pluralRulesCache[cacheKey] = rule;
      return rule;
    }
    needsPlural(code, options2 = {}) {
      let rule = this.getRule(code, options2);
      if (!rule) rule = this.getRule("dev", options2);
      return rule?.resolvedOptions().pluralCategories.length > 1;
    }
    getPluralFormsOfKey(code, key, options2 = {}) {
      return this.getSuffixes(code, options2).map((suffix) => `${key}${suffix}`);
    }
    getSuffixes(code, options2 = {}) {
      let rule = this.getRule(code, options2);
      if (!rule) rule = this.getRule("dev", options2);
      if (!rule) return [];
      return rule.resolvedOptions().pluralCategories.sort((pluralCategory1, pluralCategory2) => suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2]).map((pluralCategory) => `${this.options.prepend}${options2.ordinal ? `ordinal${this.options.prepend}` : ""}${pluralCategory}`);
    }
    getSuffix(code, count3, options2 = {}) {
      const rule = this.getRule(code, options2);
      if (rule) {
        return `${this.options.prepend}${options2.ordinal ? `ordinal${this.options.prepend}` : ""}${rule.select(count3)}`;
      }
      this.logger.warn(`no plural rule found for: ${code}`);
      return this.getSuffix("dev", count3, options2);
    }
  };
  var deepFindWithDefaults = (data, defaultData, key, keySeparator = ".", ignoreJSONStructure = true) => {
    let path = getPathWithDefaults(data, defaultData, key);
    if (!path && ignoreJSONStructure && isString(key)) {
      path = deepFind(data, key, keySeparator);
      if (path === void 0) path = deepFind(defaultData, key, keySeparator);
    }
    return path;
  };
  var regexSafe = (val) => val.replace(/\$/g, "$$$$");
  var Interpolator = class {
    constructor(options2 = {}) {
      this.logger = baseLogger.create("interpolator");
      this.options = options2;
      this.format = options2?.interpolation?.format || ((value) => value);
      this.init(options2);
    }
    init(options2 = {}) {
      if (!options2.interpolation) options2.interpolation = {
        escapeValue: true
      };
      const {
        escape: escape$1,
        escapeValue,
        useRawValueToEscape,
        prefix,
        prefixEscaped,
        suffix,
        suffixEscaped,
        formatSeparator,
        unescapeSuffix,
        unescapePrefix,
        nestingPrefix,
        nestingPrefixEscaped,
        nestingSuffix,
        nestingSuffixEscaped,
        nestingOptionsSeparator,
        maxReplaces,
        alwaysFormat
      } = options2.interpolation;
      this.escape = escape$1 !== void 0 ? escape$1 : escape;
      this.escapeValue = escapeValue !== void 0 ? escapeValue : true;
      this.useRawValueToEscape = useRawValueToEscape !== void 0 ? useRawValueToEscape : false;
      this.prefix = prefix ? regexEscape(prefix) : prefixEscaped || "{{";
      this.suffix = suffix ? regexEscape(suffix) : suffixEscaped || "}}";
      this.formatSeparator = formatSeparator || ",";
      this.unescapePrefix = unescapeSuffix ? "" : unescapePrefix || "-";
      this.unescapeSuffix = this.unescapePrefix ? "" : unescapeSuffix || "";
      this.nestingPrefix = nestingPrefix ? regexEscape(nestingPrefix) : nestingPrefixEscaped || regexEscape("$t(");
      this.nestingSuffix = nestingSuffix ? regexEscape(nestingSuffix) : nestingSuffixEscaped || regexEscape(")");
      this.nestingOptionsSeparator = nestingOptionsSeparator || ",";
      this.maxReplaces = maxReplaces || 1e3;
      this.alwaysFormat = alwaysFormat !== void 0 ? alwaysFormat : false;
      this.resetRegExp();
    }
    reset() {
      if (this.options) this.init(this.options);
    }
    resetRegExp() {
      const getOrResetRegExp = (existingRegExp, pattern) => {
        if (existingRegExp?.source === pattern) {
          existingRegExp.lastIndex = 0;
          return existingRegExp;
        }
        return new RegExp(pattern, "g");
      };
      this.regexp = getOrResetRegExp(this.regexp, `${this.prefix}(.+?)${this.suffix}`);
      this.regexpUnescape = getOrResetRegExp(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`);
      this.nestingRegexp = getOrResetRegExp(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
    }
    interpolate(str, data, lng, options2) {
      let match;
      let value;
      let replaces;
      const defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
      const handleFormat = (key) => {
        if (key.indexOf(this.formatSeparator) < 0) {
          const path = deepFindWithDefaults(data, defaultData, key, this.options.keySeparator, this.options.ignoreJSONStructure);
          return this.alwaysFormat ? this.format(path, void 0, lng, {
            ...options2,
            ...data,
            interpolationkey: key
          }) : path;
        }
        const p = key.split(this.formatSeparator);
        const k2 = p.shift().trim();
        const f2 = p.join(this.formatSeparator).trim();
        return this.format(deepFindWithDefaults(data, defaultData, k2, this.options.keySeparator, this.options.ignoreJSONStructure), f2, lng, {
          ...options2,
          ...data,
          interpolationkey: k2
        });
      };
      this.resetRegExp();
      const missingInterpolationHandler = options2?.missingInterpolationHandler || this.options.missingInterpolationHandler;
      const skipOnVariables = options2?.interpolation?.skipOnVariables !== void 0 ? options2.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
      const todos = [{
        regex: this.regexpUnescape,
        safeValue: (val) => regexSafe(val)
      }, {
        regex: this.regexp,
        safeValue: (val) => this.escapeValue ? regexSafe(this.escape(val)) : regexSafe(val)
      }];
      todos.forEach((todo) => {
        replaces = 0;
        while (match = todo.regex.exec(str)) {
          const matchedVar = match[1].trim();
          value = handleFormat(matchedVar);
          if (value === void 0) {
            if (typeof missingInterpolationHandler === "function") {
              const temp = missingInterpolationHandler(str, match, options2);
              value = isString(temp) ? temp : "";
            } else if (options2 && Object.prototype.hasOwnProperty.call(options2, matchedVar)) {
              value = "";
            } else if (skipOnVariables) {
              value = match[0];
              continue;
            } else {
              this.logger.warn(`missed to pass in variable ${matchedVar} for interpolating ${str}`);
              value = "";
            }
          } else if (!isString(value) && !this.useRawValueToEscape) {
            value = makeString(value);
          }
          const safeValue = todo.safeValue(value);
          str = str.replace(match[0], safeValue);
          if (skipOnVariables) {
            todo.regex.lastIndex += value.length;
            todo.regex.lastIndex -= match[0].length;
          } else {
            todo.regex.lastIndex = 0;
          }
          replaces++;
          if (replaces >= this.maxReplaces) {
            break;
          }
        }
      });
      return str;
    }
    nest(str, fc, options2 = {}) {
      let match;
      let value;
      let clonedOptions;
      const handleHasOptions = (key, inheritedOptions) => {
        const sep = this.nestingOptionsSeparator;
        if (key.indexOf(sep) < 0) return key;
        const c = key.split(new RegExp(`${sep}[ ]*{`));
        let optionsString = `{${c[1]}`;
        key = c[0];
        optionsString = this.interpolate(optionsString, clonedOptions);
        const matchedSingleQuotes = optionsString.match(/'/g);
        const matchedDoubleQuotes = optionsString.match(/"/g);
        if ((matchedSingleQuotes?.length ?? 0) % 2 === 0 && !matchedDoubleQuotes || matchedDoubleQuotes.length % 2 !== 0) {
          optionsString = optionsString.replace(/'/g, '"');
        }
        try {
          clonedOptions = JSON.parse(optionsString);
          if (inheritedOptions) clonedOptions = {
            ...inheritedOptions,
            ...clonedOptions
          };
        } catch (e) {
          this.logger.warn(`failed parsing options string in nesting for key ${key}`, e);
          return `${key}${sep}${optionsString}`;
        }
        if (clonedOptions.defaultValue && clonedOptions.defaultValue.indexOf(this.prefix) > -1) delete clonedOptions.defaultValue;
        return key;
      };
      while (match = this.nestingRegexp.exec(str)) {
        let formatters = [];
        clonedOptions = {
          ...options2
        };
        clonedOptions = clonedOptions.replace && !isString(clonedOptions.replace) ? clonedOptions.replace : clonedOptions;
        clonedOptions.applyPostProcessor = false;
        delete clonedOptions.defaultValue;
        const keyEndIndex = /{.*}/.test(match[1]) ? match[1].lastIndexOf("}") + 1 : match[1].indexOf(this.formatSeparator);
        if (keyEndIndex !== -1) {
          formatters = match[1].slice(keyEndIndex).split(this.formatSeparator).map((elem) => elem.trim()).filter(Boolean);
          match[1] = match[1].slice(0, keyEndIndex);
        }
        value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
        if (value && match[0] === str && !isString(value)) return value;
        if (!isString(value)) value = makeString(value);
        if (!value) {
          this.logger.warn(`missed to resolve ${match[1]} for nesting ${str}`);
          value = "";
        }
        if (formatters.length) {
          value = formatters.reduce((v, f2) => this.format(v, f2, options2.lng, {
            ...options2,
            interpolationkey: match[1].trim()
          }), value.trim());
        }
        str = str.replace(match[0], value);
        this.regexp.lastIndex = 0;
      }
      return str;
    }
  };
  var parseFormatStr = (formatStr) => {
    let formatName = formatStr.toLowerCase().trim();
    const formatOptions = {};
    if (formatStr.indexOf("(") > -1) {
      const p = formatStr.split("(");
      formatName = p[0].toLowerCase().trim();
      const optStr = p[1].substring(0, p[1].length - 1);
      if (formatName === "currency" && optStr.indexOf(":") < 0) {
        if (!formatOptions.currency) formatOptions.currency = optStr.trim();
      } else if (formatName === "relativetime" && optStr.indexOf(":") < 0) {
        if (!formatOptions.range) formatOptions.range = optStr.trim();
      } else {
        const opts = optStr.split(";");
        opts.forEach((opt) => {
          if (opt) {
            const [key, ...rest] = opt.split(":");
            const val = rest.join(":").trim().replace(/^'+|'+$/g, "");
            const trimmedKey = key.trim();
            if (!formatOptions[trimmedKey]) formatOptions[trimmedKey] = val;
            if (val === "false") formatOptions[trimmedKey] = false;
            if (val === "true") formatOptions[trimmedKey] = true;
            if (!isNaN(val)) formatOptions[trimmedKey] = parseInt(val, 10);
          }
        });
      }
    }
    return {
      formatName,
      formatOptions
    };
  };
  var createCachedFormatter = (fn) => {
    const cache = {};
    return (v, l2, o) => {
      let optForCache = o;
      if (o && o.interpolationkey && o.formatParams && o.formatParams[o.interpolationkey] && o[o.interpolationkey]) {
        optForCache = {
          ...optForCache,
          [o.interpolationkey]: void 0
        };
      }
      const key = l2 + JSON.stringify(optForCache);
      let frm = cache[key];
      if (!frm) {
        frm = fn(getCleanedCode(l2), o);
        cache[key] = frm;
      }
      return frm(v);
    };
  };
  var createNonCachedFormatter = (fn) => (v, l2, o) => fn(getCleanedCode(l2), o)(v);
  var Formatter = class {
    constructor(options2 = {}) {
      this.logger = baseLogger.create("formatter");
      this.options = options2;
      this.init(options2);
    }
    init(services, options2 = {
      interpolation: {}
    }) {
      this.formatSeparator = options2.interpolation.formatSeparator || ",";
      const cf = options2.cacheInBuiltFormats ? createCachedFormatter : createNonCachedFormatter;
      this.formats = {
        number: cf((lng, opt) => {
          const formatter = new Intl.NumberFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        }),
        currency: cf((lng, opt) => {
          const formatter = new Intl.NumberFormat(lng, {
            ...opt,
            style: "currency"
          });
          return (val) => formatter.format(val);
        }),
        datetime: cf((lng, opt) => {
          const formatter = new Intl.DateTimeFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        }),
        relativetime: cf((lng, opt) => {
          const formatter = new Intl.RelativeTimeFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val, opt.range || "day");
        }),
        list: cf((lng, opt) => {
          const formatter = new Intl.ListFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        })
      };
    }
    add(name, fc) {
      this.formats[name.toLowerCase().trim()] = fc;
    }
    addCached(name, fc) {
      this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
    }
    format(value, format, lng, options2 = {}) {
      const formats = format.split(this.formatSeparator);
      if (formats.length > 1 && formats[0].indexOf("(") > 1 && formats[0].indexOf(")") < 0 && formats.find((f2) => f2.indexOf(")") > -1)) {
        const lastIndex = formats.findIndex((f2) => f2.indexOf(")") > -1);
        formats[0] = [formats[0], ...formats.splice(1, lastIndex)].join(this.formatSeparator);
      }
      const result = formats.reduce((mem, f2) => {
        const {
          formatName,
          formatOptions
        } = parseFormatStr(f2);
        if (this.formats[formatName]) {
          let formatted = mem;
          try {
            const valOptions = options2?.formatParams?.[options2.interpolationkey] || {};
            const l2 = valOptions.locale || valOptions.lng || options2.locale || options2.lng || lng;
            formatted = this.formats[formatName](mem, l2, {
              ...formatOptions,
              ...options2,
              ...valOptions
            });
          } catch (error) {
            this.logger.warn(error);
          }
          return formatted;
        } else {
          this.logger.warn(`there was no format function for ${formatName}`);
        }
        return mem;
      }, value);
      return result;
    }
  };
  var removePending = (q2, name) => {
    if (q2.pending[name] !== void 0) {
      delete q2.pending[name];
      q2.pendingCount--;
    }
  };
  var Connector = class extends EventEmitter {
    constructor(backend, store, services, options2 = {}) {
      super();
      this.backend = backend;
      this.store = store;
      this.services = services;
      this.languageUtils = services.languageUtils;
      this.options = options2;
      this.logger = baseLogger.create("backendConnector");
      this.waitingReads = [];
      this.maxParallelReads = options2.maxParallelReads || 10;
      this.readingCalls = 0;
      this.maxRetries = options2.maxRetries >= 0 ? options2.maxRetries : 5;
      this.retryTimeout = options2.retryTimeout >= 1 ? options2.retryTimeout : 350;
      this.state = {};
      this.queue = [];
      this.backend?.init?.(services, options2.backend, options2);
    }
    queueLoad(languages, namespaces, options2, callback) {
      const toLoad = {};
      const pending2 = {};
      const toLoadLanguages = {};
      const toLoadNamespaces = {};
      languages.forEach((lng) => {
        let hasAllNamespaces = true;
        namespaces.forEach((ns) => {
          const name = `${lng}|${ns}`;
          if (!options2.reload && this.store.hasResourceBundle(lng, ns)) {
            this.state[name] = 2;
          } else if (this.state[name] < 0) ;
          else if (this.state[name] === 1) {
            if (pending2[name] === void 0) pending2[name] = true;
          } else {
            this.state[name] = 1;
            hasAllNamespaces = false;
            if (pending2[name] === void 0) pending2[name] = true;
            if (toLoad[name] === void 0) toLoad[name] = true;
            if (toLoadNamespaces[ns] === void 0) toLoadNamespaces[ns] = true;
          }
        });
        if (!hasAllNamespaces) toLoadLanguages[lng] = true;
      });
      if (Object.keys(toLoad).length || Object.keys(pending2).length) {
        this.queue.push({
          pending: pending2,
          pendingCount: Object.keys(pending2).length,
          loaded: {},
          errors: [],
          callback
        });
      }
      return {
        toLoad: Object.keys(toLoad),
        pending: Object.keys(pending2),
        toLoadLanguages: Object.keys(toLoadLanguages),
        toLoadNamespaces: Object.keys(toLoadNamespaces)
      };
    }
    loaded(name, err, data) {
      const s = name.split("|");
      const lng = s[0];
      const ns = s[1];
      if (err) this.emit("failedLoading", lng, ns, err);
      if (!err && data) {
        this.store.addResourceBundle(lng, ns, data, void 0, void 0, {
          skipCopy: true
        });
      }
      this.state[name] = err ? -1 : 2;
      if (err && data) this.state[name] = 0;
      const loaded = {};
      this.queue.forEach((q2) => {
        pushPath(q2.loaded, [lng], ns);
        removePending(q2, name);
        if (err) q2.errors.push(err);
        if (q2.pendingCount === 0 && !q2.done) {
          Object.keys(q2.loaded).forEach((l2) => {
            if (!loaded[l2]) loaded[l2] = {};
            const loadedKeys = q2.loaded[l2];
            if (loadedKeys.length) {
              loadedKeys.forEach((n) => {
                if (loaded[l2][n] === void 0) loaded[l2][n] = true;
              });
            }
          });
          q2.done = true;
          if (q2.errors.length) {
            q2.callback(q2.errors);
          } else {
            q2.callback();
          }
        }
      });
      this.emit("loaded", loaded);
      this.queue = this.queue.filter((q2) => !q2.done);
    }
    read(lng, ns, fcName, tried = 0, wait = this.retryTimeout, callback) {
      if (!lng.length) return callback(null, {});
      if (this.readingCalls >= this.maxParallelReads) {
        this.waitingReads.push({
          lng,
          ns,
          fcName,
          tried,
          wait,
          callback
        });
        return;
      }
      this.readingCalls++;
      const resolver = (err, data) => {
        this.readingCalls--;
        if (this.waitingReads.length > 0) {
          const next = this.waitingReads.shift();
          this.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
        }
        if (err && data && tried < this.maxRetries) {
          setTimeout(() => {
            this.read.call(this, lng, ns, fcName, tried + 1, wait * 2, callback);
          }, wait);
          return;
        }
        callback(err, data);
      };
      const fc = this.backend[fcName].bind(this.backend);
      if (fc.length === 2) {
        try {
          const r3 = fc(lng, ns);
          if (r3 && typeof r3.then === "function") {
            r3.then((data) => resolver(null, data)).catch(resolver);
          } else {
            resolver(null, r3);
          }
        } catch (err) {
          resolver(err);
        }
        return;
      }
      return fc(lng, ns, resolver);
    }
    prepareLoading(languages, namespaces, options2 = {}, callback) {
      if (!this.backend) {
        this.logger.warn("No backend was added via i18next.use. Will not load resources.");
        return callback && callback();
      }
      if (isString(languages)) languages = this.languageUtils.toResolveHierarchy(languages);
      if (isString(namespaces)) namespaces = [namespaces];
      const toLoad = this.queueLoad(languages, namespaces, options2, callback);
      if (!toLoad.toLoad.length) {
        if (!toLoad.pending.length) callback();
        return null;
      }
      toLoad.toLoad.forEach((name) => {
        this.loadOne(name);
      });
    }
    load(languages, namespaces, callback) {
      this.prepareLoading(languages, namespaces, {}, callback);
    }
    reload(languages, namespaces, callback) {
      this.prepareLoading(languages, namespaces, {
        reload: true
      }, callback);
    }
    loadOne(name, prefix = "") {
      const s = name.split("|");
      const lng = s[0];
      const ns = s[1];
      this.read(lng, ns, "read", void 0, void 0, (err, data) => {
        if (err) this.logger.warn(`${prefix}loading namespace ${ns} for language ${lng} failed`, err);
        if (!err && data) this.logger.log(`${prefix}loaded namespace ${ns} for language ${lng}`, data);
        this.loaded(name, err, data);
      });
    }
    saveMissing(languages, namespace, key, fallbackValue, isUpdate, options2 = {}, clb = () => {
    }) {
      if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(namespace)) {
        this.logger.warn(`did not save key "${key}" as the namespace "${namespace}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
        return;
      }
      if (key === void 0 || key === null || key === "") return;
      if (this.backend?.create) {
        const opts = {
          ...options2,
          isUpdate
        };
        const fc = this.backend.create.bind(this.backend);
        if (fc.length < 6) {
          try {
            let r3;
            if (fc.length === 5) {
              r3 = fc(languages, namespace, key, fallbackValue, opts);
            } else {
              r3 = fc(languages, namespace, key, fallbackValue);
            }
            if (r3 && typeof r3.then === "function") {
              r3.then((data) => clb(null, data)).catch(clb);
            } else {
              clb(null, r3);
            }
          } catch (err) {
            clb(err);
          }
        } else {
          fc(languages, namespace, key, fallbackValue, clb, opts);
        }
      }
      if (!languages || !languages[0]) return;
      this.store.addResource(languages[0], namespace, key, fallbackValue);
    }
  };
  var get = () => ({
    debug: false,
    initAsync: true,
    ns: ["translation"],
    defaultNS: ["translation"],
    fallbackLng: ["dev"],
    fallbackNS: false,
    supportedLngs: false,
    nonExplicitSupportedLngs: false,
    load: "all",
    preload: false,
    simplifyPluralSuffix: true,
    keySeparator: ".",
    nsSeparator: ":",
    pluralSeparator: "_",
    contextSeparator: "_",
    partialBundledLanguages: false,
    saveMissing: false,
    updateMissing: false,
    saveMissingTo: "fallback",
    saveMissingPlurals: true,
    missingKeyHandler: false,
    missingInterpolationHandler: false,
    postProcess: false,
    postProcessPassResolved: false,
    returnNull: false,
    returnEmptyString: true,
    returnObjects: false,
    joinArrays: false,
    returnedObjectHandler: false,
    parseMissingKeyHandler: false,
    appendNamespaceToMissingKey: false,
    appendNamespaceToCIMode: false,
    overloadTranslationOptionHandler: (args) => {
      let ret = {};
      if (typeof args[1] === "object") ret = args[1];
      if (isString(args[1])) ret.defaultValue = args[1];
      if (isString(args[2])) ret.tDescription = args[2];
      if (typeof args[2] === "object" || typeof args[3] === "object") {
        const options2 = args[3] || args[2];
        Object.keys(options2).forEach((key) => {
          ret[key] = options2[key];
        });
      }
      return ret;
    },
    interpolation: {
      escapeValue: true,
      format: (value) => value,
      prefix: "{{",
      suffix: "}}",
      formatSeparator: ",",
      unescapePrefix: "-",
      nestingPrefix: "$t(",
      nestingSuffix: ")",
      nestingOptionsSeparator: ",",
      maxReplaces: 1e3,
      skipOnVariables: true
    },
    cacheInBuiltFormats: true
  });
  var transformOptions = (options2) => {
    if (isString(options2.ns)) options2.ns = [options2.ns];
    if (isString(options2.fallbackLng)) options2.fallbackLng = [options2.fallbackLng];
    if (isString(options2.fallbackNS)) options2.fallbackNS = [options2.fallbackNS];
    if (options2.supportedLngs?.indexOf?.("cimode") < 0) {
      options2.supportedLngs = options2.supportedLngs.concat(["cimode"]);
    }
    if (typeof options2.initImmediate === "boolean") options2.initAsync = options2.initImmediate;
    return options2;
  };
  var noop = () => {
  };
  var bindMemberFunctions = (inst) => {
    const mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
    mems.forEach((mem) => {
      if (typeof inst[mem] === "function") {
        inst[mem] = inst[mem].bind(inst);
      }
    });
  };
  var I18n = class _I18n extends EventEmitter {
    constructor(options2 = {}, callback) {
      super();
      this.options = transformOptions(options2);
      this.services = {};
      this.logger = baseLogger;
      this.modules = {
        external: []
      };
      bindMemberFunctions(this);
      if (callback && !this.isInitialized && !options2.isClone) {
        if (!this.options.initAsync) {
          this.init(options2, callback);
          return this;
        }
        setTimeout(() => {
          this.init(options2, callback);
        }, 0);
      }
    }
    init(options2 = {}, callback) {
      this.isInitializing = true;
      if (typeof options2 === "function") {
        callback = options2;
        options2 = {};
      }
      if (options2.defaultNS == null && options2.ns) {
        if (isString(options2.ns)) {
          options2.defaultNS = options2.ns;
        } else if (options2.ns.indexOf("translation") < 0) {
          options2.defaultNS = options2.ns[0];
        }
      }
      const defOpts = get();
      this.options = {
        ...defOpts,
        ...this.options,
        ...transformOptions(options2)
      };
      this.options.interpolation = {
        ...defOpts.interpolation,
        ...this.options.interpolation
      };
      if (options2.keySeparator !== void 0) {
        this.options.userDefinedKeySeparator = options2.keySeparator;
      }
      if (options2.nsSeparator !== void 0) {
        this.options.userDefinedNsSeparator = options2.nsSeparator;
      }
      const createClassOnDemand = (ClassOrObject) => {
        if (!ClassOrObject) return null;
        if (typeof ClassOrObject === "function") return new ClassOrObject();
        return ClassOrObject;
      };
      if (!this.options.isClone) {
        if (this.modules.logger) {
          baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
        } else {
          baseLogger.init(null, this.options);
        }
        let formatter;
        if (this.modules.formatter) {
          formatter = this.modules.formatter;
        } else {
          formatter = Formatter;
        }
        const lu = new LanguageUtil(this.options);
        this.store = new ResourceStore(this.options.resources, this.options);
        const s = this.services;
        s.logger = baseLogger;
        s.resourceStore = this.store;
        s.languageUtils = lu;
        s.pluralResolver = new PluralResolver(lu, {
          prepend: this.options.pluralSeparator,
          simplifyPluralSuffix: this.options.simplifyPluralSuffix
        });
        const usingLegacyFormatFunction = this.options.interpolation.format && this.options.interpolation.format !== defOpts.interpolation.format;
        if (usingLegacyFormatFunction) {
          this.logger.deprecate(`init: you are still using the legacy format function, please use the new approach: https://www.i18next.com/translation-function/formatting`);
        }
        if (formatter && (!this.options.interpolation.format || this.options.interpolation.format === defOpts.interpolation.format)) {
          s.formatter = createClassOnDemand(formatter);
          if (s.formatter.init) s.formatter.init(s, this.options);
          this.options.interpolation.format = s.formatter.format.bind(s.formatter);
        }
        s.interpolator = new Interpolator(this.options);
        s.utils = {
          hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
        };
        s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
        s.backendConnector.on("*", (event, ...args) => {
          this.emit(event, ...args);
        });
        if (this.modules.languageDetector) {
          s.languageDetector = createClassOnDemand(this.modules.languageDetector);
          if (s.languageDetector.init) s.languageDetector.init(s, this.options.detection, this.options);
        }
        if (this.modules.i18nFormat) {
          s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
          if (s.i18nFormat.init) s.i18nFormat.init(this);
        }
        this.translator = new Translator(this.services, this.options);
        this.translator.on("*", (event, ...args) => {
          this.emit(event, ...args);
        });
        this.modules.external.forEach((m) => {
          if (m.init) m.init(this);
        });
      }
      this.format = this.options.interpolation.format;
      if (!callback) callback = noop;
      if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
        const codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
        if (codes.length > 0 && codes[0] !== "dev") this.options.lng = codes[0];
      }
      if (!this.services.languageDetector && !this.options.lng) {
        this.logger.warn("init: no languageDetector is used and no lng is defined");
      }
      const storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
      storeApi.forEach((fcName) => {
        this[fcName] = (...args) => this.store[fcName](...args);
      });
      const storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
      storeApiChained.forEach((fcName) => {
        this[fcName] = (...args) => {
          this.store[fcName](...args);
          return this;
        };
      });
      const deferred = defer();
      const load = () => {
        const finish = (err, t2) => {
          this.isInitializing = false;
          if (this.isInitialized && !this.initializedStoreOnce) this.logger.warn("init: i18next is already initialized. You should call init just once!");
          this.isInitialized = true;
          if (!this.options.isClone) this.logger.log("initialized", this.options);
          this.emit("initialized", this.options);
          deferred.resolve(t2);
          callback(err, t2);
        };
        if (this.languages && !this.isInitialized) return finish(null, this.t.bind(this));
        this.changeLanguage(this.options.lng, finish);
      };
      if (this.options.resources || !this.options.initAsync) {
        load();
      } else {
        setTimeout(load, 0);
      }
      return deferred;
    }
    loadResources(language, callback = noop) {
      let usedCallback = callback;
      const usedLng = isString(language) ? language : this.language;
      if (typeof language === "function") usedCallback = language;
      if (!this.options.resources || this.options.partialBundledLanguages) {
        if (usedLng?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return usedCallback();
        const toLoad = [];
        const append = (lng) => {
          if (!lng) return;
          if (lng === "cimode") return;
          const lngs = this.services.languageUtils.toResolveHierarchy(lng);
          lngs.forEach((l2) => {
            if (l2 === "cimode") return;
            if (toLoad.indexOf(l2) < 0) toLoad.push(l2);
          });
        };
        if (!usedLng) {
          const fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
          fallbacks.forEach((l2) => append(l2));
        } else {
          append(usedLng);
        }
        this.options.preload?.forEach?.((l2) => append(l2));
        this.services.backendConnector.load(toLoad, this.options.ns, (e) => {
          if (!e && !this.resolvedLanguage && this.language) this.setResolvedLanguage(this.language);
          usedCallback(e);
        });
      } else {
        usedCallback(null);
      }
    }
    reloadResources(lngs, ns, callback) {
      const deferred = defer();
      if (typeof lngs === "function") {
        callback = lngs;
        lngs = void 0;
      }
      if (typeof ns === "function") {
        callback = ns;
        ns = void 0;
      }
      if (!lngs) lngs = this.languages;
      if (!ns) ns = this.options.ns;
      if (!callback) callback = noop;
      this.services.backendConnector.reload(lngs, ns, (err) => {
        deferred.resolve();
        callback(err);
      });
      return deferred;
    }
    use(module) {
      if (!module) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
      if (!module.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
      if (module.type === "backend") {
        this.modules.backend = module;
      }
      if (module.type === "logger" || module.log && module.warn && module.error) {
        this.modules.logger = module;
      }
      if (module.type === "languageDetector") {
        this.modules.languageDetector = module;
      }
      if (module.type === "i18nFormat") {
        this.modules.i18nFormat = module;
      }
      if (module.type === "postProcessor") {
        postProcessor.addPostProcessor(module);
      }
      if (module.type === "formatter") {
        this.modules.formatter = module;
      }
      if (module.type === "3rdParty") {
        this.modules.external.push(module);
      }
      return this;
    }
    setResolvedLanguage(l2) {
      if (!l2 || !this.languages) return;
      if (["cimode", "dev"].indexOf(l2) > -1) return;
      for (let li = 0; li < this.languages.length; li++) {
        const lngInLngs = this.languages[li];
        if (["cimode", "dev"].indexOf(lngInLngs) > -1) continue;
        if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
          this.resolvedLanguage = lngInLngs;
          break;
        }
      }
      if (!this.resolvedLanguage && this.languages.indexOf(l2) < 0 && this.store.hasLanguageSomeTranslations(l2)) {
        this.resolvedLanguage = l2;
        this.languages.unshift(l2);
      }
    }
    changeLanguage(lng, callback) {
      this.isLanguageChangingTo = lng;
      const deferred = defer();
      this.emit("languageChanging", lng);
      const setLngProps = (l2) => {
        this.language = l2;
        this.languages = this.services.languageUtils.toResolveHierarchy(l2);
        this.resolvedLanguage = void 0;
        this.setResolvedLanguage(l2);
      };
      const done = (err, l2) => {
        if (l2) {
          if (this.isLanguageChangingTo === lng) {
            setLngProps(l2);
            this.translator.changeLanguage(l2);
            this.isLanguageChangingTo = void 0;
            this.emit("languageChanged", l2);
            this.logger.log("languageChanged", l2);
          }
        } else {
          this.isLanguageChangingTo = void 0;
        }
        deferred.resolve((...args) => this.t(...args));
        if (callback) callback(err, (...args) => this.t(...args));
      };
      const setLng = (lngs) => {
        if (!lng && !lngs && this.services.languageDetector) lngs = [];
        const fl = isString(lngs) ? lngs : lngs && lngs[0];
        const l2 = this.store.hasLanguageSomeTranslations(fl) ? fl : this.services.languageUtils.getBestMatchFromCodes(isString(lngs) ? [lngs] : lngs);
        if (l2) {
          if (!this.language) {
            setLngProps(l2);
          }
          if (!this.translator.language) this.translator.changeLanguage(l2);
          this.services.languageDetector?.cacheUserLanguage?.(l2);
        }
        this.loadResources(l2, (err) => {
          done(err, l2);
        });
      };
      if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
        setLng(this.services.languageDetector.detect());
      } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
        if (this.services.languageDetector.detect.length === 0) {
          this.services.languageDetector.detect().then(setLng);
        } else {
          this.services.languageDetector.detect(setLng);
        }
      } else {
        setLng(lng);
      }
      return deferred;
    }
    getFixedT(lng, ns, keyPrefix) {
      const fixedT = (key, opts, ...rest) => {
        let o;
        if (typeof opts !== "object") {
          o = this.options.overloadTranslationOptionHandler([key, opts].concat(rest));
        } else {
          o = {
            ...opts
          };
        }
        o.lng = o.lng || fixedT.lng;
        o.lngs = o.lngs || fixedT.lngs;
        o.ns = o.ns || fixedT.ns;
        if (o.keyPrefix !== "") o.keyPrefix = o.keyPrefix || keyPrefix || fixedT.keyPrefix;
        const keySeparator = this.options.keySeparator || ".";
        let resultKey;
        if (o.keyPrefix && Array.isArray(key)) {
          resultKey = key.map((k2) => {
            if (typeof k2 === "function") k2 = keysFromSelector(k2, {
              ...this.options,
              ...opts
            });
            return `${o.keyPrefix}${keySeparator}${k2}`;
          });
        } else {
          if (typeof key === "function") key = keysFromSelector(key, {
            ...this.options,
            ...opts
          });
          resultKey = o.keyPrefix ? `${o.keyPrefix}${keySeparator}${key}` : key;
        }
        return this.t(resultKey, o);
      };
      if (isString(lng)) {
        fixedT.lng = lng;
      } else {
        fixedT.lngs = lng;
      }
      fixedT.ns = ns;
      fixedT.keyPrefix = keyPrefix;
      return fixedT;
    }
    t(...args) {
      return this.translator?.translate(...args);
    }
    exists(...args) {
      return this.translator?.exists(...args);
    }
    setDefaultNamespace(ns) {
      this.options.defaultNS = ns;
    }
    hasLoadedNamespace(ns, options2 = {}) {
      if (!this.isInitialized) {
        this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
        return false;
      }
      if (!this.languages || !this.languages.length) {
        this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
        return false;
      }
      const lng = options2.lng || this.resolvedLanguage || this.languages[0];
      const fallbackLng = this.options ? this.options.fallbackLng : false;
      const lastLng = this.languages[this.languages.length - 1];
      if (lng.toLowerCase() === "cimode") return true;
      const loadNotPending = (l2, n) => {
        const loadState = this.services.backendConnector.state[`${l2}|${n}`];
        return loadState === -1 || loadState === 0 || loadState === 2;
      };
      if (options2.precheck) {
        const preResult = options2.precheck(this, loadNotPending);
        if (preResult !== void 0) return preResult;
      }
      if (this.hasResourceBundle(lng, ns)) return true;
      if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages) return true;
      if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns))) return true;
      return false;
    }
    loadNamespaces(ns, callback) {
      const deferred = defer();
      if (!this.options.ns) {
        if (callback) callback();
        return Promise.resolve();
      }
      if (isString(ns)) ns = [ns];
      ns.forEach((n) => {
        if (this.options.ns.indexOf(n) < 0) this.options.ns.push(n);
      });
      this.loadResources((err) => {
        deferred.resolve();
        if (callback) callback(err);
      });
      return deferred;
    }
    loadLanguages(lngs, callback) {
      const deferred = defer();
      if (isString(lngs)) lngs = [lngs];
      const preloaded = this.options.preload || [];
      const newLngs = lngs.filter((lng) => preloaded.indexOf(lng) < 0 && this.services.languageUtils.isSupportedCode(lng));
      if (!newLngs.length) {
        if (callback) callback();
        return Promise.resolve();
      }
      this.options.preload = preloaded.concat(newLngs);
      this.loadResources((err) => {
        deferred.resolve();
        if (callback) callback(err);
      });
      return deferred;
    }
    dir(lng) {
      if (!lng) lng = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language);
      if (!lng) return "rtl";
      try {
        const l2 = new Intl.Locale(lng);
        if (l2 && l2.getTextInfo) {
          const ti = l2.getTextInfo();
          if (ti && ti.direction) return ti.direction;
        }
      } catch (e) {
      }
      const rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
      const languageUtils = this.services?.languageUtils || new LanguageUtil(get());
      if (lng.toLowerCase().indexOf("-latn") > 1) return "ltr";
      return rtlLngs.indexOf(languageUtils.getLanguagePartFromCode(lng)) > -1 || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
    }
    static createInstance(options2 = {}, callback) {
      return new _I18n(options2, callback);
    }
    cloneInstance(options2 = {}, callback = noop) {
      const forkResourceStore = options2.forkResourceStore;
      if (forkResourceStore) delete options2.forkResourceStore;
      const mergedOptions = {
        ...this.options,
        ...options2,
        ...{
          isClone: true
        }
      };
      const clone = new _I18n(mergedOptions);
      if (options2.debug !== void 0 || options2.prefix !== void 0) {
        clone.logger = clone.logger.clone(options2);
      }
      const membersToCopy = ["store", "services", "language"];
      membersToCopy.forEach((m) => {
        clone[m] = this[m];
      });
      clone.services = {
        ...this.services
      };
      clone.services.utils = {
        hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
      };
      if (forkResourceStore) {
        const clonedData = Object.keys(this.store.data).reduce((prev, l2) => {
          prev[l2] = {
            ...this.store.data[l2]
          };
          prev[l2] = Object.keys(prev[l2]).reduce((acc, n) => {
            acc[n] = {
              ...prev[l2][n]
            };
            return acc;
          }, prev[l2]);
          return prev;
        }, {});
        clone.store = new ResourceStore(clonedData, mergedOptions);
        clone.services.resourceStore = clone.store;
      }
      clone.translator = new Translator(clone.services, mergedOptions);
      clone.translator.on("*", (event, ...args) => {
        clone.emit(event, ...args);
      });
      clone.init(mergedOptions, callback);
      clone.translator.options = mergedOptions;
      clone.translator.backendConnector.services.utils = {
        hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
      };
      return clone;
    }
    toJSON() {
      return {
        options: this.options,
        store: this.store,
        language: this.language,
        languages: this.languages,
        resolvedLanguage: this.resolvedLanguage
      };
    }
  };
  var instance = I18n.createInstance();
  instance.createInstance = I18n.createInstance;
  var createInstance = instance.createInstance;
  var dir = instance.dir;
  var init = instance.init;
  var loadResources = instance.loadResources;
  var reloadResources = instance.reloadResources;
  var use2 = instance.use;
  var changeLanguage = instance.changeLanguage;
  var getFixedT = instance.getFixedT;
  var t = instance.t;
  var exists = instance.exists;
  var setDefaultNamespace = instance.setDefaultNamespace;
  var hasLoadedNamespace = instance.hasLoadedNamespace;
  var loadNamespaces = instance.loadNamespaces;
  var loadLanguages = instance.loadLanguages;

  // ../../../packages/shadcn-ui/dist/i18n.js
  var y = /* @__PURE__ */ Symbol("remote-view.message");
  var S = class extends Error {
    constructor(a2, o, r3) {
      super();
      __publicField(this, "key");
      __publicField(this, "values");
      this.key = a2, this.values = o, Object.defineProperty(this, "message", { configurable: true, get: () => r3(a2, o) }), this.name = "ViewMessageError";
    }
  };
  var u = {
    en: { close: "Close", commandTitle: "Command palette", commandDescription: "Search for a command to run\u2026" },
    "zh-Hans": { close: "\u5173\u95ED", commandTitle: "\u547D\u4EE4\u9762\u677F", commandDescription: "\u641C\u7D22\u8981\u8FD0\u884C\u7684\u547D\u4EE4\u2026" },
    "zh-Hant": { close: "\u95DC\u9589", commandTitle: "\u547D\u4EE4\u9762\u677F", commandDescription: "\u641C\u5C0B\u8981\u57F7\u884C\u7684\u547D\u4EE4\u2026" }
  };
  function l(n) {
    try {
      const a2 = new Intl.Locale((n || "en").replaceAll("_", "-"));
      return a2.language === "zh" ? a2.maximize().script === "Hant" ? "zh-Hant" : "zh-Hans" : "en";
    } catch {
      return "en";
    }
  }
  function x(n, a2 = typeof navigator > "u" ? "en" : navigator.language) {
    const o = (e) => {
      const t2 = l(e);
      return t2 === "zh-Hant" && !n["zh-Hant"] ? "zh-Hans" : t2;
    }, r3 = createInstance();
    r3.init({
      lng: o(a2),
      fallbackLng: "en",
      supportedLngs: ["en", "zh-Hans", "zh-Hant"],
      load: "currentOnly",
      initAsync: false,
      keySeparator: false,
      defaultNS: "view",
      interpolation: { escapeValue: false },
      // React escapes text; never use translations as untrusted HTML.
      resources: {
        en: { view: n.en, ui: u.en },
        "zh-Hans": { view: n["zh-Hans"], ui: u["zh-Hans"] },
        "zh-Hant": { view: n["zh-Hant"] ?? n["zh-Hans"], ui: u["zh-Hant"] }
      }
    });
    const s = () => o(r3.resolvedLanguage ?? r3.language), d = (e) => (r3.on("languageChanged", e), () => {
      r3.off("languageChanged", e);
    }), c = (e, t2) => String(r3.t(e, t2));
    return {
      getLocale: s,
      subscribe: d,
      // Called only by the validated parent init handler. A locale update must not reload a document.
      setLocale(e) {
        e !== void 0 && r3.changeLanguage(o(e)), typeof document < "u" && (document.documentElement.lang = s());
      },
      t: (e, t2) => c(e, t2),
      message: (e, t2) => ({ [y]: true, key: e, values: t2 }),
      error: (e, t2) => new S(e, t2, c),
      format(e) {
        return typeof e == "string" ? e : e instanceof Error ? e.message : c(e.key, e.values);
      },
      ui: (e) => String(r3.t(e, { ns: "ui" })),
      date(e, t2 = {}) {
        const i = new Date(e);
        return Number.isNaN(i.getTime()) ? "" : new Intl.DateTimeFormat(s(), t2).format(i);
      },
      number(e, t2) {
        return new Intl.NumberFormat(s(), t2).format(e);
      },
      /** Localized labels supplied by providers are data, not translation keys. */
      label(e, t2 = "") {
        if (typeof e == "string") return e;
        const i = Object.entries(e), h = s();
        return i.find(([m]) => l(m) === h && /^(en|zh)([-_]|$)/i.test(m))?.[1] ?? e.en_US ?? e.en ?? e["en-US"] ?? t2;
      }
    };
  }
  var C = x({ en: {}, "zh-Hans": {} }, "en");
  var g = createContext(C);
  function T({ i18n: n, children: a2 }) {
    return /* @__PURE__ */ jsx(g.Provider, { value: n, children: a2 });
  }
  function f(n) {
    return useSyncExternalStore(n.subscribe, n.getLocale, n.getLocale);
  }
  function M() {
    const n = useContext(g);
    return f(n), n.ui;
  }

  // ../../../node_modules/.pnpm/react-resizable-panels@4.12.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/react-resizable-panels/dist/react-resizable-panels.js
  function St(e, t2) {
    const n = getComputedStyle(e), o = parseFloat(n.fontSize);
    return t2 * o;
  }
  function vt(e, t2) {
    const n = getComputedStyle(e.ownerDocument.documentElement), o = parseFloat(n.fontSize);
    return t2 * o;
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
        const t2 = parseFloat(e);
        return e.endsWith("%") ? [t2, "%"] : e.endsWith("px") ? [t2, "px"] : e.endsWith("rem") ? [t2, "rem"] : e.endsWith("em") ? [t2, "em"] : e.endsWith("vh") ? [t2, "vh"] : e.endsWith("vw") ? [t2, "vw"] : [t2, "%"];
      }
    }
  }
  function ie({
    groupSize: e,
    panelElement: t2,
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
        o = vt(t2, i);
        break;
      }
      case "em": {
        o = St(t2, i);
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
    const { orientation: t2, panels: n } = e;
    return n.reduce((o, i) => (o += t2 === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, o), 0);
  }
  function ve(e) {
    const { panels: t2 } = e, n = ne({ group: e });
    return n === 0 ? t2.map((o) => ({
      groupResizeBehavior: o.panelConstraints.groupResizeBehavior,
      collapsedSize: 0,
      collapsible: o.panelConstraints.collapsible === true,
      defaultSize: void 0,
      disabled: o.panelConstraints.disabled,
      minSize: 0,
      maxSize: 100,
      panelId: o.id
    })) : t2.map((o) => {
      const { element: i, panelConstraints: s } = o;
      let u3 = 0;
      if (s.collapsedSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.collapsedSize
        });
        u3 = T2(c / n * 100);
      }
      let a2;
      if (s.defaultSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.defaultSize
        });
        a2 = T2(c / n * 100);
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
      let l2 = 100;
      if (s.maxSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.maxSize
        });
        l2 = T2(c / n * 100);
      }
      return {
        groupResizeBehavior: s.groupResizeBehavior,
        collapsedSize: u3,
        collapsible: s.collapsible === true,
        defaultSize: a2,
        disabled: s.disabled,
        minSize: r3,
        maxSize: l2,
        panelId: o.id
      };
    });
  }
  function C2(e, t2 = "Assertion error") {
    if (!e)
      throw Error(t2);
  }
  function be(e, t2) {
    return Array.from(t2).sort(
      e === "horizontal" ? Pt : wt
    );
  }
  function Pt(e, t2) {
    const n = e.element.offsetLeft - t2.element.offsetLeft;
    return n !== 0 ? n : e.element.offsetWidth - t2.element.offsetWidth;
  }
  function wt(e, t2) {
    const n = e.element.offsetTop - t2.element.offsetTop;
    return n !== 0 ? n : e.element.offsetHeight - t2.element.offsetHeight;
  }
  function Ye(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
  }
  function Je(e, t2) {
    return {
      x: e.x >= t2.left && e.x <= t2.right ? 0 : Math.min(
        Math.abs(e.x - t2.left),
        Math.abs(e.x - t2.right)
      ),
      y: e.y >= t2.top && e.y <= t2.bottom ? 0 : Math.min(
        Math.abs(e.y - t2.top),
        Math.abs(e.y - t2.bottom)
      )
    };
  }
  function Lt({
    orientation: e,
    rects: t2,
    targetRect: n
  }) {
    const o = {
      x: n.x + n.width / 2,
      y: n.y + n.height / 2
    };
    let i, s = Number.MAX_VALUE;
    for (const u3 of t2) {
      const { x: a2, y: r3 } = Je(o, u3), l2 = e === "horizontal" ? a2 : r3;
      l2 < s && (s = l2, i = u3);
    }
    return C2(i, "No rect found"), i;
  }
  var fe;
  function Ct() {
    return fe === void 0 && (typeof matchMedia == "function" ? fe = !!matchMedia("(pointer:coarse)").matches : fe = false), fe;
  }
  function Ze(e) {
    const { element: t2, orientation: n, panels: o, separators: i } = e, s = be(
      n,
      Array.from(t2.children).filter(Ye).map((z) => ({ element: z }))
    ).map(({ element: z }) => z), u3 = [];
    let a2 = false, r3 = false, l2 = -1, c = -1, m = 0, p, S2 = [];
    {
      let z = -1;
      for (const f2 of s)
        f2.hasAttribute("data-panel") && (z++, f2.hasAttribute("data-disabled") || (m++, l2 === -1 && (l2 = z), c = z));
    }
    if (m > 1) {
      let z = -1;
      for (const f2 of s)
        if (f2.hasAttribute("data-panel")) {
          z++;
          const d = o.find(
            (h) => h.element === f2
          );
          if (d) {
            if (p) {
              const h = p.element.getBoundingClientRect(), y2 = f2.getBoundingClientRect();
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
                ), g2 = n === "horizontal" ? new DOMRect(y2.left, y2.top, 0, y2.height) : new DOMRect(y2.left, y2.top, y2.width, 0);
                switch (S2.length) {
                  case 0: {
                    b = [
                      v,
                      g2
                    ];
                    break;
                  }
                  case 1: {
                    const w = S2[0], M2 = Lt({
                      orientation: n,
                      rects: [h, y2],
                      targetRect: w.element.getBoundingClientRect()
                    });
                    b = [
                      w,
                      M2 === h ? g2 : v
                    ];
                    break;
                  }
                  default: {
                    b = S2;
                    break;
                  }
                }
              } else
                S2.length ? b = S2 : b = [
                  n === "horizontal" ? new DOMRect(
                    h.right,
                    y2.top,
                    y2.left - h.right,
                    y2.height
                  ) : new DOMRect(
                    y2.left,
                    h.bottom,
                    y2.width,
                    y2.top - h.bottom
                  )
                ];
              for (const v of b) {
                let g2 = "width" in v ? v : v.element.getBoundingClientRect();
                const w = Ct() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
                if (g2.width < w) {
                  const L = w - g2.width;
                  g2 = new DOMRect(
                    g2.x - L / 2,
                    g2.y,
                    g2.width + L,
                    g2.height
                  );
                }
                if (g2.height < w) {
                  const L = w - g2.height;
                  g2 = new DOMRect(
                    g2.x,
                    g2.y - L / 2,
                    g2.width,
                    g2.height + L
                  );
                }
                const M2 = z <= l2 || z > c;
                !a2 && !M2 && u3.push({
                  group: e,
                  groupSize: ne({ group: e }),
                  panels: [p, d],
                  separator: "width" in v ? void 0 : v,
                  rect: g2
                }), a2 = false;
              }
            }
            r3 = false, p = d, S2 = [];
          }
        } else if (f2.hasAttribute("data-separator")) {
          f2.ariaDisabled !== null && (a2 = true);
          const d = i.find(
            (h) => h.element === f2
          );
          d ? S2.push(d) : (p = void 0, S2 = []);
        } else
          r3 = true;
    }
    return u3;
  }
  var _e;
  var Qe = class {
    constructor() {
      __privateAdd(this, _e, {});
    }
    addListener(t2, n) {
      const o = __privateGet(this, _e)[t2];
      return o === void 0 ? __privateGet(this, _e)[t2] = [n] : o.includes(n) || o.push(n), () => {
        this.removeListener(t2, n);
      };
    }
    emit(t2, n) {
      const o = __privateGet(this, _e)[t2];
      if (o !== void 0)
        if (o.length === 1)
          o[0].call(null, n);
        else {
          let i = false, s = null;
          const u3 = Array.from(o);
          for (let a2 = 0; a2 < u3.length; a2++) {
            const r3 = u3[a2];
            try {
              r3.call(null, n);
            } catch (l2) {
              s === null && (i = true, s = l2);
            }
          }
          if (i)
            throw s;
        }
    }
    removeAllListeners() {
      __privateSet(this, _e, {});
    }
    removeListener(t2, n) {
      const o = __privateGet(this, _e)[t2];
      if (o !== void 0) {
        const i = o.indexOf(n);
        i >= 0 && o.splice(i, 1);
      }
    }
  };
  _e = new WeakMap();
  var ee = {
    cursorFlags: 0,
    state: "inactive"
  };
  var ze = new Qe();
  function B() {
    return ee;
  }
  function Rt(e) {
    return ze.addListener("change", e);
  }
  function Mt(e) {
    const t2 = ee, n = { ...ee };
    n.cursorFlags = e, ee = n, ze.emit("change", {
      prev: t2,
      next: n
    });
  }
  function te(e) {
    const t2 = ee;
    ee = e, ze.emit("change", {
      prev: t2,
      next: e
    });
  }
  var Et = (e) => e;
  var ye = () => {
  };
  var et = 1;
  var tt = 2;
  var nt = 4;
  var ot = 8;
  var Ie = 3;
  var ke = 12;
  var de;
  function De() {
    return de === void 0 && (de = false, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (de = true)), de;
  }
  function It({
    cursorFlags: e,
    groups: t2,
    state: n
  }) {
    let o = 0, i = 0;
    switch (n) {
      case "active":
      case "hover":
        t2.forEach((s) => {
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
          if (e && De()) {
            const s = (e & et) !== 0, u3 = (e & tt) !== 0, a2 = (e & nt) !== 0, r3 = (e & ot) !== 0;
            if (s)
              return a2 ? "se-resize" : r3 ? "ne-resize" : "e-resize";
            if (u3)
              return a2 ? "sw-resize" : r3 ? "nw-resize" : "w-resize";
            if (a2)
              return "s-resize";
            if (r3)
              return "n-resize";
          }
          break;
        }
      }
      return De() ? o > 0 && i > 0 ? "move" : o > 0 ? "ew-resize" : "ns-resize" : o > 0 && i > 0 ? "grab" : o > 0 ? "col-resize" : "row-resize";
    }
  }
  var Te = /* @__PURE__ */ new WeakMap();
  function xe(e) {
    if (e.defaultView === null || e.defaultView === void 0)
      return;
    let { prevStyle: t2, styleSheet: n } = Te.get(e) ?? {};
    n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
      ...e.adoptedStyleSheets,
      n
    ]));
    const o = B();
    switch (o.state) {
      case "active":
      case "hover": {
        const i = It({
          cursorFlags: o.cursorFlags,
          groups: o.hitRegions.map((u3) => u3.group),
          state: o.state
        }), s = `*, *:hover {cursor: ${i} !important; }`;
        if (t2 === s)
          return;
        t2 = s, i ? n.cssRules.length === 0 ? n.insertRule(s) : n.replaceSync(s) : n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
      case "inactive": {
        t2 = void 0, n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
    }
    Te.set(e, {
      prevStyle: t2,
      styleSheet: n
    });
  }
  var F = /* @__PURE__ */ new Map();
  var it = new Qe();
  function kt(e) {
    F = new Map(F), F.delete(e);
  }
  function Oe(e, t2) {
    for (const [n] of F)
      if (n.id === e)
        return n;
  }
  function H(e, t2) {
    for (const [n, o] of F)
      if (n.id === e)
        return o;
    if (t2)
      throw Error(`Could not find data for Group with id ${e}`);
  }
  function X2() {
    return F;
  }
  function Pe(e, t2) {
    return it.addListener("groupChange", (n) => {
      n.group.id === e && t2(n);
    });
  }
  function j(e, t2, n) {
    const o = F.get(e);
    F = new Map(F), F.set(e, t2), it.emit("groupChange", {
      group: e,
      isUserInteraction: n?.isUserInteraction === true,
      prev: o,
      next: t2
    });
  }
  function rt(e) {
    const t2 = B();
    let n = false;
    switch (t2.state) {
      case "active":
        te({
          cursorFlags: 0,
          state: "inactive"
        }), t2.hitRegions.length > 0 && (xe(e), n = true, t2.hitRegions.forEach((o) => {
          const i = H(o.group.id, true);
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
  function Dt(e, t2, n) {
    let o, i = {
      x: 1 / 0,
      y: 1 / 0
    };
    for (const s of t2) {
      const u3 = Je(n, s.rect);
      switch (e) {
        case "horizontal": {
          u3.x <= i.x && (o = s, i = u3);
          break;
        }
        case "vertical": {
          u3.y <= i.y && (o = s, i = u3);
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
  function Ot(e, t2) {
    if (e === t2) throw new Error("Cannot compare node with itself");
    const n = {
      a: Ne(e),
      b: Ne(t2)
    };
    let o;
    for (; n.a.at(-1) === n.b.at(-1); )
      o = n.a.pop(), n.b.pop();
    C2(
      o,
      "Stacking order can only be calculated for elements with a common ancestor"
    );
    const i = {
      a: Fe(Ae(n.a)),
      b: Fe(Ae(n.b))
    };
    if (i.a === i.b) {
      const s = o.childNodes, u3 = {
        a: n.a.at(-1),
        b: n.b.at(-1)
      };
      let a2 = s.length;
      for (; a2--; ) {
        const r3 = s[a2];
        if (r3 === u3.a) return 1;
        if (r3 === u3.b) return -1;
      }
    }
    return Math.sign(i.a - i.b);
  }
  var Gt = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
  function At(e) {
    const t2 = getComputedStyle(st(e) ?? e).display;
    return t2 === "flex" || t2 === "inline-flex";
  }
  function Ft(e) {
    const t2 = getComputedStyle(e);
    return !!(t2.position === "fixed" || t2.zIndex !== "auto" && (t2.position !== "static" || At(e)) || +t2.opacity < 1 || "transform" in t2 && t2.transform !== "none" || "webkitTransform" in t2 && t2.webkitTransform !== "none" || "mixBlendMode" in t2 && t2.mixBlendMode !== "normal" || "filter" in t2 && t2.filter !== "none" || "webkitFilter" in t2 && t2.webkitFilter !== "none" || "isolation" in t2 && t2.isolation === "isolate" || Gt.test(t2.willChange) || t2.webkitOverflowScrolling === "touch");
  }
  function Ae(e) {
    let t2 = e.length;
    for (; t2--; ) {
      const n = e[t2];
      if (C2(n, "Missing node"), Ft(n)) return n;
    }
    return null;
  }
  function Fe(e) {
    return e && Number(getComputedStyle(e).zIndex) || 0;
  }
  function Ne(e) {
    const t2 = [];
    for (; e; )
      t2.push(e), e = st(e);
    return t2;
  }
  function st(e) {
    const { parentNode: t2 } = e;
    return Tt(t2) ? t2.host : t2;
  }
  function Nt(e, t2) {
    return e.x < t2.x + t2.width && e.x + e.width > t2.x && e.y < t2.y + t2.height && e.y + e.height > t2.y;
  }
  function _t({
    groupElement: e,
    hitRegion: t2,
    pointerEventTarget: n
  }) {
    if (!Ye(n) || n.contains(e) || e.contains(n))
      return true;
    if (Ot(n, e) > 0) {
      let o = n;
      for (; o; ) {
        if (o.contains(e))
          return true;
        if (Nt(o.getBoundingClientRect(), t2))
          return false;
        o = o.parentElement;
      }
    }
    return true;
  }
  function we(e, t2) {
    const n = [];
    return t2.forEach((o, i) => {
      if (i.disabled)
        return;
      const s = Ze(i), u3 = Dt(i.orientation, s, {
        x: e.clientX,
        y: e.clientY
      });
      u3 && u3.distance.x <= 0 && u3.distance.y <= 0 && _t({
        groupElement: i.element,
        hitRegion: u3.hitRegion.rect,
        pointerEventTarget: e.target
      }) && n.push(u3.hitRegion);
    }), n;
  }
  function $t(e, t2) {
    if (e.length !== t2.length)
      return false;
    for (let n = 0; n < e.length; n++)
      if (e[n] != t2[n])
        return false;
    return true;
  }
  function k(e, t2, n = 0) {
    return Math.abs(T2(e) - T2(t2)) <= n;
  }
  function A(e, t2) {
    return k(e, t2) ? 0 : e > t2 ? 1 : -1;
  }
  function Z({
    overrideDisabledPanels: e,
    panelConstraints: t2,
    prevSize: n,
    size: o
  }) {
    const {
      collapsedSize: i = 0,
      collapsible: s,
      disabled: u3,
      maxSize: a2 = 100,
      minSize: r3 = 0
    } = t2;
    if (u3 && !e)
      return n;
    if (A(o, r3) < 0)
      if (s) {
        const l2 = (i + r3) / 2;
        A(o, l2) < 0 ? o = i : o = r3;
      } else
        o = r3;
    return o = Math.min(a2, o), o = T2(o), o;
  }
  function le({
    delta: e,
    initialLayout: t2,
    panelConstraints: n,
    pivotIndices: o,
    prevLayout: i,
    trigger: s
  }) {
    if (k(e, 0))
      return t2;
    const u3 = s === "imperative-api", a2 = Object.values(t2), r3 = Object.values(i), l2 = [...a2], [c, m] = o;
    C2(c != null, "Invalid first pivot index"), C2(m != null, "Invalid second pivot index");
    let p = 0;
    switch (s) {
      case "keyboard": {
        {
          const f2 = e < 0 ? m : c, d = n[f2];
          C2(
            d,
            `Panel constraints not found for index ${f2}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y2,
            minSize: b = 0
          } = d;
          if (y2) {
            const v = a2[f2];
            if (C2(
              v != null,
              `Previous layout not found for panel index ${f2}`
            ), k(v, h)) {
              const g2 = b - v;
              A(g2, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g2 : g2);
            }
          }
        }
        {
          const f2 = e < 0 ? c : m, d = n[f2];
          C2(
            d,
            `No panel constraints found for index ${f2}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y2,
            minSize: b = 0
          } = d;
          if (y2) {
            const v = a2[f2];
            if (C2(
              v != null,
              `Previous layout not found for panel index ${f2}`
            ), k(v, b)) {
              const g2 = v - h;
              A(g2, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g2 : g2);
            }
          }
        }
        break;
      }
      default: {
        const f2 = e < 0 ? m : c, d = n[f2];
        C2(
          d,
          `Panel constraints not found for index ${f2}`
        );
        const h = a2[f2], { collapsible: y2, collapsedSize: b, minSize: v } = d;
        if (y2 && A(h, v) < 0)
          if (e > 0) {
            const g2 = v - b, w = g2 / 2, M2 = h + e;
            A(M2, v) < 0 && (e = A(e, w) <= 0 ? 0 : g2);
          } else {
            const g2 = v - b, w = 100 - g2 / 2, M2 = h - e;
            A(M2, v) < 0 && (e = A(100 + e, w) > 0 ? 0 : -g2);
          }
        break;
      }
    }
    {
      const f2 = e < 0 ? 1 : -1;
      let d = e < 0 ? m : c, h = 0;
      for (; ; ) {
        const b = a2[d];
        C2(
          b != null,
          `Previous layout not found for panel index ${d}`
        );
        const g2 = Z({
          overrideDisabledPanels: u3,
          panelConstraints: n[d],
          prevSize: b,
          size: 100
        }) - b;
        if (h += g2, d += f2, d < 0 || d >= n.length)
          break;
      }
      const y2 = Math.min(Math.abs(e), Math.abs(h));
      e = e < 0 ? 0 - y2 : y2;
    }
    {
      let d = e < 0 ? c : m;
      for (; d >= 0 && d < n.length; ) {
        const h = Math.abs(e) - Math.abs(p), y2 = a2[d];
        C2(
          y2 != null,
          `Previous layout not found for panel index ${d}`
        );
        const b = y2 - h, v = Z({
          overrideDisabledPanels: u3,
          panelConstraints: n[d],
          prevSize: y2,
          size: b
        });
        if (!k(y2, v) && (p += y2 - v, l2[d] = v, p.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
          numeric: true
        }) >= 0))
          break;
        e < 0 ? d-- : d++;
      }
    }
    if ($t(r3, l2))
      return i;
    {
      const f2 = e < 0 ? m : c, d = a2[f2];
      C2(
        d != null,
        `Previous layout not found for panel index ${f2}`
      );
      const h = d + p, y2 = Z({
        overrideDisabledPanels: u3,
        panelConstraints: n[f2],
        prevSize: d,
        size: h
      });
      if (l2[f2] = y2, !k(y2, h)) {
        let b = h - y2, g2 = e < 0 ? m : c;
        for (; g2 >= 0 && g2 < n.length; ) {
          const w = l2[g2];
          C2(
            w != null,
            `Previous layout not found for panel index ${g2}`
          );
          const M2 = w + b, L = Z({
            overrideDisabledPanels: u3,
            panelConstraints: n[g2],
            prevSize: w,
            size: M2
          });
          if (k(w, L) || (b -= L - w, l2[g2] = L), k(b, 0))
            break;
          e > 0 ? g2-- : g2++;
        }
      }
    }
    const S2 = Object.values(l2).reduce(
      (f2, d) => d + f2,
      0
    );
    if (!k(S2, 100, 0.1))
      return i;
    const z = Object.keys(i);
    return l2.reduce((f2, d, h) => (f2[z[h]] = d, f2), {});
  }
  function W(e, t2) {
    if (Object.keys(e).length !== Object.keys(t2).length)
      return false;
    for (const n in e)
      if (t2[n] === void 0 || A(e[n], t2[n]) !== 0)
        return false;
    return true;
  }
  function K({
    layout: e,
    panelConstraints: t2
  }) {
    const n = Object.values(e), o = [...n], i = o.reduce(
      (a2, r3) => a2 + r3,
      0
    );
    if (o.length !== t2.length)
      throw Error(
        `Invalid ${t2.length} panel layout: ${o.map((a2) => `${a2}%`).join(", ")}`
      );
    if (!k(i, 100) && o.length > 0)
      for (let a2 = 0; a2 < t2.length; a2++) {
        const r3 = o[a2];
        C2(r3 != null, `No layout data found for index ${a2}`);
        const l2 = 100 / i * r3;
        o[a2] = l2;
      }
    let s = 0;
    for (let a2 = 0; a2 < t2.length; a2++) {
      const r3 = n[a2];
      C2(r3 != null, `No layout data found for index ${a2}`);
      const l2 = o[a2];
      C2(l2 != null, `No layout data found for index ${a2}`);
      const c = Z({
        overrideDisabledPanels: true,
        panelConstraints: t2[a2],
        prevSize: r3,
        size: l2
      });
      l2 != c && (s += l2 - c, o[a2] = c);
    }
    if (!k(s, 0))
      for (let a2 = 0; a2 < t2.length; a2++) {
        const r3 = o[a2];
        C2(r3 != null, `No layout data found for index ${a2}`);
        const l2 = r3 + s, c = Z({
          overrideDisabledPanels: true,
          panelConstraints: t2[a2],
          prevSize: r3,
          size: l2
        });
        if (r3 !== c && (s -= c - r3, o[a2] = c, k(s, 0)))
          break;
      }
    const u3 = Object.keys(e);
    return o.reduce((a2, r3, l2) => (a2[u3[l2]] = r3, a2), {});
  }
  function at({
    groupId: e,
    panelId: t2
  }) {
    const n = () => {
      const r3 = X2();
      for (const [
        l2,
        {
          defaultLayoutDeferred: c,
          derivedPanelConstraints: m,
          layout: p,
          groupSize: S2,
          separatorToPanels: z
        }
      ] of r3)
        if (l2.id === e)
          return {
            defaultLayoutDeferred: c,
            derivedPanelConstraints: m,
            group: l2,
            groupSize: S2,
            layout: p,
            separatorToPanels: z
          };
      throw Error(`Group ${e} not found`);
    }, o = () => {
      const r3 = n().derivedPanelConstraints.find(
        (l2) => l2.panelId === t2
      );
      if (r3 !== void 0)
        return r3;
      throw Error(`Panel constraints not found for Panel ${t2}`);
    }, i = () => {
      const r3 = n().group.panels.find((l2) => l2.id === t2);
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t2}`);
    }, s = () => {
      const r3 = n().layout[t2];
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t2}`);
    }, u3 = ({
      nextSize: r3,
      panels: l2,
      prevLayout: c,
      derivedPanelConstraints: m
    }) => {
      const p = s(), S2 = l2.findIndex((h) => h.id === t2), z = S2 === 0, f2 = S2 === l2.length - 1;
      if (f2 && r3 < p && (z || l2.slice(0, S2).every((h, y2) => {
        const b = m[y2];
        return b?.collapsible && k(b.collapsedSize, c[b.panelId]);
      }))) {
        const h = l2.slice(0, S2).reduce((y2, b) => y2 + c[b.id], 0);
        return {
          ...c,
          [t2]: T2(100 - h)
        };
      }
      return le({
        delta: f2 ? p - r3 : r3 - p,
        initialLayout: c,
        panelConstraints: m,
        pivotIndices: f2 ? [S2 - 1, S2] : [S2, S2 + 1],
        prevLayout: c,
        trigger: "imperative-api"
      });
    }, a2 = (r3) => {
      const l2 = s();
      if (r3 === l2)
        return;
      const {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m,
        group: p,
        groupSize: S2,
        layout: z,
        separatorToPanels: f2
      } = n(), d = u3({
        nextSize: r3,
        panels: p.panels,
        prevLayout: z,
        derivedPanelConstraints: m
      }), h = K({
        layout: d,
        panelConstraints: m
      });
      W(z, h) || j(p, {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m,
        groupSize: S2,
        layout: h,
        separatorToPanels: f2
      });
    };
    return {
      collapse: () => {
        const { collapsible: r3, collapsedSize: l2 } = o(), { mutableValues: c } = i(), m = s();
        r3 && m !== l2 && (c.expandToSize = m, a2(l2));
      },
      expand: () => {
        const { collapsible: r3, collapsedSize: l2, minSize: c } = o(), { mutableValues: m } = i(), p = s();
        if (r3 && p === l2) {
          let S2 = m.expandToSize ?? c;
          S2 === 0 && (S2 = 1), a2(S2);
        }
      },
      getSize: () => {
        const { group: r3 } = n(), l2 = s(), { element: c } = i(), m = r3.orientation === "horizontal" ? c.offsetWidth : c.offsetHeight;
        return {
          asPercentage: l2,
          inPixels: m
        };
      },
      isCollapsed: () => {
        const { collapsible: r3, collapsedSize: l2 } = o(), c = s();
        return r3 && k(l2, c);
      },
      resize: (r3) => {
        const { group: l2 } = n(), { element: c } = i(), m = ne({ group: l2 }), p = ie({
          groupSize: m,
          panelElement: c,
          styleProp: r3
        }), S2 = T2(p / m * 100);
        a2(S2);
      }
    };
  }
  function _e2(e) {
    if (e.defaultPrevented)
      return;
    const t2 = X2();
    we(e, t2).forEach((o) => {
      if (o.separator && !o.separator.disableDoubleClick) {
        const i = o.panels.find(
          (s) => s.panelConstraints.defaultSize !== void 0
        );
        if (i) {
          const s = i.panelConstraints.defaultSize, u3 = at({
            groupId: o.group.id,
            panelId: i.id
          });
          u3 && s !== void 0 && (u3.resize(s), e.preventDefault());
        }
      }
    });
  }
  function pe(e) {
    const t2 = X2();
    for (const [n] of t2)
      if (n.separators.some(
        (o) => o.element === e
      ))
        return n;
    throw Error("Could not find parent Group for separator element");
  }
  function lt({
    groupId: e
  }) {
    const t2 = () => {
      const n = X2();
      for (const [o, i] of n)
        if (o.id === e)
          return { group: o, ...i };
      throw Error(`Could not find Group with id "${e}"`);
    };
    return {
      getLayout() {
        const { defaultLayoutDeferred: n, layout: o } = t2();
        return n ? {} : o;
      },
      setLayout(n) {
        const {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: i,
          group: s,
          groupSize: u3,
          layout: a2,
          separatorToPanels: r3
        } = t2(), l2 = K({
          layout: n,
          panelConstraints: i
        });
        return o ? a2 : (W(a2, l2) || j(s, {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: i,
          groupSize: u3,
          layout: l2,
          separatorToPanels: r3
        }), l2);
      }
    };
  }
  function U(e, t2) {
    const n = pe(e), o = H(n.id, true), i = n.separators.find(
      (m) => m.element === e
    );
    C2(i, "Matching separator not found");
    const s = o.separatorToPanels.get(i);
    C2(s, "Matching panels not found");
    const u3 = s.map((m) => n.panels.indexOf(m)), r3 = lt({ groupId: n.id }).getLayout(), l2 = le({
      delta: t2,
      initialLayout: r3,
      panelConstraints: o.derivedPanelConstraints,
      pivotIndices: u3,
      prevLayout: r3,
      trigger: "keyboard"
    }), c = K({
      layout: l2,
      panelConstraints: o.derivedPanelConstraints
    });
    W(r3, c) || j(
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
    const t2 = e.currentTarget, n = pe(t2);
    if (!n.disabled)
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault(), n.orientation === "vertical" && U(t2, 5);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault(), n.orientation === "horizontal" && U(t2, -5);
          break;
        }
        case "ArrowRight": {
          e.preventDefault(), n.orientation === "horizontal" && U(t2, 5);
          break;
        }
        case "ArrowUp": {
          e.preventDefault(), n.orientation === "vertical" && U(t2, -5);
          break;
        }
        case "End": {
          e.preventDefault(), U(t2, 100);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const o = pe(t2), i = H(o.id, true), { derivedPanelConstraints: s, layout: u3, separatorToPanels: a2 } = i, r3 = o.separators.find(
            (p) => p.element === t2
          );
          C2(r3, "Matching separator not found");
          const l2 = a2.get(r3);
          C2(l2, "Matching panels not found");
          const c = l2[0], m = s.find(
            (p) => p.panelId === c.id
          );
          if (C2(m, "Panel metadata not found"), m.collapsible) {
            const p = u3[c.id], S2 = m.collapsedSize === p ? o.mutableState.expandedPanelSizes[c.id] ?? m.minSize : m.collapsedSize;
            U(t2, S2 - p);
          }
          break;
        }
        case "F6": {
          e.preventDefault();
          const i = pe(t2).separators.map(
            (r3) => r3.element
          ), s = Array.from(i).findIndex(
            (r3) => r3 === e.currentTarget
          );
          C2(s !== null, "Index not found");
          const u3 = e.shiftKey ? s > 0 ? s - 1 : i.length - 1 : s + 1 < i.length ? s + 1 : 0;
          i[u3].focus({
            preventScroll: true
          });
          break;
        }
        case "Home": {
          e.preventDefault(), U(t2, -100);
          break;
        }
      }
  }
  function je(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    const t2 = X2(), n = we(e, t2), o = /* @__PURE__ */ new Map();
    let i = false;
    n.forEach((s) => {
      s.separator && (i || (i = true, s.separator.element.focus({
        // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
        focusVisible: false,
        preventScroll: true
      })));
      const u3 = t2.get(s.group);
      u3 && o.set(s.group, u3.layout);
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
    event: t2,
    hitRegions: n,
    initialLayoutMap: o,
    mountedGroups: i,
    pointerDownAtPoint: s,
    prevCursorFlags: u3
  }) {
    let a2 = 0;
    n.forEach((l2) => {
      const { group: c, groupSize: m } = l2, { orientation: p, panels: S2 } = c, { disableCursor: z } = c.mutableState;
      let f2 = 0;
      s ? p === "horizontal" ? f2 = (t2.clientX - s.x) / m * 100 : f2 = (t2.clientY - s.y) / m * 100 : p === "horizontal" ? f2 = t2.clientX < 0 ? -100 : 100 : f2 = t2.clientY < 0 ? -100 : 100;
      const d = o.get(c), h = i.get(c);
      if (!d || !h)
        return;
      const {
        defaultLayoutDeferred: y2,
        derivedPanelConstraints: b,
        groupSize: v,
        layout: g2,
        separatorToPanels: w
      } = h;
      if (b && g2 && w) {
        const M2 = le({
          delta: f2,
          initialLayout: d,
          panelConstraints: b,
          pivotIndices: l2.panels.map((L) => S2.indexOf(L)),
          prevLayout: g2,
          trigger: "mouse-or-touch"
        });
        if (W(M2, g2)) {
          if (f2 !== 0 && !z)
            switch (p) {
              case "horizontal": {
                a2 |= f2 < 0 ? et : tt;
                break;
              }
              case "vertical": {
                a2 |= f2 < 0 ? nt : ot;
                break;
              }
            }
        } else
          j(l2.group, {
            defaultLayoutDeferred: y2,
            derivedPanelConstraints: b,
            groupSize: v,
            layout: M2,
            separatorToPanels: w
          });
      }
    });
    let r3 = 0;
    t2.movementX === 0 ? r3 |= u3 & Ie : r3 |= a2 & Ie, t2.movementY === 0 ? r3 |= u3 & ke : r3 |= a2 & ke, Mt(r3), xe(e);
  }
  function He(e) {
    const t2 = X2(), n = B();
    switch (n.state) {
      case "active":
        ut({
          document: e.currentTarget,
          event: e,
          hitRegions: n.hitRegions,
          initialLayoutMap: n.initialLayoutMap,
          mountedGroups: t2,
          prevCursorFlags: n.cursorFlags
        });
    }
  }
  function Ve(e) {
    if (e.defaultPrevented)
      return;
    const t2 = B(), n = X2();
    switch (t2.state) {
      case "active": {
        if (
          // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
          e.buttons === 0
        ) {
          te({
            cursorFlags: 0,
            state: "inactive"
          }), t2.hitRegions.forEach((o) => {
            const i = H(o.group.id, true);
            j(o.group, i, {
              isUserInteraction: true
            });
          });
          return;
        }
        for (const o of t2.hitRegions)
          if (o.separator) {
            const { element: i } = o.separator;
            i.hasPointerCapture?.(e.pointerId) || i.setPointerCapture?.(e.pointerId);
          }
        ut({
          document: e.currentTarget,
          event: e,
          hitRegions: t2.hitRegions,
          initialLayoutMap: t2.initialLayoutMap,
          mountedGroups: n,
          pointerDownAtPoint: t2.pointerDownAtPoint,
          prevCursorFlags: t2.cursorFlags
        });
        break;
      }
      default: {
        const o = we(e, n);
        o.length === 0 ? t2.state !== "inactive" && te({
          cursorFlags: 0,
          state: "inactive"
        }) : te({
          cursorFlags: 0,
          hitRegions: o,
          state: "hover"
        }), xe(e.currentTarget);
        break;
      }
    }
  }
  function Ue(e) {
    if (e.relatedTarget instanceof HTMLIFrameElement)
      switch (B().state) {
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
    let t2 = 0, n = 0;
    const o = {};
    for (const s of e)
      if (s.defaultSize !== void 0) {
        t2++;
        const u3 = T2(s.defaultSize);
        n += u3, o[s.panelId] = u3;
      } else
        o[s.panelId] = void 0;
    const i = e.length - t2;
    if (i !== 0) {
      const s = T2((100 - n) / i);
      for (const u3 of e)
        u3.defaultSize === void 0 && (o[u3.panelId] = s);
    }
    return o;
  }
  function jt(e, t2, n) {
    if (!n[0])
      return;
    const i = e.panels.find((l2) => l2.element === t2);
    if (!i || !i.onResize)
      return;
    const s = ne({ group: e }), u3 = e.orientation === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, a2 = i.mutableValues.prevSize, r3 = {
      asPercentage: T2(u3 / s * 100),
      inPixels: u3
    };
    i.mutableValues.prevSize = r3, i.onResize(r3, i.id, a2);
  }
  function Ht(e, t2) {
    if (Object.keys(e).length !== Object.keys(t2).length)
      return false;
    for (const o in e)
      if (e[o] !== t2[o])
        return false;
    return true;
  }
  function Vt({
    group: e,
    nextGroupSize: t2,
    prevGroupSize: n,
    prevLayout: o
  }) {
    if (n <= 0 || t2 <= 0 || n === t2)
      return o;
    let i = 0, s = 0, u3 = false;
    const a2 = /* @__PURE__ */ new Map(), r3 = [];
    for (const m of e.panels) {
      const p = o[m.id] ?? 0;
      switch (m.panelConstraints.groupResizeBehavior) {
        case "preserve-pixel-size": {
          u3 = true;
          const S2 = p / 100 * n, z = T2(
            S2 / t2 * 100
          );
          a2.set(m.id, z), i += z;
          break;
        }
        case "preserve-relative-size":
        default: {
          r3.push(m.id), s += p;
          break;
        }
      }
    }
    if (!u3 || r3.length === 0)
      return o;
    const l2 = 100 - i, c = { ...o };
    if (a2.forEach((m, p) => {
      c[p] = m;
    }), s > 0)
      for (const m of r3) {
        const p = o[m] ?? 0;
        c[m] = T2(
          p / s * l2
        );
      }
    else {
      const m = T2(
        l2 / r3.length
      );
      for (const p of r3)
        c[p] = m;
    }
    return c;
  }
  function Ut(e, t2) {
    const n = e.map((i) => i.id), o = Object.keys(t2);
    if (n.length !== o.length)
      return false;
    for (const i of n)
      if (!o.includes(i))
        return false;
    return true;
  }
  var J = /* @__PURE__ */ new Map();
  function Bt(e) {
    let t2 = true;
    C2(
      e.element.ownerDocument.defaultView,
      "Cannot register an unmounted Group"
    );
    const n = e.element.ownerDocument.defaultView.ResizeObserver, o = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), s = new n((f2) => {
      for (const d of f2) {
        const { borderBoxSize: h, target: y2 } = d;
        if (y2 === e.element) {
          if (t2) {
            const b = ne({ group: e });
            if (b === 0)
              return;
            const v = H(e.id);
            if (!v)
              return;
            const g2 = ve(e), w = v.defaultLayoutDeferred ? We(g2) : v.layout, M2 = Vt({
              group: e,
              nextGroupSize: b,
              prevGroupSize: v.groupSize,
              prevLayout: w
            }), L = K({
              layout: M2,
              panelConstraints: g2
            });
            if (!v.defaultLayoutDeferred && W(v.layout, L) && Ht(
              v.derivedPanelConstraints,
              g2
            ) && v.groupSize === b)
              return;
            j(e, {
              defaultLayoutDeferred: false,
              derivedPanelConstraints: g2,
              groupSize: b,
              layout: L,
              separatorToPanels: v.separatorToPanels
            });
          }
        } else
          jt(e, y2, h);
      }
    });
    s.observe(e.element), e.panels.forEach((f2) => {
      C2(
        !o.has(f2.id),
        `Panel ids must be unique; id "${f2.id}" was used more than once`
      ), o.add(f2.id), f2.onResize && s.observe(f2.element);
    });
    const u3 = ne({ group: e }), a2 = ve(e), r3 = e.panels.map(({ id: f2 }) => f2).join(",");
    let l2 = e.mutableState.defaultLayout;
    l2 && (Ut(e.panels, l2) || (l2 = void 0));
    const c = e.mutableState.layouts[r3] ?? l2 ?? We(a2), m = K({
      layout: c,
      panelConstraints: a2
    }), p = e.element.ownerDocument;
    J.set(
      p,
      (J.get(p) ?? 0) + 1
    );
    const S2 = /* @__PURE__ */ new Map();
    return Ze(e).forEach((f2) => {
      f2.separator && S2.set(f2.separator, f2.panels);
    }), j(e, {
      defaultLayoutDeferred: u3 === 0,
      derivedPanelConstraints: a2,
      groupSize: u3,
      layout: m,
      separatorToPanels: S2
    }), e.separators.forEach((f2) => {
      C2(
        !i.has(f2.id),
        `Separator ids must be unique; id "${f2.id}" was used more than once`
      ), i.add(f2.id), f2.element.addEventListener("keydown", $e);
    }), J.get(p) === 1 && (p.addEventListener("contextmenu", Ge, true), p.addEventListener("dblclick", _e2, true), p.addEventListener("pointerdown", je, true), p.addEventListener("pointerleave", He), p.addEventListener("pointermove", Ve), p.addEventListener("pointerout", Ue), p.addEventListener("pointerup", Be, true)), function() {
      t2 = false, J.set(
        p,
        Math.max(0, (J.get(p) ?? 0) - 1)
      ), kt(e), e.separators.forEach((d) => {
        d.element.removeEventListener("keydown", $e);
      }), J.get(p) || (p.removeEventListener(
        "contextmenu",
        Ge,
        true
      ), p.removeEventListener(
        "dblclick",
        _e2,
        true
      ), p.removeEventListener(
        "pointerdown",
        je,
        true
      ), p.removeEventListener("pointerleave", He), p.removeEventListener("pointermove", Ve), p.removeEventListener("pointerout", Ue), p.removeEventListener("pointerup", Be, true)), s.disconnect();
    };
  }
  function Wt() {
    const [e, t2] = useState({}), n = useCallback(() => t2({}), []);
    return [e, n];
  }
  function Le(e) {
    const t2 = useId();
    return `${e ?? t2}`;
  }
  var q = typeof window < "u" ? useLayoutEffect : useEffect;
  function se(e) {
    const t2 = useRef(e);
    return q(() => {
      t2.current = e;
    }, [e]), useCallback(
      (...n) => t2.current?.(...n),
      [t2]
    );
  }
  function Ce(...e) {
    return se((t2) => {
      e.forEach((n) => {
        if (n)
          switch (typeof n) {
            case "function": {
              n(t2);
              break;
            }
            case "object": {
              n.current = t2;
              break;
            }
          }
      });
    });
  }
  function Re(e) {
    const t2 = useRef({ ...e });
    return q(() => {
      for (const n in e)
        t2.current[n] = e[n];
    }, [e]), t2.current;
  }
  var ct = createContext(null);
  function Kt(e, t2) {
    const n = useRef({
      getLayout: () => ({}),
      setLayout: Et
    });
    useImperativeHandle(t2, () => n.current, []), q(() => {
      Object.assign(
        n.current,
        lt({ groupId: e })
      );
    });
  }
  function Xt({
    children: e,
    className: t2,
    defaultLayout: n,
    disableCursor: o,
    disabled: i,
    elementRef: s,
    groupRef: u3,
    id: a2,
    onLayoutChange: r3,
    onLayoutChanged: l2,
    orientation: c = "horizontal",
    resizeTargetMinimumSize: m = {
      coarse: 20,
      fine: 10
    },
    style: p,
    ...S2
  }) {
    const z = useRef({
      onLayoutChange: {},
      onLayoutChanged: {}
    }), f2 = se((x2) => {
      W(z.current.onLayoutChange, x2) || (z.current.onLayoutChange = x2, r3?.(x2));
    }), d = se(
      (x2, P) => {
        W(z.current.onLayoutChanged, x2) || (z.current.onLayoutChanged = x2, l2?.(x2, { isUserInteraction: P }));
      }
    ), h = Le(a2), y2 = useRef(null), [b, v] = Wt(), g2 = useRef({
      lastExpandedPanelSizes: {},
      layouts: {},
      panels: [],
      resizeTargetMinimumSize: m,
      separators: []
    }), w = Ce(y2, s);
    Kt(h, u3);
    const M2 = se(
      (x2, P) => {
        const I = B(), R = Oe(x2), E = H(x2);
        if (E) {
          let D = false;
          switch (I.state) {
            case "active": {
              D = I.hitRegions.some(
                (V) => V.group === R
              );
              break;
            }
          }
          return {
            flexGrow: E.layout[P] ?? 1,
            pointerEvents: D ? "none" : void 0
          };
        }
        if (n?.[P])
          return {
            flexGrow: n?.[P]
          };
      }
    ), L = Re({
      defaultLayout: n,
      disableCursor: o
    }), G = useMemo(
      () => ({
        get disableCursor() {
          return !!L.disableCursor;
        },
        getPanelStyles: M2,
        id: h,
        orientation: c,
        registerPanel: (x2) => {
          const P = g2.current;
          return P.panels = be(c, [
            ...P.panels,
            x2
          ]), v(), () => {
            P.panels = P.panels.filter(
              (I) => I !== x2
            ), v();
          };
        },
        registerSeparator: (x2) => {
          const P = g2.current;
          return P.separators = be(c, [
            ...P.separators,
            x2
          ]), v(), () => {
            P.separators = P.separators.filter(
              (I) => I !== x2
            ), v();
          };
        },
        updatePanelProps: (x2, { disabled: P }) => {
          const R = g2.current.panels.find(
            (V) => V.id === x2
          );
          R && (R.panelConstraints.disabled = P);
          const E = Oe(h), D = H(h);
          E && D && j(E, {
            ...D,
            derivedPanelConstraints: ve(E)
          });
        },
        updateSeparatorProps: (x2, {
          disabled: P,
          disableDoubleClick: I
        }) => {
          const E = g2.current.separators.find(
            (D) => D.id === x2
          );
          E && (E.disabled = P, E.disableDoubleClick = I);
        }
      }),
      [M2, h, v, c, L]
    ), N = useRef(null);
    return q(() => {
      const x2 = y2.current;
      if (x2 === null)
        return;
      const P = g2.current;
      let I;
      if (L.defaultLayout !== void 0 && Object.keys(L.defaultLayout).length === P.panels.length) {
        I = {};
        for (const _ of P.panels) {
          const Y2 = L.defaultLayout[_.id];
          Y2 !== void 0 && (I[_.id] = Y2);
        }
      }
      const R = {
        disabled: !!i,
        element: x2,
        id: h,
        mutableState: {
          defaultLayout: I,
          disableCursor: !!L.disableCursor,
          expandedPanelSizes: g2.current.lastExpandedPanelSizes,
          layouts: g2.current.layouts
        },
        orientation: c,
        panels: P.panels,
        resizeTargetMinimumSize: P.resizeTargetMinimumSize,
        separators: P.separators
      };
      N.current = R;
      const E = Bt(R), { defaultLayoutDeferred: D, derivedPanelConstraints: V, layout: ue } = H(R.id, true);
      !D && V.length > 0 && (f2(ue), d(ue, false));
      const oe = Pe(h, (_) => {
        const { defaultLayoutDeferred: Y2, derivedPanelConstraints: Ee, layout: ce2 } = _.next;
        if (Y2 || Ee.length === 0)
          return;
        const ft = R.panels.map(({ id: $ }) => $).join(",");
        R.mutableState.layouts[ft] = ce2, Ee.forEach(($) => {
          if ($.collapsible) {
            const { layout: ge } = _.prev ?? {};
            if (ge) {
              const pt = k(
                $.collapsedSize,
                ce2[$.panelId]
              ), ht = k(
                $.collapsedSize,
                ge[$.panelId]
              );
              pt && !ht && (R.mutableState.expandedPanelSizes[$.panelId] = ge[$.panelId]);
            }
          }
        });
        const dt = B().state !== "active";
        f2(ce2), dt && d(ce2, _.isUserInteraction);
      });
      return () => {
        N.current = null, E(), oe();
      };
    }, [
      i,
      h,
      d,
      f2,
      c,
      b,
      L
    ]), useEffect(() => {
      const x2 = N.current;
      x2 && (x2.mutableState.defaultLayout = n, x2.mutableState.disableCursor = !!o);
    }), /* @__PURE__ */ jsx(ct.Provider, { value: G, children: /* @__PURE__ */ jsx(
      "div",
      {
        ...S2,
        className: t2,
        "data-group": true,
        "data-testid": h,
        id: h,
        ref: w,
        style: {
          height: "100%",
          width: "100%",
          overflow: "hidden",
          ...p,
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
  function Me() {
    const e = useContext(ct);
    return C2(
      e,
      "Group Context not found; did you render a Panel or Separator outside of a Group?"
    ), e;
  }
  function Jt(e, t2) {
    const { id: n } = Me(), o = useRef({
      collapse: ye,
      expand: ye,
      getSize: () => ({
        asPercentage: 0,
        inPixels: 0
      }),
      isCollapsed: () => false,
      resize: ye
    });
    useImperativeHandle(t2, () => o.current, []), q(() => {
      Object.assign(
        o.current,
        at({ groupId: n, panelId: e })
      );
    });
  }
  function Zt({
    children: e,
    className: t2,
    collapsedSize: n = "0%",
    collapsible: o = false,
    defaultSize: i,
    disabled: s,
    elementRef: u3,
    groupResizeBehavior: a2 = "preserve-relative-size",
    id: r3,
    maxSize: l2 = "100%",
    minSize: c = "0%",
    onResize: m,
    panelRef: p,
    style: S2,
    ...z
  }) {
    const f2 = !!r3, d = Le(r3), h = Re({
      disabled: s
    }), y2 = useRef(null), b = Ce(y2, u3), {
      getPanelStyles: v,
      id: g2,
      orientation: w,
      registerPanel: M2,
      updatePanelProps: L
    } = Me(), G = m !== null, N = se(
      (R, E, D) => {
        m?.(R, r3, D);
      }
    );
    q(() => {
      const R = y2.current;
      if (R !== null) {
        const E = {
          element: R,
          id: d,
          idIsStable: f2,
          mutableValues: {
            expandToSize: void 0,
            prevSize: void 0
          },
          onResize: G ? N : void 0,
          panelConstraints: {
            groupResizeBehavior: a2,
            collapsedSize: n,
            collapsible: o,
            defaultSize: i,
            disabled: h.disabled,
            maxSize: l2,
            minSize: c
          }
        };
        return M2(E);
      }
    }, [
      a2,
      n,
      o,
      i,
      G,
      d,
      f2,
      l2,
      c,
      N,
      M2,
      h
    ]), useEffect(() => {
      L(d, { disabled: s });
    }, [s, d, L]), Jt(d, p);
    const x2 = () => {
      const R = v(g2, d);
      if (R)
        return JSON.stringify(R);
    }, P = useSyncExternalStore(
      (R) => Pe(g2, R),
      x2,
      x2
    );
    let I;
    return P ? I = JSON.parse(P) : i !== void 0 ? I = {
      flexGrow: void 0,
      flexShrink: void 0,
      flexBasis: i
    } : I = { flexGrow: 1 }, /* @__PURE__ */ jsx(
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
          ...I
        },
        children: /* @__PURE__ */ jsx(
          "div",
          {
            className: t2,
            style: {
              maxHeight: "100%",
              maxWidth: "100%",
              flexGrow: 1,
              overflow: "auto",
              ...S2,
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
    panelConstraints: t2,
    panelId: n,
    panelIndex: o
  }) {
    let i, s;
    const u3 = e[n], a2 = t2.find(
      (r3) => r3.panelId === n
    );
    if (a2) {
      const r3 = a2.maxSize, l2 = a2.collapsible ? a2.collapsedSize : a2.minSize, c = [o, o + 1];
      s = K({
        layout: le({
          delta: l2 - u3,
          initialLayout: e,
          panelConstraints: t2,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t2
      })[n], i = K({
        layout: le({
          delta: r3 - u3,
          initialLayout: e,
          panelConstraints: t2,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t2
      })[n];
    }
    return {
      valueControls: n,
      valueMax: i,
      valueMin: s,
      valueNow: u3
    };
  }
  function tn({
    children: e,
    className: t2,
    disabled: n,
    disableDoubleClick: o,
    elementRef: i,
    id: s,
    style: u3,
    ...a2
  }) {
    const r3 = Le(s), l2 = Re({
      disabled: n,
      disableDoubleClick: o
    }), [c, m] = useState({}), [p, S2] = useState("inactive"), [z, f2] = useState(false), d = useRef(null), h = Ce(d, i), {
      disableCursor: y2,
      id: b,
      orientation: v,
      registerSeparator: g2,
      updateSeparatorProps: w
    } = Me(), M2 = v === "horizontal" ? "vertical" : "horizontal";
    q(() => {
      const N = d.current;
      if (N !== null) {
        const x2 = {
          disabled: l2.disabled,
          disableDoubleClick: l2.disableDoubleClick,
          element: N,
          id: r3
        }, P = g2(x2), I = Rt(
          (E) => {
            S2(
              E.next.state !== "inactive" && E.next.hitRegions.some(
                (D) => D.separator === x2
              ) ? E.next.state : "inactive"
            );
          }
        ), R = Pe(
          b,
          (E) => {
            const { derivedPanelConstraints: D, layout: V, separatorToPanels: ue } = E.next, oe = ue.get(x2);
            if (oe) {
              const _ = oe[0], Y2 = oe.indexOf(_);
              m(
                en({
                  layout: V,
                  panelConstraints: D,
                  panelId: _.id,
                  panelIndex: Y2
                })
              );
            }
          }
        );
        return () => {
          I(), R(), P();
        };
      }
    }, [b, r3, g2, l2]), useEffect(() => {
      w(r3, { disabled: n, disableDoubleClick: o });
    }, [n, o, r3, w]);
    let L;
    n && !y2 && (L = "not-allowed");
    let G;
    if (n)
      G = "disabled";
    else
      switch (p) {
        case "active": {
          G = "active";
          break;
        }
        default:
          z ? G = "focus" : G = p;
      }
    return /* @__PURE__ */ jsx(
      "div",
      {
        ...a2,
        "aria-controls": c.valueControls,
        "aria-disabled": n || void 0,
        "aria-orientation": M2,
        "aria-valuemax": c.valueMax,
        "aria-valuemin": c.valueMin,
        "aria-valuenow": c.valueNow,
        children: e,
        className: t2,
        "data-separator": G,
        "data-testid": r3,
        id: r3,
        onBlur: () => f2(false),
        onFocus: () => f2(true),
        ref: h,
        role: "separator",
        style: {
          flexBasis: "auto",
          cursor: L,
          ...u3,
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
  var ce = cva(
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
  var C3 = forwardRef(function({
    className: t2,
    variant: o = "default",
    size: n = "default",
    asChild: i = false,
    ...s
  }, g2) {
    const m = i ? dist_exports.Root : "button";
    return /* @__PURE__ */ jsx(
      m,
      {
        ref: g2,
        "data-slot": "button",
        "data-variant": o,
        "data-size": n,
        className: r2(ce({ variant: o, size: n, className: t2 })),
        ...s
      }
    );
  });
  var fe2 = cva(
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
  function wt2({
    className: e,
    variant: t2 = "default",
    asChild: o = false,
    ...n
  }) {
    const i = o ? dist_exports.Root : "span";
    return /* @__PURE__ */ jsx(
      i,
      {
        "data-slot": "badge",
        "data-variant": t2,
        className: r2(fe2({ variant: t2 }), e),
        ...n
      }
    );
  }
  function me({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports2.Root, { "data-slot": "dialog", ...e });
  }
  function be2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports2.Portal, { "data-slot": "dialog-portal", ...e });
  }
  function ve2({
    className: e,
    ...t2
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.Overlay,
      {
        "data-slot": "dialog-overlay",
        className: r2(
          "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          e
        ),
        ...t2
      }
    );
  }
  function he({
    className: e,
    children: t2,
    showCloseButton: o = true,
    ...n
  }) {
    const i = M();
    return /* @__PURE__ */ jsxs(be2, { children: [
      /* @__PURE__ */ jsx(ve2, {}),
      /* @__PURE__ */ jsxs(
        dist_exports2.Content,
        {
          "data-slot": "dialog-content",
          className: r2(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            e
          ),
          ...n,
          children: [
            t2,
            o && /* @__PURE__ */ jsx(dist_exports2.Close, { "data-slot": "dialog-close", asChild: true, children: /* @__PURE__ */ jsxs(
              C3,
              {
                variant: "ghost",
                className: "absolute top-2 right-2",
                size: "icon-sm",
                children: [
                  /* @__PURE__ */ jsx(
                    X,
                    {}
                  ),
                  /* @__PURE__ */ jsx("span", { className: "sr-only", children: i("close") })
                ]
              }
            ) })
          ]
        }
      )
    ] });
  }
  function xe2({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "dialog-header",
        className: r2("flex flex-col gap-2", e),
        ...t2
      }
    );
  }
  function Pt2({
    className: e,
    showCloseButton: t2 = false,
    children: o,
    ...n
  }) {
    const i = M();
    return /* @__PURE__ */ jsxs(
      "div",
      {
        "data-slot": "dialog-footer",
        className: r2(
          "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
          e
        ),
        ...n,
        children: [
          o,
          t2 && /* @__PURE__ */ jsx(dist_exports2.Close, { asChild: true, children: /* @__PURE__ */ jsx(C3, { variant: "outline", children: i("close") }) })
        ]
      }
    );
  }
  function we2({
    className: e,
    ...t2
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.Title,
      {
        "data-slot": "dialog-title",
        className: r2(
          "text-base leading-none font-medium",
          e
        ),
        ...t2
      }
    );
  }
  function ze2({
    className: e,
    ...t2
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.Description,
      {
        "data-slot": "dialog-description",
        className: r2(
          "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          e
        ),
        ...t2
      }
    );
  }
  function J2({ className: e, type: t2, ...o }) {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type: t2,
        "data-slot": "input",
        className: r2(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...o
      }
    );
  }
  function ye2({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "textarea",
      {
        "data-slot": "textarea",
        className: r2(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...t2
      }
    );
  }
  var Ne2 = cva(
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
  var Se = cva(
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
  function _a({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(dist_exports3.Root, { "data-slot": "label", className: r2(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      e
    ), ...t2 });
  }
  var Ve2 = 3600 * 24 * 7;
  var Q = createContext(null);
  var qe = cva(
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
  function kr({ className: e, ...t2 }) {
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
            ...t2
          }
        )
      }
    );
  }
  function Nr({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "thead",
      {
        "data-slot": "table-header",
        className: r2("[&_tr]:border-b", e),
        ...t2
      }
    );
  }
  function Cr({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "tbody",
      {
        "data-slot": "table-body",
        className: r2("[&_tr:last-child]:border-0", e),
        ...t2
      }
    );
  }
  function _r({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "tr",
      {
        "data-slot": "table-row",
        className: r2(
          "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
          e
        ),
        ...t2
      }
    );
  }
  function Tr({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "th",
      {
        "data-slot": "table-head",
        className: r2(
          "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
          e
        ),
        ...t2
      }
    );
  }
  function Ir({ className: e, ...t2 }) {
    return /* @__PURE__ */ jsx(
      "td",
      {
        "data-slot": "table-cell",
        className: r2(
          "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
          e
        ),
        ...t2
      }
    );
  }
  var Xe = cva(
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
  var Y = cva(
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
  var ee2 = createContext({
    size: "default",
    variant: "default",
    spacing: 2,
    orientation: "horizontal"
  });

  // src/lib/remote-components/listing_assistant__remote/src/vendor.ts
  var React = window.React;
  var ReactDOM = window.ReactDOM;

  // src/lib/remote-components/listing_assistant__remote/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var REQUEST_TIMEOUT_MS = 18e4;
  var instanceId = null;
  var requestSequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function installBridgeListener(handlers) {
    const listener = (event) => {
      const raw = event.data;
      if (!raw || typeof raw !== "object" || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION) return;
      const message = raw;
      if (message.type === "init") {
        instanceId = typeof message.instanceId === "string" ? message.instanceId : null;
        handlers.onInit({
          locale: message.locale,
          initialQuery: message.initialQuery
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
      const item = requestId ? pending.get(requestId) : void 0;
      if (!item) return;
      pending.delete(requestId);
      clearTimeout(item.timer);
      if (message.type === "error") {
        item.reject(new Error(typeof message.message === "string" ? message.message : "Workbench request failed"));
      } else {
        item.resolve(message);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function post(type, body) {
    if (!instanceId && type !== "ready") return;
    window.parent.postMessage(
      { channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body ?? {} },
      "*"
    );
  }
  function request(type, body) {
    const requestId = String(++requestSequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u5237\u65B0\u5DE5\u4F5C\u53F0\u91CD\u8BD5\u3002"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      try {
        post(type, { requestId, ...body ?? {} });
      } catch (error) {
        pending.delete(requestId);
        clearTimeout(timer);
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
    const height = Math.max(shell?.scrollHeight ?? 0, 600);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }
  function unwrap(response) {
    if (!response || typeof response !== "object") return {};
    const record = response;
    if ("data" in record) return record.data;
    if ("result" in record) return record.result;
    if ("payload" in record) return record.payload;
    return record;
  }
  function resolveLocaleText(value, locale) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      const record = value;
      const preferred = locale.toLowerCase().startsWith("zh") ? record.zh_Hans ?? record.zh : record.en_US ?? record.en;
      return typeof preferred === "string" ? preferred : "";
    }
    return "";
  }

  // src/lib/remote-components/listing_assistant__remote/src/locales/en.json
  var en_default = {
    appTitle: "Bulk Listing Workbench",
    appSubtitle: "Paste supplier copy, extract a structured draft with AI, then review and save.",
    taskList: "Tasks",
    searchPlaceholder: "Search source copy",
    noTasks: "No listing tasks yet",
    noTasksHint: "Create a task and paste the supplier copy to start.",
    newTask: "New task",
    sourceCopy: "Source copy",
    emptySource: "No source copy.",
    untitledTask: "Untitled task",
    createTitle: "New listing task",
    createDescription: "Paste the supplier copy. AI extraction runs after the task is created.",
    pastePlaceholder: "Paste supplier copy here...",
    create: "Create",
    cancel: "Cancel",
    creating: "Creating...",
    runParse: "Run AI extraction",
    retryParse: "Retry",
    saveDraft: "Save draft",
    saving: "Saving...",
    parsing: "AI extracting...",
    parseRunningHint: "The model may take up to a minute. This panel will refresh when it returns.",
    statusDraft: "Draft",
    statusParsing: "Extracting",
    statusReview: "Needs review",
    statusSaved: "Saved",
    statusFailed: "Failed",
    attemptPrefix: "Attempt",
    fieldTitle: "Title",
    fieldDescription: "Description",
    fieldPrice: "Price",
    fieldCurrency: "Currency",
    fieldCategory: "Category",
    fieldAttributes: "Category attributes",
    fieldSpecs: "Specs",
    titlePlaceholder: "Listing title",
    descriptionPlaceholder: "Factual listing description",
    pricePlaceholder: "e.g. 99.00",
    currencyPlaceholder: "CNY",
    categoryPlaceholder: "e.g. Virtual goods",
    attrKeyPlaceholder: "Attribute",
    attrValuePlaceholder: "Value",
    addAttribute: "Add attribute",
    addSpec: "Add spec",
    specName: "Spec name",
    specPrice: "Price",
    specStock: "Stock",
    remove: "Remove",
    flagMissing: "Missing",
    flagUncertain: "Uncertain",
    flagAi: "AI-filled",
    flagsHint: "Fields marked Missing or Uncertain need operator confirmation.",
    evidenceLabel: "Evidence",
    evidenceHint: "Click to locate this excerpt in the source copy",
    evidencePaneHint: "Highlighted text is the extraction evidence",
    saveConfirmTitle: "Some fields still need review",
    saveConfirmBody: "These fields are still marked Missing or Uncertain. The markers stay after saving so they can be reviewed later.",
    saveConfirmContinue: "Save anyway",
    saveConfirmBack: "Keep reviewing",
    batchParse: "Parse pending",
    batchParsing: "Parsing",
    batchParseNone: "There are no draft or failed tasks to parse.",
    batchParseHint: "Tasks are parsed one at a time (up to 20). A failure does not stop the rest of the batch.",
    batchParseDone: "Batch parse finished: {ok} succeeded, {failed} failed.",
    missingTitle: "Required fields are missing",
    missingHint: "The draft is incomplete. Fill the highlighted fields before saving.",
    errorTitle: "AI extraction failed",
    retryHint: "Retry on this same task. A new task is not created.",
    noDraft: "No draft yet. Run AI extraction to create one.",
    saveSuccess: "Draft saved.",
    parseSuccess: "AI extraction completed.",
    parseAlready: "This task already has a draft, so AI was not called again.",
    createSuccess: "Task created.",
    failureTitle: "Action failed",
    saveHint: "Review the AI-filled fields before saving.",
    currentTask: "Current task",
    loading: "Loading...",
    emptyDraftTitle: "Waiting for AI extraction",
    emptyDraftHint: "Run AI extraction to fill the structured draft from the source copy.",
    aiNote: "This draft was generated by AI. Operator review is required before saving.",
    operatorReview: "Reviewed by operator",
    statusLabel: "Status",
    noRuns: "No AI runs yet",
    runHistory: "AI runs",
    sourceLabel: "Supplier copy",
    draftLabel: "Structured draft",
    loadFailed: "Could not load the workbench.",
    batchHint: "To create several listings at once, separate each supplier copy with a line containing only ---.",
    batchCreated: "Listings created:",
    errAiNotConfigured: "No default chat model is configured for this workspace. Ask an administrator to configure one.",
    errAiTimeout: "The model did not respond in time. Retry the same task.",
    errAiInvalidJson: "The model did not return valid JSON. Retry the same task.",
    errAiInvalidOutput: "The model response did not match the expected fields. Retry the same task.",
    errAiCallFailed: "The model call failed. Check the model configuration or retry.",
    errAiSimulated: "Simulated model failure for the demo path. Retry the same task.",
    errAiInterrupted: "A previous extraction did not finish. Retry the same task.",
    errBusyParsing: "This task is already being parsed. Refresh in a moment.",
    errTaskNotFound: "This listing task was not found or you cannot access it.",
    errSourceRequired: "Paste supplier copy before creating a task.",
    errSourceTooLong: "Supplier copy is too long. Keep it within 20000 characters.",
    errDraftRequired: "Provide at least a title, description or price before saving.",
    errBatchTooLarge: "A batch can contain at most 20 listings.",
    errUnknown: "Something went wrong. Please retry."
  };

  // src/lib/remote-components/listing_assistant__remote/src/locales/zh-Hans.json
  var zh_Hans_default = {
    appTitle: "\u6279\u91CF\u4E0A\u67B6\u5DE5\u4F5C\u53F0",
    appSubtitle: "\u7C98\u8D34\u4F9B\u8D27\u6587\u6848\uFF0C\u7528 AI \u62BD\u53D6\u7ED3\u6784\u5316\u8349\u7A3F\uFF0C\u4EBA\u5DE5\u6838\u5BF9\u540E\u4FDD\u5B58\u3002",
    taskList: "\u4E0A\u67B6\u4EFB\u52A1",
    searchPlaceholder: "\u641C\u7D22\u539F\u59CB\u6587\u6848",
    noTasks: "\u8FD8\u6CA1\u6709\u4E0A\u67B6\u4EFB\u52A1",
    noTasksHint: "\u65B0\u5EFA\u4EFB\u52A1\u5E76\u7C98\u8D34\u4F9B\u8D27\u6587\u6848\u5373\u53EF\u5F00\u59CB\u3002",
    newTask: "\u65B0\u5EFA\u4EFB\u52A1",
    sourceCopy: "\u539F\u59CB\u6587\u6848",
    emptySource: "\u6682\u65E0\u539F\u59CB\u6587\u6848\u3002",
    untitledTask: "\u672A\u547D\u540D\u4EFB\u52A1",
    createTitle: "\u65B0\u5EFA\u4E0A\u67B6\u4EFB\u52A1",
    createDescription: "\u7C98\u8D34\u4F9B\u8D27\u6587\u6848\u3002\u4EFB\u52A1\u521B\u5EFA\u540E\u5373\u53EF\u8FD0\u884C AI \u62BD\u53D6\u3002",
    pastePlaceholder: "\u5728\u6B64\u7C98\u8D34\u4F9B\u8D27\u6587\u6848\u2026\u2026",
    create: "\u521B\u5EFA",
    cancel: "\u53D6\u6D88",
    creating: "\u521B\u5EFA\u4E2D\u2026\u2026",
    runParse: "AI \u89E3\u6790",
    retryParse: "\u91CD\u8BD5",
    saveDraft: "\u4FDD\u5B58\u8349\u7A3F",
    saving: "\u4FDD\u5B58\u4E2D\u2026\u2026",
    parsing: "AI \u89E3\u6790\u4E2D\u2026\u2026",
    parseRunningHint: "\u6A21\u578B\u8C03\u7528\u53EF\u80FD\u9700\u8981\u8FD1\u4E00\u5206\u949F\uFF0C\u8FD4\u56DE\u540E\u672C\u9762\u677F\u4F1A\u81EA\u52A8\u5237\u65B0\u3002",
    statusDraft: "\u5F85\u89E3\u6790",
    statusParsing: "\u89E3\u6790\u4E2D",
    statusReview: "\u5F85\u786E\u8BA4",
    statusSaved: "\u5DF2\u4FDD\u5B58",
    statusFailed: "\u5931\u8D25",
    attemptPrefix: "\u7B2C",
    fieldTitle: "\u6807\u9898",
    fieldDescription: "\u63CF\u8FF0",
    fieldPrice: "\u4EF7\u683C",
    fieldCurrency: "\u5E01\u79CD",
    fieldCategory: "\u7C7B\u76EE",
    fieldAttributes: "\u7C7B\u76EE\u5C5E\u6027",
    fieldSpecs: "\u89C4\u683C",
    titlePlaceholder: "\u5546\u54C1\u6807\u9898",
    descriptionPlaceholder: "\u57FA\u4E8E\u539F\u6587\u7684\u4E8B\u5B9E\u6027\u63CF\u8FF0",
    pricePlaceholder: "\u4F8B\u5982 99.00",
    currencyPlaceholder: "CNY",
    categoryPlaceholder: "\u4F8B\u5982 \u865A\u62DF\u5546\u54C1",
    attrKeyPlaceholder: "\u5C5E\u6027\u540D",
    attrValuePlaceholder: "\u5C5E\u6027\u503C",
    addAttribute: "\u6DFB\u52A0\u5C5E\u6027",
    addSpec: "\u6DFB\u52A0\u89C4\u683C",
    specName: "\u89C4\u683C\u540D",
    specPrice: "\u4EF7\u683C",
    specStock: "\u5E93\u5B58",
    remove: "\u5220\u9664",
    flagMissing: "\u7F3A\u5931",
    flagUncertain: "\u5F85\u786E\u8BA4",
    flagAi: "AI \u8865\u5168",
    flagsHint: "\u6807\u8BB0\u4E3A\u300C\u7F3A\u5931\u300D\u6216\u300C\u5F85\u786E\u8BA4\u300D\u7684\u5B57\u6BB5\u9700\u8981\u8FD0\u8425\u4EBA\u5DE5\u786E\u8BA4\u3002",
    evidenceLabel: "\u4F9D\u636E",
    evidenceHint: "\u70B9\u51FB\u53EF\u5728\u539F\u6587\u4E2D\u5B9A\u4F4D\u8FD9\u6BB5\u5F15\u7528",
    evidencePaneHint: "\u9AD8\u4EAE\u6587\u5B57\u4E3A AI \u62BD\u53D6\u4F9D\u636E",
    saveConfirmTitle: "\u8FD8\u6709\u5B57\u6BB5\u5F85\u786E\u8BA4",
    saveConfirmBody: "\u4EE5\u4E0B\u5B57\u6BB5\u4ECD\u6807\u8BB0\u4E3A\u300C\u7F3A\u5931\u300D\u6216\u300C\u5F85\u786E\u8BA4\u300D\u3002\u4FDD\u5B58\u540E\u6807\u8BB0\u4F1A\u4FDD\u7559\uFF0C\u65B9\u4FBF\u540E\u7EED\u7EE7\u7EED\u6838\u5BF9\u3002",
    saveConfirmContinue: "\u4ECD\u7136\u4FDD\u5B58",
    saveConfirmBack: "\u8FD4\u56DE\u6838\u5BF9",
    batchParse: "\u6279\u91CF\u89E3\u6790",
    batchParsing: "\u89E3\u6790\u4E2D",
    batchParseNone: "\u6CA1\u6709\u5F85\u89E3\u6790\u7684\u4EFB\u52A1\uFF08\u4EC5\u5904\u7406\u5F85\u89E3\u6790\u548C\u5931\u8D25\u72B6\u6001\uFF09\u3002",
    batchParseHint: "\u5C06\u9010\u6761\u89E3\u6790\u5F53\u524D\u5217\u8868\u4E2D\u7684\u5F85\u89E3\u6790/\u5931\u8D25\u4EFB\u52A1\uFF08\u6700\u591A 20 \u6761\uFF09\uFF0C\u5355\u6761\u5931\u8D25\u4E0D\u4F1A\u4E2D\u65AD\u5176\u4F59\u4EFB\u52A1\u3002",
    batchParseDone: "\u6279\u91CF\u89E3\u6790\u5B8C\u6210\uFF1A\u6210\u529F {ok} \u6761\uFF0C\u5931\u8D25 {failed} \u6761\u3002",
    missingTitle: "\u8FD8\u6709\u5FC5\u586B\u5B57\u6BB5\u672A\u8865\u5168",
    missingHint: "\u8349\u7A3F\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8865\u5168\u9AD8\u4EAE\u5B57\u6BB5\u540E\u518D\u4FDD\u5B58\u3002",
    errorTitle: "AI \u89E3\u6790\u5931\u8D25",
    retryHint: "\u53EF\u5728\u540C\u4E00\u4EFB\u52A1\u5185\u91CD\u8BD5\uFF0C\u4E0D\u4F1A\u65B0\u5EFA\u4EFB\u52A1\u3002",
    noDraft: "\u8FD8\u6CA1\u6709\u8349\u7A3F\uFF0C\u8BF7\u5148\u8FD0\u884C AI \u89E3\u6790\u3002",
    saveSuccess: "\u8349\u7A3F\u5DF2\u4FDD\u5B58\u3002",
    parseSuccess: "AI \u89E3\u6790\u5B8C\u6210\u3002",
    parseAlready: "\u8BE5\u4EFB\u52A1\u5DF2\u6709\u89E3\u6790\u7ED3\u679C\uFF0C\u672A\u91CD\u590D\u8C03\u7528 AI\u3002",
    createSuccess: "\u4EFB\u52A1\u5DF2\u521B\u5EFA\u3002",
    failureTitle: "\u64CD\u4F5C\u5931\u8D25",
    saveHint: "\u4FDD\u5B58\u524D\u8BF7\u6838\u5BF9 AI \u8865\u5168\u7684\u5B57\u6BB5\u3002",
    currentTask: "\u5F53\u524D\u4EFB\u52A1",
    loading: "\u52A0\u8F7D\u4E2D\u2026\u2026",
    emptyDraftTitle: "\u7B49\u5F85 AI \u89E3\u6790",
    emptyDraftHint: "\u8FD0\u884C AI \u89E3\u6790\uFF0C\u4ECE\u539F\u59CB\u6587\u6848\u751F\u6210\u7ED3\u6784\u5316\u8349\u7A3F\u3002",
    aiNote: "\u8BE5\u8349\u7A3F\u7531 AI \u751F\u6210\uFF0C\u4FDD\u5B58\u524D\u5FC5\u987B\u7531\u8FD0\u8425\u4EBA\u5DE5\u6838\u5BF9\u3002",
    operatorReview: "\u8FD0\u8425\u5DF2\u6838\u5BF9",
    statusLabel: "\u72B6\u6001",
    noRuns: "\u6682\u65E0 AI \u8FD0\u884C\u8BB0\u5F55",
    runHistory: "AI \u8FD0\u884C\u8BB0\u5F55",
    sourceLabel: "\u4F9B\u8D27\u539F\u6587",
    draftLabel: "\u7ED3\u6784\u5316\u8349\u7A3F",
    loadFailed: "\u5DE5\u4F5C\u53F0\u6570\u636E\u52A0\u8F7D\u5931\u8D25\u3002",
    batchHint: "\u9700\u8981\u4E00\u6B21\u521B\u5EFA\u591A\u6761\u4EFB\u52A1\u65F6\uFF0C\u7528\u5355\u72EC\u4E00\u884C --- \u5206\u9694\u6BCF\u6761\u4F9B\u8D27\u6587\u6848\u3002",
    batchCreated: "\u5DF2\u521B\u5EFA\u4EFB\u52A1\u6570\uFF1A",
    errAiNotConfigured: "\u5F53\u524D\u5DE5\u4F5C\u7A7A\u95F4\u672A\u542F\u7528\u9ED8\u8BA4\u5BF9\u8BDD\u6A21\u578B\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u914D\u7F6E\u3002",
    errAiTimeout: "\u6A21\u578B\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u5728\u540C\u4E00\u4E2A\u4EFB\u52A1\u5185\u91CD\u8BD5\u3002",
    errAiInvalidJson: "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u5408\u6CD5\u7684 JSON\uFF0C\u8BF7\u5728\u540C\u4E00\u4E2A\u4EFB\u52A1\u5185\u91CD\u8BD5\u3002",
    errAiInvalidOutput: "\u6A21\u578B\u8FD4\u56DE\u7684\u5B57\u6BB5\u4E0D\u7B26\u5408\u8981\u6C42\uFF0C\u8BF7\u5728\u540C\u4E00\u4E2A\u4EFB\u52A1\u5185\u91CD\u8BD5\u3002",
    errAiCallFailed: "\u6A21\u578B\u8C03\u7528\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u914D\u7F6E\u6216\u91CD\u8BD5\u3002",
    errAiSimulated: "\u6F14\u793A\u6A21\u5F0F\uFF1A\u5DF2\u5F3A\u5236\u6A21\u62DF\u6A21\u578B\u670D\u52A1\u6545\u969C\uFF0C\u8BF7\u5728\u540C\u4E00\u4EFB\u52A1\u5185\u91CD\u8BD5\u3002",
    errAiInterrupted: "\u4E0A\u4E00\u6B21\u89E3\u6790\u672A\u6B63\u5E38\u7ED3\u675F\uFF0C\u8BF7\u5728\u540C\u4E00\u4E2A\u4EFB\u52A1\u5185\u91CD\u8BD5\u3002",
    errBusyParsing: "\u8BE5\u4EFB\u52A1\u6B63\u5728\u89E3\u6790\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u5237\u65B0\u67E5\u770B\u7ED3\u679C\u3002",
    errTaskNotFound: "\u672A\u627E\u5230\u8BE5\u4E0A\u67B6\u4EFB\u52A1\uFF0C\u6216\u4F60\u65E0\u6743\u8BBF\u95EE\u3002",
    errSourceRequired: "\u8BF7\u5148\u7C98\u8D34\u9700\u8981\u89E3\u6790\u7684\u4F9B\u8D27\u6587\u6848\u3002",
    errSourceTooLong: "\u4F9B\u8D27\u6587\u6848\u8FC7\u957F\uFF0C\u8BF7\u63A7\u5236\u5728 20000 \u5B57\u4EE5\u5185\u3002",
    errDraftRequired: "\u8BF7\u81F3\u5C11\u586B\u5199\u6807\u9898\u3001\u63CF\u8FF0\u6216\u4EF7\u683C\u4E2D\u7684\u4E00\u9879\u540E\u518D\u4FDD\u5B58\u3002",
    errBatchTooLarge: "\u4E00\u6B21\u6700\u591A\u521B\u5EFA 20 \u6761\u4E0A\u67B6\u4EFB\u52A1\u3002",
    errUnknown: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
  };

  // src/lib/remote-components/listing_assistant__remote/src/i18n.ts
  var i18n = x(
    {
      en: en_default,
      "zh-Hans": zh_Hans_default
    },
    "zh-Hans"
  );
  function messages(locale) {
    i18n.setLocale(locale);
    document.documentElement.lang = i18n.getLocale();
    return Object.fromEntries(Object.keys(en_default).map((key) => [key, i18n.t(key)]));
  }

  // src/lib/remote-components/listing_assistant__remote/src/styles.ts
  var STYLE_ID = "listing-assistant-workbench-styles";
  var CSS2 = `
.la-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--background, #ffffff);
  color: var(--foreground, #0f172a);
  font-size: 14px;
}
.la-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.la-title { font-size: 16px; font-weight: 600; margin: 0; }
.la-subtitle { margin: 4px 0 0; font-size: 12px; color: var(--muted-foreground, #64748b); }
.la-body { display: flex; flex: 1; min-height: 0; }
.la-sidebar {
  width: 300px;
  flex: 0 0 300px;
  border-right: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.la-sidebar-head { padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--border, #e2e8f0); }
.la-sidebar-title { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--muted-foreground, #64748b); }
.la-task-list { overflow: auto; flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.la-task {
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 10px;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: inherit;
}
.la-task:hover { background: var(--accent, #f1f5f9); }
.la-task.la-task--active { border-color: var(--primary, #2563eb); background: var(--accent, #f1f5f9); }
.la-task-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.la-task-preview { font-size: 11px; color: var(--muted-foreground, #64748b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.la-task-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: auto; }
.la-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted-foreground, #64748b); padding: 48px 24px; text-align: center; }
.la-empty h3 { margin: 0; font-size: 15px; color: var(--foreground, #0f172a); }
.la-empty p { margin: 0; font-size: 13px; }
.la-notice { margin: 12px 16px 0; padding: 10px 12px; border-radius: 8px; font-size: 13px; border: 1px solid transparent; }
.la-notice--error { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.la-notice--info { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.la-detail { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.la-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border, #e2e8f0); flex-wrap: wrap; }
.la-detail-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.la-detail-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.la-detail-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.la-error { margin: 12px 16px 0; padding: 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 13px; }
.la-error strong { display: block; margin-bottom: 4px; }
.la-error p { margin: 0 0 4px; white-space: pre-wrap; }
.la-error span { color: #b91c1c; font-size: 12px; }
.la-split { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 0; flex: 1; min-height: 0; }
.la-pane { min-width: 0; display: flex; flex-direction: column; }
.la-pane--source { border-right: 1px solid var(--border, #e2e8f0); background: var(--muted, #f8fafc); }
.la-pane-head { padding: 12px 16px 0; font-size: 12px; font-weight: 600; color: var(--muted-foreground, #64748b); }
.la-source-text { margin: 8px 16px 16px; padding: 12px; border-radius: 8px; background: var(--background, #fff); border: 1px solid var(--border, #e2e8f0); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; overflow: auto; flex: 1; min-height: 220px; }
.la-form { padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.la-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.la-field { display: flex; flex-direction: column; gap: 6px; }
.la-label { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; color: var(--foreground, #0f172a); }
.la-field--missing .la-label { color: #b45309; }
.la-field--uncertain .la-label { color: #1d4ed8; }
.la-field--missing .la-control { border-color: #f59e0b; box-shadow: 0 0 0 1px #fde68a; border-radius: 8px; }
.la-field--uncertain .la-control { border-color: #60a5fa; box-shadow: 0 0 0 1px #bfdbfe; border-radius: 8px; }
.la-flag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; border: 1px solid transparent; }
.la-flag--missing { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.la-flag--uncertain { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.la-flag--ai { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.la-flags-hint { font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-attr-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; }
.la-inline-add { align-self: flex-start; }
.la-note { font-size: 11px; color: var(--muted-foreground, #64748b); }
.la-runs { margin-top: 4px; border-top: 1px dashed var(--border, #e2e8f0); padding-top: 10px; font-size: 11px; color: var(--muted-foreground, #64748b); display: flex; flex-direction: column; gap: 4px; }
.la-status--draft { color: #475569; background: #f1f5f9; border-color: #e2e8f0; }
.la-status--parsing { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.la-status--review { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.la-status--saved { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.la-status--failed { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.la-dialog-body { display: flex; flex-direction: column; gap: 8px; }
.la-dialog-textarea { min-height: 220px; }
.la-evidence-hint { margin-left: 6px; font-weight: 400; color: var(--muted-foreground, #64748b); }
.la-evidence {
  background: #fef3c7;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
  transition: background 0.15s ease;
}
.la-evidence--active { background: #fbbf24; box-shadow: 0 0 0 2px #f59e0b; }
.la-evidence-note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px dashed var(--border, #e2e8f0);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground, #64748b);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.la-evidence-note:hover { border-color: #f59e0b; background: #fffbeb; }
.la-evidence-note--active { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
.la-evidence-tag {
  flex: 0 0 auto;
  font-weight: 600;
  color: #b45309;
}
.la-evidence-quote {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.la-warning-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.la-warning-list li { display: flex; align-items: center; gap: 8px; }
.la-batch-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--border, #e2e8f0);
  overflow: hidden;
}
.la-batch-bar span { display: block; height: 100%; background: var(--primary, #2563eb); transition: width 0.2s ease; }
@media (max-width: 900px) {
  .la-split { grid-template-columns: 1fr; }
  .la-pane--source { border-right: 0; border-bottom: 1px solid var(--border, #e2e8f0); }
  .la-sidebar { width: 220px; flex-basis: 220px; }
}
`;
  function injectStyles2() {
    if (document.getElementById(STYLE_ID)) return;
    const element = document.createElement("style");
    element.id = STYLE_ID;
    element.textContent = CSS2;
    document.head.appendChild(element);
  }

  // src/lib/remote-components/listing_assistant__remote/src/evidence.ts
  var EVIDENCE_ORDER = ["title", "description", "price", "category", "specs"];
  function sourceSegments(sourceText, evidence) {
    if (!sourceText) return [];
    if (!evidence) return [{ text: sourceText }];
    const spans = [];
    for (const field of EVIDENCE_ORDER) {
      const quote = evidence[field];
      if (!quote) continue;
      const start = sourceText.indexOf(quote);
      if (start < 0) continue;
      spans.push({ start, end: start + quote.length, field });
    }
    spans.sort((a2, b) => a2.start - b.start || b.end - a2.end);
    const selected = [];
    for (const span of spans) {
      if (selected.some((other) => span.start < other.end && other.start < span.end)) continue;
      selected.push(span);
    }
    const segments = [];
    let cursor = 0;
    for (const span of selected) {
      if (span.start > cursor) segments.push({ text: sourceText.slice(cursor, span.start) });
      segments.push({ text: sourceText.slice(span.start, span.end), field: span.field });
      cursor = span.end;
    }
    if (cursor < sourceText.length) segments.push({ text: sourceText.slice(cursor) });
    return segments;
  }

  // src/lib/remote-components/listing_assistant__remote/src/components/DraftForm.tsx
  function DraftForm({ t: t2, detail, form, activeEvidence, onChange, onEvidenceFocus }) {
    const flags = detail.draft?.fieldFlags ?? {};
    const evidence = detail.draft?.evidence ?? {};
    const renderEvidence = (field) => /* @__PURE__ */ React.createElement(
      EvidenceNote,
      {
        t: t2,
        field,
        quote: evidence[field],
        active: activeEvidence === field,
        onFocus: onEvidenceFocus
      }
    );
    const fieldClass = (name) => `la-field${flags[name] ? ` la-field--${flags[name]}` : ""}`;
    const renderFlag = (name) => {
      const flag = flags[name];
      if (!flag) return null;
      if (flag === "missing") return /* @__PURE__ */ React.createElement("span", { className: "la-flag la-flag--missing" }, t2.flagMissing);
      if (flag === "uncertain") return /* @__PURE__ */ React.createElement("span", { className: "la-flag la-flag--uncertain" }, t2.flagUncertain);
      return /* @__PURE__ */ React.createElement("span", { className: "la-flag la-flag--ai" }, t2.flagAi);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "la-form" }, /* @__PURE__ */ React.createElement("p", { className: "la-note" }, t2.flagsHint), /* @__PURE__ */ React.createElement("div", { className: fieldClass("title") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label", htmlFor: "la-title" }, t2.fieldTitle, renderFlag("title")), /* @__PURE__ */ React.createElement("div", { className: "la-control" }, /* @__PURE__ */ React.createElement(
      J2,
      {
        id: "la-title",
        value: form.title,
        placeholder: t2.titlePlaceholder,
        onChange: (event) => onChange({ title: event.target.value })
      }
    )), renderEvidence("title")), /* @__PURE__ */ React.createElement("div", { className: fieldClass("description") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label", htmlFor: "la-description" }, t2.fieldDescription, renderFlag("description")), /* @__PURE__ */ React.createElement("div", { className: "la-control" }, /* @__PURE__ */ React.createElement(
      ye2,
      {
        id: "la-description",
        value: form.description,
        placeholder: t2.descriptionPlaceholder,
        rows: 5,
        onChange: (event) => onChange({ description: event.target.value })
      }
    )), renderEvidence("description")), /* @__PURE__ */ React.createElement("div", { className: "la-grid-2" }, /* @__PURE__ */ React.createElement("div", { className: fieldClass("price") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label", htmlFor: "la-price" }, t2.fieldPrice, renderFlag("price")), /* @__PURE__ */ React.createElement("div", { className: "la-control" }, /* @__PURE__ */ React.createElement(
      J2,
      {
        id: "la-price",
        value: form.price,
        placeholder: t2.pricePlaceholder,
        onChange: (event) => onChange({ price: event.target.value })
      }
    )), renderEvidence("price")), /* @__PURE__ */ React.createElement("div", { className: "la-field" }, /* @__PURE__ */ React.createElement(_a, { className: "la-label", htmlFor: "la-currency" }, t2.fieldCurrency), /* @__PURE__ */ React.createElement(
      J2,
      {
        id: "la-currency",
        value: form.currency,
        placeholder: t2.currencyPlaceholder,
        onChange: (event) => onChange({ currency: event.target.value })
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: fieldClass("category") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label", htmlFor: "la-category" }, t2.fieldCategory, renderFlag("category")), /* @__PURE__ */ React.createElement("div", { className: "la-control" }, /* @__PURE__ */ React.createElement(
      J2,
      {
        id: "la-category",
        value: form.category,
        placeholder: t2.categoryPlaceholder,
        onChange: (event) => onChange({ category: event.target.value })
      }
    )), renderEvidence("category")), /* @__PURE__ */ React.createElement("div", { className: fieldClass("attributes") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label" }, t2.fieldAttributes), form.attributes.map((pair, index) => /* @__PURE__ */ React.createElement("div", { className: "la-attr-row", key: `attr-${index}` }, /* @__PURE__ */ React.createElement(
      J2,
      {
        value: pair.key,
        placeholder: t2.attrKeyPlaceholder,
        onChange: (event) => {
          const next = [...form.attributes];
          next[index] = { ...pair, key: event.target.value };
          onChange({ attributes: next });
        }
      }
    ), /* @__PURE__ */ React.createElement(
      J2,
      {
        value: pair.value,
        placeholder: t2.attrValuePlaceholder,
        onChange: (event) => {
          const next = [...form.attributes];
          next[index] = { ...pair, value: event.target.value };
          onChange({ attributes: next });
        }
      }
    ), /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: "ghost",
        onClick: () => onChange({ attributes: form.attributes.filter((_, i) => i !== index) })
      },
      t2.remove
    ))), /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: "outline",
        className: "la-inline-add",
        onClick: () => onChange({ attributes: [...form.attributes, { key: "", value: "" }] })
      },
      t2.addAttribute
    )), /* @__PURE__ */ React.createElement("div", { className: fieldClass("specs") }, /* @__PURE__ */ React.createElement(_a, { className: "la-label" }, t2.fieldSpecs, renderFlag("specs")), form.specs.length ? /* @__PURE__ */ React.createElement(kr, null, /* @__PURE__ */ React.createElement(Nr, null, /* @__PURE__ */ React.createElement(_r, null, /* @__PURE__ */ React.createElement(Tr, null, t2.specName), /* @__PURE__ */ React.createElement(Tr, null, t2.specPrice), /* @__PURE__ */ React.createElement(Tr, null, t2.specStock), /* @__PURE__ */ React.createElement(Tr, null))), /* @__PURE__ */ React.createElement(Cr, null, form.specs.map((spec, index) => /* @__PURE__ */ React.createElement(_r, { key: `spec-${index}` }, /* @__PURE__ */ React.createElement(Ir, null, /* @__PURE__ */ React.createElement(
      J2,
      {
        value: spec.name,
        onChange: (event) => {
          const next = [...form.specs];
          next[index] = { ...spec, name: event.target.value };
          onChange({ specs: next });
        }
      }
    )), /* @__PURE__ */ React.createElement(Ir, null, /* @__PURE__ */ React.createElement(
      J2,
      {
        value: spec.price,
        onChange: (event) => {
          const next = [...form.specs];
          next[index] = { ...spec, price: event.target.value };
          onChange({ specs: next });
        }
      }
    )), /* @__PURE__ */ React.createElement(Ir, null, /* @__PURE__ */ React.createElement(
      J2,
      {
        value: spec.stock,
        onChange: (event) => {
          const next = [...form.specs];
          next[index] = { ...spec, stock: event.target.value };
          onChange({ specs: next });
        }
      }
    )), /* @__PURE__ */ React.createElement(Ir, null, /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: "ghost",
        onClick: () => onChange({ specs: form.specs.filter((_, i) => i !== index) })
      },
      t2.remove
    )))))) : null, /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: "outline",
        className: "la-inline-add",
        onClick: () => onChange({ specs: [...form.specs, { name: "", price: "", stock: "" }] })
      },
      t2.addSpec
    ), renderEvidence("specs")), /* @__PURE__ */ React.createElement("p", { className: "la-note" }, t2.saveHint), /* @__PURE__ */ React.createElement("p", { className: "la-note" }, t2.aiNote), detail.runs.length ? /* @__PURE__ */ React.createElement("div", { className: "la-runs" }, /* @__PURE__ */ React.createElement("strong", null, t2.runHistory), detail.runs.slice(0, 5).map((run) => /* @__PURE__ */ React.createElement("span", { key: run.attempt }, `${t2.attemptPrefix} ${run.attempt} \xB7 ${run.status}${run.errorMessage ? ` \xB7 ${run.errorMessage}` : ""}`))) : null);
  }
  function EvidenceNote({ t: t2, field, quote, active, onFocus }) {
    if (!quote) return null;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: `la-evidence-note${active ? " la-evidence-note--active" : ""}`,
        onClick: () => onFocus(field),
        title: t2.evidenceHint
      },
      /* @__PURE__ */ React.createElement("span", { className: "la-evidence-tag" }, t2.evidenceLabel),
      /* @__PURE__ */ React.createElement("span", { className: "la-evidence-quote" }, quote)
    );
  }

  // src/lib/remote-components/listing_assistant__remote/src/components/NewTaskDialog.tsx
  function NewTaskDialog({ t: t2, open, value, error, creating, onOpenChange, onChange, onCreate }) {
    return /* @__PURE__ */ React.createElement(me, { open, onOpenChange }, /* @__PURE__ */ React.createElement(he, null, /* @__PURE__ */ React.createElement(xe2, null, /* @__PURE__ */ React.createElement(we2, null, t2.createTitle), /* @__PURE__ */ React.createElement(ze2, null, t2.createDescription)), /* @__PURE__ */ React.createElement("div", { className: "la-dialog-body" }, /* @__PURE__ */ React.createElement("p", { className: "la-note" }, t2.batchHint), /* @__PURE__ */ React.createElement(
      ye2,
      {
        className: "la-dialog-textarea",
        value,
        placeholder: t2.pastePlaceholder,
        onChange: (event) => onChange(event.target.value)
      }
    ), error ? /* @__PURE__ */ React.createElement("p", { className: "la-notice la-notice--error", style: { margin: 0 } }, error) : null), /* @__PURE__ */ React.createElement(Pt2, null, /* @__PURE__ */ React.createElement(C3, { variant: "outline", onClick: () => onOpenChange(false), disabled: creating }, t2.cancel), /* @__PURE__ */ React.createElement(C3, { onClick: onCreate, disabled: creating }, creating ? t2.creating : t2.create))));
  }

  // src/lib/remote-components/listing_assistant__remote/src/workbench-utils.ts
  var FIELD_LABEL = {
    title: "fieldTitle",
    description: "fieldDescription",
    price: "fieldPrice",
    category: "fieldCategory",
    specs: "fieldSpecs"
  };
  var STATUS_LABEL = {
    draft: "statusDraft",
    parsing: "statusParsing",
    review: "statusReview",
    saved: "statusSaved",
    failed: "statusFailed"
  };
  function emptyForm() {
    return { title: "", description: "", price: "", currency: "CNY", category: "", attributes: [], specs: [] };
  }
  function formFromDetail(detail) {
    const draft = detail?.draft;
    if (!draft) return emptyForm();
    return {
      title: draft.title ?? "",
      description: draft.description ?? "",
      price: draft.price ?? "",
      currency: draft.currency ?? "CNY",
      category: draft.category ?? "",
      attributes: Object.entries(draft.attributes ?? {}).map(([key, value]) => ({
        key,
        value: value === null || value === void 0 ? "" : String(value)
      })),
      specs: draft.specs.map((spec) => ({
        name: spec.name,
        price: spec.price ?? "",
        stock: spec.stock === null || spec.stock === void 0 ? "" : String(spec.stock)
      }))
    };
  }
  function openReviewFlags(detail, form) {
    const flags = detail.draft?.fieldFlags ?? {};
    const filled = {
      title: Boolean(form.title.trim()),
      description: Boolean(form.description.trim()),
      price: Boolean(form.price.trim()),
      category: Boolean(form.category.trim()),
      specs: form.specs.some((spec) => Boolean(spec.name.trim()))
    };
    return Object.keys(FIELD_LABEL).filter((field) => {
      const flag = flags[field];
      return (flag === "missing" || flag === "uncertain") && !filled[field];
    }).map((field) => ({ field, flag: flags[field] }));
  }
  function pendingParseTasks(tasks) {
    return tasks.filter((task) => task.status === "draft" || task.status === "failed").slice(0, 20);
  }
  function normalizeLocale(locale) {
    return locale && locale.toLowerCase().startsWith("zh") ? "zh-Hans" : "en";
  }
  function normalizeData(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const tasks = value.items ?? value.tasks;
    const selectedTask = value.item ?? value.selectedTask;
    return {
      tasks: Array.isArray(tasks) ? tasks : [],
      selectedTask: selectedTask ?? null
    };
  }
  function errorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  var ERROR_KEYS = {
    AI_NOT_CONFIGURED: "errAiNotConfigured",
    AI_TIMEOUT: "errAiTimeout",
    AI_INVALID_JSON: "errAiInvalidJson",
    AI_INVALID_OUTPUT: "errAiInvalidOutput",
    AI_CALL_FAILED: "errAiCallFailed",
    AI_SIMULATED_FAILURE: "errAiSimulated",
    AI_RUN_INTERRUPTED: "errAiInterrupted",
    BUSY_PARSING: "errBusyParsing",
    TASK_NOT_FOUND: "errTaskNotFound",
    SOURCE_REQUIRED: "errSourceRequired",
    SOURCE_TOO_LONG: "errSourceTooLong",
    DRAFT_REQUIRED: "errDraftRequired",
    BATCH_TOO_LARGE: "errBatchTooLarge"
  };
  function errorText(t2, code, fallback) {
    const key = code ? ERROR_KEYS[code] : void 0;
    if (key) return t2[key];
    return fallback || t2.errUnknown;
  }

  // src/lib/remote-components/listing_assistant__remote/src/components/TaskList.tsx
  function TaskList({
    t: t2,
    tasks,
    selectedId,
    search,
    batch,
    pendingCount,
    isBusy,
    onSearchChange,
    onSearchSubmit,
    onBatchParse,
    onSelect
  }) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "la-sidebar-head" }, /* @__PURE__ */ React.createElement("div", { className: "la-sidebar-title" }, /* @__PURE__ */ React.createElement("span", null, t2.taskList), /* @__PURE__ */ React.createElement("span", null, tasks.length)), /* @__PURE__ */ React.createElement(
      J2,
      {
        value: search,
        placeholder: t2.searchPlaceholder,
        onChange: (event) => onSearchChange(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") onSearchSubmit();
        }
      }
    ), /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: "outline",
        onClick: onBatchParse,
        disabled: isBusy || !batch && pendingCount === 0,
        title: t2.batchParseHint
      },
      batch ? `${t2.batchParsing} ${batch.done}/${batch.total}` : `${t2.batchParse} (${pendingCount})`
    ), batch ? /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "la-batch-bar",
        role: "progressbar",
        "aria-valuemin": 0,
        "aria-valuemax": batch.total,
        "aria-valuenow": batch.done
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: `${batch.total ? Math.round(batch.done / batch.total * 100) : 0}%` } })
    ) : null), /* @__PURE__ */ React.createElement("div", { className: "la-task-list" }, tasks.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "la-empty", style: { padding: "24px 8px" } }, /* @__PURE__ */ React.createElement("h3", null, t2.noTasks), /* @__PURE__ */ React.createElement("p", null, t2.noTasksHint)) : tasks.map((task) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: task.id,
        className: `la-task${task.id === selectedId ? " la-task--active" : ""}`,
        onClick: () => onSelect(task.id)
      },
      /* @__PURE__ */ React.createElement("span", { className: "la-task-title" }, task.title || t2.untitledTask),
      /* @__PURE__ */ React.createElement("span", { className: "la-task-preview" }, task.sourcePreview),
      /* @__PURE__ */ React.createElement("span", { className: "la-task-meta" }, /* @__PURE__ */ React.createElement(wt2, { variant: "outline", className: `la-status--${task.status}` }, t2[STATUS_LABEL[task.status]]), task.price ? /* @__PURE__ */ React.createElement("span", null, task.price) : null, task.attemptCount ? /* @__PURE__ */ React.createElement("span", null, `${t2.attemptPrefix} ${task.attemptCount}`) : null)
    ))));
  }

  // src/lib/remote-components/listing_assistant__remote/src/main.tsx
  var { useEffect: useEffect2, useRef: useRef2, useState: useState2 } = React;
  function App() {
    const [t2, setT] = useState2(() => messages("zh-Hans"));
    const [locale, setLocale] = useState2("zh-Hans");
    const [data, setData] = useState2({ tasks: [], selectedTask: null });
    const [selectedId, setSelectedId] = useState2(null);
    const [form, setForm] = useState2(emptyForm);
    const [search, setSearch] = useState2("");
    const [busy, setBusy] = useState2(null);
    const [notice, setNotice] = useState2(null);
    const [createOpen, setCreateOpen] = useState2(false);
    const [createText, setCreateText] = useState2("");
    const [createError, setCreateError] = useState2("");
    const [confirmOpen, setConfirmOpen] = useState2(false);
    const [warnings, setWarnings] = useState2([]);
    const [batch, setBatch] = useState2(null);
    const [activeEvidence, setActiveEvidence] = useState2(null);
    const selectedRef = useRef2(null);
    const searchRef = useRef2("");
    const localeRef = useRef2(locale);
    searchRef.current = search;
    localeRef.current = locale;
    const tRef = useRef2(t2);
    tRef.current = t2;
    useEffect2(() => {
      injectStyles2();
      const dispose = installBridgeListener({
        onInit: (next) => {
          const nextLocale = normalizeLocale(next.locale);
          setLocale(nextLocale);
          setT(messages(nextLocale));
          void loadData(void 0, false);
        },
        onHostEvent: () => {
          void loadData(selectedRef.current ?? void 0, true);
        }
      });
      window.parent.postMessage({ channel: "xpertai.remote_component", protocolVersion: 1, type: "ready" }, "*");
      return dispose;
    }, []);
    useEffect2(() => {
      const root2 = document.getElementById("root");
      if (!root2 || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root2);
      return () => observer.disconnect();
    }, []);
    useEffect2(() => {
      setTimeout(reportResize, 0);
    });
    useEffect2(() => {
      if (!activeEvidence) return;
      document.getElementById(`la-evidence-${activeEvidence}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [activeEvidence]);
    async function loadData(taskId, silent = false) {
      if (!silent) setBusy("load");
      try {
        const response = await requestData({
          page: 1,
          pageSize: 50,
          search: searchRef.current.trim() || void 0,
          parameters: { taskId: taskId || void 0 }
        });
        const next = normalizeData(unwrap(response));
        setData(next);
        if (next.selectedTask) {
          selectedRef.current = next.selectedTask.id;
          setSelectedId(next.selectedTask.id);
          setForm(formFromDetail(next.selectedTask));
        } else {
          selectedRef.current = null;
          setSelectedId(null);
          setForm(emptyForm());
        }
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error, tRef.current.loadFailed) });
      } finally {
        if (!silent) setBusy(null);
      }
    }
    function selectTask(taskId) {
      selectedRef.current = taskId;
      setSelectedId(taskId);
      setNotice(null);
      setActiveEvidence(null);
      void loadData(taskId);
    }
    function requestSave() {
      const detail2 = data.selectedTask;
      if (!detail2) return;
      const open = openReviewFlags(detail2, form);
      if (!open.length) {
        void saveDraft();
        return;
      }
      setWarnings(open);
      setConfirmOpen(true);
    }
    async function runBatchParse() {
      if (busy) return;
      const pending2 = pendingParseTasks(data.tasks);
      if (!pending2.length) {
        notify(tRef.current.batchParseNone);
        return;
      }
      const reload = selectedRef.current;
      setBusy("batch");
      setNotice({ kind: "info", text: tRef.current.batchParseHint });
      let ok = 0;
      let failed = 0;
      try {
        for (let index = 0; index < pending2.length; index += 1) {
          setBatch({ done: index, total: pending2.length, ok, failed });
          try {
            const response = await executeAction("parse_task", pending2[index].id, { taskId: pending2[index].id });
            const result = unwrap(response);
            if (result && result.success === false) failed += 1;
            else ok += 1;
          } catch {
            failed += 1;
          }
          await loadData(reload ?? void 0, true);
        }
        setBatch({ done: pending2.length, total: pending2.length, ok, failed });
      } finally {
        setBusy(null);
        setBatch(null);
        const summary = tRef.current.batchParseDone.replace("{ok}", String(ok)).replace("{failed}", String(failed));
        setNotice({ kind: failed ? "error" : "info", text: summary });
        notify(summary);
        await loadData(reload ?? void 0, true);
      }
    }
    async function runParse(retry) {
      const taskId = selectedRef.current;
      if (!taskId) return;
      setBusy("parse");
      setNotice(null);
      try {
        const response = await executeAction(retry ? "retry_parse" : "parse_task", taskId, { taskId });
        const result = unwrap(response);
        if (result && result.success === false) {
          const detail2 = result.data;
          setNotice({
            kind: "error",
            text: errorText(
              tRef.current,
              detail2?.errorCode,
              detail2?.errorMessage || resolveLocaleText(result.message, localeRef.current)
            )
          });
        } else {
          const outcome = result?.data?.outcome;
          notify(outcome === "already_parsed" ? tRef.current.parseAlready : tRef.current.parseSuccess);
        }
        await loadData(taskId, true);
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error, tRef.current.failureTitle) });
      } finally {
        setBusy(null);
      }
    }
    async function saveDraft() {
      const taskId = selectedRef.current;
      if (!taskId) return;
      setBusy("save");
      setNotice(null);
      try {
        const attributes = Object.fromEntries(
          form.attributes.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value.trim() || null])
        );
        const specs = form.specs.filter((spec) => spec.name.trim()).map((spec) => ({
          name: spec.name.trim(),
          price: spec.price.trim() || null,
          stock: spec.stock.trim() ? Number(spec.stock) : null
        }));
        const response = await executeAction("save_draft", taskId, {
          taskId,
          title: form.title,
          description: form.description,
          price: form.price,
          currency: form.currency,
          category: form.category,
          attributes,
          specs
        });
        const result = unwrap(response);
        if (result && result.success === false) {
          const data2 = result.data;
          setNotice({
            kind: "error",
            text: errorText(
              tRef.current,
              data2?.errorCode,
              data2?.errorMessage || resolveLocaleText(result.message, localeRef.current)
            )
          });
          return;
        }
        notify(tRef.current.saveSuccess);
        await loadData(taskId, true);
      } catch (error) {
        setNotice({ kind: "error", text: errorMessage(error, tRef.current.failureTitle) });
      } finally {
        setBusy(null);
      }
    }
    async function createTask() {
      const sourceText = createText.trim();
      if (!sourceText) {
        setCreateError(tRef.current.pastePlaceholder);
        return;
      }
      setBusy("create");
      setCreateError("");
      try {
        const isBatch = /(?:^|\n)\s*---\s*(?:\n|$)/.test(createText);
        const response = await executeAction(isBatch ? "create_task_batch" : "create_task", null, { sourceText });
        const result = unwrap(response);
        if (result && result.success === false) {
          const failure = result.data;
          setCreateError(
            errorText(
              tRef.current,
              failure?.errorCode,
              failure?.errorMessage || resolveLocaleText(result.message, localeRef.current)
            )
          );
          return;
        }
        const data2 = result?.data;
        const taskIds = Array.isArray(data2?.taskIds) ? data2.taskIds : [];
        const taskId = data2?.taskId ?? taskIds[0] ?? null;
        setCreateOpen(false);
        setCreateText("");
        notify(isBatch ? `${tRef.current.batchCreated} ${data2?.count ?? taskIds.length}` : tRef.current.createSuccess);
        selectedRef.current = taskId;
        if (taskId) setSelectedId(taskId);
        await loadData(taskId ?? void 0, true);
      } catch (error) {
        setCreateError(errorMessage(error, tRef.current.errUnknown));
      } finally {
        setBusy(null);
      }
    }
    const detail = data.selectedTask;
    const isBusy = busy !== null;
    return /* @__PURE__ */ React.createElement("div", { className: "la-root" }, /* @__PURE__ */ React.createElement("header", { className: "la-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "la-title" }, t2.appTitle), /* @__PURE__ */ React.createElement("p", { className: "la-subtitle" }, t2.appSubtitle)), /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        onClick: () => {
          setCreateError("");
          setCreateOpen(true);
        },
        disabled: isBusy
      },
      t2.newTask
    )), /* @__PURE__ */ React.createElement("div", { className: "la-body" }, /* @__PURE__ */ React.createElement("aside", { className: "la-sidebar" }, /* @__PURE__ */ React.createElement(
      TaskList,
      {
        t: t2,
        tasks: data.tasks,
        selectedId,
        search,
        batch,
        pendingCount: pendingParseTasks(data.tasks).length,
        isBusy,
        onSearchChange: setSearch,
        onSearchSubmit: () => void loadData(void 0),
        onBatchParse: () => void runBatchParse(),
        onSelect: selectTask
      }
    )), /* @__PURE__ */ React.createElement("main", { className: "la-main" }, notice ? /* @__PURE__ */ React.createElement("div", { className: `la-notice la-notice--${notice.kind}` }, notice.text) : null, !detail ? /* @__PURE__ */ React.createElement("div", { className: "la-empty" }, /* @__PURE__ */ React.createElement("h3", null, t2.noTasks), /* @__PURE__ */ React.createElement("p", null, t2.noTasksHint), /* @__PURE__ */ React.createElement(C3, { size: "sm", onClick: () => setCreateOpen(true), disabled: isBusy }, t2.newTask)) : /* @__PURE__ */ React.createElement(
      TaskDetailView,
      {
        t: t2,
        detail,
        form,
        busy,
        isBusy,
        activeEvidence,
        onFormChange: (patch) => setForm({ ...form, ...patch }),
        onEvidenceFocus: setActiveEvidence,
        onParse: runParse,
        onSave: requestSave
      }
    ))), /* @__PURE__ */ React.createElement(
      NewTaskDialog,
      {
        t: t2,
        open: createOpen,
        value: createText,
        error: createError,
        creating: busy === "create",
        onOpenChange: setCreateOpen,
        onChange: setCreateText,
        onCreate: () => void createTask()
      }
    ), /* @__PURE__ */ React.createElement(me, { open: confirmOpen, onOpenChange: setConfirmOpen }, /* @__PURE__ */ React.createElement(he, null, /* @__PURE__ */ React.createElement(xe2, null, /* @__PURE__ */ React.createElement(we2, null, t2.saveConfirmTitle), /* @__PURE__ */ React.createElement(ze2, null, t2.saveConfirmBody)), /* @__PURE__ */ React.createElement("ul", { className: "la-warning-list" }, warnings.map((warning) => /* @__PURE__ */ React.createElement("li", { key: warning.field }, /* @__PURE__ */ React.createElement("span", null, t2[FIELD_LABEL[warning.field]]), /* @__PURE__ */ React.createElement(wt2, { variant: "outline", className: `la-flag la-flag--${warning.flag}` }, warning.flag === "missing" ? t2.flagMissing : t2.flagUncertain)))), /* @__PURE__ */ React.createElement(Pt2, null, /* @__PURE__ */ React.createElement(C3, { variant: "outline", onClick: () => setConfirmOpen(false) }, t2.saveConfirmBack), /* @__PURE__ */ React.createElement(
      C3,
      {
        onClick: () => {
          setConfirmOpen(false);
          void saveDraft();
        }
      },
      t2.saveConfirmContinue
    )))));
  }
  function TaskDetailView({
    t: t2,
    detail,
    form,
    busy,
    isBusy,
    activeEvidence,
    onFormChange,
    onEvidenceFocus,
    onParse,
    onSave
  }) {
    return /* @__PURE__ */ React.createElement("div", { className: "la-detail" }, /* @__PURE__ */ React.createElement("div", { className: "la-detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "la-detail-head-left" }, /* @__PURE__ */ React.createElement(wt2, { variant: "outline", className: `la-status--${detail.status}` }, t2[STATUS_LABEL[detail.status]]), /* @__PURE__ */ React.createElement("span", { className: "la-detail-title" }, detail.draft?.title || t2.untitledTask), detail.attemptCount ? /* @__PURE__ */ React.createElement("span", { className: "la-note" }, `${t2.attemptPrefix} ${detail.attemptCount}`) : null), /* @__PURE__ */ React.createElement("div", { className: "la-detail-actions" }, /* @__PURE__ */ React.createElement(
      C3,
      {
        size: "sm",
        variant: detail.status === "failed" ? "outline" : "default",
        onClick: () => onParse(detail.status === "failed"),
        disabled: isBusy
      },
      busy === "parse" ? t2.parsing : detail.status === "failed" ? t2.retryParse : t2.runParse
    ), /* @__PURE__ */ React.createElement(C3, { size: "sm", variant: "outline", onClick: onSave, disabled: isBusy || !detail.draft }, busy === "save" ? t2.saving : t2.saveDraft))), busy === "parse" ? /* @__PURE__ */ React.createElement("div", { className: "la-notice la-notice--info" }, t2.parseRunningHint) : null, detail.status === "failed" ? /* @__PURE__ */ React.createElement("div", { className: "la-error" }, /* @__PURE__ */ React.createElement("strong", null, t2.errorTitle), /* @__PURE__ */ React.createElement("p", null, errorText(t2, detail.lastErrorCode, detail.lastErrorMessage || t2.failureTitle)), /* @__PURE__ */ React.createElement("span", null, t2.retryHint)) : null, /* @__PURE__ */ React.createElement("div", { className: "la-split" }, /* @__PURE__ */ React.createElement("section", { className: "la-pane la-pane--source" }, /* @__PURE__ */ React.createElement("div", { className: "la-pane-head" }, t2.sourceLabel, detail.draft?.evidence ? /* @__PURE__ */ React.createElement("span", { className: "la-evidence-hint" }, t2.evidencePaneHint) : null), /* @__PURE__ */ React.createElement("div", { className: "la-source-text" }, detail.sourceText ? sourceSegments(detail.sourceText, detail.draft?.evidence).map(
      (segment, index) => segment.field ? /* @__PURE__ */ React.createElement(
        "mark",
        {
          key: `${segment.field}-${index}`,
          id: `la-evidence-${segment.field}`,
          className: `la-evidence${activeEvidence === segment.field ? " la-evidence--active" : ""}`
        },
        segment.text
      ) : /* @__PURE__ */ React.createElement("span", { key: `text-${index}` }, segment.text)
    ) : t2.emptySource)), /* @__PURE__ */ React.createElement("section", { className: "la-pane" }, /* @__PURE__ */ React.createElement("div", { className: "la-pane-head" }, t2.draftLabel), !detail.draft ? /* @__PURE__ */ React.createElement("div", { className: "la-empty" }, /* @__PURE__ */ React.createElement("h3", null, t2.emptyDraftTitle), /* @__PURE__ */ React.createElement("p", null, t2.emptyDraftHint), /* @__PURE__ */ React.createElement(C3, { size: "sm", onClick: () => onParse(false), disabled: isBusy }, t2.runParse)) : /* @__PURE__ */ React.createElement(
      DraftForm,
      {
        t: t2,
        detail,
        form,
        activeEvidence,
        onChange: onFormChange,
        onEvidenceFocus
      }
    ))));
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(
      /* @__PURE__ */ React.createElement(T, { i18n }, /* @__PURE__ */ React.createElement(App, null))
    );
  } else {
    ReactDOM.render?.(
      /* @__PURE__ */ React.createElement(T, { i18n }, /* @__PURE__ */ React.createElement(App, null)),
      rootElement
    );
  }
})();
