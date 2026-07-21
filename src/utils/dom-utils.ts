/**
 * DOM utilities for content scripts: waiting on asynchronously rendered
 * elements (SPA pages) and dispatching synthetic mouse events
 */

import { TIMEOUTS } from './config';

/**
 * Polls until check returns a non-null value or the timeout elapses
 * @param check - Function returning the awaited value (null/undefined = keep waiting)
 * @param timeoutMs - Maximum time to wait
 * @param description - Human-readable description used in the timeout error
 * @param intervalMs - Poll interval (default: TIMEOUTS.domPoll)
 * @returns The first non-null value returned by check
 * @throws Error if the timeout elapses before check returns a value
 */
export async function waitFor<T>(
  check: () => T | null | undefined,
  timeoutMs: number,
  description: string,
  intervalMs: number = TIMEOUTS.domPoll
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const value = check();
    if (value !== null && value !== undefined) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Dispatches a mousedown/mouseup/click sequence on an element
 *
 * Covers UI libraries that act on any one of the three: ember-basic-dropdown
 * toggles on mousedown or click depending on version/configuration, and
 * ember-power-select chooses options on mouseup
 */
export function dispatchMouseSequence(element: Element): void {
  for (const type of ['mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click'] as const) {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
    );
  }
}

/**
 * Simulates real keystroke-by-keystroke typing into an input, dispatching a
 * keydown/input/keyup sequence per character via the native value setter
 * (bypassing any framework property interceptor)
 *
 * Setting the full value in one shot and firing a single input event is not
 * equivalent: some search widgets (confirmed for FreshService's requester
 * typeahead) only trigger their live search off a genuine per-keystroke
 * event stream, and never open their results dropdown for a bulk value set
 */
export function typeIntoInput(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  let value = '';
  for (const char of text) {
    value += char;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
  }
}
