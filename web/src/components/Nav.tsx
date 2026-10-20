import { Shield } from 'lucide-react';
import { linkProps, usePath } from '../lib/router.ts';
import { GithubMark } from './Icons.tsx';

export const REPO_URL = 'https://github.com/NikhilBhatt-15/agent-gauntlet';

export function Nav() {
  const path = usePath();
  const cur = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'page' : undefined);
  return (
    <header className="nav">
      <div className="container wide nav-inner">
        <a className="brand" {...linkProps('/')}>
          <span className="brand-mark">
            <Shield size={16} strokeWidth={2.4} />
          </span>
          Agent Gauntlet
        </a>
        <nav className="nav-links" aria-label="Main">
          <a {...linkProps('/play')} aria-current={cur('/play')}>
            Play
          </a>
          <a {...linkProps('/leaderboard')} aria-current={cur('/leaderboard')}>
            Leaderboard
          </a>
          <a className="hide-sm" {...linkProps('/how-it-works')} aria-current={cur('/how-it-works')}>
            How it works
          </a>
          <a className="hide-sm" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source on GitHub">
            <GithubMark />
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container wide footer-inner">
        <span>Agent Gauntlet — a live arena for AI agent security. Open source.</span>
        <span style={{ display: 'flex', gap: 16 }}>
          <a {...linkProps('/how-it-works')}>How it works</a>
          <a {...linkProps('/verify')}>Verify a contract</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}
