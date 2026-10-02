(function () {
  'use strict';
  // Fit the whole scene to its available grid cell; never stretch map geometry.
  const frames = [...document.querySelectorAll('[data-scene-frame]')];
  function fit(frame) {
    const scene = frame.querySelector('[data-scene-ratio]');
    if (!scene || !frame.clientWidth || !frame.clientHeight) return;
    const ratio = Number(scene.dataset.sceneRatio);
    const width = Math.min(frame.clientWidth, frame.clientHeight * ratio);
    scene.style.width = `${width}px`;
    scene.style.height = `${width / ratio}px`;
  }
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(entries => entries.forEach(entry => fit(entry.target)));
    frames.forEach(frame => observer.observe(frame));
  } else {
    window.addEventListener('resize', () => frames.forEach(fit));
  }
  frames.forEach(fit);
})();
