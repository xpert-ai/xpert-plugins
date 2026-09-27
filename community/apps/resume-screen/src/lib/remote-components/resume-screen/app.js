"use strict";
var XpertResumeScreen = (() => {
  // src/lib/remote-components/resume-screen/src/react-shim.ts
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

  // src/lib/remote-components/resume-screen/src/react-dom-client-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createRoot = ReactDOMGlobal.createRoot;
  var hydrateRoot = ReactDOMGlobal.hydrateRoot;

  // src/lib/remote-components/resume-screen/src/main.tsx
  function App() {
    return react_shim_default.createElement("div", { style: { padding: 24 } }, "Resume Screening Workbench (bootstrap)");
  }
  var rootElement = document.getElementById("root");
  var container = rootElement ?? document.body;
  createRoot(container).render(react_shim_default.createElement(App));
})();
