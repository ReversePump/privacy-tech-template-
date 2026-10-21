import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Logo from '../components/Logo';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const BIFROST = `${BACKEND}/api/bifrost/v1`;

// Map any pretty site URL to the Bifrost v1 upstream mirror (one single site):
//   /                -> app  /            (NullCash app: wallet, shield, trade, swaps...)
//   /docs, /security -> app  /docs ...
//   /about[...]      -> site /...         (landing)
//   /swap            -> app  /#private-route   (legacy)
//   /track?id=X      -> app  /#track/X         (legacy)
//   /shield[...]     -> same as above without the /shield prefix (legacy)
export function shieldUpstream(pathname, search = '', hash = '') {
  let rest = pathname.replace(/^\/(shield|app)(?=\/|$)/, '') || '/';
  if (rest === '/swap' || rest.startsWith('/swap/')) return `${BIFROST}/app/${hash || '#private-route'}`;
  if (rest === '/track' || rest.startsWith('/track/')) {
    const id = new URLSearchParams(search).get('id') || rest.slice(7);
    return `${BIFROST}/app/#track${id ? `/${encodeURIComponent(id)}` : ''}`;
  }
  let target = 'app';
  if (rest === '/about' || rest.startsWith('/about/')) {
    target = 'site';
    rest = rest.slice(6) || '/';
  }
  return `${BIFROST}/${target}${rest}${search}${hash}`;
}

// ZK Shield: full-page NullCash app experience served by the app mirror
// (no iframe). This route just hands the browser over to the mirror, which
// rewrites the address bar back to /shield.
export default function ShieldPage() {
  const loc = useLocation();
  useEffect(() => {
    window.location.replace(shieldUpstream(loc.pathname, loc.search, loc.hash));
  }, [loc.pathname, loc.search, loc.hash]);

  return (
    <div
      data-testid="shield-loading"
      className="min-h-screen bg-[#07060c] flex flex-col items-center justify-center gap-5 text-white"
    >
      <div className="animate-pulse">
        <Logo size={44} />
      </div>
      <p className="text-sm text-white/50 tracking-wide">Loading NullCash…</p>
    </div>
  );
}
