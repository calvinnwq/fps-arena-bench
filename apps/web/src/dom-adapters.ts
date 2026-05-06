import type {
  ControlButtonElement,
  ControlRangeElement,
  ControlSelectElement,
  ControlTextElement,
} from './controls-binding.js';
import type { SpeedOption } from './controls.js';
import type { ReplayFile, ReplayFileInputElement } from './file-input-binding.js';
import type { CanvasBindingHost } from './canvas-binding.js';
import type { Drawing2DContext } from './renderer.js';
import type { PanelListElement, PanelToggleElement } from './summary-binding.js';

export interface CanvasLikeElement {
  width: number;
  height: number;
  getContext(type: '2d'): Drawing2DContext | null;
}

export const createCanvasHost = (canvas: CanvasLikeElement): CanvasBindingHost => ({
  get width() {
    return canvas.width;
  },
  get height() {
    return canvas.height;
  },
  getContext: (type) => canvas.getContext(type),
});

export interface ButtonLikeElement {
  textContent: string | null;
  disabled: boolean;
  addEventListener(type: 'click', listener: () => void): void;
  removeEventListener(type: 'click', listener: () => void): void;
}

export const createButtonControl = (button: ButtonLikeElement): ControlButtonElement => ({
  get textContent() {
    return button.textContent;
  },
  set textContent(value: string | null) {
    button.textContent = value;
  },
  get disabled() {
    return button.disabled;
  },
  set disabled(value: boolean) {
    button.disabled = value;
  },
  addEventListener: (type, listener) => button.addEventListener(type, listener),
  removeEventListener: (type, listener) => button.removeEventListener(type, listener),
});

export interface RangeLikeElement {
  min: string;
  max: string;
  value: string;
  disabled: boolean;
  addEventListener(type: 'input', listener: () => void): void;
  removeEventListener(type: 'input', listener: () => void): void;
}

export const createRangeControl = (range: RangeLikeElement): ControlRangeElement => ({
  get min() {
    return range.min;
  },
  set min(value: string) {
    range.min = value;
  },
  get max() {
    return range.max;
  },
  set max(value: string) {
    range.max = value;
  },
  get value() {
    return range.value;
  },
  set value(value: string) {
    range.value = value;
  },
  get disabled() {
    return range.disabled;
  },
  set disabled(value: boolean) {
    range.disabled = value;
  },
  addEventListener: (type, listener) => range.addEventListener(type, listener),
  removeEventListener: (type, listener) => range.removeEventListener(type, listener),
});

export interface OptionLikeElement {
  value: string;
  textContent: string | null;
}

export interface SelectLikeElement {
  value: string;
  disabled: boolean;
  replaceChildren(...children: OptionLikeElement[]): void;
  ownerDocument: { createElement(tag: 'option'): OptionLikeElement };
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export const createSelectControl = (select: SelectLikeElement): ControlSelectElement => ({
  get value() {
    return select.value;
  },
  set value(value: string) {
    select.value = value;
  },
  get disabled() {
    return select.disabled;
  },
  set disabled(value: boolean) {
    select.disabled = value;
  },
  setOptions(options: readonly SpeedOption[]) {
    const nextSelected = options.find((o) => o.selected)?.value;
    const optionElements = options.map((option) => {
      const el = select.ownerDocument.createElement('option');
      el.value = String(option.value);
      el.textContent = option.label;
      return el;
    });
    select.replaceChildren(...optionElements);
    if (nextSelected !== undefined) {
      select.value = String(nextSelected);
    }
  },
  addEventListener: (type, listener) => select.addEventListener(type, listener),
  removeEventListener: (type, listener) => select.removeEventListener(type, listener),
});

export interface TextLikeElement {
  textContent: string | null;
}

export const createTextElement = (el: TextLikeElement): ControlTextElement => ({
  get textContent() {
    return el.textContent;
  },
  set textContent(value: string | null) {
    el.textContent = value;
  },
});

export interface ToggleLikeElement {
  hidden: boolean;
}

export const createToggleElement = (el: ToggleLikeElement): PanelToggleElement => ({
  get hidden() {
    return el.hidden;
  },
  set hidden(value: boolean) {
    el.hidden = value;
  },
});

export interface ListLikeElement<TChild> {
  replaceChildren(...children: TChild[]): void;
  ownerDocument: { createElement(tag: string): TChild };
}

export type ListItemRenderer<TItem, TChild> = (
  item: TItem,
  doc: ListLikeElement<TChild>['ownerDocument'],
) => TChild;

export const createListElement = <TItem, TChild = unknown>(
  el: ListLikeElement<TChild>,
  renderItem: ListItemRenderer<TItem, TChild>,
): PanelListElement<TItem> => ({
  setItems(items) {
    const children = items.map((item) => renderItem(item, el.ownerDocument));
    el.replaceChildren(...children);
  },
});

export interface FileInputLikeElement {
  files: readonly ReplayFile[] | null;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export const createFileInputControl = (input: FileInputLikeElement): ReplayFileInputElement => ({
  getFiles() {
    return input.files === null ? [] : input.files;
  },
  addEventListener: (type, listener) => input.addEventListener(type, listener),
  removeEventListener: (type, listener) => input.removeEventListener(type, listener),
});
