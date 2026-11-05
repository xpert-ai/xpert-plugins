/** Injected into the isolated dashboard only; it never reads or executes query definitions. */
export const DASHBOARD_INSPECTION_RUNTIME = String.raw`
(() => {
  const key = '__INSPECTION_SESSION__', channel = 'live-dashboard.inspection';
  let enabled = false, standard = false, components = [], selected = null, overlay, previousFocus;
  const tabs = new Map();
  const post = (type, data = {}) => parent.postMessage({ channel, key, type, ...data }, '*');
  function outline(element) {
    selected = element;
    if (!element || !enabled) { if (overlay) overlay.hidden = true; return; }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2563eb;background:rgba(37,99,235,.06);box-sizing:border-box';
      document.documentElement.append(overlay);
    }
    const r = element.getBoundingClientRect();
    Object.assign(overlay.style, { left:r.left+'px', top:r.top+'px', width:r.width+'px', height:r.height+'px' });
    overlay.hidden = false;
  }
  function target(node) {
    for (let element = node instanceof Element ? node : null; element; element = element.parentElement) {
      if (components.some(c => c.elementId === (standard ? element.getAttribute('data-layout-block-id') : element.id))) return element;
    }
    return null;
  }
  function registerTargets() {
    if (!enabled) return;
    for (const component of components) {
      const element = standard ? [...document.querySelectorAll('[data-layout-block-id]')].find(e => e.getAttribute('data-layout-block-id') === component.elementId) : document.getElementById(component.elementId);
      if (element && !tabs.has(element)) { tabs.set(element, element.getAttribute('tabindex')); element.setAttribute('tabindex', '0'); }
    }
  }
  new MutationObserver(registerTargets).observe(document, { childList:true, subtree:true });
  function activate(value) {
    if (value === enabled) return;
    enabled = value;
    if (enabled) {
      previousFocus = document.activeElement;
      registerTargets();
    } else {
      outline(null);
      for (const [element, value] of tabs) value === null ? element.removeAttribute('tabindex') : element.setAttribute('tabindex', value);
      tabs.clear();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll:true });
    }
  }
  function choose(event) {
    if (!enabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const element = target(event.target), component = components.find(c => c.elementId === (standard ? element?.getAttribute('data-layout-block-id') : element?.id));
    outline(element);
    post('selected', { componentId:component?.id ?? null });
  }
  window.addEventListener('message', event => {
    const m = event.data;
    if (event.source !== parent || !m || m.channel !== channel || m.key !== key) return;
    if (m.type === 'mode') { components = m.components; standard = m.standard; activate(m.enabled === true); }
  });
  window.addEventListener('pointermove', e => { if (enabled) outline(target(e.target)); }, true);
  window.addEventListener('focusin', e => { if (enabled) outline(target(e.target)); }, true);
  for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) window.addEventListener(name, e => {
    if (enabled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('click', choose, true);
  window.addEventListener('keydown', e => {
    if (!enabled) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); activate(false); post('exit'); }
    else if (e.key === 'Enter' || e.key === ' ') choose(e);
  }, true);
  window.addEventListener('scroll', () => { if (enabled) outline(selected); }, true);
  window.addEventListener('resize', () => { if (enabled) outline(selected); });
  post('ready');
})();`
