# TopSheetSelect — API Documentation

`TopSheetSelect` is a mobile-friendly "top sheet" select component. It transforms a trigger element into an accessible combobox that opens a searchable list of options in a fixed overlay sheet that slides down from the trigger.

The component is designed for touch devices, uses the Visual Viewport API for proper keyboard handling on mobile, supports keyboard navigation, and provides rich ARIA attributes.

---

## Table of Contents

- [DataStore Contract](#datastore-contract)
- [Item Shape](#item-shape)
- [Constructor & Lifecycle](#constructor--lifecycle)
- [Public Methods](#public-methods)
- [Private Methods](#private-methods)
- [Keyboard & Interaction Behavior](#keyboard--interaction-behavior)
- [Accessibility](#accessibility)

---

## DataStore Contract

The component does **not** own the data. You must provide a `dataStore` object that implements the following interface:

```ts
interface DataStore {
  /**
   * Returns the full list of selectable items (and separators).
   * Called every time the sheet is opened.
   */
  list(): Promise<Item[]>;

  /**
   * Retrieves a single item by its `value`.
   * Used by the static `create()` factory to restore the display value
   * when the trigger already has a value on initialization.
   */
  get(value: string): Promise<Item | null>;
}
```

**Important notes:**
- Both methods **must** return Promises.
- `list()` is called on every `toggle()` / `renderList()`.
- The component does **not** cache results.

---

## Item Shape

Each item returned by `dataStore.list()` can be either a **regular option** or a **separator/header**.

```ts
interface Item {
  /** Unique identifier for the item. Stored in the hidden input and emitted on change. */
  value: string;

  /** HTML content to display. XSS is the caller's responsibility. */
  displayName: string;

  /**
   * Value used for filtering/search.
   * Falls back to `displayName` (after stripping HTML) when omitted.
   */
  filterValue?: string;

  /**
   * When `true`, the item is rendered as a non-selectable visual separator
   * (header / section label). `value` is ignored for separators.
   */
  is_sep?: boolean;
}
```

**Example items:**
```js
[
  { is_sep: true,  displayName: 'People' },
  { value: 'p1',   displayName: 'Jean Müller', filterValue: 'Jean Müller' },
  { is_sep: true,  displayName: 'Buildings' },
  { value: 'b1',   displayName: '<span style="color:red">30 Hudson Yards</span>', filterValue: '30 hudson yards' }
]
```

---

## Constructor & Lifecycle

### constructor(triggerNode, dataStore, config?)

```ts
constructor(
  triggerNode: HTMLElement,
  dataStore: DataStore,
  config?: { coverRatio?: number }
)
```

Creates a new `TopSheetSelect` instance.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `triggerNode` | `HTMLElement` | The element that will act as the combobox trigger. Must already exist in the DOM. |
| `dataStore` | `DataStore` | Object implementing `list()` and `get()`. |
| `config` (optional) | `{ coverRatio?: number }` | Configuration object. `coverRatio` controls the height of the sheet as a fraction of the available viewport space below the trigger (clamped between 0.3 and 1.0). Default: `0.9`. |

**Behavior:**
- Validates that `triggerNode` is an `HTMLElement` and `dataStore` is an object (throws otherwise).
- Prevents double initialization on the same element (throws if `dataset.topSheetInstalled === '1'`).
- Creates a hidden `<input>` (used for form submission and the actual value).
- Assigns a unique internal `myId`.
- Sets ARIA attributes on the trigger (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, etc.).
- Installs event listeners (click + mutation observer + viewport resize).
- Marks the trigger with `data-topSheetInstalled="1"`.
- The backdrop overlay is clickable to close the sheet.

**Throws:**
- `Error` if `triggerNode` is not an `HTMLElement`.
- `Error` if `dataStore` is not an object.

---

### static create(triggerNode, dataStore, config?)

```ts
static create(
  triggerNode: HTMLElement,
  dataStore: DataStore,
  config?: { coverRatio?: number }
): Promise<TopSheetSelect>
```

Async factory method. Preferred way to instantiate the component.

**Returns:** `Promise<TopSheetSelect>` that resolves once the component is ready.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `config` (optional) | `{ coverRatio?: number }` | Same as the constructor `config` parameter. Controls sheet height ratio. |

**Special behavior:**
- Rejects with an `Error` if the trigger is already initialized.
- If the trigger already has a `.value` (or `value` attribute), it calls `dataStore.get()` to fetch the corresponding item and calls `setDisplayValue()` to restore the visual label.
- If no value or the value is not found, it calls `reset()`.

**Usage (recommended):**
```js
const select = await TopSheetSelect.create(document.getElementById('myTrigger'), myDataStore);
```

---

### destroy()

```ts
destroy(): void
```

Completely tears down the component.

**Actions performed:**
- Removes all event listeners via the internal `AbortController`.
- Disconnects the internal `MutationObserver`.
- Removes the dynamically created overlay nodes (`#opacityNode`, `#copyNode`, and the hidden input) on the next animation frame.

**Important:** After calling `destroy()`, the instance should no longer be used.

---

## Public Methods

### toggle(event?)

```ts
toggle(event?: Event): void
```

Toggles the sheet open or closed.

- If the sheet is currently shown → calls `hide()`.
- If hidden → renders the list + sheet, appends them to the body, applies dimensions, focuses the search input, and scrolls the currently selected item into view.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `event` | `Event` | Optional. Currently unused except for potential future use. |

**Side effects:**
- Sets `aria-expanded="true"` on the trigger when opening.
- Stores `window.scrollY` so it can be restored on close (mobile keyboard handling).

---

### renderList()

```ts
renderList(): Promise<HTMLDivElement>
```

Builds the list of options (`role="listbox"`).

**Returns:** `Promise<HTMLDivElement>` — the populated list container.

**Behavior:**
- Calls `dataStore.list()`.
- Creates one `<div role="option">` per item.
- Separators (`is_sep: true`) receive the class `top-sheet-item-separator`.
- Regular items receive `top-sheet-item`, `data-effective-value`, `data-filter-value`, and an `id`.
- Pre-selects the item matching the current hidden input value.
- Attaches a delegated click handler that calls `selectItem()`.
- Generates 2-grams for every item and stores them in the internal `#itemNGrams` Map (used by the fuzzy filter).

---

### setDisplayValue(v)

```ts
setDisplayValue(v: { displayName: string }): void
```

Updates the visual label inside the trigger element.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `v` | `{ displayName: string }` | Object containing the HTML/string to display. |

**Implementation detail:** Looks for a child element with class `.value` inside the trigger and sets its `innerHTML`.

---

### reset()

```ts
reset(): void
```

Clears the visual selection inside the trigger (sets `.value` innerHTML to empty string).

Does **not** clear the hidden input value.

---

### selectItem(event)

```ts
selectItem(event: MouseEvent): void
```

Handles click selection of an item in the list.

**Behavior:**
- Uses `event.target.closest('.top-sheet-item')` to support rich HTML content inside items.
- Safely ignores clicks that do not land on a valid item.
- Sets the hidden input's value (via `setAttribute('value', ...)` for DevTools visibility).
- Updates the trigger's display value (preserving rich HTML).
- Dispatches a `CustomEvent("change", { detail: { value }, bubbles: true })` on the trigger.
- Automatically closes the sheet via `hide()`.

---

### selectNext()

```ts
selectNext(): void
```

Moves keyboard/visual selection to the next selectable (non-separator, visible) item.

Wraps around to the top when reaching the end.

Used by `ArrowDown` key handling.

---

### selectPrevious()

```ts
selectPrevious(): void
```

Moves keyboard/visual selection to the previous selectable item.

Wraps around to the bottom.

Used by `ArrowUp` key handling.

---

### renderSheet()

```ts
renderSheet(): Promise<HTMLDivElement>
```

Creates (or reuses) the main sheet container, including the search input.

**Returns:** `Promise<HTMLDivElement>` — the sheet container.

**Key responsibilities:**
- Creates the backdrop blur node (`#opacityNode`).
- Clones the trigger for visual continuity (`#copyNode`).
- Creates the search `<input>` with extensive ARIA attributes.
- Wires `keyup` (filtering) and `keydown` (navigation + Enter/Escape) handlers.
- On Enter: updates the hidden input and trigger display, dispatches `CustomEvent("change", { detail: { value }, bubbles: true })`, then closes the sheet.
- Returns an already existing sheet if the component is being reopened (just clears the search field).

---

### hide()

```ts
hide(): Promise<void>
```

Closes the sheet and cleans up DOM nodes.

**Returns:** `Promise<void>` that resolves after the nodes are removed.

**Side effects:**
- Removes `#dataNode`, `#opacityNode`, `#copyNode`, and `#domNode`.
- Restores the previous `scrollY` position (important on mobile when the virtual keyboard appeared).
- Sets `aria-expanded="false"` on the trigger.

---

### filter(text)

```ts
filter(text: string): void
```

Filters the currently rendered list in real time as the user types.

**Algorithm (in priority order):**
1. **Prefix match** (`startsWith`) → highest score.
2. **Substring match** (`includes`) → medium score.
3. **2-gram / character similarity** (Jaccard-like) → fallback fuzzy match.

Items with a score > 0.15 are shown; others are hidden.

Separators are always shown (they stay visible even when filtering).

---

## Private Methods

### #scrollIntoView(node)

Scrolls the given item into the center of the scrollable list container.

Uses `requestAnimationFrame` for smoothness.

### #debounce(callback, delay)

Returns a debounced version of the given function. Used for the viewport `resize` handler.

### #resizeEventHandler(event)

Responds to `visualViewport` resize events (mainly virtual keyboard appearing/disappearing on mobile).

Recomputes dimensions and re-applies them, then re-scrolls the selected item into view.

### #installEvents()

Sets up:
- A `MutationObserver` on the trigger's parent to auto-destroy if the trigger is removed from the DOM.
- `visualViewport` resize listener (debounced).
- Click listener on the trigger that calls `toggle()`.

All listeners are attached with an `AbortController` signal for clean removal.

### #removeEvents()

Aborts the `AbortController`, removing all listeners installed by `#installEvents()`.
Disconnects the internal `MutationObserver` if present.

### #markNodeSelected(node)

Visually and ARIA-selects a list item:
- Removes `.selected` and `aria-selected="true"` from the previous item.
- Adds them to the new node.
- Updates `aria-activedescendant` on the search input.

### #getSearchInput()

Helper that returns the search `<input>` element inside `#domNode`, or `undefined`.

### #getNextSelectable()

Returns the next keyboard-focusable item after the current selection (skipping separators and hidden nodes). Wraps around.

### #getPreviousSelectable()

Returns the previous keyboard-focusable item. Wraps around.

### #computeDimensions()

Calculates the target geometry for the sheet based on the trigger's position and the visual viewport.

The sheet height is determined by `coverRatio` (see constructor/config):  
`height = (viewportHeight - triggerHeight) * coverRatio`

**Returns:** An object with `height`, `left`, `top`, `width`.

### #applyDimensions(dimensions)

Applies the calculated dimensions to `#domNode`, `#copyNode`, and `#opacityNode` using CSS custom properties (`--tss-*`).

Appends the nodes to the body if they are not already attached.

### #normalize(str)

Lowercases and removes diacritics (NFD normalization + removal of combining marks). Used for search.

### #generate2Grams(str)

Generates a simplified 2-gram (bigram) representation of a string for fuzzy matching.

Process:
1. Split on spaces.
2. For each word: keep first letter + consonants (remove vowels).
3. Generate adjacent pairs.

These grams are stored per item and used during filtering.

---

## Keyboard & Interaction Behavior

| Key | Context | Action |
|-----|---------|--------|
| `ArrowDown` | Sheet open | Move selection to next item |
| `ArrowUp` | Sheet open | Move selection to previous item |
| `Enter` | Sheet open + selection | Confirm selection, update value, close sheet |
| `Escape` | Sheet open | Close sheet (toggle behavior) |
| Any printable key | Sheet open | Filter the list (debounced via keyup) |

Clicking the backdrop (the blurred full-screen overlay) or the cloned trigger closes the sheet. The backdrop is interactive by default.

---

## Accessibility

The component implements the ARIA combobox pattern:

- Trigger: `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls`, `aria-expanded`
- List: `role="listbox"`, `aria-label="Options"`
- Items: `role="option"`, `aria-selected`
- Search input: `aria-autocomplete="list"`, `aria-controls`, `aria-activedescendant`

The hidden input receives the actual value and participates in form submission.

---

## Usage Example

```js
import TopSheetSelect from './top-sheet-select.js';

class MyDataStore {
  async list() {
    return [
      { is_sep: true, displayName: 'People' },
      { value: '1', displayName: 'Alice', filterValue: 'Alice' },
      { value: '2', displayName: 'Bob',   filterValue: 'Bob' },
    ];
  }
  async get(value) {
    // return matching item or null
  }
}

const trigger = document.getElementById('my-select');
const select = await TopSheetSelect.create(trigger, new MyDataStore());

// Later...
select.destroy();
```

---

*Documentation updated to reflect the latest changes (coverRatio config + backdrop interaction) — top-sheet-select.js*