export type Child = Node | string | undefined | false;

/** Crea un elemento con atributos y texto seguros (nunca interpreta HTML de los datos). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) el.setAttribute(key, value);
  for (const child of children) {
    if (child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Inserta un SVG estático. Solo para constantes del código, jamás para datos del repositorio. */
export function icon(svg: string, className: string): HTMLElement {
  const span = h('span', { class: className });
  span.innerHTML = svg;
  return span;
}
