import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Users, User } from 'lucide-react';

const Header: React.FC = () => {
  const location = useLocation();

  return (
    <header className="relative z-10 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-emerald-400" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
              Gridiron Give
            </h1>
          </Link>

          <nav className="flex items-center space-x-6">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === '/'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-300 hover:text-emerald-400'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Teams
            </Link>
            <Link
              to="/coach"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === '/coach'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-300 hover:text-emerald-400'
              }`}
            >
              <User className="w-4 h-4 inline mr-2" />
              Coach Portal
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;