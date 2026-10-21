/* Camo Cash in-app swaps: Private route, Privacy swap, Track (design-only reference: square-card swap UI)
   Live data via /api/ds. */
(function () {
  if (window.__dkSwap) return;
  window.__dkSwap = 1;

  var F = window.__bfFetch || window.fetch.bind(window);
  var API = '/api/ds';
  var LS_KEY = 'cadabra_orders_v1';
  var REFRESH_SECS = 30;
  var SOL_ICON = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png';

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) {
    var x = Number(n);
    if (!isFinite(x) || x === 0) return '0';
    if (x >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (x >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return x.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }
  function usd(n) {
    var x = Number(n);
    if (!isFinite(x) || x <= 0) return '';
    return '$' + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qp(o) {
    return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&');
  }
  function req(path, opts, attempt) {
    attempt = attempt || 0;
    return F(API + path, Object.assign({ credentials: 'same-origin', headers: { accept: 'application/json' } }, opts || {}, {
      headers: Object.assign({ accept: 'application/json' }, (opts && opts.headers) || {})
    })).then(function (r) {
      return r.text().then(function (t) {
        var html = /^\s*</.test(t || '');
        if (html) {
          // an edge/bot check answered instead of our API: retry quietly, never show raw HTML
          var isPost = opts && opts.method === 'POST';
          if (attempt < (isPost ? 1 : 3)) return (window.__bfHeal ? window.__bfHeal() : new Promise(function (res) { setTimeout(res, 900 * (attempt + 1)); })).then(function () { return req(path, opts, attempt + 1); });
          var ce = new Error('Connection check in progress. Please try again in a few seconds.'); ce.challenge = true; throw ce;
        }
        var d = {};
        try { d = t ? JSON.parse(t) : {}; } catch (e) { d = { error: 'Unexpected response' }; }
        if (!r.ok) {
          if ((r.status === 502 || r.status === 503 || r.status === 429) && attempt < 2 && (!opts || opts.method !== 'POST' || (d && d.busy))) {
            return new Promise(function (res) { setTimeout(res, 800 * (attempt + 1)); }).then(function () { return req(path, opts, attempt + 1); });
          }
          throw new Error((d && (d.error || d.message)) || ('Request failed (' + r.status + ')'));
        }
        return d;
      });
    }, function (e) {
      if (attempt < 2) return new Promise(function (res) { setTimeout(res, 800); }).then(function () { return req(path, opts, attempt + 1); });
      throw new Error('Network error. Please check your connection and retry.');
    });
  }
  function b64u(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  var MEMO = {};
  function memo(k, fn) {
    var m = MEMO[k], now = Date.now();
    if (m && now - m.t < 300000) return m.p;
    var p = fn().catch(function (e) { delete MEMO[k]; throw e; });
    MEMO[k] = { t: now, p: p };
    return p;
  }
  function post(path, body) {
    var json = JSON.stringify(body);
    return req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json }).catch(function (e) {
      if (!e || !e.challenge) throw e;
      // edge bot-check swallowed the POST (it never reached us): resend through the GET tunnel
      var p = path.split('?')[0];
      return req('/_post' + p + '?b=' + b64u(json)).catch(function (e2) {
        if (!e2 || !e2.challenge || !window.__bfHeal) throw e2;
        return window.__bfHeal().then(function () { return req('/_post' + p + '?b=' + b64u(json)); });
      });
    });
  }
  function nearIcon(t) {
    if (t.icon) return t.icon;
    if (t.chain === 'sol') {
      if (t.native || t.symbol === 'SOL') return SOL_ICON;
      if (t.contractAddress) return '/api/bifrost/v1/indexer/v1/logo/' + encodeURIComponent(t.contractAddress);
    }
    var s = (t.symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return s ? 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/' + s + '.png' : '';
  }
  var api = {
    tokens: function (side, term, chain) { return memo('t|' + side + '|' + (term || '') + '|' + (chain || ''), function () { return req('/tokens?' + qp({ side: side, term: term, chain: chain })).then(function (d) { return d.tokens || []; }); }); },
    quotes: function (o) { return req('/quotes?' + qp(o)).then(function (d) { return d.quotes || []; }); },
    order: function (b) { return post('/orders', b); },
    getOrder: function (id) { return req('/orders/' + encodeURIComponent(id)); },
    nTokens: function (side, term) {
      return memo('n|' + side + '|' + (term || ''), function () {
        return req('/near/tokens?' + qp({ side: side, term: term })).then(function (d) {
          return (d.tokens || []).map(function (t) { var o = Object.assign({}, t); o.name = t.name || t.symbol; o.icon = nearIcon(t); return o; });
        });
      });
    },
    nQuote: function (b) { return post('/near/quote', b); },
    nOrder: function (b) { return post('/near/orders', b); },
    nGetOrder: function (id) { return req('/near/orders/' + encodeURIComponent(id)); }
  };
  function localOrders() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } }
  function saveOrder(o) {
    var all = localOrders(), i = all.findIndex(function (x) { return x.id === o.id; });
    if (i >= 0) all[i] = o; else all.unshift(o);
    localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 30)));
  }
  function localOrder(id) {
    id = (id || '').trim().toLowerCase();
    return localOrders().find(function (o) { return (o.id || '').toLowerCase() === id; });
  }

  /* ---------------- icons ---------------- */
  var SV = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 18) + '" height="' + (w || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var IC = {
    route: '<circle cx="6" cy="19" r="2"></circle><circle cx="18" cy="5" r="2"></circle><path d="M8 19h5.5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7H16"></path>',
    shield: '<path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z"></path><path d="M9 12.5l2 2 4-4"></path>',
    track: '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path>',
    flip: '<path d="M7 4v16"></path><path d="M3 8l4-4 4 4"></path><path d="M17 20V4"></path><path d="M21 16l-4 4-4-4"></path>',
    close: '<path d="M6 6l12 12M18 6L6 18"></path>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"></rect><path d="M5 15V5a1 1 0 0 1 1-1h10"></path>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
    chev: '<path d="M6 9l6 6 6-6"></path>',
    search: '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>'
  };
  function IMGP(u) {
    if (!u || typeof u !== 'string') return u;
    if (/^https:\/\//i.test(u) && u.indexOf(location.origin) !== 0) {
      try { return '/api/bifrost/v1/_img?k=' + btoa(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return u; }
    }
    return u;
  }
  var JD2 = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/';
  function coin(src, sym, size, badge) {
    size = size || 30;
    src = IMGP(src); badge = IMGP(badge);
    var letter = esc((sym || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?');
    var img = src
      ? '<img class="m" src="' + esc(src) + '" data-fb="' + esc(IMGP(JD2 + String(sym || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.png')) + '" alt="" style="width:' + size + 'px;height:' + size + 'px" onload="if(this.naturalWidth===1)this.onerror()" onerror="if(this.dataset.fb&&!this.dataset.t){this.dataset.t=1;this.src=this.dataset.fb;}else{this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';}">' +
        '<span class="lt" style="display:none;width:' + size + 'px;height:' + size + 'px">' + letter + '</span>'
      : '<span class="lt" style="width:' + size + 'px;height:' + size + 'px">' + letter + '</span>';
    var b = badge ? '<img class="b" src="' + esc(badge) + '" alt="" onerror="this.remove()">' : '';
    return '<span class="gx-ico" style="width:' + size + 'px;height:' + size + 'px">' + img + b + '</span>';
  }

  /* ---------------- CSS ---------------- */
  var CSS = [
    "#gx-view,#gx-modal{--gx-bg:var(--cc-card,#fff);--gx-box:var(--s-field,#f3f4ee);--gx-line:var(--line,rgba(0,0,0,.08));--gx-line2:var(--line-2,rgba(0,0,0,.14));--gx-mut:var(--fg-3,#8a8d80);--gx-fg:var(--fg,#14160f);--gx-fg2:var(--fg-2,#4a4d42);--gx-acc:var(--veil-hi,#2b2f33);--gx-grad:linear-gradient(180deg,#ffffff,#d9dbe0);--gx-ease:cubic-bezier(.2,.9,.25,1);--gx-spring:cubic-bezier(.34,1.56,.64,1)}",
    "html:not(.gx-on) #gx-view{display:none!important}",
    "#gx-intro{max-width:760px;margin:0 auto 18px;padding:16px 20px;border-radius:0;border:1px solid var(--cc-card-line,rgba(0,0,0,.07));background:var(--cc-card,#fff);box-shadow:var(--cc-shadow,none);color:var(--fg-2);font-family:var(--f-sans);animation:ncRise .4s cubic-bezier(.2,.9,.25,1) both}",
    "#gx-intro .gx-intro-k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--veil-hi);font-weight:700}",
    "#gx-intro p{margin:6px 0 0;font-size:14px;line-height:1.6;color:var(--fg-2)}",
    ".gx-intro-t{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.gx-intro-t span{font-size:11.5px;padding:4px 10px;border-radius:0;background:var(--veil-wash);color:var(--veil-hi);font-weight:600}",
    ".gx-intro-nw{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--fg-2)}.gx-intro-nw b{color:var(--fg)}.gx-intro-nw a{color:var(--veil-hi);margin-left:8px;text-decoration:none;font-weight:600}",
    "nav.side .gx-nav span{white-space:nowrap}",
    ".gx-nw{font-style:normal;margin-left:auto;font-size:8.5px;letter-spacing:.05em;text-transform:uppercase;padding:1px 6px;border-radius:0;background:var(--veil-wash);color:var(--veil-hi);white-space:nowrap}",
    ".gx-x{display:inline-flex;align-items:center;justify-content:center;margin-right:6px;text-decoration:none}",
    "@media (max-width:520px){#gx-intro{margin:0 0 14px;padding:14px;cursor:pointer}#gx-intro:not(.open) p{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}#gx-intro:not(.open) .gx-intro-t{display:none}#gx-intro:not(.open)::after{content:'Tap to read more';display:block;margin-top:6px;font-size:11px;color:var(--fg-3)}}",
    "html.gx-on main.main>:not(#gx-view):not(#gx-intro):not(#cc-foot){display:none!important}",
    "html.gx-on .nav-i.on:not(.gx-nav){background:transparent!important;color:var(--fg-2)!important}",
    "html.gx-on nav.tabbar .nav-i.on:not(.gx-nav),html.gx-on nav.tabbar .nav-i.on:not(.gx-nav) *{color:var(--fg-3)!important;background:transparent!important;box-shadow:none!important}",
    "nav.tabbar:has(.gx-nav){grid-template-columns:repeat(6,minmax(0,1fr))!important}",
    "nav.tabbar .gx-nav span{white-space:nowrap}",
    "#gx-view{display:block;padding:6px 0 40px;font-family:var(--f-sans);color:var(--gx-fg)}",
    "#gx-view *,#gx-modal *{box-sizing:border-box}",
    ".gx-wrap{width:min(470px,100%);margin:0 auto}",
    ".gx-seg{position:relative;display:flex;justify-content:center;gap:4px;margin:0 auto 18px;padding:4px;width:max-content;max-width:100%;border-radius:0;background:var(--gx-box);border:1px solid var(--gx-line)}",
    ".gx-seg button{all:unset;cursor:pointer;padding:8px 16px;border-radius:0;color:var(--gx-mut);font-size:14px;font-weight:500;display:inline-flex;gap:7px;align-items:center;white-space:nowrap;transition:background .25s var(--gx-ease),color .2s,transform .22s var(--gx-spring)}",
    ".gx-seg button:hover{color:var(--gx-fg)}.gx-seg button:active{transform:scale(.95)}",
    ".gx-seg button.on{background:var(--gx-bg);color:var(--gx-fg);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 14px -6px rgba(0,0,0,.18)}",
    ".gx-cl{width:16px;height:16px;border-radius:0;background:var(--veil-wash);color:var(--veil-hi);font-size:10px;display:inline-flex;align-items:center;justify-content:center}",
    ".gx-card{background:var(--gx-bg);border:1px solid var(--cc-card-line,var(--gx-line));border-radius:0;padding:18px 18px 22px;box-shadow:var(--cc-shadow,none);animation:ncRise .45s var(--gx-ease) both}",
    ".gx-lbl{color:var(--gx-mut);font-size:13.5px;font-weight:500;margin:8px 6px 8px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}",
    ".gx-lbl small{font-size:12px;color:var(--gx-mut)}",
    ".gx-row{display:flex;gap:6px;padding:6px;border-radius:0;background:var(--gx-box);border:1px solid var(--gx-line);transition:border-color .2s,box-shadow .2s}",
    ".gx-row:focus-within{border-color:rgba(90,98,110,.55);box-shadow:0 0 0 4px rgba(160,170,184,.2)}",
    ".gx-tok{all:unset;box-sizing:border-box;cursor:pointer;width:140px;height:62px;flex:none;background:var(--gx-bg);border:1px solid var(--gx-line);border-radius:0;padding:10px 12px;display:flex;align-items:center;gap:10px;transition:transform .22s var(--gx-spring),border-color .2s,box-shadow .2s}",
    ".gx-tok:hover{border-color:var(--gx-line2);box-shadow:0 4px 14px -8px rgba(0,0,0,.25)}.gx-tok:active{transform:scale(.97)}",
    ".gx-tok .t{min-width:0;display:flex;flex-direction:column}",
    ".gx-sym{font-weight:600;font-size:15.5px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:78px}",
    ".gx-ch{font-size:12px;color:var(--gx-mut);line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:78px}",
    ".gx-sel{font-size:15px;color:var(--gx-fg2);font-weight:500}",
    ".gx-ico{position:relative;display:inline-flex;flex:none}",
    ".gx-ico img.m{border-radius:0;object-fit:cover;display:block}",
    ".gx-ico .lt{border-radius:0;background:var(--veil-wash);color:var(--veil-hi);align-items:center;justify-content:center;font-size:12px;font-weight:700;display:flex}",
    ".gx-ico img.b{position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:0;border:1.5px solid var(--gx-bg);background:var(--gx-bg)}",
    ".gx-amt{flex:1;min-width:0;height:62px;background:transparent;border:0;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:2px;cursor:text;text-align:right}",
    ".gx-amt input{all:unset;font-family:var(--f-sans);font-weight:600;font-size:24px;width:100%;color:var(--gx-fg);text-align:right;letter-spacing:-.02em}",
    ".gx-amt input::placeholder{color:var(--gx-mut)}",
    ".gx-amt .u{font-size:12px;line-height:1.3;flex:none;color:var(--gx-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
    ".gx-out{font-weight:600;font-size:24px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
    ".gx-out.z{color:var(--gx-mut)}",
    ".gx-flip{all:unset;width:38px;height:38px;margin:-8px auto -8px;position:relative;z-index:2;border-radius:0;border:4px solid var(--gx-bg);background:var(--gx-box);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--gx-fg2);transition:transform .35s var(--gx-spring),background .2s}",
    ".gx-flip:hover{transform:rotate(180deg);background:var(--veil-wash);color:var(--veil-hi)}",
    ".gx-field{margin-top:6px}",
    ".gx-in{display:flex;align-items:center;gap:8px;background:var(--gx-box);border:1px solid var(--gx-line);border-radius:0;padding:12px 14px;transition:border-color .2s,box-shadow .2s}",
    ".gx-in:focus-within{border-color:rgba(90,98,110,.55);box-shadow:0 0 0 4px rgba(160,170,184,.2)}",
    ".gx-in input{all:unset;flex:1;min-width:0;font-family:var(--f-mono,monospace);font-size:13px;color:var(--gx-fg)}",
    ".gx-in input::placeholder{color:var(--gx-mut);font-family:var(--f-sans)}",
    ".gx-paste{all:unset;cursor:pointer;font-size:12px;font-weight:600;color:var(--gx-fg2);background:var(--gx-bg);border:1px solid var(--gx-line);border-radius:0;padding:5px 11px;transition:transform .2s var(--gx-spring)}",
    ".gx-paste:hover{color:var(--gx-fg);border-color:var(--gx-line2)}.gx-paste:active{transform:scale(.94)}",
    ".gx-hint{color:var(--gx-mut);font-size:12px;margin:8px 8px 0}",
    ".gx-rates{margin-top:16px}",
    ".gx-r{all:unset;box-sizing:border-box;width:100%;cursor:pointer;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;transition:border-color .2s,background .2s,transform .22s var(--gx-spring);animation:ncRise .35s var(--gx-ease) both}",
    ".gx-r:hover{border-color:var(--gx-line2)}.gx-r:active{transform:scale(.985)}",
    ".gx-r.on{border-color:rgba(90,98,110,.7);background:var(--veil-wash);box-shadow:0 0 0 3px rgba(160,170,184,.18)}",
    ".gx-r .k{font-size:12px;color:var(--gx-mut)}",
    ".gx-r .v{font-weight:600;font-size:14px}",
    ".gx-r .best{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1a2200;background:var(--gx-grad);padding:2px 8px;border-radius:0;margin-left:8px}",
    ".gx-fees{margin-top:8px;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:6px 12px}",
    ".gx-fees>div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:12.5px;border-top:1px dashed var(--gx-line)}",
    ".gx-fees>div:first-child{border-top:0}",
    ".gx-fees span{color:var(--gx-mut)}.gx-fees b{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}",
    ".gx-fees-m{margin:12px 0}.gx-fees .gx-fees-h span{color:inherit;font-weight:600}",
    ".gx-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}",
    ".gx-meta div{border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:9px 11px}",
    ".gx-meta b{display:block;font-weight:500;font-size:11px;color:var(--gx-mut)}",
    ".gx-meta span{font-weight:600;font-size:12.5px}",
    ".gx-lim{font-size:12px;color:var(--gx-mut);margin:8px 8px 0}",
    ".gx-cta{all:unset;box-sizing:border-box;width:100%;margin-top:20px;height:52px;border-radius:0;font-size:16px;font-weight:600;color:#08090c;cursor:pointer;background:var(--gx-grad);box-shadow:0 8px 24px -8px rgba(40,44,50,.85),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center;gap:10px;transition:transform .22s var(--gx-spring),box-shadow .25s,opacity .2s,filter .2s}",
    ".gx-cta:hover{transform:translateY(-1px);box-shadow:0 12px 30px -8px rgba(40,44,50,.95),inset 0 1px 0 rgba(255,255,255,.6)}",
    ".gx-cta:active{transform:scale(.975)}",
    ".gx-cta[disabled]{opacity:.45;cursor:not-allowed;filter:grayscale(.35);transform:none;box-shadow:none}",
    ".gx-err{margin-top:14px;border-radius:0;border:1px solid rgba(200,48,74,.25);background:rgba(200,48,74,.07);color:var(--bad,#c8304a);padding:10px 12px;font-size:13px;animation:ncRise .3s var(--gx-ease) both}",
    ".gx-note{text-align:center;color:var(--gx-mut);font-size:12px;margin-top:14px}",
    ".gx-live{display:inline-flex;align-items:center;gap:6px;color:var(--gx-fg2);font-size:12px}",
    ".gx-live i{width:7px;height:7px;border-radius:0;background:#8c95a3}",
    ".gx-spin{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:0;animation:dks .8s linear infinite;display:inline-block}",
    "@keyframes dks{to{transform:rotate(360deg)}}",
    "#gx-modal{position:fixed;inset:0;z-index:90;background:rgba(18,19,21,.4);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:grid;place-items:center;font-family:var(--f-sans);color:var(--gx-fg);animation:ncFade .2s ease both}",
    ".gx-mb{width:min(440px,calc(100% - 24px));max-height:calc(100vh - 52px);background:var(--gx-bg);border:1px solid var(--cc-card-line,var(--gx-line));border-radius:0;padding:20px;display:flex;flex-direction:column;box-shadow:0 30px 80px -24px rgba(20,22,25,.45);animation:ncPop .32s var(--gx-spring) both}",
    ".gx-mh{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}",
    ".gx-mh h3{margin:0;font-size:18px;font-weight:600}",
    ".gx-mb .gx-x{all:unset;cursor:pointer;color:var(--gx-fg2);display:flex;width:32px;height:32px;border-radius:0;align-items:center;justify-content:center;transition:background .2s,transform .2s var(--gx-spring)}",
    ".gx-mb .gx-x:hover{background:var(--gx-box);color:var(--gx-fg)}.gx-mb .gx-x:active{transform:scale(.9)}",
    ".gx-chains{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}",
    ".gx-chain{all:unset;box-sizing:border-box;cursor:pointer;height:46px;border:1px solid var(--gx-line);border-radius:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;color:var(--gx-fg2);text-align:center;padding:0 4px;overflow:hidden;transition:background .2s,border-color .2s,transform .2s var(--gx-spring)}",
    ".gx-chain span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
    ".gx-chain:hover{background:var(--gx-box)}.gx-chain:active{transform:scale(.96)}",
    ".gx-chain.on{background:var(--veil-wash);border-color:rgba(90,98,110,.6);color:var(--gx-fg);font-weight:600}",
    ".gx-chain img{width:16px;height:16px;border-radius:0}",
    ".gx-srch{display:flex;align-items:center;gap:10px;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:10px 12px;color:var(--gx-mut)}",
    ".gx-srch:focus-within{border-color:rgba(90,98,110,.55);box-shadow:0 0 0 4px rgba(160,170,184,.2)}",
    ".gx-srch input{all:unset;flex:1;font-size:15px;color:var(--gx-fg)}",
    ".gx-srch input::placeholder{color:var(--gx-mut)}",
    ".gx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 6px}",
    ".gx-err-sw{all:unset;cursor:pointer;display:inline-block;margin-left:6px;font-weight:600;text-decoration:underline;text-underline-offset:3px}",
    ".gx-chip{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;background:var(--gx-box);border:1px solid var(--gx-line);padding:4px 10px 4px 5px;border-radius:0;font-size:12.5px;font-weight:600;transition:background .2s,transform .2s var(--gx-spring)}",
    ".gx-chip:hover{background:var(--veil-wash)}.gx-chip:active{transform:scale(.95)}",
    ".gx-list{overflow-y:auto;margin:4px -8px 0;padding:0 8px;min-height:120px}",
    ".gx-it{all:unset;box-sizing:border-box;width:100%;cursor:pointer;display:flex;align-items:center;gap:13px;padding:9px 8px;border-radius:0;transition:background .15s}",
    ".gx-it:hover{background:var(--gx-box)}",
    ".gx-it .n{font-size:15px;font-weight:500;line-height:20px}",
    ".gx-it .s{font-size:12px;color:var(--gx-mut)}",
    ".gx-it .p{margin-left:auto;text-align:right;font-size:12px;color:var(--gx-mut);flex:none}",
    ".gx-empty{padding:36px 0;text-align:center;color:var(--gx-mut);font-size:14px;display:flex;gap:8px;align-items:center;justify-content:center}",
    ".gx-sec{font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:600;color:var(--gx-mut);padding:10px 8px 2px}",
    ".gx-pair{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:12px 14px;gap:8px}",
    ".gx-pair .a{display:flex;align-items:center;gap:10px;min-width:0}",
    ".gx-pair .a div{font-size:14px;font-weight:600} .gx-pair .a small{display:block;font-size:11px;color:var(--gx-mut);font-weight:400}",
    ".gx-cf{margin-top:12px}",
    ".gx-cf .k{font-size:12px;color:var(--gx-mut);margin:0 0 6px 4px}",
    ".gx-cf .v{display:flex;align-items:center;gap:8px;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:10px 12px}",
    ".gx-cf code{font-family:var(--f-mono,monospace);font-size:12.5px;word-break:break-all;color:var(--gx-fg);flex:1}",
    ".gx-cp{all:unset;cursor:pointer;color:var(--gx-fg2);display:flex;padding:4px;border-radius:0;transition:background .2s,transform .2s var(--gx-spring)}",
    ".gx-cp:hover{color:var(--gx-fg);background:var(--gx-bg)}.gx-cp:active{transform:scale(.88)}",
    ".gx-timer{margin-top:12px;border-radius:0;background:var(--veil-wash);padding:9px 12px;font-size:13px;color:var(--gx-fg2)}",
    ".gx-timer b{font-family:var(--f-mono,monospace);color:var(--gx-fg)}",
    ".gx-steps{margin-top:18px;display:grid;gap:10px}",
    ".gx-step{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--gx-mut);transition:color .3s}",
    ".gx-step i{width:26px;height:26px;border-radius:0;border:1px solid var(--gx-line2);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:600;transition:background .3s,border-color .3s}",
    ".gx-step.done{color:var(--gx-fg)} .gx-step.done i{background:var(--gx-grad);border-color:transparent;color:#1a2200}",
    ".gx-step.act{color:var(--gx-fg)} .gx-step.act i{border-color:#8c95a3;animation:ncPulse 1.8s ease-in-out infinite}",
    ".gx-badge{display:inline-flex;align-items:center;gap:6px;border-radius:0;background:var(--veil-wash);padding:4px 10px;font-size:12px;font-weight:600;color:var(--veil-hi);margin-top:10px}",
    ".gx-recent{all:unset;box-sizing:border-box;width:100%;cursor:pointer;display:flex;align-items:center;gap:10px;border:1px solid var(--gx-line);background:var(--gx-box);border-radius:0;padding:11px 12px;margin-top:6px;font-size:13px;transition:border-color .2s,transform .2s var(--gx-spring)}",
    ".gx-recent:hover{border-color:var(--gx-line2)}.gx-recent:active{transform:scale(.985)}",
    ".gx-recent code{margin-left:auto;font-family:var(--f-mono,monospace);font-size:11px;color:var(--gx-mut);max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "@media (max-width:520px){.gx-tok{width:122px}#gx-view{padding:4px 0 150px}.gx-card{padding:14px 12px 18px;border-radius:0}"
    + ".gx-seg{width:100%}.gx-seg button{flex:1;justify-content:center;padding:8px 6px;font-size:13px;gap:5px}.gx-seg button svg{display:none}}",
    /* ---- token picker: Portal-style arrangement (Camo Cash light) ---- */
    ".gx-pk{width:min(480px,calc(100% - 24px));padding:14px 20px 0;max-height:calc(100vh - 40px);overflow:hidden}",
    ".gx-pk .gx-grab{width:44px;height:5px;border-radius:0;background:var(--gx-line2);margin:0 auto 6px;display:none}",
    ".gx-pk .gx-mh{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;margin:4px 0 16px}",
    ".gx-pk .gx-mh h3{grid-column:2;text-align:center;font-size:24px;font-weight:700;letter-spacing:-.02em}",
    ".gx-pk .gx-mh .gx-x{grid-column:3;width:40px!important;height:40px!important;border-radius:0;margin:0}",
    ".gx-pk .gx-lbl{font-size:15px;font-weight:600;color:var(--gx-fg);margin:0 0 10px 2px;display:flex;align-items:center;justify-content:space-between;gap:8px}",
    ".gx-pk .gx-lbl2{font-size:14px;font-weight:500;color:var(--gx-mut);margin:16px 0 4px 2px}",
    ".gx-pk .gx-lbl2 button{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--gx-acc);padding:2px 6px;border-radius:0}",
    ".gx-pk .gx-lbl2 button:hover{background:var(--veil-wash)}",
    ".gx-pk .gx-chains{grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}",
    ".gx-pk .gx-chain{height:76px;border-radius:0;gap:7px;font-size:12.5px;padding:0 3px;border:1.5px solid var(--gx-line2);color:var(--gx-fg2)}",
    ".gx-pk .gx-chain img,.gx-pk .gx-chain .gx-cl{width:30px;height:30px;border-radius:0;flex:none}",
    ".gx-pk .gx-chain .gx-cl{display:flex;align-items:center;justify-content:center;background:var(--gx-box);font-weight:700;font-size:13px;color:var(--gx-fg2)}",
    ".gx-pk .gx-chain .gx-more{width:30px;height:30px;border-radius:0;display:flex;align-items:center;justify-content:center;background:var(--gx-fg2);color:#fff;font-size:20px;line-height:1;font-weight:400}",
    ".gx-pk .gx-chain.on{background:var(--veil-wash);border-color:rgba(90,98,110,.75);color:var(--gx-fg);font-weight:600;box-shadow:0 0 0 3px rgba(160,170,184,.22)}",
    ".gx-pk .gx-chain.fixed{cursor:default}",
    ".gx-pk .gx-srch{border-radius:0;padding:13px 18px;border:1.5px solid var(--gx-line2);background:transparent;gap:12px}",
    ".gx-pk .gx-srch input{font-size:16px}",
    ".gx-pk .gx-chips{display:none}",
    ".gx-pk .gx-list{margin:0 -20px;padding:0 0 18px;min-height:160px}",
    ".gx-pk .gx-it{border-radius:0;padding:11px 26px;gap:16px;cursor:pointer}",
    ".gx-pk .gx-it:hover{background:var(--gx-box)}",
    ".gx-pk .gx-it.sel{background:var(--veil-wash)}",
    ".gx-pk .gx-it .n{font-size:17px;font-weight:600;line-height:22px;color:var(--gx-fg)}",
    ".gx-pk .gx-it .s{font-size:13px;color:var(--gx-mut);display:flex;align-items:center;gap:7px;margin-top:2px;min-width:0;white-space:nowrap}",
    ".gx-pk .gx-it .s .nm{overflow:hidden;text-overflow:ellipsis;max-width:150px}",
    ".gx-pk .gx-it .s .dot{width:3px;height:3px;border-radius:0;background:currentColor;opacity:.7;flex:none}",
    ".gx-pk .gx-addr{color:var(--gx-fg2);text-decoration:underline;text-underline-offset:3px;font-family:var(--f-mono,monospace);font-size:12px;display:inline-flex;align-items:center;gap:3px}",
    ".gx-pk .gx-addr:hover{color:var(--gx-acc)}",
    ".gx-pk .gx-it .tx{min-width:0;flex:1}",
    ".gx-pk .gx-it .p{font-size:13px;line-height:18px}",
    ".gx-pk .gx-sec{padding:12px 26px 4px}",
    "@keyframes dkSheetUp{from{transform:translateY(100%)}to{transform:none}}",
    "@media (max-width:640px){#gx-modal.pk{place-items:end center}#gx-modal.pk .gx-pk{width:100%;max-height:92vh;border-radius:0;border-bottom:0;padding:10px 16px 0;animation:dkSheetUp .34s var(--gx-ease) both}"
    + ".gx-pk .gx-grab{display:block}.gx-pk .gx-mh h3{font-size:22px}.gx-pk .gx-chains{gap:7px}.gx-pk .gx-chain{height:70px;font-size:11.5px}.gx-pk .gx-chain img,.gx-pk .gx-chain .gx-cl,.gx-pk .gx-chain .gx-more{width:28px;height:28px}"
    + ".gx-pk .gx-list{margin:0 -16px;padding-bottom:calc(18px + env(safe-area-inset-bottom))}.gx-pk .gx-it{padding:11px 20px}.gx-pk .gx-it .s .nm{max-width:110px}}"
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('gx-swap-css')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    var s = document.createElement('style');
    s.id = 'gx-swap-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- state ---------------- */
  var S = {
    view: null, method: 'private',
    send: null, recv: null, amount: '', dest: '', refund: '',
    routes: [], ri: 0, quoting: false, qerr: '', validUntil: 0,
    submitting: false, serr: '', reqId: 0,
    track: { q: '', local: null, live: null, loading: false, err: '', searched: false, poll: null }
  };
  var qTimer = null;

  function isNear() { return S.method === 'privacy'; }
  function selected() { return S.routes[S.ri] || null; }
  var B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, EVM = /^0x[a-fA-F0-9]{40}$/;
  var ADDR = {
    solana: B58, sol: B58,
    bitcoin: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
    tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
    litecoin: /^(ltc1[a-z0-9]{25,62}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,33})$/,
    near: /^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+\.(near|tg)$|^[a-f0-9]{64}$/,
    zec: /^(t1|t3)[a-km-zA-HJ-NP-Z1-9]{33}$|^(zs1|u1)[a-z0-9]{40,}$/, Zcash: /^(t1|t3)[a-km-zA-HJ-NP-Z1-9]{33}$|^(zs1|u1)[a-z0-9]{40,}$/,
    xlm: /^G[A-Z2-7]{55}$/, ripple: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, monero: /^[48][1-9A-HJ-NP-Za-km-z]{94,105}$/
  };
  var EVM_CHAINS = /^(ethereum|eth|bsc|arbitrum|arb|base|op|optimism|pol|polygon|avalanche|cronos|gnosis|gravity|hyperevm|manta-pacific|pulsechain|rootstock|sei|ARC|Robinhood)$/;
  function addrOk(chain, a) {
    a = (a || '').trim();
    if (!a) return false;
    if (EVM_CHAINS.test(chain || '')) return EVM.test(a);
    var re = ADDR[chain];
    return re ? re.test(a) : a.length >= 20;
  }
  function destOk() { return !!S.recv && addrOk(S.recv.chain, S.dest); }
  function refundOk() { return B58.test(S.refund.trim()); }

  var CHAIN_ALIAS = { eth: 'ethereum', 'ethereum mainnet': 'ethereum', mainnet: 'ethereum', bsc: 'bnb', 'binance smart chain': 'bnb', 'bnb smart chain': 'bnb', 'bnb chain': 'bnb', binance: 'bnb',
    arb: 'arbitrum', 'arbitrum one': 'arbitrum', op: 'optimism', 'op mainnet': 'optimism', pol: 'polygon', matic: 'polygon', 'polygon pos': 'polygon', avax: 'avalanche', 'avalanche c-chain': 'avalanche',
    sol: 'solana', btc: 'bitcoin', trx: 'tron', ton: 'ton', 'the open network': 'ton', xrp: 'ripple', 'xrp ledger': 'ripple', doge: 'dogecoin', ltc: 'litecoin', zec: 'zcash', xlm: 'stellar', near: 'near', sui: 'sui', base: 'base' };
  function canonChain(t) {
    var cands = [(t && t.chainName) || '', (t && t.chain) || ''];
    for (var i = 0; i < cands.length; i++) {
      var c = String(cands[i]).toLowerCase().trim();
      if (!c) continue;
      if (CHAIN_ALIAS[c]) return CHAIN_ALIAS[c];
      var c2 = c.replace(/\s+(mainnet|network|chain)$/, '');
      if (CHAIN_ALIAS[c2]) return CHAIN_ALIAS[c2];
      if (i === 0) return c2;
    }
    return '';
  }
  function resetPair() {
    S.send = null; S.recv = null; S.routes = []; S.ri = 0; S.qerr = ''; S.serr = ''; S.validUntil = 0;
  }

  function scheduleQuote() {
    clearTimeout(qTimer);
    qTimer = setTimeout(fetchQuote, 550);
  }

  function fetchQuote() {
    var amt = parseFloat(S.amount);
    var near = isNear();
    var ready = S.send && S.recv && amt > 0 && (!near || (destOk() && refundOk()));
    if (!ready) { S.routes = []; S.quoting = false; S.qerr = ''; render(); return Promise.resolve(); }
    var id = ++S.reqId;
    S.quoting = true; S.qerr = ''; S.qerrSwitch = false; render();
    var p = near
      ? api.nQuote({ from: S.send.id, to: S.recv.id, amount: S.amount, recipient: S.dest.trim(), refundTo: S.refund.trim() }).then(function (q) {
          var out = parseFloat(q.amountOut);
          S.routes = [{ quoteId: q.quoteId, out: out, usdIn: amt * (S.send.price || 0), usdOut: out * (S.recv.price || 0),
            etaMin: q.estimatedSeconds ? Math.max(1, Math.round(q.estimatedSeconds / 60)) : null, min: q.min, max: q.max,
            appFeeBps: q.appFeeBps != null ? Number(q.appFeeBps) : null, withdrawFee: q.withdrawFee != null ? parseFloat(q.withdrawFee) : null,
            refundFee: q.refundFee != null ? parseFloat(q.refundFee) : null, minOut: q.minAmountOut != null ? parseFloat(q.minAmountOut) : null,
            pIn: (q.from && q.from.price) || S.send.price || 0, pOut: (q.to && q.to.price) || S.recv.price || 0 }];
          var R0 = S.routes[0]; R0.usdIn = amt * R0.pIn; R0.usdOut = out * R0.pOut;
          S.ri = 0;
          S.validUntil = q.validUntil ? new Date(q.validUntil).getTime() : Date.now() + REFRESH_SECS * 1000;
        })
      : api.quotes({ amount: S.amount, from: S.send.id, to: S.recv.id }).then(function (qs) {
          if (!qs || !qs.length) { S.routes = []; S.qerr = 'No route available for this pair. Try a different asset or amount.'; return; }
          S.routes = qs.slice().sort(function (a, b) { return b.amountOut - a.amountOut; }).slice(0, 3).map(function (q) {
            return { quoteId: q.quoteId, out: q.amountOut, usdIn: q.amountInUsd, usdOut: q.amountOutUsd,
              etaMin: q.duration ? Math.max(1, Math.round(q.duration)) : null, min: q.min, max: q.max };
          });
          S.ri = 0;
          S.validUntil = Date.now() + REFRESH_SECS * 1000;
        });
    return p.catch(function (e) {
        if (id !== S.reqId) return;
        S.routes = [];
        var m = String(e && e.message || '');
        if (near && /no privacy swap route|not available|quoting/i.test(m)) {
          // provider-side outage: say so plainly and offer the other engine
          S.qerr = 'Privacy swap providers aren\u2019t quoting right now. Try again in a few minutes, or use Private route.';
          S.qerrSwitch = true;
        } else { S.qerr = m; }
      })
      .then(function () { if (id === S.reqId) { S.quoting = false; if (!S.submitting) render(); } });
  }

  function feeInfo(sel, amt, near) {
    var rows = [], sIn = (S.send && S.send.symbol) || '', sOut = (S.recv && S.recv.symbol) || '';
    var usdIn = Number(sel.usdIn) || 0, usdOut = Number(sel.usdOut) || 0;
    var cost = usdIn > 0 && usdOut > 0 ? Math.max(0, usdIn - usdOut) : null;
    var pct = cost != null && usdIn > 0 ? cost / usdIn * 100 : null;
    var total = cost != null ? usd(cost) + ' (' + pct.toFixed(2) + '%)' : '—';
    if (near) {
      if (sel.appFeeBps != null) rows.push(['Camo Cash fee (' + (sel.appFeeBps / 100).toFixed(2) + '%)', fmt(amt * sel.appFeeBps / 10000) + ' ' + sIn + (S.send && S.send.price ? ' · ' + usd(amt * sel.appFeeBps / 10000 * S.send.price) : '')]);
      if (sel.withdrawFee != null) rows.push(['Network fee (' + ((S.recv && S.recv.chainName) || 'destination') + ')', fmt(sel.withdrawFee) + ' ' + sOut + (sel.pOut ? ' · ' + usd(sel.withdrawFee * sel.pOut) : '')]);
      if (sel.minOut != null) rows.push(['Minimum received', fmt(sel.minOut) + ' ' + sOut]);
      if (sel.refundFee != null) rows.push(['Refund fee (only if it fails)', fmt(sel.refundFee) + ' ' + sIn]);
    } else {
      rows.push(['Route fee + spread (all-in)', cost != null ? usd(cost) + ' · ' + pct.toFixed(2) + '%' : 'Included in quote']);
      rows.push(['You send', fmt(amt) + ' ' + sIn + (usdIn ? ' · ' + usd(usdIn) : '')]);
      rows.push(['You receive', fmt(sel.out) + ' ' + sOut + (usdOut ? ' · ' + usd(usdOut) : '')]);
    }
    rows.push(['Network gas', 'Included']);
    return { total: total, rows: rows, cost: cost, pct: pct };
  }

  function cta() {
    var amt = parseFloat(S.amount), near = isNear();
    var validDest = destOk(), validRefund = refundOk();
    var sel = selected();
    var ok = S.send && S.recv && sel && validDest && (!near || validRefund) && !S.quoting && !S.submitting;
    var t = 'Review swap';
    if (!S.send) t = 'Choose the asset you send';
    else if (!amt || amt <= 0) t = 'Enter an amount';
    else if (!S.recv) t = 'Pick an asset to receive';
    else if (!S.dest.trim()) t = 'Enter a destination address';
    else if (!validDest) t = 'Invalid ' + (S.recv.chainName || '') + ' address';
    else if (near && !S.refund.trim()) t = 'Enter your Solana refund address';
    else if (near && !validRefund) t = 'Invalid Solana refund address';
    else if (S.qerr) t = 'No quote · adjust and retry';
    else if (S.quoting || !sel) t = 'Fetching quote…';
    if (S.submitting) t = 'Creating order…';
    return { ok: !!ok, text: t };
  }

  function submit() {
    var c = cta();
    if (!c.ok) return;
    var sel = selected(), near = isNear();
    S.submitting = true; S.serr = ''; render();
    var ri = S.ri;
    create(sel, near).catch(function (e) {
      if (e && e.challenge) return new Promise(function (r) { setTimeout(r, 2500); }).then(function () { return create(sel, near); });
      throw e;
    }).catch(function (e) {
      if (!/fresh quote|claimed|expired|quote/i.test(e.message || '')) throw e;
      return fetchQuote().then(function () {
        S.ri = Math.min(ri, Math.max(0, S.routes.length - 1));
        var s2 = selected();
        if (!s2) throw new Error(S.qerr || 'Quote expired. Please try again.');
        return create(s2, near);
      });
    }).then(function (rec) {
      try { var fz = feeInfo(sel, parseFloat(S.amount), near); rec.feeTotal = fz.total; rec.feeRows = fz.rows; } catch (x) {}
      saveOrder(rec); openOrder(rec); })
      .catch(function (e) {
        var m = String((e && e.message) || '');
        if (near && (/incident|paused|unavailable|503|502|not available|try again later|busy/i.test(m) || (e && e.status >= 500))) {
          S.serr = ''; S.qerr = 'Privacy swap is temporarily paused by the network for new orders. Nothing was charged. Try again shortly, or use Private route now.'; S.qerrSwitch = true;
        } else if (/too many|rate limit|429/i.test(m)) {
          S.serr = 'Lots of swaps right now. Wait a few seconds and tap again; nothing was charged.';
        } else { S.serr = friendlyErr(m); }
      })
      .then(function () { S.submitting = false; render(); });
  }

  function friendlyErr(m) {
    if (/Connection check|Upstream is busy/i.test(m || '')) return 'Network check still running. Tap the button again in a few seconds; nothing was charged.';
    if (/recipient|address/i.test(m || '')) return 'The destination address is not valid for ' + ((S.recv && S.recv.chainName) || 'this network') + '. Double-check it and retry.';
    return m || 'Could not create the order. Please retry.';
  }

  function create(sel, near) {
    var p;
    if (near) {
      var rid = (window.crypto && crypto.randomUUID && crypto.randomUUID()) || ('req-' + Math.random().toString(16).slice(2));
      p = api.nOrder({ quoteId: sel.quoteId, requestId: rid }).then(function (o) {
        return { id: o.requestId, method: 'privacy', depositAddress: o.depositAddress, depositMemo: o.depositMemo || null,
          addressTo: o.recipient, amount: o.amountIn, sendSymbol: (o.from && o.from.symbol) || S.send.symbol,
          outAmount: o.amountOut, recvSymbol: (o.to && o.to.symbol) || S.recv.symbol,
          networkName: (o.to && o.to.chainName) || S.recv.chainName, sendIcon: S.send.icon, recvIcon: S.recv.icon,
          expires: o.deadline, eta: o.estimatedSeconds, createdAt: Date.now() };
      });
    } else {
      p = api.order({ quoteId: sel.quoteId, addressTo: S.dest.trim() }).then(function (o) {
        return { id: o.orderId || o.id, method: 'private', depositAddress: o.depositAddress, depositMemo: null,
          addressTo: o.receiverAddress || S.dest.trim(), amount: o.inAmount, sendSymbol: o.inSymbol || S.send.symbol,
          outAmount: o.outAmount, recvSymbol: S.recv.symbol, networkName: S.recv.chainName,
          sendIcon: S.send.icon, recvIcon: S.recv.icon, expires: o.expires, eta: o.eta, createdAt: Date.now() };
      });
    }
    return p;
  }

  /* ---------------- render: swap ---------------- */
  function tokBtn(side) {
    var t = side === 'source' ? S.send : S.recv;
    var badge = side === 'source' ? SOL_ICON : (t && chainIconFor(chainKey(t), t));
    if (!t) {
      return '<button class="gx-tok" data-act="pick" data-side="' + side + '" data-testid="gx-pick-' + side + '">' +
        '<span class="gx-ico" style="width:30px;height:30px"><span class="lt" style="width:30px;height:30px">' + SV(IC.chev, 14) + '</span></span>' +
        '<span class="t"><span class="gx-sel">Select</span><span class="gx-ch">' + (side === 'source' ? 'Solana' : 'Any chain') + '</span></span></button>';
    }
    return '<button class="gx-tok" data-act="pick" data-side="' + side + '" data-testid="gx-pick-' + side + '">' + coin(t.icon, t.symbol, 30, badge) +
      '<span class="t"><span class="gx-sym">' + esc(t.symbol) + '</span><span class="gx-ch">' + esc(t.chainName || '') + '</span></span></button>';
  }

  function swapHTML() {
    var near = isNear(), sel = selected(), amt = parseFloat(S.amount), c = cta();
    var secs = S.validUntil ? Math.max(0, Math.round((S.validUntil - Date.now()) / 1000)) : 0;
    var usdIn = sel ? usd(sel.usdIn) : (S.send && amt > 0 ? usd(amt * (S.send.price || 0)) : '');
    var h = '';
    h += '<div class="gx-card" data-testid="gx-swap-card">';
    h += '<div class="gx-lbl"><span>From</span><small>Solana · Min $3</small></div>';
    h += '<div class="gx-row">' + tokBtn('source') +
      '<label class="gx-amt"><input id="gx-amount" data-testid="gx-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(S.amount) + '">' +
      '<span class="u">' + (usdIn ? '≈ ' + usdIn : (S.send ? esc(S.send.name || S.send.symbol) : '&nbsp;')) + '</span></label></div>';
    h += '<button class="gx-flip" data-act="refresh" title="Refresh quote" data-testid="gx-refresh">' + SV(IC.flip, 15) + '</button>';
    h += '<div class="gx-lbl"><span>To</span><small>' + (S.recv ? esc(S.recv.chainName) : 'Any supported network') + '</small></div>';
    var outTxt = S.quoting && !sel ? '<span class="gx-spin"></span>' : (sel ? esc(fmt(sel.out)) : '0');
    h += '<div class="gx-row">' + tokBtn('destination') +
      '<div class="gx-amt"><div class="gx-out' + (sel ? '' : ' z') + '" data-testid="gx-out">' + outTxt + '</div>' +
      '<span class="u">' + (sel && sel.usdOut ? '≈ ' + usd(sel.usdOut) : (sel && S.send && S.recv && amt > 0 ? '1 ' + esc(S.send.symbol) + ' ≈ ' + esc(fmt(sel.out / amt)) + ' ' + esc(S.recv.symbol) : '&nbsp;')) + '</span></div></div>';

    if (sel) {
      h += '<div class="gx-rates">';
      h += '<div class="gx-lbl" style="margin-top:4px"><span>' + (S.routes.length > 1 ? 'Routes' : 'Route') + '</span><span class="gx-live"><i></i>' + (S.quoting ? 'refreshing…' : 'Live · new in ' + secs + 's') + '</span></div>';
      S.routes.forEach(function (r, i) {
        h += '<button class="gx-r' + (i === S.ri ? ' on' : '') + '" data-act="route" data-i="' + i + '" data-testid="gx-route-' + i + '">' +
          '<span><span class="k">' + (near ? 'Privacy swap · shielded' : 'Route ' + (i + 1)) + '</span>' + (i === 0 ? '<span class="best">Best</span>' : '') + '</span>' +
          '<span class="v">' + esc(fmt(r.out)) + ' ' + esc(S.recv.symbol) + '</span></button>';
      });
      var fz = feeInfo(sel, amt, near);
      h += '<div class="gx-meta"><div data-testid="gx-fee-total"><b>Total fees</b><span>' + esc(fz.total) + '</span></div><div><b>Expected time</b><span>' + (sel.etaMin ? '~' + sel.etaMin + ' min' : '—') + '</span></div>' +
        '<div><b>Rate</b><span>' + (amt > 0 ? esc(fmt(sel.out / amt)) : '—') + '</span></div></div>';
      h += '<div class="gx-fees" data-testid="gx-fees">' + fz.rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
      if (sel.min != null && sel.max != null && Number(sel.max) < 1e9) h += '<div class="gx-lim">Limits ' + esc(fmt(sel.min)) + '–' + esc(fmt(sel.max)) + ' ' + esc(S.send.symbol) + '</div>';
      h += '</div>';
    }

    h += '<div class="gx-lbl" style="margin-top:18px"><span>Destination address</span><small>' + (S.recv ? esc(S.recv.symbol + ' on ' + S.recv.chainName) : 'Destination chain') + '</small></div>';
    h += '<div class="gx-field"><div class="gx-in"><input id="gx-dest" data-testid="gx-dest" autocomplete="off" spellcheck="false" placeholder="' + (S.recv ? 'Your ' + esc(S.recv.chainName) + ' receiving address' : 'Your receiving address') + '" value="' + esc(S.dest) + '">' +
      '<button class="gx-paste" data-act="paste" data-f="dest">Paste</button></div></div>';
    if (near) {
      h += '<div class="gx-lbl" style="margin-top:14px"><span>Refund address</span><small>Solana</small></div>';
      h += '<div class="gx-field"><div class="gx-in"><input id="gx-refund" data-testid="gx-refund" autocomplete="off" spellcheck="false" placeholder="Your Solana refund address" value="' + esc(S.refund) + '">' +
        '<button class="gx-paste" data-act="paste" data-f="refund">Paste</button></div></div>';
      h += '<div class="gx-hint">Funds return here if the swap cannot complete.</div>';
    } else {
      h += '<div class="gx-hint">Check the chain and address. Transfers cannot be reversed.</div>';
    }
    if (S.qerr || S.serr) h += '<div class="gx-err" data-testid="gx-error">' + esc(S.serr || S.qerr) +
      (!S.serr && S.qerrSwitch ? ' <button type="button" class="gx-err-sw" data-act="go" data-v="private-route" data-testid="gx-err-switch">Use Private route \u2192</button>' : '') + '</div>';
    h += '<button class="gx-cta" data-act="submit" data-testid="gx-submit"' + (c.ok ? '' : ' disabled') + '>' + (S.submitting ? '<span class="gx-spin"></span>' : '') + esc(c.text) + '</button>';
    h += '<div class="gx-note">Creating an order moves no funds · live on-chain quotes</div>';
    h += '</div>';
    return h;
  }

  /* ---------------- render: track ---------------- */
  var STEPS = ['Awaiting deposit', 'Confirming', 'Exchanging', 'Sending', 'Completed'];
  function statusIndex(s) {
    var u = (s || '').toUpperCase();
    if (/EXPIRE|REFUND|FAIL|CANCEL|ERROR/.test(u)) return -1;
    if (/FINISH|COMPLETE|SUCCESS|DONE|SETTLED/.test(u)) return 4;
    if (/SEND|WITHDRAW/.test(u)) return 3;
    if (/EXCHANG|SWAP|PROCESS/.test(u)) return 2;
    if (/CONFIRM|DETECT|RECEIVED/.test(u)) return 1;
    return 0;
  }
  function trackHTML() {
    var T = S.track, h = '<div class="gx-card" data-testid="gx-track-card">';
    h += '<div class="gx-lbl"><span>Track your order</span><small>live status</small></div>';
    h += '<div class="gx-in"><input id="gx-track-q" data-testid="gx-track-input" placeholder="Paste your order ID" autocomplete="off" spellcheck="false" value="' + esc(T.q) + '">' +
      '<button class="gx-paste" data-act="track" data-testid="gx-track-btn">' + (T.loading ? '<span class="gx-spin" style="width:12px;height:12px"></span>' : 'Track') + '</button></div>';
    var has = T.local || T.live;
    if (has) {
      var l = T.local || {}, v = T.live || {};
      var st = v.displayStatus || v.status || 'AWAITING_DEPOSIT';
      var idx = statusIndex(st);
      var sendSym = l.sendSymbol || v.inSymbol || (v.from && v.from.symbol) || '?';
      var recvSym = l.recvSymbol || v.outSymbol || (v.to && v.to.symbol) || '?';
      var net = l.networkName || (v.to && v.to.chainName) || '';
      var amount = l.amount != null ? l.amount : (v.inAmount != null ? v.inAmount : v.amountIn);
      var out = l.outAmount != null ? l.outAmount : (v.outAmount != null ? v.outAmount : v.amountOut);
      var dep = l.depositAddress || v.depositAddress;
      h += '<div style="margin-top:18px;display:flex;justify-content:space-between;gap:8px;align-items:center"><span style="font-size:13px;color:#cfcfd4">' +
        (l.method === 'privacy' ? 'Privacy swap · shielded' : 'Private route · best rate') + '</span><code style="font-family:Space Mono,monospace;font-size:11px;color:#8c8c8c;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(l.id || v.routeId || v.requestId || '') + '</code></div>';
      h += '<div class="gx-badge" data-testid="gx-track-status"><span class="gx-live"><i></i></span>' + esc(String(st).replace(/_/g, ' ')) + '</div>';
      h += '<div class="gx-pair" style="margin-top:12px"><div class="a">' + coin(l.sendIcon, sendSym, 26) + '<div>' + esc(fmt(amount)) + ' ' + esc(sendSym) + '<small>Solana</small></div></div>' +
        SV(IC.arrow, 16) + '<div class="a" style="text-align:right"><div>≈ ' + esc(fmt(out)) + ' ' + esc(recvSym) + '<small>' + esc(net) + '</small></div>' + coin(l.recvIcon, recvSym, 26) + '</div></div>';
      if (dep) h += copyField('Solana deposit address', dep);
      if (idx === -1) h += '<div class="gx-err">Order expired, refunded or failed.</div>';
      else {
        h += '<div class="gx-steps">';
        STEPS.forEach(function (s, i) {
          h += '<div class="gx-step' + (i < idx ? ' done' : i === idx ? ' act' : '') + '"><i>' + (i < idx ? SV(IC.check, 13) : (i + 1)) + '</i>' + s + '</div>';
        });
        h += '</div>';
      }
      h += '<div class="gx-note">Live status · refreshes automatically</div>';
    } else if (T.err) {
      h += '<div class="gx-err" data-testid="gx-track-error">Couldn\u2019t find that order. ' + esc(T.err) + '</div>';
    } else if (!T.searched) {
      var rec = localOrders().slice(0, 6);
      if (rec.length) {
        h += '<div class="gx-lbl" style="margin-top:18px"><span>Recent orders</span><small>this browser</small></div>';
        rec.forEach(function (o) {
          h += '<button class="gx-recent" data-act="recent" data-id="' + esc(o.id) + '">' + coin(o.sendIcon, o.sendSymbol, 22) + SV(IC.arrow, 13) + coin(o.recvIcon, o.recvSymbol, 22) +
            '<span>' + esc(fmt(o.amount)) + ' ' + esc(o.sendSymbol) + ' → ' + esc(o.recvSymbol) + '</span><code>' + esc(o.id) + '</code></button>';
        });
      } else {
        h += '<div class="gx-empty" style="flex-direction:column">No orders yet.<span style="font-size:12px;color:#6d6d74">Create a swap to get an order ID.</span></div>';
      }
    }
    h += '</div>';
    return h;
  }

  function doTrack(id) {
    var T = S.track;
    id = (id || '').trim();
    if (!id) return;
    T.q = id; T.searched = true; T.loading = true; T.live = null; T.err = '';
    T.local = localOrder(id) || null;
    render();
    if (T.poll) clearInterval(T.poll);
    var once = function () {
      var lo = T.local;
      var p = lo && lo.method === 'privacy' ? api.nGetOrder(id) : api.getOrder(id).catch(function () { return api.nGetOrder(id); });
      return p.then(function (d) { T.live = d; T.err = ''; }).catch(function (e) { T.err = (e && e.message) || 'Order not found'; })
        .then(function () { T.loading = false; if (S.view === 'track') render(); });
    };
    once();
    T.poll = setInterval(function () { if (S.view === "track" && T.q === id) once(); else { clearInterval(T.poll); T.poll = null; } }, 5000);
  }

  function copyField(label, value) {
    return '<div class="gx-cf"><div class="k">' + esc(label) + '</div><div class="v"><code>' + esc(value) + '</code><button class="gx-cp" data-act="copy" data-v="' + esc(value) + '" title="Copy">' + SV(IC.copy, 16) + '</button></div></div>';
  }

  /* ---------------- main render ---------------- */
  function viewEl() { return document.getElementById('gx-view'); }
  function render() {
    var el = viewEl();
    if (!el || !S.view) return;
    if (S.view === 'chain') { el.innerHTML = chainHTML(); return; }
    var ae = document.activeElement, fid = ae && ae.id && el.contains(ae) ? ae.id : null;
    var ss = fid && ae.selectionStart, se = fid && ae.selectionEnd;
    var seg = '<div class="gx-seg">' +
      '<button data-act="go" data-v="private-route" class="' + (S.view === 'swap' && S.method === 'private' ? 'on' : '') + '" data-testid="gx-seg-private">Private route ' + SV(IC.route, 14) + '</button>' +
      '<button data-act="go" data-v="privacy-swap" class="' + (S.view === 'swap' && S.method === 'privacy' ? 'on' : '') + '" data-testid="gx-seg-privacy">Privacy swap ' + SV(IC.shield, 14) + '</button>' +
      '<button data-act="go" data-v="track" class="' + (S.view === 'track' ? 'on' : '') + '" data-testid="gx-seg-track">Track ' + SV(IC.track, 14) + '</button></div>';
    el.innerHTML = '<div class="gx-wrap">' + seg + (S.view === 'track' ? trackHTML() : swapHTML()) + '</div>';
    if (fid) {
      var n = document.getElementById(fid);
      if (n) { n.focus(); try { n.setSelectionRange(ss, se); } catch (e) {} }
    }
  }

  // countdown tick without full re-render
  setInterval(function () {
    if (S.view !== 'swap' || !S.routes.length) return;
    var secs = S.validUntil ? Math.max(0, Math.round((S.validUntil - Date.now()) / 1000)) : 0;
    if (secs <= 0 && !S.quoting) { fetchQuote(); return; }
    var lv = document.querySelector('#gx-view .gx-rates .gx-live');
    if (lv && !S.quoting) lv.innerHTML = '<i></i>Live · new in ' + secs + 's';
  }, 1000);

  /* ---------------- token modal ---------------- */
  var CHAIN_ICONS = {};
  var NATIVE = { 'Ethereum Mainnet': 'ETH', Ethereum: 'ETH', Arbitrum: 'ETH', Base: 'ETH', Optimism: 'ETH', 'Binance Smart Chain': 'BNB', 'BNB Chain': 'BNB', Polygon: 'POL', 'Avalanche C-Chain': 'AVAX', Solana: 'SOL', NEAR: 'wNEAR', Zcash: 'ZEC', Cronos: 'CRO', Gnosis: 'XDAI', Sei: 'SEI', Rootstock: 'RBTC', HyperEVM: 'HYPE', PLS: 'PLS', Gravity: 'G', 'Manta Pacific Mainnet': 'ETH' };
  function learnChains(list) {
    list.forEach(function (t) {
      var c = t.chainName; if (!c || !t.icon) return;
      if (!CHAIN_ICONS[c] || (NATIVE[c] && t.symbol === NATIVE[c])) CHAIN_ICONS[c] = t.icon;
    });
    CHAIN_ICONS.Solana = SOL_ICON;
  }
  function chainIcon(c) { return CHAIN_ICONS[c] || ''; }

  var M = null; // modal state
  function closeModal() {
    var m = document.getElementById('gx-modal');
    if (m) m.remove();
    M = null;
  }
  function openPicker(side) {
    closeModal();
    M = { kind: 'pick', side: side, term: '', chain: 'All', tokens: [], loading: true, req: 0, allChains: [], more: false };
    var m = document.createElement('div');
    m.id = 'gx-modal';
    m.className = 'pk';
    m.setAttribute('data-testid', 'gx-token-modal');
    document.body.appendChild(m);
    m.addEventListener('mousedown', function (e) { if (e.target === m) closeModal(); });
    renderPicker(true);
    loadTokens('');
  }
  var JD = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/';
  var H_CHAINS = [
    { id: 'ethereum', name: 'Ethereum', icon: JD + 'eth.png', nat: 'ETH' },
    { id: 'base', name: 'Base', icon: 'https://assets.coingecko.com/asset_platforms/images/131/large/base.jpeg', nat: 'ETH' },
    { id: 'arbitrum', name: 'Arbitrum', icon: 'https://assets.coingecko.com/coins/images/16547/large/arb.jpg', nat: 'ETH', gov: 'ARB' },
    { id: 'solana', name: 'Solana', icon: JD + 'sol.png', nat: 'SOL' },
    { id: 'bsc', name: 'BNB Chain', icon: JD + 'bnb.png', nat: 'BNB' },
    { id: 'polygon', name: 'Polygon', icon: JD + 'matic.png', nat: 'POL' },
    { id: 'optimism', name: 'Optimism', icon: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png', nat: 'ETH', gov: 'OP' },
    { id: 'avalanche', name: 'Avalanche', icon: JD + 'avax.png', nat: 'AVAX' },
    { id: 'bitcoin', name: 'Bitcoin', icon: JD + 'btc.png', nat: 'BTC' },
    { id: 'tron', name: 'Tron', icon: JD + 'trx.png', nat: 'TRX' },
    { id: 'ton', name: 'TON', icon: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png', nat: 'TON' }
  ];
  var H_BY_ID = {}; H_CHAINS.forEach(function (c) { H_BY_ID[c.id] = c; });
  var POPULAR = ['USDC', 'USDT', 'ETH', 'BTC', 'SOL', 'BNB', 'WBTC', 'WETH', 'DAI', 'POL', 'AVAX', 'TRX', 'TON', 'ZEC', 'wNEAR', 'NEAR', 'ARB', 'OP', 'LINK', 'UNI', 'JUP', 'BONK'];
  var CH_PRI = ['ethereum', 'Ethereum Mainnet', 'Ethereum', 'base', 'Base', 'arbitrum', 'Arbitrum', 'solana', 'Solana', 'bsc', 'Binance Smart Chain', 'BNB Chain', 'polygon', 'Polygon', 'optimism', 'Optimism', 'avalanche', 'Avalanche C-Chain', 'bitcoin', 'Bitcoin', 'tron', 'Tron', 'ton', 'TON', 'NEAR', 'Zcash'];
  function rankChain(c) { var i = CH_PRI.indexOf(c); return i < 0 ? 999 : i; }
  function rankSym(sy) { var i = POPULAR.indexOf(sy); return i < 0 ? 999 : i; }
  function popularSort(list) {
    return list.map(function (t, i) { return [t, i]; }).sort(function (a, b) {
      var d = rankSym(a[0].symbol) - rankSym(b[0].symbol);
      return d || a[1] - b[1];
    }).map(function (x) { return x[0]; });
  }
  function chainKey(t) { return isNear() ? (t.chainName || 'Other') : (t.chain || t.chainName || 'Other'); }
  function chainLabel(k) { return (H_BY_ID[k] && H_BY_ID[k].name) || String(k).replace(' Mainnet', ''); }
  function chainIconFor(k, t) {
    if (H_BY_ID[k] && H_BY_ID[k].icon) return H_BY_ID[k].icon;
    var lk = String(k).toLowerCase().replace(' mainnet', '').replace(' c-chain', '').replace('binance smart chain', 'bsc').replace('bnb chain', 'bsc');
    if (H_BY_ID[lk] && H_BY_ID[lk].icon) return H_BY_ID[lk].icon;
    if (lk === 'near') return 'https://assets.coingecko.com/coins/images/10365/large/near.jpg';
    if (lk === 'zcash') return JD + 'zec.png';
    if (CHAIN_ICONS[k]) return CHAIN_ICONS[k];
    return t ? chainIcon(t.chainName) : '';
  }
  // learn governance-token icons for L2s once (ARB, OP, ...) straight from the upstream list
  var govLearned = false;
  function learnGov() {
    if (govLearned) return; govLearned = true;
    H_CHAINS.forEach(function (c) {
      var sym = c.gov || (c.icon ? null : c.nat);
      if (!sym || c.icon) return;
      api.tokens('destination', sym, c.id).then(function (l) {
        var hit = (l || []).find(function (t) { return t.symbol === sym && t.icon; }) || (l || []).find(function (t) { return t.icon; });
        if (hit) { c.icon = hit.icon; if (M && M.kind === 'pick') renderPicker(false); }
      }).catch(function () {});
    });
  }
  function mergeTokens(lists) {
    var seen = {}, out = [];
    lists.forEach(function (l) { (l || []).forEach(function (t) { var k = t.id || (t.symbol + '|' + t.chain); if (!seen[k]) { seen[k] = 1; out.push(t); } }); });
    return out;
  }
  function loadTokens(term) {
    if (!M) return;
    var id = ++M.req, near = isNear(), side = M.side;
    M.loading = true; renderPickerList();
    var job;
    if (near) {
      job = api.nTokens(side, term).then(function (list) {
        list = popularSort(list || []);
        // order by chain priority, popular first inside each chain
        return list.map(function (t, i) { return [t, i]; }).sort(function (a, b) {
          return (rankChain(a[0].chainName) - rankChain(b[0].chainName)) || (a[1] - b[1]);
        }).map(function (x) { return x[0]; });
      });
    } else {
      var ch = (side === 'destination' && M.chain !== 'All') ? M.chain : undefined;
      if (term) {
        job = api.tokens(side, term, ch).then(function (l) {
          var T = term.toUpperCase();
          return (l || []).map(function (t, i) { return [t, i]; }).sort(function (a, b) {
            var ea = a[0].symbol.toUpperCase() === T ? 0 : 1, eb = b[0].symbol.toUpperCase() === T ? 0 : 1;
            return (ea - eb) || (rankChain(a[0].chain) - rankChain(b[0].chain)) || (a[1] - b[1]);
          }).map(function (x) { return x[0]; });
        });
      } else {
        var terms = side === 'source' ? ['SOL', 'USDC', 'USDT'] :
          (ch ? ['USDC', 'USDT', (H_BY_ID[ch] || {}).nat || 'ETH'] : ['USDC', 'USDT', 'ETH', 'BTC', 'SOL', 'BNB']);
        var calls = terms.map(function (q) {
          return api.tokens(side, q, ch).then(function (l) {
            var ex = (l || []).filter(function (t) { return t.symbol.toUpperCase() === q; });
            return ex.sort(function (a, b) { return rankChain(a.chain) - rankChain(b.chain); });
          }).catch(function () { return []; });
        });
        calls.push(api.tokens(side, '', ch).catch(function () { return []; }));
        job = Promise.all(calls).then(function (ls) {
          var pop = mergeTokens(ls.slice(0, -1));
          return mergeTokens([pop, ls[ls.length - 1]]);
        });
      }
    }
    job.then(function (list) {
      if (!M || id !== M.req) return;
      M.tokens = Array.isArray(list) ? list : [];
      learnChains(M.tokens);
      if (near && !term) {
        var seen = {}, cs = [];
        M.tokens.forEach(function (t) { var c = t.chainName || 'Other'; if (!seen[c]) { seen[c] = 1; cs.push(c); } });
        cs.sort(function (a, b) { return rankChain(a) - rankChain(b); });
        M.allChains = cs;
      } else if (!near) {
        M.allChains = H_CHAINS.map(function (c) { return c.id; });
      }
    }).catch(function () { if (M && id === M.req) M.tokens = []; })
      .then(function () { if (M && id === M.req) { M.loading = false; renderPicker(false); } });
    if (!near && side === 'destination') learnGov();
  }
  // Portal-style tile order for the network grid
  var TILE_PRI = ['ethereum', 'solana', 'arbitrum', 'base', 'bsc', 'polygon', 'optimism', 'avalanche', 'bitcoin', 'tron', 'ton', 'near', 'zcash'];
  function tileKey(c) {
    var k = String(c).toLowerCase().replace(' mainnet', '').replace(' c-chain', '');
    var al = { eth: 'ethereum', sol: 'solana', arb: 'arbitrum', 'binance smart chain': 'bsc', 'bnb chain': 'bsc', bnb: 'bsc', pol: 'polygon', matic: 'polygon', op: 'optimism', avax: 'avalanche', btc: 'bitcoin', trx: 'tron', zec: 'zcash' };
    return al[k] || k;
  }
  function tileSort(list) {
    return list.map(function (c, i) { return [c, i]; }).sort(function (a, b) {
      var ia = TILE_PRI.indexOf(tileKey(a[0])), ib = TILE_PRI.indexOf(tileKey(b[0]));
      return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || (a[1] - b[1]);
    }).map(function (x) { return x[0]; });
  }
  // block-explorer links for token contracts (opens in a new tab, never selects the row)
  var EXPLORER = {
    ethereum: 'https://etherscan.io/token/', solana: 'https://solscan.io/token/', base: 'https://basescan.org/token/',
    arbitrum: 'https://arbiscan.io/token/', bsc: 'https://bscscan.com/token/', polygon: 'https://polygonscan.com/token/',
    optimism: 'https://optimistic.etherscan.io/token/', avalanche: 'https://snowtrace.io/token/', near: 'https://nearblocks.io/token/',
    tron: 'https://tronscan.org/#/token20/', gnosis: 'https://gnosisscan.io/token/', sui: 'https://suivision.xyz/coin/',
    ton: 'https://tonviewer.com/', bera: 'https://berascan.com/token/', berachain: 'https://berascan.com/token/'
  };
  function tokenAddr(t) {
    var a = t && !t.native && (t.contractAddress || t.address || t.mint);
    return a && typeof a === 'string' && a.length > 3 ? a : '';
  }
  function shortAddr(a) { return a.length > 14 ? a.slice(0, 5) + '…' + a.slice(-6) : a; }
  function explorerUrl(t, a) {
    var base = EXPLORER[tileKey(t.chain || '')] || EXPLORER[tileKey(t.chainName || '')];
    return base ? base + encodeURIComponent(a).replace(/%3A/g, ':') : '';
  }
  function looksLikeAddr(q) { return q.length >= 24 || /^0x[0-9a-f]{6,}/i.test(q) || /\.(near|tg)$/i.test(q); }

  function renderPicker(first) {
    var m = document.getElementById('gx-modal');
    if (!m || !M) return;
    if (first || !m.querySelector('.gx-mb')) {
      m.innerHTML = '<div class="gx-mb gx-pk" data-side="' + esc(M.side) + '"><div class="gx-grab"></div>' +
        '<div class="gx-mh"><h3>Select token</h3><button class="gx-x" data-act="close" data-testid="gx-modal-close" aria-label="Close">' + SV(IC.close, 20) + '</button></div>' +
        '<div class="gx-lbl">Choose network</div>' +
        '<div class="gx-chains" id="gx-chains"></div>' +
        '<div class="gx-srch">' + SV(IC.search, 20) + '<input id="gx-term" data-testid="gx-token-search" placeholder="Search for a token or paste an address" autocomplete="off" spellcheck="false"></div>' +
        '<div class="gx-chips" id="gx-chips"></div><div class="gx-lbl gx-lbl2" id="gx-lbl2"></div><div class="gx-list" id="gx-list"></div></div>';
      var inp = m.querySelector('#gx-term');
      var t = null;
      inp.addEventListener('input', function () {
        M.term = inp.value; clearTimeout(t);
        t = setTimeout(function () {
          var q = M.term.trim();
          // pasted contract address: load the full list once and match locally
          if (q && looksLikeAddr(q) && isNear()) { if (M.loadedAll) renderPickerList(); else { M.loadedAll = true; loadTokens(''); } }
          else loadTokens(q);
        }, 300);
      });
      if (window.matchMedia && !window.matchMedia('(max-width:640px)').matches) setTimeout(function () { inp.focus(); }, 30);
    }
    // network grid: 9 tiles + More (Portal arrangement)
    var cg = m.querySelector('#gx-chains');
    var chains = tileSort((M.allChains || []).filter(function (c) { return c !== 'All'; }));
    if (M.side === 'source') {
      cg.style.display = '';
      cg.innerHTML = '<button class="gx-chain on fixed" data-testid="gx-chain-solana" title="Deposits are sent on Solana"><img src="' + esc(IMGP(SOL_ICON)) + '" alt="" onerror="this.remove()"><span>Solana</span></button>';
    } else if (chains.length > 1) {
      var tiles = M.more ? chains.slice() : chains.slice(0, 9);
      if (!M.more && M.chain !== 'All' && tiles.indexOf(M.chain) < 0) tiles[tiles.length - 1] = M.chain;
      cg.style.display = '';
      cg.innerHTML = tiles.map(function (c) {
        var ci = chainIconFor(c);
        var ic = ci ? '<img src="' + esc(IMGP(ci)) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;gx-cl&quot;>' + esc(chainLabel(c).charAt(0)) + '</span>\'">' : '<span class="gx-cl">' + esc(chainLabel(c).charAt(0)) + '</span>';
        return '<button class="gx-chain' + (M.chain === c ? ' on' : '') + '" data-act="chain" data-c="' + esc(c) + '" title="' + esc(chainLabel(c)) + '" data-testid="gx-chain-' + esc(String(c).toLowerCase().replace(/\s+/g, '-')) + '">' + ic + '<span>' + esc(chainLabel(c)) + '</span></button>';
      }).join('') + (chains.length > 9
        ? '<button class="gx-chain" data-act="more" data-testid="gx-chain-more"><span class="gx-more">' + (M.more ? '−' : '+') + '</span><span>' + (M.more ? 'Less' : 'More') + '</span></button>'
        : '<button class="gx-chain' + (M.chain === 'All' ? ' on' : '') + '" data-act="chain" data-c="All" data-testid="gx-chain-all-tile"><span class="gx-more" style="background:var(--gx-box);color:var(--gx-fg)">✦</span><span>All</span></button>');
    } else {
      cg.style.display = 'none';
      cg.innerHTML = '';
    }
    var lb = m.querySelector('#gx-lbl2');
    if (lb) lb.innerHTML = (M.chain === 'All' || M.side === 'source' ? '<span>All tokens</span>' : '<span>' + esc(chainLabel(M.chain)) + ' tokens</span><button data-act="chain" data-c="All" data-testid="gx-chain-all">All networks</button>');
    var chips = m.querySelector('#gx-chips');
    if (chips) chips.innerHTML = '';
    renderPickerList();
  }
  function filtered() {
    if (!M) return [];
    var list = M.chain === 'All' ? M.tokens : M.tokens.filter(function (t) { return chainKey(t) === M.chain; });
    var q = (M.term || '').trim();
    if (q && looksLikeAddr(q)) {
      var lq = q.toLowerCase();
      var hit = list.filter(function (t) { var a = tokenAddr(t).toLowerCase(); return a && (a === lq || a.indexOf(lq) >= 0); });
      if (hit.length || isNear()) return hit;
    }
    return list;
  }
  function renderPickerList() {
    var m = document.getElementById('gx-modal');
    if (!m || !M) return;
    var l = m.querySelector('#gx-list');
    if (!l) return;
    if (M.loading) { l.innerHTML = '<div class="gx-empty"><span class="gx-spin"></span>Loading tokens…</div>'; return; }
    var list = filtered();
    if (!list.length) { l.innerHTML = '<div class="gx-empty">No tokens found.</div>'; return; }
    var cur = M.side === 'source' ? S.send : S.recv;
    var h = '', last = null, grouped = isNear() && M.side === 'destination' && M.chain === 'All' && !M.term;
    list.forEach(function (t) {
      var c = t.chainName || 'Other';
      if (grouped && c !== last) { h += '<div class="gx-sec">' + esc(c) + '</div>'; last = c; }
      var price = t.price ? '$' + (Number(t.price) >= 1 ? Number(t.price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(t.price).toPrecision(2)) : '';
      var addr = tokenAddr(t), url = addr ? explorerUrl(t, addr) : '';
      var sub = '<span class="nm">' + esc(t.name && t.name !== t.symbol ? t.name : t.symbol) + '</span>';
      if (addr && M.side === 'destination' && !grouped) sub += '<i class="dot"></i><span class="gx-chn">' + esc(t.chainName || chainLabel(chainKey(t))) + '</span>';
      if (addr) {
        sub += '<i class="dot"></i>' + (url
          ? '<a class="gx-addr" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(addr) + '" data-testid="gx-token-addr">' + esc(shortAddr(addr)) + ' ↗</a>'
          : '<span class="gx-addr" title="' + esc(addr) + '">' + esc(shortAddr(addr)) + '</span>');
      } else if (M.side === 'destination') {
        sub += '<i class="dot"></i><span>' + esc(chainLabel(chainKey(t))) + '</span>';
      }
      var sel = cur && ((cur.id && cur.id === t.id) || (!cur.id && cur.symbol === t.symbol && cur.chain === t.chain));
      h += '<div class="gx-it' + (sel ? ' sel' : '') + '" role="button" tabindex="0" data-act="choose" data-i="' + M.tokens.indexOf(t) + '" data-testid="gx-token-' + esc(t.symbol) + '">' +
        coin(t.icon, t.symbol, 42, M.side === 'destination' ? chainIconFor(chainKey(t), t) : SOL_ICON) +
        '<span class="tx"><div class="n">' + esc(t.symbol) + '</div><div class="s">' + sub + '</div></span>' +
        '<span class="p">' + esc(price) + '</span></div>';
    });
    l.innerHTML = h;
  }

  /* ---------------- order modal ---------------- */
  var orderTimer = null;
  function openOrder(o) {
    closeModal();
    M = { kind: 'order', o: o };
    var m = document.createElement('div');
    m.id = 'gx-modal';
    m.setAttribute('data-testid', 'gx-order-modal');
    document.body.appendChild(m);
    m.addEventListener('mousedown', function (e) { if (e.target === m) closeModal(); });
    var h = '<div class="gx-mb" style="overflow-y:auto"><div class="gx-mh"><h3>Order created</h3><button class="gx-x" data-act="close">' + SV(IC.close, 20) + '</button></div>';
    h += '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#cfcfd4;margin:-4px 0 12px"><span>' + (o.method === 'privacy' ? 'Privacy swap · shielded' : 'Private route · best rate') + '</span><code style="font-family:Space Mono,monospace;font-size:11px;color:#8c8c8c;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" data-testid="gx-order-id">' + esc(o.id) + '</code></div>';
    h += '<div class="gx-pair"><div class="a">' + coin(o.sendIcon, o.sendSymbol, 26) + '<div>' + esc(fmt(o.amount)) + ' ' + esc(o.sendSymbol) + '<small>Solana</small></div></div>' + SV(IC.arrow, 16) +
      '<div class="a" style="text-align:right"><div>≈ ' + esc(fmt(o.outAmount)) + ' ' + esc(o.recvSymbol) + '<small>' + esc(o.networkName || '') + '</small></div>' + coin(o.recvIcon, o.recvSymbol, 26) + '</div></div>';
    if (o.expires) h += '<div class="gx-timer">Deposit within <b id="gx-cd">--:--</b> · send on Solana only.</div>';
    h += copyField('Send exactly', fmt(o.amount) + ' ' + o.sendSymbol);
    h += copyField('To this Solana deposit address', o.depositAddress || '');
    if (o.depositMemo) h += copyField('Deposit memo / tag (required)', o.depositMemo);
    if (o.feeRows && o.feeRows.length) h += '<div class="gx-fees gx-fees-m" data-testid="gx-order-fees"><div class="gx-fees-h"><span>Total fees</span><b>' + esc(o.feeTotal || '—') + '</b></div>' + o.feeRows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
    h += '<div class="gx-cf"><div class="k">Receiving address</div><div class="v"><code>' + esc(o.addressTo || '') + '</code></div></div>';
    h += '<button class="gx-cta" data-act="trackorder" data-id="' + esc(o.id) + '" data-testid="gx-order-track">Track this order</button>';
    h += '<div class="gx-note">Live order via Camo Cash. Only deposit from your own Solana wallet.</div></div>';
    m.innerHTML = h;
    clearInterval(orderTimer);
    if (o.expires) {
      var target = new Date(o.expires).getTime();
      var tick = function () {
        var cd = document.getElementById('gx-cd');
        if (!cd) { clearInterval(orderTimer); return; }
        var left = Math.max(0, target - Date.now());
        var hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000), ss = Math.floor((left % 60000) / 1000);
        cd.textContent = (hh ? hh + 'h ' + String(mm).padStart(2, '0') + 'm' : mm + ':' + String(ss).padStart(2, '0'));
      };
      tick();
      orderTimer = setInterval(tick, 1000);
    }
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('sheet-scrim')) { var sx = document.querySelector('.sheet-wrap .sheet-h .x'); if (sx) sx.click(); return; }
    if (e.target.closest && e.target.closest('a.gx-addr')) return; // explorer link: open, don't select
    var a = e.target.closest && e.target.closest('[data-act]');
    if (!a || !(a.closest('#gx-view') || a.closest('#gx-modal'))) return;
    var act = a.getAttribute('data-act');
    e.preventDefault();
    if (act === 'go') { go(a.getAttribute('data-v')); }
    else if (act === 'pick') openPicker(a.getAttribute('data-side'));
    else if (act === 'refresh') { if (S.send && S.recv) fetchQuote(); }
    else if (act === 'route') { S.ri = +a.getAttribute('data-i'); render(); }
    else if (act === 'paste') {
      var f = a.getAttribute('data-f');
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) {
        if (t) { S[f] = t.trim(); render(); scheduleQuote(); }
      }).catch(function () {});
    }
    else if (act === 'submit') submit();
    else if (act === 'track') { var q = document.getElementById('gx-track-q'); doTrack(q ? q.value : S.track.q); }
    else if (act === 'recent') doTrack(a.getAttribute('data-id'));
    else if (act === 'close') closeModal();
    else if (act === 'more') { if (M) { M.more = !M.more; renderPicker(false); } }
    else if (act === 'chain') { var nc = a.getAttribute('data-c'); M.chain = (nc === M.chain && nc !== 'All') ? 'All' : nc; if (isNear()) renderPicker(false); else { renderPicker(false); loadTokens((M.term || '').trim()); } }
    else if (act === 'choose') {
      var t = M && M.tokens[+a.getAttribute('data-i')];
      if (t) {
        if (M.side === 'source') S.send = t; else S.recv = t;
        S.routes = []; S.qerr = '';
        closeModal(); render(); scheduleQuote();
      }
    }
    else if (act === 'copy') {
      var v = a.getAttribute('data-v');
      if (navigator.clipboard) navigator.clipboard.writeText(v).catch(function () {});
      a.innerHTML = SV(IC.check, 16);
      setTimeout(function () { a.innerHTML = SV(IC.copy, 16); }, 1400);
    }
    else if (act === 'trackorder') { var id = a.getAttribute('data-id'); closeModal(); go('track/' + id); }
  }, true);

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.id || !t.closest || !t.closest('#gx-view')) return;
    if (t.id === 'gx-amount') {
      var v = t.value.replace(/[^0-9.]/g, '');
      if (v !== t.value) t.value = v;
      S.amount = v; S.routes = S.routes.length ? S.routes : []; scheduleQuote();
      partial();
    } else if (t.id === 'gx-dest') { S.dest = t.value; S.serr = ''; scheduleQuote(); partial(); }
    else if (t.id === 'gx-refund') { S.refund = t.value; S.serr = ''; scheduleQuote(); partial(); }
    else if (t.id === 'gx-track-q') { S.track.q = t.value; }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('gx-modal')) closeModal();
    else if (e.key === 'Escape') { var sx = document.querySelector('.sheet-wrap .sheet-h .x'); if (sx) sx.click(); }
    if (e.key === 'Enter' && e.target && e.target.id === 'gx-track-q') doTrack(e.target.value);
  }, true);

  // light refresh of the CTA while typing (keeps the caret in place)
  function partial() {
    var b = document.querySelector('#gx-view .gx-cta');
    if (!b) return;
    var c = cta();
    b.disabled = !c.ok;
    b.textContent = c.text;
  }

  /* ---------------- Chain: live on-chain terminal page ---------------- */
  var CH = { stats: null, feed: [], assets: {}, err: null, at: 0, seen: {}, fresh: {}, timer: null, clock: null, first: true };
  var BFI = '/api/bifrost/v1/indexer/v1/';
  function chJ(p) { return fetch(BFI + p, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function chLoad() {
    var a = Object.keys(CH.assets).length ? Promise.resolve(null) : chJ('assets').then(function (d) { (d.assets || []).forEach(function (x) { CH.assets[x.mint] = x; }); CH.nAssets = (d.assets || []).length; CH.nVer = (d.assets || []).filter(function (x) { return x.verified; }).length; });
    return Promise.all([chJ('stats'), chJ('feed?limit=60'), a]).then(function (res) {
      CH.stats = res[0]; CH.err = null; CH.at = Date.now();
      var feed = (res[1] && res[1].feed) || [];
      CH.fresh = {};
      if (!CH.first) feed.forEach(function (f) { if (!CH.seen[f.sig]) CH.fresh[f.sig] = 1; });
      feed.forEach(function (f) { CH.seen[f.sig] = 1; });
      CH.first = false; CH.feed = feed;
    }).catch(function (e) { CH.err = e.message || 'offline'; }).then(function () { if (S.view === 'chain') render(); });
  }
  function startChain() {
    if (CH.timer) return;
    chLoad();
    CH.timer = setInterval(function () { if (S.view !== 'chain') { clearInterval(CH.timer); clearInterval(CH.clock); CH.timer = CH.clock = null; return; } chLoad(); }, 4000);
    CH.clock = setInterval(function () {
      if (S.view !== 'chain') return;
      var n = document.querySelector('#gx-view .ch-next'); if (n) n.textContent = Math.max(0, 4 - Math.floor((Date.now() - CH.at) / 1000)) + 's';
      document.querySelectorAll('#gx-view [data-ts]').forEach(function (e) { e.textContent = chAgo(+e.getAttribute('data-ts')); });
    }, 1000);
  }
  function chAgo(ts) {
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  }
  function chShort(a, n) { a = String(a || ''); n = n || 4; return a.length > n * 2 + 1 ? a.slice(0, n) + '\u2026' + a.slice(-n) : a; }
  function chAmt(f) {
    var a = CH.assets[f.mint]; if (!f.amount) return '';
    var d = a ? a.decimals : 0, v = Number(f.amount) / Math.pow(10, d || 0);
    var t = v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return t + ' ' + (a ? a.symbol : chShort(f.mint, 3));
  }
  function chainHTML() {
    var st = CH.stats || {}, live = !CH.err && CH.stats;
    var kinds = { deposit: ['Shield', 'in'], withdraw: ['Exit', 'out'], swap: ['Pool trade', 'sw'], transfer: ['Private pay', 'sw'] };
    var cnt = { deposit: 0, withdraw: 0, swap: 0 }; CH.feed.forEach(function (f) { if (cnt[f.kind] !== undefined) cnt[f.kind]++; });
    var head = '<div class="ch-row ch-head">' +
      '<span>Type</span><span>Path</span><span class="ch-amt">Amount</span><span>Proof</span><span class="ch-t">Time</span></div>';
    var rows = CH.feed.map(function (f, i) {
      var k = kinds[f.kind] || [String(f.kind || 'tx'), 'sw'];
      var who = f.kind === 'deposit' ? '<b>' + esc(chShort(f.account)) + '</b><i class="ch-arrow">\u2192</i>pool' : f.kind === 'withdraw' ? 'pool<i class="ch-arrow">\u2192</i><b>' + esc(chShort(f.account)) + '</b>' : '<i class="ch-redact">\u2588\u2588\u2588\u2588</i><i class="ch-arrow">\u2192</i><i class="ch-redact">\u2588\u2588\u2588\u2588</i>';
      var amt = chAmt(f);
      return '<a class="ch-row ' + k[1] + (CH.fresh[f.sig] ? ' new' : '') + '" style="animation-delay:' + Math.min(i, 20) * 25 + 'ms" href="https://solscan.io/tx/' + encodeURIComponent(f.sig) + '" target="_blank" rel="noopener noreferrer" data-testid="chain-row">' +
        '<span class="ch-k">' + k[0] + '</span><span class="ch-who">' + who + '</span><span class="ch-amt">' + (amt ? esc(amt) : '<i class="ch-redact">\u2588\u2588\u2588</i>') + '</span>' +
        '<span class="ch-meta">' + (f.nullifiers || 0) + ' nullifiers \u00b7 ' + (f.commitments || 0) + ' notes \u00b7 <i>' + esc(chShort(f.sig, 5)) + '</i></span><span class="ch-t" data-ts="' + f.ts + '">' + chAgo(f.ts) + '</span></a>';
    }).join('');
    function stat(k, v, s, t) { return '<div class="ch-stat"><span>' + k + '</span><b' + (t ? ' title="' + esc(t) + '"' : '') + '>' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>'; }
    return '<div class="ch-page" data-testid="chain-page">' +
      '<div class="ch-top"><div><h2>Chain</h2><p>Live pool ledger \u00b7 Solana mainnet</p></div>' +
      '<div class="ch-top-r"><a class="ch-alp" href="/docs#alpenglow" data-testid="chain-alpenglow">Alpenglow \u00b7 epoch 1064 \u2197</a>' +
      '<span class="ch-live ' + (live ? 'on' : 'off') + '" data-testid="chain-live"><i></i>' + (live ? 'Live \u00b7 sync <b class="ch-next">4s</b>' : (CH.err ? 'Reconnecting' : 'Connecting')) + '</span></div></div>' +
      '<div class="ch-stats" data-testid="chain-stats">' +
        stat('Merkle root', st.root ? esc(chShort(st.root, 6)) : '\u2026', null, st.root) +
        stat('Sealed notes', st.leaves != null ? Number(st.leaves).toLocaleString() : '\u2026', 'commitments in the pool') +
        stat('Nullifiers', st.nullifiers != null ? Number(st.nullifiers).toLocaleString() : '\u2026', 'notes already spent') +
        stat('Tokens', CH.nAssets ? CH.nVer + '<i>/' + CH.nAssets + '</i>' : '\u2026', 'verified in pool') +
      '</div>' +
      '<div class="ch-feed-h"><span>Latest activity</span><span class="ch-mix">shield <b>' + cnt.deposit + '</b> \u00b7 trade <b>' + cnt.swap + '</b> \u00b7 exit <b>' + cnt.withdraw + '</b></span></div>' +
      '<div class="ch-feed">' + head + (rows || '<div class="ch-empty">' + (CH.err ? 'Feed unavailable \u2014 retrying\u2026' : 'Loading activity\u2026') + '</div>') + '</div>' +
    '</div>';
  }

  /* ---------------- routing + shell integration ---------------- */
  function parse() {
    var h = location.hash || '';
    if (h === '#private-route') return { view: 'swap', method: 'private' };
    if (h === '#privacy-swap') return { view: 'swap', method: 'privacy' };
    if (h.indexOf('#track') === 0) return { view: 'track', id: decodeURIComponent(h.slice(7) || '') };
    if (h === '#chain') return { view: 'chain' };
    return null;
  }
  function go(v) {
    if (('#' + v) !== location.hash) history.pushState(history.state, '', location.pathname + location.search + '#' + v);
    sync();
  }
  var lastKey = null;
  function sync() {
    var r = parse();
    var root = document.documentElement;
    var key = r ? r.view + ':' + (r.method || '') + ':' + (r.id || '') : null;
    if (!r) {
      if (root.classList.contains('gx-on')) root.classList.remove('gx-on');
      S.view = null; lastKey = null;
      markNav(null);
      return;
    }
    root.classList.add('gx-on');
    ensure();
    if (key === lastKey && viewEl() && viewEl().firstChild) return;
    lastKey = key;
    if (r.view === 'swap') {
      if (S.method !== r.method) {
        var carry = S.recv ? { sym: S.recv.symbol, chain: canonChain(S.recv), dest: S.dest } : null;
        S.method = r.method; resetPair();
        if (carry) {
          var m1 = S.method;
          (m1 === 'privacy' ? api.nTokens('destination', carry.sym) : api.tokens('destination', carry.sym)).then(function (l) {
            if (S.method !== m1 || S.recv) return;
            var hit = (l || []).find(function (t) { return t.symbol === carry.sym && canonChain(t) === carry.chain; });
            if (hit) { S.recv = hit; if (carry.dest && !S.dest) S.dest = carry.dest; render(); if (S.send) scheduleQuote(); }
          }).catch(function () {});
        }
      }
      S.view = 'swap';
      render();
      if (S.send && S.recv) scheduleQuote();
      if (!S.send) {
        var m0 = S.method;
        (m0 === 'privacy' ? api.nTokens('source', '') : api.tokens('source', '')).then(function (l) {
          if (S.method !== m0 || S.send) return;
          var sol = (l || []).find(function (t) { return t.symbol === 'SOL'; }) || (l || [])[0];
          if (sol) { S.send = sol; render(); if (S.recv) scheduleQuote(); }
        }).catch(function () {});
      }
    } else if (r.view === 'chain') {
      S.view = 'chain';
      render();
      startChain();
    } else {
      S.view = 'track';
      render();
      if (r.id && r.id !== S.track.q) doTrack(r.id);
      else if (r.id && !S.track.searched) doTrack(r.id);
    }
    markNav(r.view === 'swap' ? r.method : r.view);
    try { var mn = document.querySelector('main.main'); if (mn) mn.scrollTop = 0; window.scrollTo(0, 0); } catch (e) {}
  }
  function markNav(which) {
    document.querySelectorAll('.gx-nav').forEach(function (b) {
      var k = b.getAttribute('data-dk');
      var on = k === which || (k === 'any' && !!which);
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  var NAV_ITEMS = [
    { k: 'private', label: 'Private route', hash: 'private-route', icon: IC.route, nw: true },
    { k: 'privacy', label: 'Privacy swap', hash: 'privacy-swap', icon: IC.shield, nw: true },
    { k: 'track', label: 'Track', hash: 'track', icon: IC.track },
    { k: 'chain', label: 'Chain', hash: 'chain', icon: IC.track }
  ];
  function ensure() {
    injectCSS();
    var main = document.querySelector('main.main');
    if (main && !document.getElementById('gx-view')) {
      var v = document.createElement('div');
      v.id = 'gx-view';
      v.className = 'view';
      main.appendChild(v);
      if (S.view) render();
    }
    document.querySelectorAll('nav.side, nav.tabbar').forEach(function (nav) {
      if (nav.querySelector('.gx-nav')) return;
      var compact = nav.classList.contains('tabbar');
      var btns = Array.prototype.slice.call(nav.querySelectorAll('.nav-i'));
      if (!btns.length) return;
      var anchor = btns.find(function (b) { return /(Camo Cash)Swap|^Bridge$|Bridge out|^Swap$/.test(b.textContent.trim()); }) ||
                   btns.find(function (b) { return /Trade/.test(b.textContent); }) || btns[btns.length - 1];
      var frag = document.createDocumentFragment();
      (compact ? [{ k: 'any', label: 'Swaps', hash: 'private-route', icon: IC.route }] : NAV_ITEMS).forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'nav-i gx-nav';
        b.setAttribute('data-dk', it.k);
        b.setAttribute('data-testid', (compact ? 'gx-tab-' : 'gx-nav-') + it.k);
        b.innerHTML = '<i data-ico="dk">' + SV(it.icon, 24) + '</i><span>' + it.label + '</span>' + (it.nw && !compact ? '<em class="gx-nw">No wallet</em>' : '');
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(it.hash); });
        frag.appendChild(b);
      });
      anchor.parentNode.insertBefore(frag, anchor.nextSibling);
      var r = parse();
      markNav(r ? (r.view === 'swap' ? r.method : r.view) : null);
    });
  }

  // leaving our views when any native nav item / in-app link is used
  document.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('.nav-i');
    if (n && !n.classList.contains('gx-nav') && document.documentElement.classList.contains('gx-on')) {
      if (parse()) history.replaceState(history.state, '', location.pathname + location.search);
      sync();
    }
  }, true);
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', function () { setTimeout(sync, 0); });
  var lastHash = location.hash;
  setInterval(function () {
    if (location.hash !== lastHash) { lastHash = location.hash; sync(); }
    if (document.querySelector('main.main') && (!document.getElementById('gx-view') || !document.querySelector('nav.side .gx-nav'))) { ensure(); if (parse()) { lastKey = null; sync(); } }
  }, 400);

  // visual-only ordering of the sidebar / bottom bar (CSS order; React keeps its DOM untouched)
  var SIDE_ORDER = ['home|overview', 'shield|vanish', 'send|pay', 'swap|trade', 'bridge|bridge out|camocashswap',
    'dk:private', 'dk:privacy', 'dk:track', 'history|activity', 'dk:chain', 'nc:more',
    'receive|request', 'withdraw|cash out', 'earn|yield', 'addresses|burner addresses', 'invite|referrals', 'keys|vault & keys'];
  var TAB_ORDER = ['home|overview', 'dk:any', 'shield|vanish', 'swap|trade', 'send|pay', 'more'];
  function orderNav() {
    [['nav.side', SIDE_ORDER], ['nav.tabbar', TAB_ORDER]].forEach(function (cfg) {
      var nav = document.querySelector(cfg[0]); if (!nav) return;
      Array.prototype.forEach.call(nav.children, function (el) {
        var key = el.getAttribute('data-dk') ? 'dk:' + el.getAttribute('data-dk') : (el.classList.contains('cc-more-btn') ? 'nc:more' : (el.textContent || '').trim().toLowerCase());
        var idx = 99;
        cfg[1].forEach(function (o, i) { if (o.split('|').indexOf(key) >= 0) idx = i; });
        if (String(el.style.order) !== String(idx)) el.style.order = idx;
      });
    });
  }

  // ---- per-tab explainers (users always know what a tab does) ----
  var X_URL = 'https://x.com/trycamocash';
  var INTRO = {
    'dk:private': ['Private route · no wallet needed', 'Swap from Solana to any chain without connecting a wallet. Camo Cash compares several multi-hop routes, you pick one and send a single deposit to a one-time address; the route converts and delivers to your destination address. Nothing links your Solana wallet to the receiving address beyond the route itself.', ['No wallet connection', 'Multi-hop routing', 'One deposit']],
    'dk:privacy': ['Privacy swap · no wallet needed', 'Intent-based confidential swap. You state what you want (send X, receive at least Y on chain Z); a competitive solver network fills it and settlement runs through confidential processing. Refunds return to your Solana refund address if the intent is not filled.', ['Solver competition', 'Confidential settlement', 'Auto refund']],
    'dk:track': ['Track order', 'Paste an order ID to see its live status, from waiting for deposit through confirmation, exchange and delivery. Orders created on this device are listed below.', ['Live status', 'Local order list']],
    'home': ['Home', 'Your camouflaged balance, recent activity and quick actions. Everything here is decrypted locally from your notes; on-chain it is just another shape in the crowd. The first Alpenglow-era ZK shield on Solana: every move finalizes in ~150 ms.', ['Local decryption', 'Notes', 'Alpenglow finality', 'No tracking']],
    'shield': ['Shield · ZK shielded deposit', 'Yes, this is real zero-knowledge. Shield moves public tokens from a Solana wallet into the shielded pool: the program stores a Poseidon commitment to (token, amount, owner key, blinding) as a leaf in a 2^26 Merkle tree. From then on the funds are notes only you can open. Every later spend is a Groth16 proof (BN254) that the note exists in the tree and that you hold its key, checked on-chain without revealing which note.', ['Groth16 / BN254', 'Poseidon Merkle tree', 'Nullifiers block double-spends']],
    'swap': ['Swap · private trade inside the pool', 'Trade one shielded token for another without leaving the pool. A proof spends your input note, the program routes the trade through on-chain liquidity and writes the output as a new note. Outside observers see a pool trade happen, not who made it or how big it was.', ['Proof-bound terms', 'Relayer pays gas', 'Output lands as a note']],
    'bridge': ['Bridge', 'Exit the shielded pool directly to another network. The proof binds the destination chain, address and minimum output, so a relayer cannot change where funds go.', ['Bound destination', 'Cross-chain exit', 'Relayer submitted']],
    'send': ['Send · private transfer', 'Send to any Camo Cash address. Your note is spent by proof and a new note is encrypted to the recipient’s viewing key. On-chain: one nullifier and two new commitments. No sender, recipient or amount is revealed.', ['Encrypted to recipient', '0 public amounts', 'No wallet signature']],
    'receive': ['Receive privately', 'Share your Camo Cash address or a payment link. Incoming notes are found by scanning with your viewing key locally; the address itself never appears on-chain.', ['Viewing key scan', 'Shareable address', 'Unlinkable receipts']],
    'withdraw': ['Withdraw to Solana', 'Turn notes back into public tokens at any Solana address, ideally a fresh burner one. The amount and destination become public at exit, but the proof does not link them to the deposit that funded them.', ['Public exit', 'Use a burner address', 'Unlinkable to deposit']],
    'earn': ['Earn while shielded', 'Lend shielded balances into allow-listed on-chain vaults from inside the pool. Positions are held by the program and accounted to your notes, so your wallet never appears as the depositor.', ['Allow-listed vaults', 'Position as notes', 'Withdraw any time']],
    'history': ['History', 'Your own decrypted activity log. Only your device can read it; the chain only ever sees nullifiers and commitments.', ['Local only', 'Decrypted with your keys']],
    'addresses': ['Burner addresses', 'One-time Solana addresses derived from your vault, used once for a cash out or a payment so exits do not cluster on one public address.', ['Derived from vault', 'Single use', 'Breaks clustering']],
    'invite': ['Invite', 'Invite friends with your personal link and track rewards earned from their activity.', ['Personal link', 'Rewards']],
    'keys': ['Keys & vault', 'Your spending key, viewing key and recovery key, all derived from one 32-byte root encrypted on this device (PBKDF2 · AES-GCM). Back up the recovery key offline; nobody can reset it.', ['Never leaves device', 'Recovery key', 'Viewing key export']]
  };
  function activeLabel() {
    var on = document.querySelector('nav.side .nav-i.on:not(.gx-nav)') || document.querySelector('nav.tabbar .nav-i.on:not(.gx-nav)');
    return on ? (on.textContent || '').trim().toLowerCase() : '';
  }
  function introHTML(k) {
    var it = INTRO[k]; if (!it) return '';
    return '<div class="gx-intro-k">' + esc(it[0]) + '</div><p>' + esc(it[1]) + '</p><div class="gx-intro-t">' +
      it[2].map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
      (k === 'home' ? '<div class="gx-intro-nw"><b>No wallet? No problem.</b> Private route and Privacy swap work without connecting or creating a wallet: pick tokens, paste an address, send one deposit. <a href="#private-route" data-testid="gx-intro-private">Private route →</a> <a href="#privacy-swap" data-testid="gx-intro-privacy">Privacy swap →</a></div>' : '');
  }
  var lastIntro = null;
  function syncIntro() {
    var main = document.querySelector('main.main'); if (!main) return;
    var el = document.getElementById('gx-intro');
    var on = document.documentElement.classList.contains('gx-on');
    var r = on ? parse() : null;
    var k = on ? (r ? (r.view === 'track' ? 'dk:track' : (r.method === 'privacy' ? 'dk:privacy' : 'dk:private')) : null) : activeLabel();
    if (!k || !INTRO[k]) { if (el) el.style.display = 'none'; lastIntro = null; return; }
    if (!el || el.parentNode !== main) {
      el = document.createElement('div'); el.id = 'gx-intro'; el.setAttribute('data-testid', 'gx-intro');
      el.addEventListener('click', function (e) { if (!e.target.closest('a')) el.classList.toggle('open'); });
      main.insertBefore(el, main.firstChild);
    }
    el.style.display = '';
    if (lastIntro !== k) { el.innerHTML = introHTML(k); el.setAttribute('data-tab', k); lastIntro = k; }
  }
  function ensureX() {
    var tr = document.querySelector('header .top-right');
    if (tr && !tr.querySelector('.gx-x')) {
      var a = document.createElement('a');
      a.className = 'gx-x'; a.href = X_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', 'Camo Cash on X'); a.setAttribute('data-testid', 'gx-x-link');
      a.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
      tr.insertBefore(a, tr.firstChild);
    }
  }
  /* ---- Camo Cash: header tagline — First Alpenglow ZK shield on Solana ---- */
  function ensureTagline() {
    if (!document.querySelector('main.main')) return;
    if (document.getElementById('cc-tagline')) return;
    var t = document.createElement('span');
    t.id = 'cc-tagline'; t.className = 'cc-tag'; t.setAttribute('data-testid', 'cc-tagline');
    t.textContent = 'First Alpenglow ZK shield on Solana';
    document.body.appendChild(t);
  }
  function fixTaglineOverlap() {
    var t = document.getElementById('cc-tagline'); if (!t) return;
    var wb = document.querySelector('header .wallet-btn');
    var connected = wb && /\u00b7/.test(wb.textContent || '');
    var show = connected ? 'none' : '';
    if (t.style.display !== show) t.style.display = show;
  }
  /* ---- Camo Cash: keep desktop top tabs clear of the header controls ---- */
  var OVF_ORDER = ['chain', 'history', 'bridge', 'track', 'send', 'privacy swap', 'shield', 'private route', 'swap'];
  function navKey(b) {
    var t = '';
    Array.prototype.forEach.call(b.childNodes, function (n) {
      if (n.nodeType === 3) t += n.nodeValue;
      else if (n.nodeType === 1 && !(n.classList && n.classList.contains('gx-nw')) && n.tagName !== 'I' && n.tagName !== 'svg') t += n.textContent;
    });
    return t.trim().toLowerCase();
  }
  var fitRO = null;
  function fitNav() {
    if (!fitRO && window.ResizeObserver) {
      var trx = document.querySelector('header .top-right');
      if (trx) { fitRO = new ResizeObserver(function () { try { fitNavNow(); } catch (e) {} }); fitRO.observe(trx); }
    }
    fitNavNow();
  }
  function fitNavNow() {
    var nav = document.querySelector('nav.side'), tr = document.querySelector('header .top-right');
    if (!nav || !tr) return;
    var items = nav.querySelectorAll('.nav-i');
    if (window.innerWidth < 1024) {
      Array.prototype.forEach.call(items, function (b) { if (b.classList.contains('cc-ovf')) b.classList.remove('cc-ovf'); });
      nav.style.removeProperty('right'); nav.style.removeProperty('left'); return;
    }
    var brand = document.querySelector('header .brand');
    var left = brand ? Math.round(brand.getBoundingClientRect().right + 24) : 160;
    var right = Math.max(0, Math.round(window.innerWidth - tr.getBoundingClientRect().left + 16));
    if (nav.style.getPropertyValue('right') !== right + 'px') nav.style.setProperty('right', right + 'px', 'important');
    if (nav.style.getPropertyValue('left') !== left + 'px') nav.style.setProperty('left', left + 'px', 'important');
    var byKey = {};
    Array.prototype.forEach.call(items, function (b) {
      if (b.classList.contains('cc-more-item') || b.classList.contains('cc-hide')) return;
      byKey[navKey(b)] = b;
    });
    var was = Array.prototype.filter.call(items, function (b) { return b.classList.contains('cc-ovf'); });
    was.forEach(function (b) { b.classList.remove('cc-ovf'); });
    var over = function () {
      if (nav.scrollWidth > nav.clientWidth + 1) return true;
      var mbx = nav.querySelector('.cc-more-btn');
      return !!(mbx && mbx.offsetWidth && mbx.getBoundingClientRect().right > nav.getBoundingClientRect().right + 0.5);
    };
    for (var i = 0; i < OVF_ORDER.length && over(); i++) {
      var it = byKey[OVF_ORDER[i]]; if (it) it.classList.add('cc-ovf');
    }
    var now = Array.prototype.filter.call(items, function (b) { return b.classList.contains('cc-ovf'); });
    nav.classList.toggle('cc-tight', over());
    if (now.length !== was.length && document.getElementById('cc-more-pop')) closeMore();
  }
  /* ---- Camo Cash: top-tab "More" menu (desktop) ---- */
  var MORE_OVF = { 'chain': 'Live pool terminal', 'history': 'Your local activity', 'bridge': 'Move funds across chains', 'track': 'Follow a swap order live',
    'send': 'Pay anyone privately', 'privacy swap': 'No wallet · shielded cross-chain', 'shield': 'Move tokens into the pool', 'private route': 'No wallet · best-rate cross-chain', 'swap': 'Trade inside the pool' };
  var MORE = { 'receive': 'Get paid to a private address', 'withdraw': 'Exit to any Solana address',
    'addresses': 'One-time burner addresses', 'keys': 'Vault, viewing & recovery keys' };
  var MORE_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function closeMore() {
    var p = document.getElementById('cc-more-pop'); if (p) p.remove();
    var b = document.querySelector('.cc-more-btn'); if (b) b.classList.remove('open');
  }
  function openMore(btn) {
    closeMore();
    var nav = document.querySelector('nav.side'); if (!nav) return;
    var pop = document.createElement('div'); pop.id = 'cc-more-pop'; pop.setAttribute('data-testid', 'cc-more-menu');
    var ovf = Array.prototype.slice.call(nav.querySelectorAll('.nav-i.cc-ovf'));
    var more = Array.prototype.slice.call(nav.querySelectorAll('.nav-i.cc-more-item'));
    ovf.concat(more).forEach(function (orig) {
      var k = navKey(orig), label = k.replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/^(Private|Privacy) (Route|Swap)$/, function (m, a, b2) { return a + ' ' + b2.toLowerCase(); });
      var it = document.createElement('button'); it.type = 'button';
      it.setAttribute('data-testid', 'cc-more-' + k.replace(/[^a-z]+/g, '-'));
      if (orig.classList.contains('on')) it.className = 'on';
      var ico = orig.querySelector('i'); 
      it.innerHTML = '<i>' + (ico ? ico.innerHTML : '') + '</i><span>' + esc(label) + '<small>' + esc(MORE[k] || MORE_OVF[k] || '') + '</small></span>';
      it.addEventListener('click', function () { closeMore(); orig.click(); });
      pop.appendChild(it);
    });
    document.body.appendChild(pop);
    var r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 12) + 'px';
    btn.classList.add('open');
  }
  document.addEventListener('click', function (e) {
    if (!document.getElementById('cc-more-pop')) return;
    if (e.target.closest && (e.target.closest('#cc-more-pop') || e.target.closest('.cc-more-btn'))) return;
    closeMore();
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMore(); });
  window.addEventListener('resize', function () { closeMore(); try { fitNav(); } catch (e) {} });
  function ensureMore() {
    var nav = document.querySelector('nav.side'); if (!nav) return;
    var anyOn = false;
    Array.prototype.forEach.call(nav.querySelectorAll('.nav-i:not(.gx-nav)'), function (b) {
      var k = (b.textContent || '').trim().toLowerCase();
      var gone = k === 'earn' || k === 'invite';
      if (gone !== b.classList.contains('cc-hide')) b.classList.toggle('cc-hide', gone);
      var isMore = MORE.hasOwnProperty(k);
      if (isMore !== b.classList.contains('cc-more-item')) b.classList.toggle('cc-more-item', isMore);
      if (isMore && b.classList.contains('on') && !document.documentElement.classList.contains('gx-on')) anyOn = true;
    });
    var mb = nav.querySelector('.cc-more-btn');
    if (!mb) {
      mb = document.createElement('button'); mb.type = 'button'; mb.className = 'cc-more-btn';
      mb.setAttribute('data-testid', 'cc-more-btn'); mb.setAttribute('aria-haspopup', 'menu');
      mb.innerHTML = '<span>More</span>' + MORE_ICO;
      mb.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (mb.classList.contains('open')) closeMore(); else openMore(mb); });
      nav.appendChild(mb);
    }
    mb.classList.toggle('on', anyOn || !!nav.querySelector('.nav-i.cc-ovf.on'));
  }

  /* ---- Camo Cash: welcome tour (first visit) ---- */
  var TOUR_KEY = 'cc-tour-v1';
  var TOUR = [
    ['Welcome to Camo Cash', 'Private money on Solana.', 'Shield your tokens into a zero-knowledge pool — your balance puts on camo and melts into the crowd.', 'mark'],
    ['Shield, send, swap', 'Every move under cover.', 'Pay anyone, trade tokens and earn yield with proofs instead of public transfers. Nobody sees who, what or how much.', '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'],
    ['No wallet? No problem', 'Private route & Privacy swap.', 'One deposit to a burn-after-use address moves value to any chain. Track every order live.', '<path d="M7 7h11l-3-3M17 17H6l3 3"/>'],
    ['Your keys, your device', 'Nothing to reset, nothing to leak.', 'Keys are forged and encrypted on this device alone. Guard your recovery key — you alone hold the pattern.', '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M16 7l2 2M14 9l2 2"/>']
  ];
  function showTour(force) {
    try { if (!force && localStorage.getItem(TOUR_KEY)) return; } catch (e) {}
    if (document.getElementById('cc-tour')) return;
    var i = 0, box = document.createElement('div'); box.id = 'cc-tour'; box.setAttribute('data-testid', 'cc-tour');
    function done() { try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {} box.classList.add('out'); setTimeout(function () { box.remove(); }, 200); document.removeEventListener('keydown', kd, true); }
    function kd(e) { if (e.key === 'Escape') done(); }
    function draw() {
      var t = TOUR[i];
      var ico = t[3] === 'mark' ? '<img src="/api/bifrost/v1/_brand/mark-black.png" alt="" class="nt-mk">' : '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + t[3] + '</svg>';
      box.innerHTML = '<div class="nt-card" role="dialog" aria-modal="true" aria-label="' + esc(t[0]) + '"><div class="nt-dots">' +
        TOUR.map(function (_, j) { return '<i class="' + (j === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="nt-body" key="' + i + '"><div class="nt-ico">' + ico + '</div><h3>' + esc(t[0]) + '</h3><div class="nt-sub">' + esc(t[1]) + '</div><p>' + esc(t[2]) + '</p></div>' +
        '<button class="nt-go" data-testid="cc-tour-next">' + (i === TOUR.length - 1 ? 'Get started' : 'Next') + '</button>' +
        '<button class="nt-skip" data-testid="cc-tour-skip">' + (i === TOUR.length - 1 ? 'Close' : 'Skip intro') + '</button></div>';
      if (document.documentElement.getAttribute('data-theme') === 'dark') { var mk = box.querySelector('.nt-mk'); if (mk) mk.src = '/api/bifrost/v1/_brand/mark-white.png'; }
      box.querySelector('.nt-go').onclick = function () { if (i < TOUR.length - 1) { i++; draw(); } else done(); };
      box.querySelector('.nt-skip').onclick = done;
    }
    box.addEventListener('click', function (e) { if (e.target === box) done(); });
    document.addEventListener('keydown', kd, true);
    draw(); document.body.appendChild(box);
  }
  window.__ncTour = function () { showTour(true); };

  /* ---- Camo Cash: footer ---- */
  function ensureFoot() {
    var main = document.querySelector('main.main'); if (!main) return;
    var f = document.getElementById('cc-foot');
    if (f && f.parentNode === main && main.lastElementChild === f) return;
    if (!f) {
      f = document.createElement('footer'); f.id = 'cc-foot'; f.setAttribute('data-testid', 'cc-footer');
      f.innerHTML = '<span>© ' + new Date().getFullYear() + ' Camo Cash</span><nav>' +
        '<a href="/#flow">How it works</a><a href="/#zk">Privacy model</a><a href="/docs">Docs</a><a href="/#fees">Fees</a>' +
        '<a href="#" data-cc-tour="1">Take the tour</a><a href="' + X_URL + '" target="_blank" rel="noopener noreferrer">X</a></nav>';
      f.querySelector('[data-cc-tour]').addEventListener('click', function (e) { e.preventDefault(); showTour(true); });
    }
    main.appendChild(f);
  }

  function ensureWalletBtn() {
    var wb = document.querySelector('header .wallet-btn'); if (!wb) return;
    var off = /^connect$/i.test((wb.textContent || '').trim());
    if (off !== wb.classList.contains('cc-off')) wb.classList.toggle('cc-off', off);
    if (wb.getAttribute('data-testid') !== 'cc-connect-btn') wb.setAttribute('data-testid', 'cc-connect-btn');
  }
  /* ---- Camo Cash: mobile dock + Menu sheet ---- */
  var DI = {
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2"/><path d="M3 10h18"/><path d="M7 6V5a2 2 0 0 1 2-2h8"/>',
    hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.3 6.3A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    pay: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
    trade: '<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/>',
    menu: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    bridge: '<path d="M3 17h18"/><path d="M5 17V9a7 7 0 0 1 14 0v8"/><path d="M9 17v-5M15 17v-5"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    track: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    exit: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    grow: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    pin: '<path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-.5 6-1.5S14 4 12 8Z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l2.5 2.5M14.5 8.5 17 11"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.9 0-3 .9-3 2s1 1.7 3 2 3 .9 3 2-1.1 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    out: '<path d="M7 17 17 7M8 7h9v9"/>', chev: '<path d="m9 6 6 6-6 6"/>'
  };
  var DOCK = [
    { k: 'home', label: 'Wallet', ico: 'wallet' }, { k: 'shield', label: 'Hide', ico: 'hide' },
    { k: 'send', label: 'Pay', ico: 'pay' }, { k: 'swap', label: 'Trade', ico: 'trade' },
    { k: 'dk:chain', label: 'Chain', ico: 'term' }, { k: 'menu', label: 'Menu', ico: 'menu' }
  ];
  var TILES = [
    { k: 'bridge', label: 'Bridge', ico: 'bridge' }, { k: 'dk:private-route', label: 'Private route', ico: 'route' },
    { k: 'dk:privacy-swap', label: 'Privacy swap', ico: 'lock' }, { k: 'dk:track', label: 'Track', ico: 'track' },
    { k: 'history', label: 'History', ico: 'clock' }, { k: 'dk:chain', label: 'Chain', ico: 'term' },
    { k: 'receive', label: 'Receive', ico: 'inbox' },
    { k: 'withdraw', label: 'Withdraw', ico: 'exit' }, { k: 'addresses', label: 'Addresses', ico: 'pin' },
    { k: 'keys', label: 'Keys', ico: 'key' }
  ];
  var LEARN = [
    { label: 'How Camo Cash works', ico: 'spark', act: 'tour' }, { label: 'Privacy model', ico: 'eye', href: '/#zk' },
    { label: 'Fees', ico: 'coin', href: '/#fees' }, { label: 'Docs', ico: 'book', href: '/docs', ext: true }
  ];
  function dsv(n, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + DI[n] + '</svg>'; }
  function nativeNav(k) {
    var btns = document.querySelectorAll('nav.side .nav-i:not(.gx-nav)');
    for (var i = 0; i < btns.length; i++) if ((btns[i].textContent || '').trim().toLowerCase() === k) return btns[i];
    return null;
  }
  function openFeature(k) {
    closeSheet();
    if (k.indexOf('dk:') === 0) { go(k.slice(3)); return; }
    var b = nativeNav(k); if (b) b.click();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function currentKey() {
    var r = document.documentElement.classList.contains('gx-on') ? parse() : null;
    if (r) return r.view === 'track' ? 'dk:track' : r.view === 'chain' ? 'dk:chain' : (r.method === 'privacy' ? 'dk:privacy-swap' : 'dk:private-route');
    var on = document.querySelector('nav.side .nav-i.on:not(.gx-nav)');
    return on ? (on.textContent || '').trim().toLowerCase() : 'home';
  }
  function closeSheet() {
    var s = document.getElementById('cc-sheet'); if (!s) return;
    s.classList.add('out'); setTimeout(function () { s.remove(); }, 260);
    var m = document.querySelector('#cc-dock [data-k="menu"]'); if (m) m.classList.remove('open');
  }
  function openSheet() {
    if (document.getElementById('cc-sheet')) { closeSheet(); return; }
    var cur = currentKey();
    var s = document.createElement('div'); s.id = 'cc-sheet'; s.setAttribute('data-testid', 'cc-menu-sheet');
    s.innerHTML = '<div class="ns-panel" role="dialog" aria-modal="true" aria-label="Menu"><i class="ns-grab"></i>' +
      '<div class="ns-h"><b>Menu</b><button class="ns-x" data-testid="cc-menu-close" aria-label="Close">' + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="ns-scroll"><div class="ns-grid">' + TILES.map(function (t, i) {
        return '<button class="ns-tile' + (cur === t.k ? ' on' : '') + '" style="animation-delay:' + (i * 22) + 'ms" data-k="' + t.k + '" data-testid="cc-menu-' + t.k.replace(/[^a-z]+/g, '-') + '"><i>' + dsv(t.ico, 20) + '</i><span>' + t.label + '</span></button>';
      }).join('') + '</div><div class="ns-sec">Learn</div><div class="ns-list">' + LEARN.map(function (l, i) {
        return (l.href ? '<a href="' + l.href + '"' : '<button data-act="' + l.act + '"') + ' class="ns-row" data-testid="cc-learn-' + i + '"><i>' + dsv(l.ico, 18) + '</i><span>' + l.label + '</span><em>' + dsv(l.ext ? 'out' : 'chev', 16) + '</em>' + (l.href ? '</a>' : '</button>');
      }).join('') + '</div><div class="ns-foot"><span>© ' + new Date().getFullYear() + ' Camo Cash</span><a href="' + X_URL + '" target="_blank" rel="noopener noreferrer">X</a><a href="/">Home page</a></div></div></div>';
    s.addEventListener('click', function (e) {
      if (e.target === s || e.target.closest('.ns-x')) { closeSheet(); return; }
      var t = e.target.closest('.ns-tile'); if (t) { openFeature(t.getAttribute('data-k')); return; }
      var a = e.target.closest('[data-act="tour"]'); if (a) { closeSheet(); showTour(true); }
    });
    document.body.appendChild(s);
    var m = document.querySelector('#cc-dock [data-k="menu"]'); if (m) m.classList.add('open');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  function ensureDock() {
    if (!document.querySelector('main.main')) return;
    var d = document.getElementById('cc-dock');
    if (!d) {
      d = document.createElement('nav'); d.id = 'cc-dock'; d.setAttribute('data-testid', 'cc-dock');
      d.innerHTML = DOCK.map(function (t) { return '<button type="button" data-k="' + t.k + '" data-testid="cc-dock-' + t.k.replace(/^(dk|gx):/, '') + '"><i>' + dsv(t.ico) + '</i><span>' + t.label + '</span></button>'; }).join('');
      d.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var k = b.getAttribute('data-k');
        if (k === 'menu') openSheet(); else openFeature(k);
        setTimeout(ensureDock, 80);
      });
      document.body.appendChild(d);
    }
    var cur = currentKey(), inDock = DOCK.some(function (t) { return t.k === cur; });
    Array.prototype.forEach.call(d.children, function (b) {
      var k = b.getAttribute('data-k');
      var on = k === cur || (k === 'menu' && !inDock);
      if (on !== b.classList.contains('on')) b.classList.toggle('on', on);
    });
  }

  /* ---- Camo Cash: explain first, connect last ---- */
  var SHORT = {
    home: ['Wallet', 'Your money, in camo.'], shield: ['Hide', 'Pull your tokens under cover.'],
    send: ['Pay', 'Deliver value. Leave no tracks.'], swap: ['Trade', 'Swap under cover.'],
    bridge: ['Bridge', 'Slip out to any chain.'], receive: ['Receive', 'Get paid off the radar.'],
    withdraw: ['Withdraw', 'Cash out, no fingerprints.'], earn: ['Earn', 'Yield under cover.'],
    history: ['History', 'For your eyes only.'], addresses: ['Addresses', 'Burn-after-use exits.'],
    invite: ['Invite', 'Recruit and earn.'], keys: ['Keys', 'Your keys, your command.']
  };
  var GET = {
    home: ['Camouflaged balance', 'Local history', 'All tools unlocked'], shield: ['Sealed notes', 'Hidden amounts', 'Unlinked wallet'],
    send: ['Hidden sender', 'Hidden amount', 'Gas covered'], swap: ['Private trades', 'New notes out', 'No public trail'],
    bridge: ['Any network', 'Proof-locked', 'No signature'], receive: ['Private address', 'QR code', 'Auto-detected'],
    withdraw: ['Any address', 'Burner ready', 'Gas covered'], earn: ['Vetted vaults', 'Private positions', 'Exit anytime'],
    history: ['Full log', 'Device-only', 'Encrypted'], addresses: ['One-time', 'Unclustered', 'Vault-derived'],
    invite: ['Personal link', 'Fee share', 'Live rewards'], keys: ['Recovery key', 'View-only key', 'Local encryption']
  };
  var PITCH_ICO = { home: 'wallet', shield: 'hide', send: 'pay', swap: 'trade', bridge: 'bridge', receive: 'inbox', withdraw: 'exit', earn: 'grow', history: 'clock', addresses: 'pin', invite: 'gift', keys: 'key' };
  function closeOnb() {
    document.documentElement.classList.remove('cc-onb-open');
    var bg = document.getElementById('cc-onb-bg'); if (bg) bg.remove();
  }
  function openOnb() {
    if (!document.querySelector('main.main .card.onb')) return;
    document.documentElement.classList.add('cc-onb-open');
    if (!document.getElementById('cc-onb-bg')) {
      var bg = document.createElement('div'); bg.id = 'cc-onb-bg'; bg.setAttribute('data-testid', 'cc-connect-backdrop');
      bg.innerHTML = '<button class="cc-onb-x" data-testid="cc-connect-close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
      bg.addEventListener('click', closeOnb);
      var host = document.querySelector('main.main'); host = (host && host.parentNode) || document.body;
      host.appendChild(bg);
    }
  }
  window.__ncConnect = openOnb;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOnb(); });
  document.addEventListener('click', function (e) {
    // opening the native create/restore sheet from the connect box: close our box
    if (document.documentElement.classList.contains('cc-onb-open') && e.target.closest && e.target.closest('.card.onb .wopt, .card.onb .link')) setTimeout(closeOnb, 60);
    var wb = e.target.closest && e.target.closest('header .wallet-btn.cc-off');
    if (wb && document.querySelector('main.main .card.onb')) { e.preventDefault(); e.stopPropagation(); openOnb(); }
  }, true);
  var lastPitch = null;
  function ensurePitch() {
    var main = document.querySelector('main.main'); if (!main) return;
    var html = document.documentElement;
    var gated = !html.classList.contains('gx-on') && !!main.querySelector('.card.onb');
    if (gated !== html.classList.contains('cc-gated')) html.classList.toggle('cc-gated', gated);
    var p = document.getElementById('cc-pitch');
    if (!gated) { if (p) p.remove(); lastPitch = null; closeOnb(); return; }
    var k = activeLabel() || 'home'; if (!SHORT[k]) k = 'home';
    if (!p || p.parentNode !== main) {
      p = document.createElement('section'); p.id = 'cc-pitch'; p.setAttribute('data-testid', 'cc-pitch');
      var anchor = main.querySelector('.view'); main.insertBefore(p, anchor || null);
      lastPitch = null;
    }
    if (lastPitch === k) return;
    lastPitch = k;
    var it = SHORT[k], get = GET[k] || GET.home;
    p.setAttribute('data-tab', k);
    p.innerHTML = '<i class="np-ico">' + dsv(PITCH_ICO[k] || 'wallet', 28) + '</i><span class="np-k">' + esc(it[0]) + '</span><h2>' + esc(it[1]) + '</h2>' +
      '<div class="np-get">' + get.map(function (g, i) { return '<span style="animation-delay:' + (120 + i * 70) + 'ms">' + dsv('chev', 14).replace('m9 6 6 6-6 6', 'M5 12l5 5 9-10') + esc(g) + '</span>'; }).join('') + '</div>' +
      '<button class="np-cta" data-testid="cc-pitch-connect">Connect wallet</button>' +
      '<a class="np-alt" href="#private-route" data-testid="cc-pitch-private">No wallet? Swap instantly →</a>';
    p.querySelector('.np-cta').addEventListener('click', openOnb);
  }

  /* ---- Camo Cash: wallet sheet — Camo Wallet first, non-native wallets under a dropdown ---- */
  var EXT_WALLETS = [
    ['Phantom', 'The popular Solana wallet', 'https://phantom.com'],
    ['Solflare', 'Solana wallet, web and mobile', 'https://solflare.com'],
    ['Backpack', 'Wallet for Solana and more', 'https://backpack.app']
  ];
  function woptClone(o) {
    // clone visually, never move React-managed nodes
    var name = (o.querySelector('b') || {}).textContent || 'Wallet';
    var subEl = o.querySelector('span span');
    var sub = subEl ? subEl.textContent : '';
    var img = o.querySelector('img');
    var href = o.tagName === 'A' ? o.getAttribute('href') : null;
    var el = document.createElement(href ? 'a' : 'button');
    el.className = 'wopt wext';
    el.setAttribute('data-testid', 'wallet-ext-' + name.toLowerCase());
    if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
    else { el.type = 'button'; el.addEventListener('click', function () { try { o.click(); } catch (e) {} }); }
    el.innerHTML = (img ? '<img src="' + img.getAttribute('src') + '" alt="" style="width:30px;height:30px">' : '') +
      '<span><b></b><span></span></span><span class="wg-go">' + (href ? 'Install' : 'Open') + '</span>';
    el.querySelector('b').textContent = name;
    el.querySelector('span span').textContent = sub;
    return el;
  }
  function ensureWalletGroup() {
    var card = document.querySelector('.card.onb'); if (!card) return;
    if (card.querySelector('.wgroup')) return;
    var own = card.querySelector('.wopt-own'); if (!own) return;
    var rest = Array.prototype.slice.call(card.querySelectorAll('.wopt:not(.wopt-own)'));
    var g = document.createElement('div'); g.className = 'wgroup';
    var t = document.createElement('button'); t.type = 'button'; t.className = 'wgroup-t';
    t.setAttribute('data-testid', 'wallet-other-toggle'); t.setAttribute('aria-expanded', 'false');
    t.innerHTML = '<span>Other wallets <em>not ZK-native</em></span><i class="wg-chev"></i>';
    var list = document.createElement('div'); list.className = 'wgroup-list';
    if (rest.length) {
      card.classList.add('wg-has-ext');
      rest.forEach(function (o) { try { list.appendChild(woptClone(o)); } catch (e) {} });
    } else {
      list.innerHTML = EXT_WALLETS.map(function (w) {
        return '<a class="wopt wext" href="' + w[2] + '" target="_blank" rel="noopener noreferrer" data-testid="wallet-ext-' + w[0].toLowerCase() + '">' +
          '<span><b>' + w[0] + '</b><span>' + w[1] + '</span></span><span class="wg-go">Install</span></a>';
      }).join('');
    }
    try {
      own.parentNode.insertBefore(g, own.nextSibling);
      g.appendChild(t); g.appendChild(list);
      t.addEventListener('click', function () {
        var open = g.classList.toggle('open'); t.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    } catch (e) {}
  }

  /* ---- Camo Cash boot loader: square radar sweep + cycling field actions ---- */
  function ensureSplash() {
    if (window.__ncSplashDone || document.getElementById('cc-splash')) return;
    var vl = document.querySelector('.vl');
    if (!vl) return;
    window.__ncSplashDone = true;
    var box = document.createElement('div'); box.id = 'cc-splash'; box.setAttribute('data-testid', 'cc-splash');
    var shownAt = performance.now(), MIN_MS = 1500, leaving = false;
    box.innerHTML = '<div class="sp-card sp-mini">'
      + '<div class="sp-radar"><i class="sp-r2"></i><i class="sp-r3"></i><i class="sp-sweep"></i><i class="sp-core"></i></div>'
      + '<b id="sp-act" class="in">Sweeping the field&hellip;</b></div>';
    document.body.appendChild(box);
    var acts = ['Sweeping the field\u2026', 'Forging keys\u2026', 'Sealing notes\u2026', 'Syncing the pool\u2026', 'Cloaking tracks\u2026', 'Going dark\u2026'];
    var ai = 0, act = box.querySelector('#sp-act');
    var at = setInterval(function () {
      ai = (ai + 1) % acts.length;
      act.classList.remove('in'); void act.offsetWidth;
      act.textContent = acts[ai]; act.classList.add('in');
    }, 1300);
    var boot = document.getElementById('cc-boot'); if (boot) boot.remove();
    var done = function () { clearInterval(at); box.classList.add('sp-out'); setTimeout(function () { box.remove(); }, 420); };
    var gone = setInterval(function () {
      var v = document.querySelector('.vl');
      var ready = (!v || v.classList.contains('out')) && document.querySelector('main.main');
      if (!leaving && ready && performance.now() - shownAt >= MIN_MS) { leaving = true; clearInterval(gone); done(); }
    }, 100);
    setTimeout(function () { if (!leaving) { leaving = true; clearInterval(gone); done(); } }, 20000);
  }
  var spT = setInterval(function () { ensureSplash(); if (window.__ncSplashDone || (document.querySelector('main.main') && !document.querySelector('.vl'))) clearInterval(spT); }, 30);

  /* ---- collapsible fee summaries on every in-app page (Send, Shield, Swap, Bridge...) ---- */
  // every fee box starts closed; state lives on its own toggle and resets on page change
  function feeSummary(box) {
    var rows = Array.prototype.slice.call(box.querySelectorAll(':scope > .r'));
    var pick = null;
    rows.forEach(function (r) {
      var k = (r.children[0] && r.children[0].textContent || '').trim(), v = (r.children[1] && r.children[1].textContent || '').trim();
      if (!pick && /fee/i.test(k) && /\d/.test(v)) pick = [k, v];
    });
    if (!pick) rows.some(function (r) { var k = (r.children[0] && r.children[0].textContent || '').trim(); if (/fee/i.test(k)) { pick = [k, (r.children[1] && r.children[1].textContent || '').trim()]; return true; } return false; });
    if (!pick && rows[0]) pick = [(rows[0].children[0] || {}).textContent || '', (rows[0].children[1] || {}).textContent || ''];
    return pick ? (pick[0].trim() + ': ' + pick[1].trim()) : 'Fees and details';
  }
  function ensureFees() {
    var main = document.querySelector('main.main') || document.body;
    // drop toggles whose panel React removed
    Array.prototype.forEach.call(main.querySelectorAll('.cc-fee-tog'), function (b) {
      var n = b.nextElementSibling; if (!n || !n.classList.contains('sum')) b.remove();
    });
    Array.prototype.forEach.call(main.querySelectorAll('div.sum'), function (box) {
      if (box.closest('#gx-view') || box.querySelectorAll(':scope > .r').length < 1) { if (!box.classList.contains('cc-fee-ok')) box.classList.add('cc-fee-ok'); return; }
      var tog = box.previousElementSibling;
      if (!tog || !tog.classList.contains('cc-fee-tog')) {
        tog = document.createElement('button');
        tog.type = 'button'; tog.className = 'cc-fee-tog'; tog.setAttribute('data-testid', 'cc-fee-toggle');
        tog.innerHTML = '<span class="k">Fees &amp; details</span><span class="v"></span><span class="c" aria-hidden="true"></span>';
        tog.setAttribute('data-open', '0');
        tog.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); tog.setAttribute('data-open', tog.getAttribute('data-open') === '1' ? '0' : '1'); ensureFees(); });
        box.parentNode.insertBefore(tog, box);
      }
      var sum = feeSummary(box), v = tog.querySelector('.v');
      if (v && v.textContent !== sum) v.textContent = sum;
      if (!box.classList.contains('cc-fee-ok')) box.classList.add('cc-fee-ok');
      var isOpen = tog.getAttribute('data-open') === '1';
      if (tog.getAttribute('aria-expanded') !== String(isOpen)) tog.setAttribute('aria-expanded', String(isOpen));
      if (box.classList.contains('cc-fee-shut') === isOpen) box.classList.toggle('cc-fee-shut', !isOpen);
    });
  }
  (function feeCss() {
    if (document.getElementById('cc-fee-css')) return;
    var st = document.createElement('style'); st.id = 'cc-fee-css';
    st.textContent = '.cc-fee-tog{all:unset;box-sizing:border-box;width:100%;cursor:pointer;display:flex;align-items:center;gap:10px;margin-top:14px;padding:11px 14px;border:1px solid var(--line,rgba(0,0,0,.08));border-radius:0;background:var(--s-field,#f3f4ee);font-size:13.5px;color:var(--fg-2,#4a4d42);transition:background .2s,border-color .2s}' +
      '.cc-fee-tog:hover{border-color:var(--line-2,rgba(0,0,0,.16))}' +
      '.cc-fee-tog .k{font-weight:600;color:var(--fg,#14160f);white-space:nowrap}' +
      '.cc-fee-tog .v{flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg-3,#8a8d80)}' +
      '.cc-fee-tog .c{width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform .25s;flex:none}' +
      '.cc-fee-tog[aria-expanded=true]{border-bottom-left-radius:4px;border-bottom-right-radius:4px}' +
      '.cc-fee-tog[aria-expanded=true] .c{transform:rotate(-135deg) translateY(-2px)}' +
      '.cc-fee-tog[aria-expanded=true] + .sum{margin-top:4px!important;animation:ncFeeIn .25s ease both}' +
      '.sum.cc-fee-shut{display:none!important}main.main form .sum:not(.cc-fee-ok){display:none}' +
      '@keyframes ncFeeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}';
    (document.head || document.documentElement).appendChild(st);
  })();
  document.addEventListener('input', function () { setTimeout(ensureFees, 120); }, true);
  window.addEventListener('hashchange', function () { Array.prototype.forEach.call(document.querySelectorAll('.cc-fee-tog'), function (b) { b.setAttribute('data-open', '0'); }); ensureFees(); });
  function tick() { orderNav(); ensureX(); ensureTagline(); fixTaglineOverlap(); syncIntro(); ensureMore(); fitNav(); ensureFoot(); ensureWalletBtn(); ensureDock(); ensurePitch(); ensureSplash(); ensureFees(); ensureWalletGroup(); }
  setTimeout(function () { if (document.querySelector('main.main')) showTour(false); }, 1400);
  function boot() { ensure(); sync(); tick(); setInterval(tick, 700); document.addEventListener('click', function () { setTimeout(tick, 60); }, true); window.addEventListener('hashchange', function () { setTimeout(tick, 60); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
