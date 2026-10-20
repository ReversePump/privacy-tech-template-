/* Grail Break rip stage. Port of PB's 6-seat mock (/srv/sites/_dev/clips/rip/six), driven by the engine's show feed.
 *   const stage = GrailRip.create(containerEl, { root: '../', seats, total, onLand(entry), live: true });
 *   stage.preload(pack)           // show.next: fetch the clip ahead of time ({code, price}, or a code)
 *   stage.reveal(entry)           // a new show.revealed[] entry: queued, played in order, never skipped
 *   stage.playAll(entries)        // demo: the whole dealt box
 *   stage.seedDone([spots])       // entries that were already revealed before this page opened (no replay)
 *   stage.between(label, title, note) / stage.done(totalUsd) / stage.reset()
 * Solo pulls (gacha page): create(el, { solo: true, ... }) skips the seat spin; entry.card may be a Promise — the clip
 * holds on the sealed pack, just before the light, until the card is known (null = no card: the stage stops there).
 * Rules from PB (RIP-STAGE-README.md): the light never fakes, it steps up to the card's true tier and stops; rare/epic
 * get slow-mo + vignette + heartbeat; no fanfare; the spinner only reveals the seat the oracle already chose.
 * 2026-10-12 (PB): the clip's light stays white; at the burst the single-pull reveal takes over (card face-down over
 * YEAR / GRADE / RARITY tiles; rarity stays face-down, shakes harder as its light climbs to the true tier, then flips, card turns over, name + price count up),
 * same slow pace as js/pull.js: a break is an experience people pay for. Then the seat spin.
 */
(function () {
  const ORDER = ['common', 'uncommon', 'rare', 'epic'];
  const REVEAL = { common: 'hit_common', uncommon: 'hit_rare', rare: 'rev_burst', epic: 'rev_crack' };
  const LABEL = { common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', epic: 'EPIC' };
  const SFX = ['hit_uncommon', 'foil', 'riser', 'heart', 'hit_common', 'hit_rare', 'tick', 'land', 'whoosh', 'rev_burst', 'rev_crack'];
  const CLIPS = ['pokemon_100', 'pokemon_250', 'pokemon_500', 'pokemon_1000', 'pokemon_2500', 'pokemon_5000', 'onepiece_250', 'onepiece_1000', 'ewatch_250', 'ewatch_500', 'baseball_250', 'basketball_250', 'football_250', 'soccer_250', 'sports_500', 'riftbound_250', 'dragonball_100'];
  // PB 2026-10-15: every pack plays its foil's clip (same price tiers as the pack art, js/gh.js TIERS); watch boxes keep their own clips
  const FOILS = [[25, 'bronze'], [75, 'silver'], [150, 'emerald'], [250, 'sapphire'], [500, 'amethyst'], [1000, 'gold'], [2500, 'rose'], [1e9, 'celestial']];
  /** Pack (or code + price) → clip name. sealed_80 is sealed product, not a slab: no clip (the reveal still runs). No price → the code's number. */
  function clipFor(code, price) {
    if (code && typeof code === 'object') { price = code.price; code = code.code; }
    code = String(code || '');
    if (code === 'sealed_80') return null;
    if (/watch/.test(code)) {
      if (CLIPS.includes(code)) return code;
      const n = +(code.match(/_(\d+)$/) || [])[1] || 250;
      return n >= 500 ? 'ewatch_500' : 'ewatch_250';
    }
    const p = +price || +(code.match(/_(\d+)$/) || [])[1] || 1000;
    return 'foil_' + FOILS.find(t => p <= t[0])[1];
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tierOf = card => { const t = card && String(card.rarity || '').toLowerCase(); return ORDER.includes(t) ? t : 'common'; };
  const shortGrade = g => String(g || '').replace(/^GEM[- ]?(MT|MINT) /, '').replace(/^NM-MT /, '').replace(/^MINT /, '');
  const nice = s => String(s || 'Card').replace(/-Holo$/i, ' Holo');
  const TILE = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' };
  const tileGrade = (grader, grade) => { const g = String(grade || '').trim(), n = (g.match(/(\d+(?:\.\d)?)\s*$/) || [])[1]; return [grader, n || g].filter(Boolean).join(' ') || '—'; };
  // the reveal's pace (ms), same as js/pull.js
  const PACE_SOLO = { land: 900, beforeTile: 1100, wobble: 650, flip: 750, afterTile: 1500, firstPause: 1400, step: [0, 1500, 1700, 1900], lock: 300, afterRarity: [1600, 1900, 2500, 3000], cardFlip: 1000, count: [1200, 1600, 2400, 3200] };
  // breaks (risk 2026-10-17): the server moves to the next card every 22 s but the full reveal took ~32 s, so every phone fell
  // further behind each card. Same clip, tiles and rarity build-up, tighter pauses and a seat spin capped at ~2.5 s: ~20-23 s.
  // risk 2026-10-17: the deal (card landing, year/grade/rarity tiles) back at the original pace: the trimmed one felt jumpy
  const PACE_BREAK = { land: 900, beforeTile: 1100, wobble: 650, flip: 750, afterTile: 1500, firstPause: 1400, step: [0, 1500, 1700, 1900], lock: 300, afterRarity: [1300, 1600, 2200, 2700], cardFlip: 1000, count: [1000, 1400, 2100, 2800] };

  function create(container, opts) {
    opts = opts || {};
    const root = opts.root || '../';
    let seats = (opts.seats || []).slice(), total = opts.total || seats.length;
    const done = new Set();
    let soundOn = false, ac = null, buf = {}, beat = null, run = 0, queue = Promise.resolve(), started = false;
    const PACE = opts.solo ? PACE_SOLO : PACE_BREAK;
    // catch-up (risk 2026-10-17): reveals waiting behind the one playing speed it up: 1 waiting = 25% faster, 2+ = ~2.5x, so a slow
    // phone or one that was in the background gets back to the live card within a card or two. Solo pulls never wait in a queue.
    let waiting = 0, speed = 1;
    const sw = ms => wait(Math.round(ms * speed));
    // the deal (landing + tiles + rarity build-up + card turn) always plays at its own pace; catch-up only trims the rest
    const dw = ms => wait(ms);

    container.classList.add('rs');
    const tile = (k, cls) => `<div class="rs-tile ${cls}"><div class="rs-tf"><div class="rs-tb"><small>${k}</small><span class="rs-tq">?</span></div><div class="rs-tv"><small>${k}</small><b></b></div></div></div>`;
    const baseClass = container.className; // the page's own classes (e.g. rs-portrait) survive every reset
    container.innerHTML = `<video playsinline muted preload="auto"></video><div class="rs-tint"></div><div class="rs-bloom"></div><div class="rs-vig"></div><div class="rs-flash"></div>
      <div class="rs-tag"><b></b><span></span></div><div class="rs-live" hidden>● LIVE</div>
      <div class="rs-slab"><img alt=""></div>
      <div class="rs-rv"><div class="rs-card"><div class="rs-fl"><div class="rs-cb"><img src="${root}img/brand/logo.svg" alt=""></div><div class="rs-cf"><img alt=""></div></div></div>
        <div class="rs-tiles">${tile('Year', 'rs-yr')}${tile('Grade', 'rs-grd')}${tile('Rarity', 'rs-rar')}</div>
        <div class="rs-title"><div class="rs-tnm"></div><div class="rs-tst"></div><div class="rs-tpr"></div></div></div>
      <div class="rs-info"><div><div class="rs-sub"></div><div class="rs-nm"></div><div class="rs-gr"></div></div><div class="rs-rt"><div class="rs-val">$0</div><div class="rs-tier"></div></div></div>
      <div class="rs-who"><h3>Whose is it?</h3><div class="rs-ring"></div></div>
      <div class="rs-owner"><small>Goes to</small><b></b></div>
      <div class="rs-between rs-on"><div><small></small><span></span><p></p></div></div>
      <div class="rs-ctl"><button type="button" class="rs-snd" aria-label="Turn sound on"></button></div>
      <div class="rs-start" hidden><button type="button">▶ Start</button></div>`;
    const q = s => container.querySelector(s);
    const vid = q('video'), slab = q('.rs-slab'), slabImg = q('.rs-slab img'), info = q('.rs-info'), who = q('.rs-who'), ring = q('.rs-ring'), owner = q('.rs-owner'), btw = q('.rs-between'), tag = q('.rs-tag'), sndBtn = q('.rs-snd'), startEl = q('.rs-start');
    const rv = q('.rs-rv'), rvCard = q('.rs-card'), rvFront = q('.rs-cf img'), rvTitle = q('.rs-title');
    if (opts.live) q('.rs-live').hidden = false;

    // ---- sound (needs a user gesture to start) ----
    async function loadSfx() {
      try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') await ac.resume(); } catch (e) { return; }
      await Promise.all(SFX.map(async n => { if (buf[n]) return; try { buf[n] = await ac.decodeAudioData(await (await fetch(`${root}rip/sfx/${n}.mp3?v=2`)).arrayBuffer()); } catch (e) {} }));
    }
    function play(n, vol, rate, loop) {
      if (!soundOn || !ac || !buf[n]) return null;
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf[n]; s.playbackRate.value = rate || 1; s.loop = !!loop; g.gain.value = vol == null ? 1 : vol;
      s.connect(g).connect(ac.destination); s.start();
      return { stop(t) { t = t || .25; try { g.gain.setTargetAtTime(0, ac.currentTime, t / 3); s.stop(ac.currentTime + t); } catch (e) {} }, rate(r) { try { s.playbackRate.setTargetAtTime(r, ac.currentTime, .15); } catch (e) {} } };
    }
    // PB 2026-10-12: one speaker button. Speaker = sound on, speaker with an x = muted. The choice is remembered.
    const SPK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/>';
    const drawSnd = () => { sndBtn.innerHTML = SPK + (soundOn ? '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>' : '<path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>'); sndBtn.classList.toggle('rs-on', soundOn); sndBtn.setAttribute('aria-label', soundOn ? 'Mute' : 'Turn sound on'); };
    async function setSound(on) {
      soundOn = on; drawSnd();
      try { localStorage.setItem('gb-sound', on ? '1' : '0'); } catch (e) {}
      // iPhones silence web audio when the ring/silent switch is on; a "playback" session plays like a video does
      try { if (on && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      if (on) await loadSfx(); else { beat && beat.stop(); beat = null; }
      try { opts.onSound && opts.onSound(on); } catch (e) {}
    }
    sndBtn.onclick = () => setSound(!soundOn);
    drawSnd();
    // they turned sound on before: it comes back on with their next tap anywhere (browsers need a tap to play audio)
    try { if (localStorage.getItem('gb-sound') === '1') { const arm = (e) => { document.removeEventListener('pointerdown', arm, true); if (!soundOn && !sndBtn.contains(e.target)) setSound(true); }; document.addEventListener('pointerdown', arm, true); } } catch (e) {}

    const setTier = t => container.style.setProperty('--rs-tier', `var(--rs-${t})`);
    function flash() { const f = q('.rs-flash'); f.classList.remove('rs-go'); void f.offsetWidth; f.classList.add('rs-go'); }
    function clearStage() {
      beat && beat.stop(); beat = null;
      container.className = baseClass; setTier('common'); vid.playbackRate = 1;
      [info, who, owner, btw].forEach(e => e.classList.remove('rs-on')); info.classList.remove('rs-side'); slab.className = 'rs-slab';
      rv.className = 'rs-rv'; rvCard.className = 'rs-card'; rvTitle.className = 'rs-title'; rv.querySelectorAll('.rs-tile').forEach(t => t.classList.remove('rs-open', 'rs-wob', 'rs-bump', 'rs-lock', 'rs-charge', 'rs-ten'));
    }
    const fit = b => requestAnimationFrame(() => { b.style.fontSize = ''; let fs = parseFloat(getComputedStyle(b).fontSize); while (b.scrollWidth > b.clientWidth && fs > 8) { fs -= 0.5; b.style.fontSize = fs + 'px'; } });
    // each tile clicks as it turns (pitched up per tile); a 10 lights gold with its own chime (PB 2026-10-12)
    async function flipTile(t, value, alive, o = {}) {
      const b = t.querySelector('.rs-tv b'); b.textContent = value; fit(b);
      t.classList.add('rs-wob'); play('whoosh', .35, 1.15); await dw(PACE.wobble); if (!alive()) return;
      t.classList.remove('rs-wob'); t.classList.add('rs-open'); play('tick', 1, o.rate || 1);
      if (o.ten) { t.classList.add('rs-ten'); play('hit_uncommon', .6); }
      await dw(PACE.flip);
    }
    const isTen = g => /(^|[^\d.])10(\.0)?\s*$/.test(String(g || '').trim());
    function between(label, title, note) { btw.querySelector('small').textContent = label || ''; btw.querySelector('span').textContent = title || ''; btw.querySelector('p').textContent = note || ''; btw.classList.add('rs-on'); }

    // ---- seats ----
    const seatLabel = s => s.label || ('Seat ' + s.n);
    const seatAv = s => s.avatar ? `<img src="${esc(s.avatar)}" alt="">` : `<div class="rs-av">${esc(String(s.n))}</div>`;
    function drawRing(highlightLeft) {
      ring.className = 'rs-ring rs-n' + seats.length;
      ring.innerHTML = seats.map(s => `<div class="rs-s ${highlightLeft && !done.has(s.n) ? '' : 'rs-out'}" data-n="${s.n}">${seatAv(s)}<span>${esc(seatLabel(s))}</span>${seatLabel(s) === 'Seat ' + s.n ? '' : `<small>Seat ${s.n}</small>`}</div>`).join('');
    }
    const hot = n => { ring.querySelectorAll('.rs-s').forEach(e => e.classList.remove('rs-hot')); if (n != null) { const e = ring.querySelector(`.rs-s[data-n="${n}"]`); if (e) e.classList.add('rs-hot'); } };
    // warm the next clip in a hidden player, never the stage's: the poll calls this mid-reveal, and swapping vid.src there
    // played the next pack's foil over the current card (rip 2026-10-17 GH-81A0FF, 4 price tiers)
    const pre = document.createElement('video'); pre.muted = true; pre.preload = 'auto';
    function preloadClip(pack) { const c = clipFor(pack); if (!c) return; const src = `${root}rip/clips/${c}.mp4`; if (!pre.src.endsWith(src.replace(/^\.\.\//, ''))) { pre.src = src; pre.load(); } }

    // ---- one reveal, start to finish (the card is known) ----
    async function rip(entry, alive) {
      const pending = entry.card && typeof entry.card.then === 'function';
      let card = pending ? null : entry.card || {};
      const k = entry.i || 0, pack = entry.pack || {};
      clearStage();
      tag.querySelector('b').textContent = opts.solo ? 'Your pull' : `Pack ${k + 1} of ${total}`;
      tag.querySelector('span').textContent = `${pack.name || pack.code || ''} · ${money(pack.price)} ${opts.solo ? 'pack' : 'machine'}${entry.grand ? ' · grand prize' : ''}`;
      if (card) slabImg.src = card.front || '';
      const clip = clipFor(pack.code, pack.price);
      if (clip) {
        const src = `${root}rip/clips/${clip}.mp4`;
        if (!vid.src.endsWith(src.replace(/^\.\.\//, ''))) { vid.src = src; await new Promise(r => { vid.addEventListener('canplay', r, { once: true }); setTimeout(r, 4000); }); if (!alive()) return; }
        vid.currentTime = 0; vid.playbackRate = speed <= 0.4 ? 1.5 : 1; await vid.play().catch(() => {});
        const rise = play('riser', .5); // sound from the first shake of the pack, not only at the tear (team ask 2026-10-12)
        await sw(1700); if (rise) rise.stop(.3); if (!alive()) return; play('foil', .8);
        await sw(1500); if (!alive()) return;
      } else { container.classList.add('rs-black'); await sw(600); if (!alive()) return; }
      // a solo pull is still being bought: hold the sealed pack right before the light until the card is in
      if (pending) {
        vid.pause();
        card = await entry.card;
        if (!alive()) return;
        if (!card) return 'nocard';
        slabImg.src = card.front || '';
        if (clip) await vid.play().catch(() => {});
      }
      const tier = tierOf(card), rank = ORDER.indexOf(tier);
      // the light stays white: the rarity tile does the build-up now (PB 2026-10-12)
      setTier('common'); container.classList.add('rs-glow');
      // wait for the clip to finish; a pause near the end, a stall or a throttled tab must not hang the stage
      if (clip) { await new Promise(r => { if (vid.ended) return r(); const d = () => r(); vid.addEventListener('ended', d, { once: true }); vid.addEventListener('pause', () => { if (vid.currentTime >= (vid.duration || 6) - .4) d(); }, { once: true }); setTimeout(d, Math.max(1500, ((vid.duration || 6) - vid.currentTime) / (vid.playbackRate || 1) * 1000 + 2500)); }); if (!alive()) return; }
      await sw(250); if (!alive()) return;
      // the burst (white, no tier hint), then the card lands face-down over three face-down tiles
      play('whoosh', .6); flash(); container.classList.add('rs-burst', 'rs-dim');
      await sw(500); if (!alive()) return;
      container.classList.remove('rs-glow', 'rs-burst');
      rvFront.src = card.front || ''; rv.classList.add('rs-on');
      await dw(PACE.land + PACE.beforeTile); if (!alive()) return;
      // year, then grade
      await flipTile(q('.rs-yr'), card.year || '—', alive); if (!alive()) return;
      await dw(PACE.afterTile); if (!alive()) return;
      await flipTile(q('.rs-grd'), tileGrade(card.grader, card.grade), alive, { rate: 1.18, ten: isTen(card.grade) }); if (!alive()) return;
      await dw(PACE.afterTile); if (!alive()) return;
      // rarity stays FACE-DOWN (PB 2026-10-12): the hidden tile shakes and its light climbs white → green → blue → purple,
      // harder with every tier, stops at the true one, then flips once to show it (flash + tier sound)
      const rt = q('.rs-rar'), rb = rt.querySelector('.rs-tv b');
      rb.textContent = TILE[tier]; fit(rb);
      setTier('common'); rt.style.setProperty('--rs-sh', 1); rt.classList.add('rs-charge'); play('tick', .8, 1);
      beat = play('heart', .85, 1, true); // the heartbeat runs through the climb and quickens with each tier
      await dw(PACE.firstPause); if (!alive()) return;
      for (const t of ORDER.slice(1, rank + 1)) {
        const k = ORDER.indexOf(t);
        setTier(t); rt.style.setProperty('--rs-sh', k + 1); rt.classList.remove('rs-bump'); void rt.offsetWidth; rt.classList.add('rs-bump');
        play('tick', .9, 1 + k * .18); if (beat && beat.rate) beat.rate(1 + k * .14);
        await dw(PACE.step[k]); if (!alive()) return;
      }
      beat && beat.stop(.3); beat = null;
      rt.classList.remove('rs-charge', 'rs-bump'); rt.classList.add('rs-open'); play('whoosh', .5);
      await dw(PACE.flip); if (!alive()) return;
      rt.classList.add('rs-lock'); rv.classList.add('rs-lit'); flash(); play(REVEAL[tier], tier === 'common' ? .6 : .9);
      await dw(PACE.lock + PACE.afterRarity[rank]); if (!alive()) return;
      // the card turns over: full name, set, and the price counting up underneath
      play('whoosh', .6); rvCard.classList.add('rs-flip'); await dw(PACE.cardFlip); if (!alive()) return;
      rvTitle.querySelector('.rs-tnm').textContent = nice(card.name);
      rvTitle.querySelector('.rs-tst').textContent = [card.year, String(card.set || '').replace(/^Pokemon /, 'Pokémon ')].filter(Boolean).join(' · ') + (card.grade ? ` · ${[card.grader, card.grade].filter(Boolean).join(' ')}` : '');
      const v = rvTitle.querySelector('.rs-tpr'), dur = PACE.count[rank], t0 = performance.now(), val = +card.value || 0; v.textContent = '$0'; rvTitle.classList.add('rs-on');
      // a hidden tab or iframe gets no animation frames: the timer finishes the count so the queue never stalls behind it
      await new Promise(r => { const end = () => { v.textContent = money(val); r(); }, tm = setTimeout(end, dur + 60); (function f(now) { if (!alive()) { clearTimeout(tm); return r(); } const qq = Math.min(1, (now - t0) / dur); v.textContent = money(val * (1 - Math.pow(1 - qq, 3))); if (qq < 1) requestAnimationFrame(f); else { clearTimeout(tm); r(); } })(t0); });
      if (opts.solo) { try { opts.onLand && opts.onLand(entry, tier); } catch (e) {} return; }
      await sw(rank >= 2 ? 1400 : 800); if (!alive()) return;
      // whose is it? the highlight runs around the seats still waiting and lands on the owner the oracle picked
      const spot = entry.spot, left = seats.map(s => s.n).filter(n => !done.has(n) || n === spot), last = left.length === 1;
      rv.classList.add('rs-aside'); container.classList.add('rs-spin');
      drawRing(true); who.querySelector('h3').textContent = last ? 'Only one seat left' : 'Whose is it?'; who.classList.add('rs-on');
      if (!last && left.includes(spot)) {
        await dw(600); if (!alive()) return;
        // risk 2026-10-17 ("the last jump is erratic and skips a bunch of ppl"): the highlight walks EVERY seat in ring order,
        // one neighbour per hop (seats already dealt are passed, still dimmed), so no hop jumps across the ring when only a few
        // seats are left. Same hop speed and ease as before; about 1.5 laps (1 when catching up), capped so big breaks don't
        // drag (24 hops ≈ 4.3 s), and the start is set back from the oracle's seat so the last hop lands exactly on it.
        const ringOrder = seats.map(x => x.n), N = ringOrder.length, target = ringOrder.indexOf(spot);
        const hops = (speed < 1 ? Math.min(Math.max(N, 6), 16) : Math.min(Math.max(Math.round(1.5 * N), 6), 24)) + Math.floor(Math.random() * 3);
        const at = (((target - hops) % N) + N) % N;
        for (let h = 0; h <= hops; h++) { if (!alive()) return; hot(ringOrder[(at + h) % N]); play('tick', .4, 1 + Math.random() * .06); const qq = h / hops; await wait(55 + 520 * Math.pow(qq, 3.2)); }
      } else { hot(spot); await sw(900); if (!alive()) return; }
      hot(null); const w = ring.querySelector(`.rs-s[data-n="${spot}"]`); if (w) w.classList.add('rs-won');
      play('land', .9); flash();
      const sObj = seats.find(s => s.n === spot); owner.querySelector('b').textContent = sObj ? seatLabel(sObj) : 'Seat ' + spot; owner.classList.add('rs-on');
      done.add(spot);
      try { opts.onLand && opts.onLand(entry, tier); } catch (e) {}
      await sw(rank >= 2 ? 2600 : 1500);
    }

    function enqueue(fn) { queue = queue.then(fn).catch(() => {}); return queue; }
    const api = {
      el: container,
      setSeats(list) { seats = list.slice(); },
      setTotal(n) { total = n; },
      seedDone(spots) { (spots || []).forEach(n => done.add(n)); },
      preload(pack) { preloadClip(pack); },
      enableSound() { return setSound(true); },
      between,
      // `run` only moves on reset(): a queued reveal from an older session is dropped, everything in this session plays in order
      reveal(entry) { const id = run; waiting++; return enqueue(async () => { waiting = Math.max(0, waiting - 1); const alive = () => id === run; if (!alive()) return; speed = opts.solo || waiting < 2 ? 1 : waiting === 2 ? 0.6 : 0.4; if (!started) { started = true; } if (entry.i > 0 || done.size) { clearStage(); container.classList.add('rs-black'); between('Next pack', `Pack ${entry.i + 1} of ${total}`, entry.grand ? 'The grand prize pack' : (entry.pack && entry.pack.name) || ''); await sw(opts.solo ? 1300 : 900); if (!alive()) return; } await rip(entry, alive); }); },
      playAll(entries) { entries.forEach((e, i) => api.reveal(Object.assign({ i }, e))); return queue; },
      // the end of a break: the top hit held up in its tier light, who got it, and the scoreline (PB 2026-10-11)
      results(entry, totalUsd, note, o = {}) { return enqueue(async () => {
        // the break is over: no LIVE badge (it sat under "Pulled by")
        clearStage(); q('.rs-live').hidden = true; const card = (entry && entry.card) || {}, tier = tierOf(card);
        if (!entry || !card.front) { container.classList.add('rs-black'); between('Break complete', money(totalUsd) + ' pulled', note || ''); return; }
        setTier(tier); container.classList.add('rs-black', 'rs-glow', 'rs-burst');
        tag.querySelector('b').textContent = o.label || 'Break complete'; tag.querySelector('span').textContent = o.sub != null ? o.sub : `${money(totalUsd)} pulled${note ? ' ' + note : ''}`;
        slabImg.src = card.front; slab.className = 'rs-slab rs-rise rs-clear';
        const sub = [card.year, card.set].filter(Boolean).join(' · ').replace(/^Pokemon /, 'Pokémon ');
        info.querySelector('.rs-sub').textContent = (o.kick || 'Top hit') + (sub ? ' · ' + sub : '');
        info.querySelector('.rs-nm').textContent = nice(card.name);
        info.querySelector('.rs-gr').innerHTML = card.grade ? `<i>${esc((card.grader ? card.grader + ' ' : '') + shortGrade(card.grade))}</i><span>${esc(card.grade)}</span>` : '';
        info.querySelector('.rs-tier').textContent = LABEL[tier]; info.querySelector('.rs-val').textContent = money(card.value); info.classList.add('rs-on');
        const sObj = seats.find(x => x.n === entry.spot); owner.querySelector('small').textContent = 'Pulled by'; owner.querySelector('b').textContent = sObj ? seatLabel(sObj) : 'Seat ' + entry.spot;
        owner.classList.add('rs-on', 'rs-res');
      }); },
      done(totalUsd, note) { return enqueue(async () => { clearStage(); container.classList.add('rs-black'); between('Break complete', money(totalUsd) + ' pulled', note || ''); }); },
      reset() { run++; waiting = 0; speed = 1; queue = Promise.resolve(); done.clear(); clearStage(); container.classList.add('rs-black'); btw.classList.add('rs-on'); },
      idle(label, title, note) { clearStage(); container.classList.add('rs-black'); between(label, title, note); },
      showStart(onStart) { startEl.hidden = false; startEl.onclick = async () => { startEl.hidden = true; await setSound(true); onStart && onStart(); }; },
      get soundOn() { return soundOn; },
      clipFor,
    };
    return api;
  }
  window.GrailRip = { create, clipFor };
})();
