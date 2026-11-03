// Presses keys and moves the mouse. The app uses this directly, or through the elevated helper when admin control is on.
const { mouse, keyboard, Key, Button, Point } = require('@nut-tree-fork/nut-js');
const { coalesceInput, heldKeysTracker, wheelAmount } = require('./session');

mouse.config.mouseSpeed = 100000;
mouse.config.autoDelayMs = 0; // the default waits 100 ms before every click and scroll
keyboard.config.autoDelayMs = 0;

// Map browser KeyboardEvent.code to nut-js keys (common subset).
const KEYMAP = {
  Enter: Key.Enter, Backspace: Key.Backspace, Tab: Key.Tab, Escape: Key.Escape, Space: Key.Space,
  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  Delete: Key.Delete, Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown,
  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift, ControlLeft: Key.LeftControl,
  ControlRight: Key.RightControl, AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  Minus: Key.Minus, Equal: Key.Equal, Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash,
  Semicolon: Key.Semicolon, Quote: Key.Quote, BracketLeft: Key.LeftBracket,
  BracketRight: Key.RightBracket, Backslash: Key.Backslash, Backquote: Key.Grave,
  MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper, ContextMenu: Key.Menu, CapsLock: Key.CapsLock,
  Insert: Key.Insert, PrintScreen: Key.Print, Pause: Key.Pause, ScrollLock: Key.ScrollLock, NumLock: Key.NumLock,
  NumpadAdd: Key.Add, NumpadSubtract: Key.Subtract, NumpadMultiply: Key.Multiply, NumpadDivide: Key.Divide,
  NumpadDecimal: Key.Decimal, NumpadEnter: Key.Enter,
};
function keyFor(code) {
  if (KEYMAP[code]) return KEYMAP[code];
  if (/^Key[A-Z]$/.test(code)) return Key[code.slice(3)];
  if (/^Digit[0-9]$/.test(code)) return Key['Num' + code.slice(5)];
  if (/^Numpad[0-9]$/.test(code)) return Key['NumPad' + code.slice(6)];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return Key[code];
  return undefined;
}
const BUTTONS = [Button.LEFT, Button.MIDDLE, Button.RIGHT];

// Inject one at a time so events keep their order, skipping mouse moves that are already out of date.
// x and y are screen pixels here.
function inputQueue() {
  const pending = [];
  let pumping = false;
  const heldKeys = heldKeysTracker();
  const heldButtons = heldKeysTracker();

  async function inject(ev) {
    if (typeof ev.x === 'number' && typeof ev.y === 'number') await mouse.setPosition(new Point(ev.x, ev.y));
    if (ev.type === 'down') {
      heldButtons.down(ev.button);
      await mouse.pressButton(BUTTONS[ev.button] ?? Button.LEFT);
    } else if (ev.type === 'up') {
      heldButtons.up(ev.button);
      await mouse.releaseButton(BUTTONS[ev.button] ?? Button.LEFT);
    } else if (ev.type === 'wheel') {
      if (ev.dy > 0) await mouse.scrollDown(wheelAmount(ev.dy, process.platform));
      else if (ev.dy < 0) await mouse.scrollUp(wheelAmount(ev.dy, process.platform));
      if (ev.dx > 0) await mouse.scrollRight(wheelAmount(ev.dx, process.platform));
      else if (ev.dx < 0) await mouse.scrollLeft(wheelAmount(ev.dx, process.platform));
    } else if (ev.type === 'keydown' || ev.type === 'keyup') {
      const k = keyFor(ev.code);
      if (k === undefined) return;
      if (ev.type === 'keydown') {
        heldKeys.down(ev.code);
        await keyboard.pressKey(k);
      } else {
        heldKeys.up(ev.code);
        await keyboard.releaseKey(k);
      }
    }
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (pending.length) {
      for (const ev of coalesceInput(pending.splice(0))) {
        await inject(ev).catch((err) => console.error('input error:', err.message));
      }
    }
    pumping = false;
  }

  return {
    push(ev) {
      pending.push(ev);
      return pump();
    },
    // A viewer that vanishes must not leave keys or buttons pressed on this computer.
    releaseAll() {
      for (const code of heldKeys.releaseAll()) pending.push({ type: 'keyup', code });
      for (const button of heldButtons.releaseAll()) pending.push({ type: 'up', button });
      return pump();
    },
  };
}

module.exports = { inputQueue };
