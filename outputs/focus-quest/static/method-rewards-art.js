(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusMethodArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function avatar() {
    // This is a filled illustration, not an icon. Keep the reset on the SVG
    // itself: the app-wide svg rule otherwise outlines its face and fingers.
    return `<svg class="method-mentor-art" viewBox="0 0 200 180" width="200" height="180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none" style="display:block;width:100%;height:auto;max-width:none;max-height:none;stroke:none">
      <title>研习导师砚青：把听懂的一页，变成亲手写下的解答</title>
      <g data-method-part="setting">
        <circle cx="102" cy="89" r="74" fill="#9fb5a3" opacity=".055"/>
        <path d="M40 67q10-25 29-34m86 61q3 17-4 32" stroke="#a7bfae" stroke-width="1.3" stroke-linecap="round" opacity=".2"/>
        <ellipse cx="104" cy="165" rx="84" ry="10" fill="#0f2530" opacity=".24"/>
        <path d="m157 104 7-29h18l4 29-14 8Z" fill="#738e82"/>
        <path d="M167 76v-23m10 23 7-19m-14 19-9-17" stroke="#d0c1a2" stroke-width="2.3" stroke-linecap="round"/>
        <path d="m180 63 4-6" stroke="#7e9c9a" stroke-width="3.3"/>
        <path d="m166 85 16-1m-17 11 18-1" stroke="#aab6a0" stroke-width="1.2" opacity=".6"/>
      </g>
      <g data-method-part="mentor">
        <g data-method-part="legs">
          <path d="m82 116 16 2-5 43-16 1Z" fill="#425f66"/>
          <path d="m99 118 17-2 4 45-17 1Z" fill="#34525d"/>
          <path d="M78 157h15l2 10H73q-4-5 5-10Z" fill="#66716a"/>
          <path d="M103 157h17q12 3 12 10h-29Z" fill="#57655f"/>
          <path d="M74 166h21m9 0h27" stroke="#b2aa92" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <path d="M83 75q18-11 35 0l10 43-17 17-32-5-10-16Z" fill="#d3cbb0"/>
        <path d="m86 73 12 7 14-7 12 44-15 11-29-5-6-17Z" fill="#6d998d"/>
        <path d="m103 80 9-7 12 44-15 11-6-2Z" fill="#466f6c"/>
        <path d="m87 72 10 9-8 8-7-11Zm25 0-9 9 8 8 7-11Z" fill="#e4d9ba"/>
        <path d="M100 82v41" stroke="#a9bba3" stroke-width="1.6"/>
        <circle cx="103" cy="96" r="1.2" fill="#d9cc9f"/>
        <circle cx="103" cy="107" r="1.2" fill="#d9cc9f"/>
        <path d="M109 99h10v10l-5 3-5-3Z" fill="#81a497"/>
        <path d="M114 102v7" stroke="#e2d3a6" stroke-width="1.3"/>
        <path d="m83 77-13 7-15 22 14 8 17-23Z" fill="#c6c8ad"/>
        <path d="m58 101 14 8-5 9-16-9Z" fill="#e4d9bc"/>
        <path d="m115 77 14 6 15 18-12 12-18-23Z" fill="#d5cbb0"/>
        <path d="m132 95 15 13-7 8-16-12Z" fill="#e8ddbf"/>
        <path d="m59 106 10 6m61-10 11 9" stroke="#a8ad94" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M92 65h15v12q-7 8-15 0Z" fill="#cba58c"/>
        <g data-method-part="face">
          <path d="M81 55V41q-1-22 20-22 21-1 22 23l-2 17-10 9-23-4Z" fill="#4c5e5c"/>
          <circle cx="83.5" cy="53" r="3.2" fill="#caa28b"/>
          <circle cx="118.5" cy="53" r="3.2" fill="#caa28b"/>
          <path d="M86 40q14-12 29 0v15q-1 18-14 18-14-1-15-18Z" fill="#e5c5a8"/>
          <path d="M108 40q6 7 7 18-1 12-14 15 16-2 17-18V42Z" fill="#d3ad92"/>
          <path d="M81 43q-3-20 16-23l-1-7 10 6q18 1 18 25l-8 1-4-10-11 6-3-7-8 8-9 2Z" fill="#5d7068"/>
          <path d="M89 27q15-11 25 3l-12-6-12 10Z" fill="#819184" opacity=".56"/>
          <path d="M88 48q4-2 7-1m11 0q4-1 7 1" stroke="#788373" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="92.5" cy="53.3" r="1.45" fill="#3b4b50"/>
          <circle cx="109" cy="53.3" r="1.45" fill="#3b4b50"/>
          <path d="m101 54-1 5h2" stroke="#c3937d" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M97 64q4 2.5 8-1" stroke="#aa7c70" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="90" cy="60" rx="3" ry="1.5" fill="#d8a394" opacity=".55"/>
          <ellipse cx="113" cy="60" rx="2.7" ry="1.5" fill="#d8a394" opacity=".5"/>
        </g>
      </g>
      <g data-method-part="writing-desk">
        <path d="M40 118v43m52-24v37m73-48v34" stroke="#6f8276" stroke-width="7" stroke-linecap="round"/>
        <path d="m40 143 52 17 73-22" fill="none" stroke="#7f9080" stroke-width="3"/>
        <path d="m27 112 91-26 62 29-85 34Z" fill="#a6ac90"/>
        <path d="m27 112 0 9 68 37 85-34v-9l-85 34Z" fill="#6f8c7d"/>
        <path d="m27 112 68 37v9l-68-37Z" fill="#859b85"/>
        <path d="m40 114 76-22 50 23-73 27Z" fill="#c5c1a1" opacity=".24"/>
        <path d="m36 115 55 28m65-22 16-6" stroke="#d5ccb0" stroke-width="1.2" opacity=".55"/>
      </g>
      <g data-method-part="open-book">
        <path d="m44 111 31-13 20 6 19-3 9 15-26 10-20-5-28 6Z" fill="#537d80"/>
        <path d="m45 108 28-12 19 6 20-4 9 15-25 10-19-5-28 6Z" fill="#e1d6b7"/>
        <path d="m75 96 17 6 4 21-19-5Z" fill="#b6bba0"/>
        <path d="M75 96v22m17-16 4 21" stroke="#8d9b87" stroke-width="1"/>
        <path d="m76 95 12-15q9 2 13 12l-9 10 4 21-19-5Z" fill="#ede0bd"/>
        <path d="m86 88 7 6m-10-2 6 5" stroke="#98a38b" stroke-width="1" stroke-linecap="round"/>
        <path d="m53 109 15-6m-13 10 15-5m32-7 7-2m-6 6 9-3" stroke="#8fa08a" stroke-width="1.1" stroke-linecap="round"/>
        <path d="m94 122 2 9 5-5 1-7" fill="#a89b72"/>
      </g>
      <g data-method-part="practice-paper">
        <path d="m117 108 22-6 23 17-28 13-22-14Z" fill="#d7d7ba"/>
        <path d="m120 105 20-6 22 17-28 13-22-14Z" fill="#eee2c4"/>
        <path d="m123 110 11-4m-7 8 10-4m-5 9 10-4" stroke="#9ca993" stroke-width="1.25" stroke-linecap="round"/>
        <path d="m142 114 3 2 5-5" fill="none" stroke="#608e86" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m112 119-4-1m-4-2-4-1" stroke="#87a396" stroke-width="1.3" stroke-linecap="round"/>
      </g>
      <g data-method-part="hands-and-pen">
        <path d="m60 110 8 4 7-5 8-1q4 1 1 4l-7 4-7 6q-6 3-11-2l-4-4Z" fill="#e1bb9e"/>
        <path d="m67 116 8-4 7-1" stroke="#b58e79" stroke-width="1.2" stroke-linecap="round"/>
        <path d="m133 110 9-8 6 5-1 9-8 3-7-4Z" fill="#dfb99e"/>
        <path d="m145 92-10 31" stroke="#385b66" stroke-width="3.2" stroke-linecap="round"/>
        <path d="m145 92 2-6" stroke="#b9c6af" stroke-width="3.2" stroke-linecap="round"/>
        <path d="m136 120-3 7 0-8Z" fill="#c8b899"/>
        <path d="m133 125-1 3" stroke="#4b6567" stroke-width="1" stroke-linecap="round"/>
        <path d="m138 107 7 2q3 3-1 4l-7-2" fill="#e7c5a7" stroke="#bb957f" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`;
  }

  return {avatar};
});
