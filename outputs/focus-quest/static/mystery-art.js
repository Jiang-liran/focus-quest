(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusMysteryArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // No SVG IDs or external references: several portraits and gifts can coexist.
  const star = (x, y, radius, color) => {
    const inset = radius * .28;
    return `<path d="M${x} ${y - radius} L${x + inset} ${y - inset} L${x + radius} ${y} L${x + inset} ${y + inset} L${x} ${y + radius} L${x - inset} ${y + inset} L${x - radius} ${y} L${x - inset} ${y - inset} Z" fill="${color}"/>`;
  };
  const svg = (className, width, height, attributes, body) => `<svg class="${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none"${attributes}>${body}</svg>`;

  function portrait() {
    return svg('mystery-npc-art', 160, 180, '', `
      <ellipse cx="80" cy="164" rx="52" ry="7" fill="#111a2d" opacity=".3"/>
      <ellipse cx="80" cy="162" rx="39" ry="3" fill="#a69fc9" opacity=".12"/>
      <g class="mystery-star-specks">
        ${star(25, 52, 3, '#b6c9d9')}${star(120, 24, 3.4, '#d5c3e4')}${star(145, 90, 2.5, '#b9d6d2')}
        <circle cx="36" cy="30" r="1.1" fill="#b5a8cc"/><circle cx="138" cy="120" r="1.4" fill="#b5a8cc"/>
        <circle cx="19" cy="98" r="1" fill="#d8ccaa"/><circle cx="106" cy="13" r="1" fill="#d8ccaa"/>
      </g>
      <g class="mystery-moon-staff">
        <ellipse cx="131" cy="153" rx="11" ry="2" fill="#a69fc9" opacity=".12"/>
        <path d="M131 64 L131 145" stroke="#968aa9" stroke-width="3" stroke-linecap="round"/>
        <path d="M131 67 L131 142" stroke="#c8c1da" stroke-width="1"/>
        <path d="M139 29 C123 27 115 41 119 52 C123 64 138 68 147 55 C135 60 124 49 131 38 C133 34 136 31 139 29 Z" fill="#bdc2d9"/>
        <path d="M139 29 C130 33 121 46 127 56 C121 54 118 48 120 42 C123 33 130 28 139 29 Z" fill="#e0d5e4"/>
        ${star(137, 45, 5.5, '#e6d2a2')}
        <path d="M126 67 L136 67 L134 73 L128 73 Z" fill="#c4b491"/>
        <path d="M128 83 C116 88 121 99 135 101 C144 104 138 115 127 118" stroke="#8999b7" stroke-width="1.2" opacity=".7"/>
        <path d="M131 143 L134 148 L131 152 L128 148 Z" fill="#b5c8cf"/>
      </g>
      <path d="M61 145 L72 145 L73 159 L57 159 C56 154 58 149 61 145 Z" fill="#45445a"/>
      <path d="M89 145 L100 145 C104 150 106 154 105 159 L88 159 Z" fill="#35384e"/>
      <path d="M61 72 L97 71 L109 99 L115 125 L123 151 L109 158 L89 152 L75 159 L42 153 L48 127 L51 100 Z" fill="#4c526f"/>
      <path d="M81 73 L97 71 L109 99 L115 125 L123 151 L109 158 L89 152 Z" fill="#333d58"/>
      <path d="M61 74 L78 84 L62 131 L42 153 L48 127 L51 100 Z" fill="#607084"/>
      <path d="M80 89 L74 151 L60 148 Z" fill="#6d7694" opacity=".5"/>
      <path d="M94 92 L102 145 L114 150 L104 118 Z" fill="#29334d"/>
      <path d="M47 146 L61 150 L75 154 L89 147 L110 153 L117 150" stroke="#a9a3bf" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M61 74 L47 80 L34 95 L42 106 L57 94 L67 84 Z" fill="#657187"/>
      <path d="M47 80 L39 96 L43 103 L57 94 L67 84 Z" fill="#434e6b"/>
      <path d="M37 96 L45 101 L41 108 L34 103 Z" fill="#a9a0b2"/>
      <path d="M97 75 L108 81 L118 93 L111 103 L99 91 Z" fill="#4d5876"/>
      <path d="M111 92 C118 91 120 94 117 98 C115 102 111 102 108 98 Z" fill="#b5abba"/>
      <path d="M60 71 L51 60 L55 43 L68 29 L82 21 L98 33 L107 48 L110 66 L99 77 L79 84 Z" fill="#66688a"/>
      <path d="M82 21 L98 33 L107 48 L110 66 L99 77 L79 84 L82 66 Z" fill="#3e4465"/>
      <path d="M68 29 L55 43 L51 60 L60 71 L64 52 L81 33 Z" fill="#7d7a9b"/>
      <path d="M64 48 L81 34 L98 50 L102 65 L92 74 L79 79 L62 69 L59 61 Z" fill="#252e47"/>
      <path d="M66 51 L81 40 L94 52 L96 65 L88 71 L78 74 L65 66 Z" fill="#374259"/>
      <path d="M66 51 L81 40 L80 72 L65 66 Z" fill="#485367"/>
      <path d="M69 59 L74 60 M85 60 L90 58" stroke="#d3d8d7" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M76 68 Q80 70 84 67" stroke="#9d9eae" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M61 69 L79 79 L99 72 L94 83 L80 91 L66 83 Z" fill="#9290ae"/>
      <path d="M79 79 L99 72 L94 83 L80 91 Z" fill="#727692"/>
      <path d="M61 69 L79 79 L99 72" stroke="#c7bbce" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M79 83 L84 89 L79 95 L74 89 Z" fill="#ccb98f"/>
      <path d="M79 85 L81 89 L79 92 L77 89 Z" fill="#c2d3d3"/>
      <path d="M85 98 L91 115 L87 131" stroke="#9fa7bc" stroke-width=".8" opacity=".6"/>
      <circle cx="85" cy="98" r="1.5" fill="#c4cbd5"/><circle cx="91" cy="115" r="1.3" fill="#c4cbd5"/>
      ${star(87, 131, 2.6, '#bdc5d3')}
      <g class="mystery-lantern">
        <g class="mystery-lantern-glow">
          <ellipse cx="38" cy="128" rx="19" ry="24" fill="#d5c597" opacity=".08"/>
          <ellipse cx="38" cy="128" rx="13" ry="17" fill="#e5d2a0" opacity=".1"/>
        </g>
        <path d="M33 115 L33 110 C33 103 43 103 43 110 L43 115" stroke="#c1b392" stroke-width="2"/>
        <path d="M26 119 L38 111 L50 119 L47 123 L29 123 Z" fill="#a69b87"/>
        <path d="M38 111 L50 119 L47 123 L38 123 Z" fill="#817c7e"/>
        <path d="M29 122 L47 122 L46 141 L38 147 L30 141 Z" fill="#8e8491"/>
        <path d="M32 124 L44 124 L43 139 L38 142 L33 139 Z" fill="#e0c18e"/>
        <path d="M38 124 L44 124 L43 139 L38 142 Z" fill="#b2bfa6"/>
        <g class="mystery-lantern-glow">${star(38, 132, 6, '#fff0c0')}</g>
        <path d="M38 122 L38 143 M29 122 L31 141 L38 145 L45 141 L47 122" stroke="#bca98c" stroke-width="1.4"/>
        <path d="M29 141 L38 146 L47 141 L47 145 L38 150 L29 145 Z" fill="#8e8790"/>
        <path d="M32 118 L44 118" stroke="#d9c79f" stroke-width="1"/>
      </g>`);
  }

  const palettes = [
    null,
    {top: '#a9a1bd', left: '#817e9d', right: '#5e6585', ribbon: '#c5c9d3', gem: '#d8e2d8', ink: '#e0d9d8'},
    {top: '#96bdc0', left: '#668f9f', right: '#4f718b', ribbon: '#d8c8a2', gem: '#d2ebe0', ink: '#e0dbc6'},
    {top: '#b3a0c8', left: '#8b79ad', right: '#625b8b', ribbon: '#e3c18b', gem: '#d6e5e7', ink: '#f0d9af'},
    {top: '#d8c39d', left: '#a898ad', right: '#6f7198', ribbon: '#f0d69b', gem: '#edf1dd', ink: '#f6e6bd'},
  ];

  function gift(tier = 1, opened = false) {
    // Never interpolate caller strings or call object coercion hooks into SVG.
    tier = typeof tier === 'number' && Number.isFinite(tier) ? Math.max(1, Math.min(4, Math.floor(tier))) : 1;
    opened = opened === true;
    const p = palettes[tier], lift = opened ? 18 : 0;
    const lid = `<g class="mystery-gift-lid">
      <path d="M17 ${43 - lift} L48 ${28 - lift} L79 ${43 - lift} L48 ${58 - lift} Z" fill="${p.top}"/>
      <path d="M17 ${43 - lift} L48 ${58 - lift} L48 ${64 - lift} L17 ${49 - lift} Z" fill="${p.left}"/>
      <path d="M48 ${58 - lift} L79 ${43 - lift} L79 ${49 - lift} L48 ${64 - lift} Z" fill="${p.right}"/>
      <path d="M27 ${38 - lift} L33 ${35 - lift} L64 ${50 - lift} L58 ${53 - lift} Z M63 ${35 - lift} L69 ${38 - lift} L38 ${53 - lift} L32 ${50 - lift} Z" fill="${p.ribbon}"/>
      <path d="M32 ${50 - lift} L38 ${53 - lift} L38 ${59 - lift} L32 ${56 - lift} Z M58 ${53 - lift} L64 ${50 - lift} L64 ${56 - lift} L58 ${59 - lift} Z" fill="${p.ribbon}"/>
      <path d="M47 ${30 - lift} C42 ${19 - lift} 29 ${19 - lift} 29 ${25 - lift} C29 ${33 - lift} 40 ${33 - lift} 47 ${30 - lift} Z M49 ${30 - lift} C54 ${19 - lift} 67 ${19 - lift} 67 ${25 - lift} C67 ${33 - lift} 56 ${33 - lift} 49 ${30 - lift} Z" fill="${p.ribbon}"/>
      <path d="M43 ${29 - lift} C39 ${25 - lift} 34 ${23 - lift} 33 ${26 - lift} M53 ${29 - lift} C57 ${25 - lift} 62 ${23 - lift} 63 ${26 - lift}" stroke="${p.right}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M48 ${25 - lift} L53 ${30 - lift} L48 ${35 - lift} L43 ${30 - lift} Z" fill="${p.gem}"/>
      <path d="M19 ${44 - lift} L48 ${58 - lift} L77 ${44 - lift}" stroke="${p.ink}" stroke-width="1" opacity=".6"/>
    </g>`;
    const details = tier >= 2 ? `<g class="mystery-gift-ornament">
      <path d="M24 62 L27 63 M24 67 L27 68 M69 63 L72 62 M69 68 L72 67" stroke="${p.ink}" stroke-width="1.2" stroke-linecap="round"/>
      ${star(41, 67, 2.3, p.ink)}${star(55, 68, 2.3, p.ink)}
      ${tier >= 3 ? `<path d="M23 70 L28 73 L28 77 M68 77 L68 73 L73 70" stroke="${p.ribbon}" stroke-width="1.2"/>
        <path d="M48 65 L54 72 L48 80 L42 72 Z" fill="${p.ribbon}"/>
        <path d="M48 68 L51 72 L48 77 L45 72 Z" fill="${p.gem}"/>` : ''}
      ${tier >= 4 ? `<path d="M22 53 L22 69 L28 72 M74 53 L74 69 L68 72" stroke="${p.ink}" stroke-width="1"/>
        <path d="M24 80 Q48 91 72 80" stroke="${p.ribbon}" stroke-width="1" opacity=".5"/>` : ''}
    </g>` : '';
    const sparkles = `<g class="mystery-gift-sparkles">
      ${tier >= 2 ? star(15, 30, 2.3, p.ink) + star(82, 61, 2.6, p.ink) : ''}
      ${tier >= 3 ? star(79, 22, 3.3, p.ink) + '<circle cx="13" cy="62" r="1.2" fill="#c7c2df"/>' : ''}
      ${tier >= 4 ? star(10, 47, 3.2, p.ink) + star(84, 39, 3.6, p.gem) + '<circle cx="23" cy="18" r="1.3" fill="#e8d9b0"/>' : ''}
      ${opened ? star(38, 46, 3, p.gem) + star(60, 43, 4, p.ink) + star(47, 38, 2.4, p.gem) : ''}
    </g>`;
    return svg('mystery-gift-art', 96, 96, ` data-tier="${tier}" data-opened="${opened}"`, `
      <ellipse cx="48" cy="85" rx="31" ry="5" fill="#192238" opacity=".25"/>
      ${tier >= 4 ? '<ellipse class="mystery-gift-light" cx="48" cy="54" rx="37" ry="36" fill="#d9c9a2" opacity=".08"/>' : ''}
      <path d="M20 47 L48 34 L76 47 L48 60 Z" fill="${opened ? '#3f435f' : p.top}"/>
      ${opened ? `<path class="mystery-gift-light" d="M28 47 L24 31 L48 22 L73 32 L68 47 L48 57 Z" fill="${p.gem}" opacity=".18"/>` : ''}
      <path d="M20 47 L48 60 L48 84 L20 71 Z" fill="${p.left}"/>
      <path d="M48 60 L76 47 L76 71 L48 84 Z" fill="${p.right}"/>
      <path d="M31 52 L37 55 L37 79 L31 76 Z M59 55 L65 52 L65 76 L59 79 Z" fill="${p.ribbon}"/>
      <path d="M22 70 L48 82 L74 70" stroke="${p.ink}" stroke-width="1" opacity=".5"/>
      ${details}${lid}${sparkles}`);
  }

  return {portrait, gift};
});
