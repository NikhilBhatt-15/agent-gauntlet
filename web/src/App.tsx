import { Footer, Nav } from './components/Nav.tsx';
import { About } from './pages/About.tsx';
import { Home } from './pages/Home.tsx';
import { LeaderboardPage } from './pages/Leaderboard.tsx';
import { PlayPage } from './pages/Play.tsx';
import { Replay } from './pages/Replay.tsx';
import { linkProps, usePath } from './lib/router.ts';

function Route({ path }: { path: string }) {
  const play = path.match(/^\/play\/([a-z]+)\/?$/);
  if (play) return <PlayPage key={play[1]} levelId={play[1]} />;
  const replay = path.match(/^\/g\/([A-Za-z0-9_-]+)\/?$/);
  if (replay) return <Replay key={replay[1]} gameId={replay[1]} />;
  switch (path.replace(/\/+$/, '') || '/') {
    case '/':
      return <Home />;
    case '/leaderboard':
      return <LeaderboardPage />;
    case '/about':
      return <About />;
    default:
      return (
        <div className="container" style={{ padding: '100px 16px', textAlign: 'center' }}>
          <h2 className="h2">Ye dukaan band hai 🔒</h2>
          <a className="btn btn-primary" {...linkProps('/')}>
            Home chalo
          </a>
        </div>
      );
  }
}

export function App() {
  const path = usePath();
  return (
    <>
      <Nav />
      <main style={{ minHeight: 'calc(100vh - 130px)' }}>
        <Route path={path} />
      </main>
      <Footer />
    </>
  );
}
