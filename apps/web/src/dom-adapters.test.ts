import { describe, expect, it } from 'vitest';

import {
  createButtonControl,
  createCanvasHost,
  createFileInputControl,
  createListElement,
  createRangeControl,
  createSelectControl,
  createTextElement,
  createToggleElement,
} from './dom-adapters.js';
import type { Drawing2DContext } from './renderer.js';
import type { ReplayFile } from './file-input-binding.js';

interface StubListenerStore<T extends string> {
  readonly listenersByType: Map<T, Set<() => void>>;
}

const addStubListener = <T extends string>(
  store: StubListenerStore<T>,
  type: T,
  listener: () => void,
): void => {
  const set = store.listenersByType.get(type) ?? new Set();
  set.add(listener);
  store.listenersByType.set(type, set);
};

const removeStubListener = <T extends string>(
  store: StubListenerStore<T>,
  type: T,
  listener: () => void,
): void => {
  const set = store.listenersByType.get(type);
  if (!set) return;
  set.delete(listener);
};

const dispatch = <T extends string>(store: StubListenerStore<T>, type: T): void => {
  const set = store.listenersByType.get(type);
  if (!set) return;
  for (const listener of [...set]) listener();
};

interface StubButton extends StubListenerStore<'click'> {
  textContent: string | null;
  disabled: boolean;
  addEventListener(type: 'click', listener: () => void): void;
  removeEventListener(type: 'click', listener: () => void): void;
}

const createStubButton = (): StubButton => {
  const store = { listenersByType: new Map<'click', Set<() => void>>() };
  return {
    ...store,
    textContent: '',
    disabled: false,
    addEventListener: (type, listener) => addStubListener(store, type, listener),
    removeEventListener: (type, listener) => removeStubListener(store, type, listener),
  };
};

interface StubRange extends StubListenerStore<'input'> {
  min: string;
  max: string;
  value: string;
  disabled: boolean;
  addEventListener(type: 'input', listener: () => void): void;
  removeEventListener(type: 'input', listener: () => void): void;
}

const createStubRange = (): StubRange => {
  const store = { listenersByType: new Map<'input', Set<() => void>>() };
  return {
    ...store,
    min: '0',
    max: '0',
    value: '0',
    disabled: false,
    addEventListener: (type, listener) => addStubListener(store, type, listener),
    removeEventListener: (type, listener) => removeStubListener(store, type, listener),
  };
};

interface StubOption {
  value: string;
  textContent: string | null;
}

interface StubSelect extends StubListenerStore<'change'> {
  value: string;
  disabled: boolean;
  options: StubOption[];
  replaceChildren(...children: StubOption[]): void;
  ownerDocument: { createElement(tag: 'option'): StubOption };
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

const createStubSelect = (): StubSelect => {
  const store = { listenersByType: new Map<'change', Set<() => void>>() };
  const options: StubOption[] = [];
  return {
    ...store,
    value: '',
    disabled: false,
    options,
    replaceChildren(...children) {
      options.length = 0;
      for (const child of children) options.push(child);
    },
    ownerDocument: {
      createElement: (_tag) => ({ value: '', textContent: '' }),
    },
    addEventListener: (type, listener) => addStubListener(store, type, listener),
    removeEventListener: (type, listener) => removeStubListener(store, type, listener),
  };
};

interface StubFileInput extends StubListenerStore<'change'> {
  files: readonly ReplayFile[] | null;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

const createStubFileInput = (): StubFileInput => {
  const store = { listenersByType: new Map<'change', Set<() => void>>() };
  return {
    ...store,
    files: null,
    addEventListener: (type, listener) => addStubListener(store, type, listener),
    removeEventListener: (type, listener) => removeStubListener(store, type, listener),
  };
};

interface StubElement {
  textContent: string | null;
  hidden: boolean;
  children: StubElement[];
  replaceChildren(...children: StubElement[]): void;
  ownerDocument: { createElement(tag: string): StubElement };
}

const createStubElement = (): StubElement => {
  const children: StubElement[] = [];
  return {
    textContent: '',
    hidden: false,
    children,
    replaceChildren(...next) {
      children.length = 0;
      for (const child of next) children.push(child);
    },
    ownerDocument: {
      createElement: (_tag) => createStubElement(),
    },
  };
};

interface StubCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): Drawing2DContext | null;
}

const createStubCanvas = (): StubCanvas => {
  const ctx: Drawing2DContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
  };
  return {
    width: 320,
    height: 240,
    getContext: (type) => (type === '2d' ? ctx : null),
  };
};

describe('createCanvasHost', () => {
  it('passes through width, height, and getContext to the underlying canvas', () => {
    const canvas = createStubCanvas();
    const host = createCanvasHost(canvas);
    expect(host.width).toBe(320);
    expect(host.height).toBe(240);
    canvas.width = 100;
    canvas.height = 200;
    expect(host.width).toBe(100);
    expect(host.height).toBe(200);
    expect(host.getContext('2d')).not.toBeNull();
  });
});

describe('createButtonControl', () => {
  it('mirrors textContent and disabled to the underlying button', () => {
    const button = createStubButton();
    const control = createButtonControl(button);
    control.textContent = 'Play';
    control.disabled = true;
    expect(button.textContent).toBe('Play');
    expect(button.disabled).toBe(true);
  });

  it('forwards click listeners and removes them on demand', () => {
    const button = createStubButton();
    const control = createButtonControl(button);
    let clicks = 0;
    const listener = (): void => {
      clicks += 1;
    };
    control.addEventListener('click', listener);
    dispatch(button, 'click');
    expect(clicks).toBe(1);
    control.removeEventListener('click', listener);
    dispatch(button, 'click');
    expect(clicks).toBe(1);
  });
});

describe('createRangeControl', () => {
  it('mirrors min/max/value/disabled to the underlying range input', () => {
    const range = createStubRange();
    const control = createRangeControl(range);
    control.min = '0';
    control.max = '10';
    control.value = '5';
    control.disabled = true;
    expect(range.min).toBe('0');
    expect(range.max).toBe('10');
    expect(range.value).toBe('5');
    expect(range.disabled).toBe(true);
  });

  it('reads the current value from the underlying element', () => {
    const range = createStubRange();
    const control = createRangeControl(range);
    range.value = '7';
    expect(control.value).toBe('7');
  });

  it('forwards input events and removes listeners on demand', () => {
    const range = createStubRange();
    const control = createRangeControl(range);
    let inputs = 0;
    const listener = (): void => {
      inputs += 1;
    };
    control.addEventListener('input', listener);
    dispatch(range, 'input');
    expect(inputs).toBe(1);
    control.removeEventListener('input', listener);
    dispatch(range, 'input');
    expect(inputs).toBe(1);
  });
});

describe('createSelectControl', () => {
  it('renders setOptions as <option> elements with value and textContent', () => {
    const select = createStubSelect();
    const control = createSelectControl(select);
    control.setOptions([
      { value: 0.5, label: '0.5x', selected: false },
      { value: 1, label: '1x', selected: true },
      { value: 2, label: '2x', selected: false },
    ]);
    expect(select.options).toHaveLength(3);
    expect(select.options[0]).toEqual({ value: '0.5', textContent: '0.5x' });
    expect(select.options[2]).toEqual({ value: '2', textContent: '2x' });
  });

  it('mirrors value/disabled and forwards change events', () => {
    const select = createStubSelect();
    const control = createSelectControl(select);
    control.setOptions([{ value: 1, label: '1x', selected: true }]);
    control.value = '1';
    control.disabled = true;
    expect(select.value).toBe('1');
    expect(select.disabled).toBe(true);

    let changes = 0;
    const listener = (): void => {
      changes += 1;
    };
    control.addEventListener('change', listener);
    dispatch(select, 'change');
    expect(changes).toBe(1);
    control.removeEventListener('change', listener);
    dispatch(select, 'change');
    expect(changes).toBe(1);
  });
});

describe('createTextElement / createToggleElement', () => {
  it('mirrors textContent on the underlying element', () => {
    const el = createStubElement();
    const text = createTextElement(el);
    text.textContent = 'Tick 3 / 10';
    expect(el.textContent).toBe('Tick 3 / 10');
  });

  it('mirrors hidden on the underlying element', () => {
    const el = createStubElement();
    const toggle = createToggleElement(el);
    expect(toggle.hidden).toBe(false);
    toggle.hidden = true;
    expect(el.hidden).toBe(true);
  });
});

describe('createListElement', () => {
  it('renders setItems by mapping each item through the provided renderer', () => {
    const el = createStubElement();
    const list = createListElement<{ label: string }, StubElement>(el, (item, doc) => {
      const li = doc.createElement('li');
      li.textContent = item.label;
      return li;
    });
    list.setItems([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    expect(el.children).toHaveLength(3);
    expect(el.children.map((c) => c.textContent)).toEqual(['A', 'B', 'C']);
  });

  it('clears prior items when setItems is called again', () => {
    const el = createStubElement();
    const list = createListElement<{ label: string }, StubElement>(el, (item, doc) => {
      const li = doc.createElement('li');
      li.textContent = item.label;
      return li;
    });
    list.setItems([{ label: 'A' }, { label: 'B' }]);
    list.setItems([{ label: 'X' }]);
    expect(el.children).toHaveLength(1);
    expect(el.children[0]?.textContent).toBe('X');
  });
});

describe('createFileInputControl', () => {
  it('returns the input.files array (or empty when null)', () => {
    const input = createStubFileInput();
    const control = createFileInputControl(input);
    expect(control.getFiles()).toEqual([]);
    const fakeFile: ReplayFile = {
      name: 'replay.json',
      size: 4,
      text: () => Promise.resolve('null'),
    };
    input.files = [fakeFile];
    const files = control.getFiles();
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('replay.json');
  });

  it('forwards change events and removes listeners on demand', () => {
    const input = createStubFileInput();
    const control = createFileInputControl(input);
    let changes = 0;
    const listener = (): void => {
      changes += 1;
    };
    control.addEventListener('change', listener);
    dispatch(input, 'change');
    expect(changes).toBe(1);
    control.removeEventListener('change', listener);
    dispatch(input, 'change');
    expect(changes).toBe(1);
  });
});
