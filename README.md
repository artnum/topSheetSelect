# TopSheetSelect

A lightweight, mobile-first "top sheet" select component for the web.

Transforms any element into an accessible combobox that opens a searchable list in a fixed overlay sheet. Designed for touch devices, with excellent keyboard support and full ARIA compliance.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- Mobile-friendly top-sheet UX (slides down from the trigger)
- Live fuzzy filtering (prefix + substring + 2-gram similarity)
- Full keyboard navigation (arrows, Enter, Escape)
- Rich HTML support inside options (with separate `filterValue` for searching)
- Section separators / headers
- Configurable sheet height via `coverRatio` option
- Clickable backdrop to dismiss the sheet
- Proper lifecycle management (`destroy()`, double-init protection)
- Clean ARIA combobox pattern
- Uses the Visual Viewport API for reliable behavior with mobile keyboards
- Zero dependencies

## Installation

```html
<link rel="stylesheet" href="top-sheet-select.css">
<script type="module">
  import TopSheetSelect from './top-sheet-select.js';
</script>
```

## Basic Usage

```js
import TopSheetSelect from './top-sheet-select.js';

class MyDataStore {
  async list() {
    return [
      { is_sep: true, displayName: 'People' },
      { value: '1', displayName: 'Alice', filterValue: 'Alice' },
      { value: '2', displayName: 'Bob', filterValue: 'Bob' },
      { is_sep: true, displayName: 'Places' },
      { value: '3', displayName: 'Paris', filterValue: 'Paris' },
    ];
  }

  async get(value) {
    // Return the item matching `value`, or null
  }
}

const trigger = document.getElementById('my-select');
const select = await TopSheetSelect.create(trigger, new MyDataStore());

// With custom height (optional)
const selectCompact = await TopSheetSelect.create(trigger, store, { coverRatio: 0.6 });

// Later, when you're done:
select.destroy();
```

The trigger element must contain a child with class `.value` where the selected label will be displayed.

See [index.html](index.html) for a complete working example.

## Documentation

Full API reference, DataStore contract, Item shape, keyboard behavior, and accessibility details are available in [DOCUMENTATION.md](DOCUMENTATION.md).

## How it works

- A hidden `<input>` is created next to your trigger for form participation and the actual value.
- When opened, a cloned copy of the trigger + a search input + the option list are positioned on top of the page.
- Filtering happens live as the user types.
- Selection can be made by click, keyboard, or programmatically.
- The component cleans up after itself when destroyed.
- The backdrop overlay is clickable to close the sheet.

## Browser Support

Modern browsers that support:
- ES Modules
- `visualViewport` API (most current mobile browsers)
- CSS custom properties

## License

This project is released under the **MIT License**.

See the [LICENSE](LICENSE) file for the full text.

---

Made with care for good mobile form experiences.
