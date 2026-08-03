/**
 * Clickable buttons.
 *
 * One list holds both the drawing and the hit region, and the region is
 * recorded *by* the draw call. A button that is drawn somewhere and clickable
 * somewhere else is the classic failure here, and keeping the two in separate
 * structures is how it happens.
 *
 * Every button carries a key as well, always, and the key is drawn on the face.
 * The mouse is an addition to the keyboard, never a replacement: a terminal
 * game that can only be played with a mouse has given up the thing that made it
 * worth writing.
 */

import { strWidth, box } from '@clicade/tui';
import { getTheme } from './theme.js';

/**
 * @typedef {object} Button
 * @property {string} id
 * @property {string} key keyboard equivalent, shown on the face
 * @property {string} label
 * @property {boolean} [enabled]
 */

/** Width a button occupies, including its border. */
export function buttonWidth(button, style = 'boxed') {
  const face = faceOf(button);
  return style === 'flat' ? strWidth(face) : strWidth(face) + 4;
}

function faceOf(button) {
  // `H hit` rather than `[H] hit`: the key is already picked out in the accent
  // colour, and brackets inside a bordered box is one frame too many.
  return `${button.key} ${button.label}`;
}

/** Total width of a row, including the gaps between. */
export function rowWidth(buttons, opts = {}) {
  const gap = opts.gap ?? 1;
  const style = opts.style ?? 'boxed';
  if (buttons.length === 0) return 0;
  return buttons.reduce((sum, b) => sum + buttonWidth(b, style), 0) + gap * (buttons.length - 1);
}

/**
 * A set of drawn buttons that can be asked what was clicked.
 *
 * Rebuilt every frame. Regions are cleared on each draw so a button that
 * stopped being drawn — split, once the hand is no longer a pair — cannot go
 * on answering clicks from where it used to be.
 */
export function createButtons() {
  let regions = [];
  let hovered = null;
  let pressed = null;

  return {
    get regions() {
      return regions;
    },
    get hovered() {
      return hovered;
    },

    clear() {
      regions = [];
    },

    /** Record a region. Called by `drawRow`, or directly for bespoke shapes. */
    add(id, x, y, w, h, extra = {}) {
      regions.push({ id, x, y, w, h, ...extra });
      return regions[regions.length - 1];
    },

    /** The button under a point, or null. */
    at(x, y) {
      for (const r of regions) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
      }
      return null;
    },

    /**
     * Feed a mouse event in; get back the id of a completed click, or null.
     *
     * A click is press *and* release on the same button, the way every other
     * interface behaves — pressing on one thing and releasing on another must
     * do nothing, so a misclick can be taken back by moving away before
     * letting go.
     */
    handle(event) {
      if (!event) return null;

      if (event.type === 'move') {
        const region = this.at(event.x, event.y);
        hovered = region && region.enabled !== false ? region.id : null;
        return null;
      }

      if (event.type === 'down' && event.button === 'left') {
        const region = this.at(event.x, event.y);
        pressed = region && region.enabled !== false ? region.id : null;
        hovered = pressed;
        return null;
      }

      if (event.type === 'up') {
        const region = this.at(event.x, event.y);
        const id = region && region.enabled !== false && region.id === pressed ? region.id : null;
        pressed = null;
        return id;
      }

      return null;
    },

    get pressed() {
      return pressed;
    },
  };
}

/**
 * Draw a row of buttons and record where they landed.
 *
 * @param {object} target stage or screen
 * @param {object} g glyph set
 * @param {ReturnType<createButtons>} buttons
 * @param {number} x left edge
 * @param {number} y top edge
 * @param {Button[]} items
 * @param {object} [opts] theme, gap, style ('boxed' | 'flat'), height
 * @returns {number} width drawn
 */
export function drawRow(target, g, buttons, x, y, items, opts = {}) {
  const theme = opts.theme ?? getTheme();
  const gap = opts.gap ?? 1;
  const style = opts.style ?? 'boxed';
  const boxed = style !== 'flat';
  const h = boxed ? 3 : 1;

  let at = x;
  for (const item of items) {
    const w = buttonWidth(item, style);
    const enabled = item.enabled !== false;
    const active = buttons.hovered === item.id || buttons.pressed === item.id;

    // The region is recorded here, from the same numbers that drew it.
    buttons.add(item.id, at, y, w, h, { enabled, key: item.key });

    const face = faceOf(item);
    const textY = boxed ? y + 1 : y;
    const textX = boxed ? at + 2 : at;

    if (boxed) {
      box(
        target,
        g,
        at,
        y,
        w,
        h,
        {
          fg: !enabled ? theme.tableDark : active ? theme.accent : theme.cardEdge,
          bg: theme.table,
        },
        // A pressed or hovered button doubles its border, so the highlight is
        // not carried by colour alone.
        active ? 'double' : 'round',
      );
    }

    target.put(textX, textY, item.key, {
      fg: !enabled ? theme.tableDark : theme.accent,
      bg: theme.table,
      bold: enabled,
    });
    target.put(textX + strWidth(item.key) + 1, textY, item.label, {
      fg: !enabled ? theme.tableDark : active ? theme.text : theme.textMuted,
      bg: theme.table,
      bold: active && enabled,
    });

    at += w + gap;
  }

  return Math.max(0, at - x - gap);
}
