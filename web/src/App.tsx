import { Footer, Nav } from './components/Nav.tsx';
import { Home } from './pages/Home.tsx';
import { HowItWorks } from './pages/HowItWorks.tsx';
import { LeaderboardPage } from './pages/Leaderboard.tsx';
import { PlayPage } from './pages/Play.tsx';
import { Room } from './pages/Room.tsx';
import { VerifyPage } from './pages/Verify.tsx';
import { linkProps, usePath } from './lib/router.ts';

function Route({ path }: { path: string }) {
  const run = path.match(/^\/run\/([A-Za-z0-9_-]+)\/?$/);
  if (run) return <Room key={run[1]} runId={run[1]} />;
  switch (path.replace(/\/+$/, '') || '/') {
    case '/':
      return <Home />;
    case '/play':
      return <PlayPage />;
    case '/leaderboard':
      return <LeaderboardPage />;
    case '/how-it-works':
      return <HowItWorks />;
    case '/verify':
      return <VerifyPage />;
    default:
      return (
        <div className="container empty" style={{ padding: '120px 16px' }}>
          <h2 className="display">Nothing here</h2>
          <a className="btn btn-primary" {...linkProps('/')}>
            Back to the arena
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
      <main style={{ minHeight: 'calc(100vh - 140px)' }}>
        <Route path={path} />
      </main>
      <Footer />
    </>
  );
}
