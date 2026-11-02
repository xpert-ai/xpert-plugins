// Accessible, select-only combobox. The native select remains the typed data-control contract.
// Read theme.css and icons.js; inline all three in the saved HTML (no relative asset URLs).
function enhanceDashboardSelect(select) {
  const field = select.closest('.filter-field');
  const label = field.querySelector('label').textContent;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = select.id + '-trigger';
  button.className = 'filter-trigger';
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const copy = document.createElement('span');
  copy.className = 'filter-copy';
  const caption = document.createElement('span');
  caption.className = 'filter-caption';
  caption.textContent = label;
  const value = document.createElement('span');
  value.className = 'filter-value';
  copy.append(caption, value);
  button.append(copy, dashboardThemeIcon('chevronDown'));
  const menu = document.createElement('div');
  menu.id = select.id + '-listbox';
  menu.className = 'filter-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', label);
  button.setAttribute('aria-controls', menu.id);
  let active = 0, search = '', searchTimer;
  const options = [...select.options].map((option, index) => {
    const item = document.createElement('div');
    item.id = select.id + '-option-' + index;
    item.className = 'filter-option';
    item.setAttribute('role', 'option');
    const text = document.createElement('span');
    text.textContent = option.textContent;
    item.append(text, dashboardThemeIcon('check'));
    item.addEventListener('pointerdown', event => event.preventDefault());
    item.addEventListener('pointermove', () => highlight(index));
    item.addEventListener('click', () => choose(index));
    menu.append(item);
    return item;
  });
  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent ?? '';
    button.setAttribute('aria-label', label + '：' + value.textContent);
    button.disabled = select.disabled;
    options.forEach((item, index) => item.setAttribute('aria-selected', String(index === select.selectedIndex)));
    if (select.disabled) close(false);
  }
  function position() {
    if (menu.hidden) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 190), innerWidth - 16);
    menu.style.width = width + 'px';
    menu.style.left = Math.min(Math.max(8, rect.left), innerWidth - width - 8) + 'px';
    menu.style.maxHeight = Math.min(280, innerHeight - 16) + 'px';
    const height = menu.offsetHeight;
    const top = rect.bottom + 6 + height <= innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
    menu.style.top = top + 'px';
  }
  function highlight(index) {
    active = Math.max(0, Math.min(index, options.length - 1));
    options.forEach((item, i) => item.dataset.active = String(i === active));
    button.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({block: 'nearest'});
  }
  function open(index = select.selectedIndex) {
    if (button.disabled || !options.length) return;
    document.dispatchEvent(new CustomEvent('dashboard-select-open', {detail: button.id}));
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    position();
    highlight(index);
  }
  function close(restoreFocus = false) {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    if (restoreFocus && !button.disabled) button.focus();
  }
  function choose(index) {
    if (select.disabled || select.options[index].disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    sync();
    close(true);
    if (changed) select.dispatchEvent(new Event('change', {bubbles: true}));
  }
  button.addEventListener('click', () => menu.hidden ? open() : close());
  button.addEventListener('keydown', event => {
    const {key} = event;
    if (key === 'Tab') { close(); return; }
    if (key === 'Escape') { if (!menu.hidden) { event.preventDefault(); close(true); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (menu.hidden) open(key === 'Home' ? 0 : key === 'End' ? options.length - 1 : select.selectedIndex);
      else highlight(key === 'Home' ? 0 : key === 'End' ? options.length - 1 : active + (key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      menu.hidden ? open() : choose(active);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      search += key.toLocaleLowerCase();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { search = ''; }, 600);
      const index = [...select.options].findIndex(option => option.textContent.toLocaleLowerCase().startsWith(search));
      if (index >= 0) { event.preventDefault(); menu.hidden ? open(index) : highlight(index); }
    }
  });
  select.addEventListener('change', sync);
  document.addEventListener('pointerdown', event => { if (!field.contains(event.target) && !menu.contains(event.target)) close(); });
  document.addEventListener('dashboard-select-open', event => { if (event.detail !== button.id) close(); });
  document.addEventListener('focusin', event => { if (!field.contains(event.target) && !menu.contains(event.target)) close(); });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  new MutationObserver(sync).observe(select, {attributes: true, attributeFilter: ['disabled']});
  field.append(button);
  document.body.append(menu);
  field.classList.add('is-enhanced');
  select.hidden = true;
  sync();
  return {sync, close};
}
