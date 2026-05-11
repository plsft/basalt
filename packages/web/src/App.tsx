import { Link, NavLink, Outlet } from "react-router-dom";

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-basalt-rule">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-semibold text-basalt-ink">
            Basalt
          </Link>
          <nav className="flex gap-6 text-sm mono">
            <NavLinkClass to="/briefs">I · Briefs</NavLinkClass>
            <NavLinkClass to="/timeline">II · Timeline</NavLinkClass>
            <NavLinkClass to="/vaults">III · Vaults</NavLinkClass>
            <NavLinkClass to="/settings">IV · Settings</NavLinkClass>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-basalt-rule">
        <div className="max-w-5xl mx-auto px-6 py-4 text-sm text-basalt-ink-dim mono">
          Basalt · MIT · 1556 Ventures LLC · The vault keeps the receipts.
        </div>
      </footer>
    </div>
  );
}

function NavLinkClass({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? "text-basalt-accent-na" : "text-basalt-ink-dim hover:text-basalt-ink"
      }
    >
      {children}
    </NavLink>
  );
}
