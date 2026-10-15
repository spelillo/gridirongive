import { NavBar } from './NavBar';
import { Footer } from './Footer';
import { DemoBanner } from './DemoBanner';

export function PublicShell({ children, hideSearch }: { children: React.ReactNode; hideSearch?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <NavBar hideSearch={hideSearch} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}
