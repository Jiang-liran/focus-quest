/* Decorative, self-contained subject emblems. No generated IDs or user HTML. */
(function () {
  'use strict';

  const base = `
    <ellipse class="sigil-shadow" cx="60" cy="87" rx="32" ry="5"/>
    <path class="sigil-plinth" d="M25 79 60 71 95 79 60 90Z"/>
    <path class="sigil-plinth-edge" d="M25 79 60 86 95 79M60 86v4"/>
    <ellipse class="sigil-aura" cx="60" cy="49" rx="36" ry="34"/>`;

  const sparkles = `
    <g class="sigil-sparkles">
      <path class="sigil-spark sigil-spark-a" d="M20 31v8m-4-4h8"/>
      <path class="sigil-spark sigil-spark-b" d="M98 53v6m-3-3h6"/>
      <path class="sigil-spark sigil-spark-c" d="M84 14v6m-3-3h6"/>
      <circle class="sigil-spark sigil-spark-d" cx="29" cy="65" r="1.3"/>
    </g>`;

  const drawings = {
    math: `
      <g class="sigil-math-orbit">
        <ellipse class="sigil-orbit" cx="60" cy="47" rx="42" ry="15" transform="rotate(-27 60 47)"/>
        <circle class="sigil-satellite" cx="96" cy="29" r="2.8"/>
        <circle class="sigil-satellite sigil-satellite-small" cx="24" cy="65" r="1.8"/>
      </g>
      <g class="sigil-math-geometry">
        <path class="sigil-facet" d="M60 16 85 32 85 61 60 77 35 61 35 32Z"/>
        <path class="sigil-face-light" d="M60 16 60 47 35 32Z"/>
        <path class="sigil-face-light" d="M60 47 85 61 60 77Z"/>
        <path class="sigil-line" d="M60 16v61M35 32 85 61M85 32 35 61M35 32 60 47 85 32"/>
        <g class="sigil-math-nodes">
          <circle cx="60" cy="16" r="2.4"/><circle cx="85" cy="32" r="2.4"/>
          <circle cx="85" cy="61" r="2.4"/><circle cx="60" cy="77" r="2.4"/>
          <circle cx="35" cy="61" r="2.4"/><circle cx="35" cy="32" r="2.4"/>
        </g>
        <path class="sigil-core-star" d="m60 37 2.8 7.2L70 47l-7.2 2.8L60 57l-2.8-7.2L50 47l7.2-2.8Z"/>
      </g>`,
    cs: `
      <g class="sigil-circuit-lines">
        <path d="M43 37H30V24H20M43 48H17M43 59H29V72H19M77 37h14V24h10M77 48h26M77 59h14v13h10M52 30V18M68 30V16M52 67v10M68 67v12"/>
        <circle cx="20" cy="24" r="2.5"/><circle cx="17" cy="48" r="2.5"/>
        <circle cx="19" cy="72" r="2.5"/><circle cx="101" cy="24" r="2.5"/>
        <circle cx="103" cy="48" r="2.5"/><circle cx="101" cy="72" r="2.5"/>
      </g>
      <path class="sigil-circuit-current" d="M20 24h10v13h13M17 48h26M19 72h10V59h14M77 37h14V24h10M77 48h26M77 59h14v13h10"/>
      <g class="sigil-chip">
        <rect class="sigil-chip-shell" x="39" y="28" width="42" height="42" rx="7"/>
        <rect class="sigil-chip-inset" x="45" y="34" width="30" height="30" rx="4"/>
        <path class="sigil-chip-pins" d="M47 24v4m9-4v4m8-4v4m9-4v4M47 70v4m9-4v4m8-4v4m9-4v4M35 37h4m-4 8h4m-4 8h4m-4 8h4M81 37h4m-4 8h4m-4 8h4m-4 8h4"/>
        <path class="sigil-chip-bolt" d="m63 38-12 13h8l-2 10 12-14h-8Z"/>
        <circle class="sigil-chip-dot" cx="47" cy="36" r="1"/>
      </g>`,
    politics: `
      <path class="sigil-laurel" d="M36 73c-13-6-17-17-12-29m-1 11-7-5m9 13-9-2m15 9-8 2M76 75c9-4 14-10 16-18m-5 11 8-2m-14 8 9 1"/>
      <path class="sigil-flag-pole" d="M43 20v58"/>
      <circle class="sigil-pole-cap" cx="43" cy="19" r="2.6"/>
      <g class="sigil-flag">
        <path class="sigil-flag-cloth" d="M45 24c16-12 31 9 50-1v29c-19 10-34-11-50 1Z"/>
        <path class="sigil-flag-fold" d="M66 25v29M82 29v28"/>
        <path class="sigil-flag-star" d="m61 30 2.2 5.1 5.5.5-4.2 3.6 1.3 5.4-4.8-2.8-4.8 2.8 1.3-5.4-4.2-3.6 5.5-.5Z"/>
      </g>
      <g class="sigil-medal">
        <path class="sigil-medal-ribbon" d="m50 65-5 14 9-3 6 7 3-17m5-1 7 13-9-2-6 7-1-17"/>
        <circle class="sigil-medal-shell" cx="60" cy="62" r="14"/>
        <circle class="sigil-medal-ring" cx="60" cy="62" r="10.5"/>
        <path class="sigil-medal-star" d="m60 54 2.4 5.2 5.7.7-4.2 3.9 1 5.6-4.9-2.8-4.9 2.8 1-5.6-4.2-3.9 5.7-.7Z"/>
      </g>`,
    english: `
      <g class="sigil-letter-stars">
        <text class="sigil-letter sigil-letter-a" x="30" y="29">A</text>
        <text class="sigil-letter sigil-letter-b" x="82" y="34">B</text>
        <path class="sigil-letter-trail" d="M39 32q-4 8 1 12M83 38q4 4 1 9"/>
        <path class="sigil-book-star" d="m63 12 2.5 6.5L72 21l-6.5 2.5L63 30l-2.5-6.5L54 21l6.5-2.5Z"/>
      </g>
      <g class="sigil-book">
        <path class="sigil-book-cover" d="M24 43c12-3 26 1 36 8 10-7 24-11 36-8v29c-14-2-26 1-36 8-10-7-22-10-36-8Z"/>
        <path class="sigil-book-paper" d="M28 38c11-1 23 4 32 11 9-7 21-12 32-11v29c-11 0-23 4-32 11-9-7-21-11-32-11Z"/>
        <path class="sigil-book-spine" d="M60 49v29"/>
        <path class="sigil-book-lines" d="M35 47c6 1 12 3 18 7M35 55c6 1 12 3 18 7M35 62q9 2 18 7M67 54c6-4 12-6 18-7M67 62c6-4 12-6 18-7M67 69q9-7 18-7"/>
        <g class="sigil-turn-page">
          <path class="sigil-turn-paper" d="M60 49c7-9 15-14 23-16v28c-8 3-16 9-23 17Z"/>
          <path class="sigil-turn-lines" d="M65 51q6-6 13-9M65 59q6-6 13-9"/>
        </g>
        <path class="sigil-book-ribbon" d="M73 72v11l4-4 4 1V69"/>
      </g>`
  };

  window.FocusSubjectArt = Object.freeze({
    markup(id) {
      if (!Object.prototype.hasOwnProperty.call(drawings, id)) return '';
      return `<svg class="sigil-svg sigil-${id}" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${base}${drawings[id]}${sparkles}</svg>`;
    }
  });
})();
