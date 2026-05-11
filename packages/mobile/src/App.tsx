import { NavLink, Outlet } from "react-router-dom";

export function App() {
  return (
    <>
      <header className="app-header">
        <span className="display" style={{ fontSize: "1.1rem" }}>
          Basalt
        </span>
        <span className="mono muted" style={{ fontSize: "0.7rem" }}>
          read-only
        </span>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="app-footer">
        <NavLink to="/" end>
          <span className="glyph">📜</span>
          <span>briefs</span>
        </NavLink>
        <NavLink to="/settings">
          <span className="glyph">⚙</span>
          <span>settings</span>
        </NavLink>
      </footer>
    </>
  );
}
