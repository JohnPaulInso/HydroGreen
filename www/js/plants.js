/* Custom hand-built plant-stage illustrations — original vector art, not fetched
   from the web, so growth visuals always render offline and never touch copyright.
   Each is defined once (viewBox 0 0 100 100) and can be used two ways:
   - plantIcon(key,size)   -> a standalone <svg> for cards/modals
   - plantIconInner(key)   -> just the shapes, to embed inside a bigger SVG
     (e.g. directly inside a tower pocket cup) via a scaled <g> wrapper. */
const PLANT_ICON_INNER = {
  empty: `<circle cx="50" cy="50" r="36" fill="none" stroke="#C9D6CC" stroke-width="4" stroke-dasharray="5 7"/><path d="M50 36v28M36 50h28" stroke="#AABBAF" stroke-width="5" stroke-linecap="round"/>`,
  germination: `<ellipse cx="50" cy="80" rx="28" ry="9" fill="#CBA876"/><path d="M50 80 C50 70 47 62 50 54" stroke="#7A5A32" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="50" rx="7" ry="9" fill="#EFDFA6" stroke="#CBA876" stroke-width="2"/>`,
  cotyledon: `<ellipse cx="50" cy="82" rx="28" ry="8" fill="#CBA876"/><path d="M50 82 V58" stroke="#4C7A3F" stroke-width="4" stroke-linecap="round"/><ellipse cx="38" cy="54" rx="13" ry="8" fill="#93D07C" transform="rotate(-22 38 54)"/><ellipse cx="62" cy="54" rx="13" ry="8" fill="#93D07C" transform="rotate(22 62 54)"/>`,
  thinning: `<rect x="30" y="68" width="40" height="16" rx="3" fill="#BB9C7A"/><path d="M50 68 V42" stroke="#3F7A3B" stroke-width="4" stroke-linecap="round"/><ellipse cx="36" cy="44" rx="14" ry="9" fill="#72C25E" transform="rotate(-25 36 44)"/><ellipse cx="64" cy="44" rx="14" ry="9" fill="#72C25E" transform="rotate(25 64 44)"/><ellipse cx="50" cy="32" rx="9" ry="12" fill="#59AB4F"/>`,
  transplant: `<path d="M40 62 L36 84 M60 62 L64 84 M50 62 V86" stroke="#CBA876" stroke-width="3" stroke-linecap="round"/><rect x="31" y="54" width="38" height="14" rx="3" fill="#E1D7BC" stroke="#BB9C7A" stroke-width="2"/><path d="M50 54 V26" stroke="#2F7A3B" stroke-width="4" stroke-linecap="round"/><ellipse cx="35" cy="33" rx="14" ry="9" fill="#5FBA54" transform="rotate(-25 35 33)"/><ellipse cx="65" cy="33" rx="14" ry="9" fill="#5FBA54" transform="rotate(25 65 33)"/><ellipse cx="50" cy="18" rx="10" ry="13" fill="#4CA748"/>`,
  vegetative: `<ellipse cx="50" cy="87" rx="32" ry="7" fill="#DCEFE1"/><g fill="#2F8F4E"><ellipse cx="50" cy="55" rx="20" ry="24"/><ellipse cx="29" cy="63" rx="16" ry="20" transform="rotate(-30 29 63)"/><ellipse cx="71" cy="63" rx="16" ry="20" transform="rotate(30 71 63)"/></g><ellipse cx="50" cy="50" rx="12" ry="16" fill="#40B15E"/>`,
  harvest: `<ellipse cx="50" cy="87" rx="32" ry="7" fill="#F6E7C9"/><g fill="#E8A33D"><ellipse cx="50" cy="55" rx="21" ry="25"/><ellipse cx="29" cy="63" rx="16" ry="20" transform="rotate(-30 29 63)"/><ellipse cx="71" cy="63" rx="16" ry="20" transform="rotate(30 71 63)"/></g><ellipse cx="50" cy="50" rx="12" ry="16" fill="#DA6A31"/><circle cx="74" cy="28" r="11" fill="#fff" stroke="#E8A33D" stroke-width="3"/><path d="M69 28 l4 4 8-8" stroke="#E8A33D" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
};
const STAGE_DESCRIPTIONS = {
  germination: 'Days 1–3. Kept dark and humid so the seed pushes out its first root.',
  cotyledon: 'Days 4–9. The cover comes off — seedlings need direct morning sun from here on.',
  thinning: 'Days 10–11. Snip the weaker sprouts so one strong seedling gets all the light per cube.',
  transplant: 'Days 12–14. Roots are visible — move the rockwool cube into a tower net pot.',
  vegetative: 'Days 15–35. Full nutrient circulation; this is where most of the growth happens.',
  harvest: 'Day 36+. Ready to pick — harvest outer leaves or the whole head.'
};
function plantIconInner(stageKey){ return PLANT_ICON_INNER[stageKey] || PLANT_ICON_INNER.empty; }
function plantIcon(stageKey, size){
  const s = size || 48;
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${plantIconInner(stageKey)}</svg>`;
}
