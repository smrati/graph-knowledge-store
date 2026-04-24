import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, PenLine, Search, Share2 } from "lucide-react";

export default function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-indigo-100 text-indigo-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 border-r border-gray-200 bg-white p-4 flex flex-col gap-1">
        <h1 className="text-lg font-bold text-gray-900 mb-4 px-3">Knowledge Store</h1>
        <NavLink to="/" className={linkClass} end>
          <BookOpen size={18} /> Articles
        </NavLink>
        <NavLink to="/editor" className={linkClass}>
          <PenLine size={18} /> New Article
        </NavLink>
        <NavLink to="/search" className={linkClass}>
          <Search size={18} /> Search
        </NavLink>
        <NavLink to="/graph" className={linkClass}>
          <Share2 size={18} /> Graph
        </NavLink>
      </nav>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
