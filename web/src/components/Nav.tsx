import { linkProps, usePath } from '../lib/router.ts';

export const REPO_URL = 'https://github.com/NikhilBhatt-15/molbhav';

export function Nav() {
  const path = usePath();
  const cur = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'page' : undefined);
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a className="brand" {...linkProps('/')}>
          <span className="brand-mark">₹</span>
          Mol-Bhav
        </a>
        <nav className="nav-links" aria-label="Main">
          <a {...linkProps('/#levels')} onClick={(e) => {
            e.preventDefault();
            if (location.pathname !== '/') {
              history.pushState(null, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
            setTimeout(() => document.getElementById('levels')?.scrollIntoView({ behavior: 'smooth' }), 50);
          }}>
            Khelo
          </a>
          <a {...linkProps('/leaderboard')} aria-current={cur('/leaderboard')}>
            Leaderboard
          </a>
          <a className="hide-xs" {...linkProps('/about')} aria-current={cur('/about')}>
            Kya test hai?
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>Mol-Bhav · AI dukandaar vs aap · Made in India ❤️</span>
        <span style={{ display: 'flex', gap: 14 }}>
          <a {...linkProps('/about')}>How it works</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}

export function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? '' : 'off'}>
          ★
        </span>
      ))}
    </span>
  );
}
