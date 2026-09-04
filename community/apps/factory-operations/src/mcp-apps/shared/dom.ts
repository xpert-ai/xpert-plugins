export function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing MCP App element #${id}.`);
  return element as T;
}

export function replaceChildren(
  element: HTMLElement,
  children: Array<Node | string>
) {
  element.replaceChildren(
    ...children.map((child) =>
      typeof child === "string" ? document.createTextNode(child) : child
    )
  );
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
