(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';
  let initialized = false, bridge = {}, returnFocus = null, backgrounds = [];

  function isOpen() { return Boolean($('campfire-room') && !$('campfire-room').hidden); }
  function available(node) {
    if (!node?.isConnected || node.disabled) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.inert) return false;
    }
    return Boolean(node.getClientRects().length);
  }
  function focus(node) { if (available(node)) { node.focus({preventScroll: true}); return true; } return false; }
  function quickMenu() {
    const menu = $('quick-skins');
    return menu && !menu.hidden ? menu : null;
  }
  function open(anchor) {
    init();
    if (!initialized || isOpen() || document.querySelector('dialog[open]')) return false;
    // Restore the previous overlay's inert state before taking ownership of it.
    root.FocusCitadel?.close(false);
    root.FocusQuickSkins?.close(false);
    returnFocus = anchor || document.activeElement;
    backgrounds = Array.from(document.querySelectorAll('body > main, body > .sidebar'), node => [node, node.inert]);
    backgrounds.forEach(([node]) => { node.inert = true; });
    $('campfire-room').hidden = false;
    document.documentElement.classList.add('has-campfire-room');
    focus($('campfire-room-close'));
    return true;
  }
  function close(restoreFocus = true) {
    if (!isOpen()) return false;
    root.FocusQuickSkins?.close(false);
    $('campfire-room').hidden = true;
    document.documentElement.classList.remove('has-campfire-room');
    backgrounds.forEach(([node, inert]) => { node.inert = inert; });
    backgrounds = [];
    const anchor = returnFocus;
    returnFocus = null;
    if (restoreFocus && !focus(anchor)) focus($('campfire-room-open'));
    bridge.afterClose?.();
    return true;
  }
  function onKeydown(event) {
    if (!isOpen() || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    const menu = quickMenu();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      // QuickSkins normally handles Escape first; this also works if init order changes.
      if (menu) root.FocusQuickSkins?.close();
      else close();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = menu || $('campfire-room');
    const nodes = Array.from(container.querySelectorAll(focusable)).filter(node =>
      available(node) && Number(node.getAttribute('tabindex') ?? 0) >= 0);
    const first = nodes[0], last = nodes.at(-1), active = document.activeElement;
    if (!first) { event.preventDefault(); focus($('campfire-room-close')); return; }
    if (!nodes.includes(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      focus(event.shiftKey ? last : first);
    }
  }
  function init(options) {
    if (options) bridge = {...bridge, ...options};
    const room = $('campfire-room');
    if (initialized || !room) return;
    initialized = true;
    $('campfire-room-close')?.addEventListener('click', () => close());
    room.addEventListener('click', event => { if (event.target === room) close(); });
    document.addEventListener('keydown', onKeydown, true);
  }
  root.FocusCampfireRoom = {init, open, close, isOpen};
})(globalThis);
