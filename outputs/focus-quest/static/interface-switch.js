(function (root) {
  'use strict';
  let busy = false;
  const allowed = new Set(['modern', 'classic']);
  const buttons = () => [...document.querySelectorAll('button[data-interface-mode]')];
  function status(message, error = false) {
    for (const node of document.querySelectorAll('[data-interface-status]')) {
      node.textContent = message;
      node.hidden = !message;
      node.setAttribute('role', error ? 'alert' : 'status');
    }
  }
  async function switchTo(mode) {
    if (busy || !allowed.has(mode)) return false;
    busy = true;
    buttons().forEach(button => { button.disabled = true; });
    status(mode === 'classic' ? '正在回到最初的远征…' : '正在返回最新版…');
    try {
      const response = await root.fetch('/api/interface', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '版本切换暂时未完成');
      if (result.mode !== mode || result.url !== '/') throw new Error('版本切换响应异常，请重试');
      // Full navigation releases the outgoing page's timers, sounds and scene state.
      // The running collector, calendar bridge and study archive stay in place.
      root.location.replace('/');
      return true;
    } catch (error) {
      status(error.message || '版本切换暂时未完成，请重试。', true);
      busy = false;
      buttons().forEach(button => { button.disabled = false; });
      return false;
    }
  }
  for (const button of buttons()) {
    button.addEventListener('click', () => switchTo(button.dataset.interfaceMode));
  }
  root.FocusInterface = { switchTo, isBusy: () => busy };
})(typeof globalThis !== 'undefined' ? globalThis : this);
