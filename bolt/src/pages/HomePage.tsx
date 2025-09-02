import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Users, Target, TrendingUp } from 'lucide-react';
import { Team } from '../types';
import TeamCard from '../components/TeamCard';

interface HomePageProps {
  teams: Team[];
}

const HomePage: React.FC<HomePageProps> = ({ teams }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         team.school.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = !selectedLocation || team.location.includes(selectedLocation);
    return matchesSearch && matchesLocation;
  });

  const totalRaised = teams.reduce((sum, team) => sum + team.raisedAmount, 0);
  const totalGoal = teams.reduce((sum, team) => sum + team.goalAmount, 0);
  const totalPlayers = teams.reduce((sum, team) => sum + team.playerCount, 0);

  return (
    <div className="relative z-10">
      {/* Hero Section */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            Gear Up Our Champions
          </h1>
          <p className="text-xl text-slate-300 mb-8 leading-relaxed">
            Support high school football teams by funding essential equipment. 
            Every donation helps young athletes pursue their dreams safely and confidently.
          </p>
          
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-center mb-2">
                <Target className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-400">${totalRaised.toLocaleString()}</div>
              <div className="text-slate-400">Total Raised</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-center mb-2">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-blue-400">{totalPlayers}</div>
              <div className="text-slate-400">Players Supported</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
              <div className="text-3xl font-bold text-purple-400">{Math.round((totalRaised / totalGoal) * 100)}%</div>
              <div className="text-slate-400">Overall Progress</div>
            </div>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search teams or schools..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent appearance-none"
                >
                  <option value="">All Locations</option>
                  <option value="Knoxville">Knoxville</option>
                  <option value="Memphis">Memphis</option>
                  <option value="Nashville">Nashville</option>
                </select>
              </div>
            </div>
          </div>

          {/* Teams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeams.map(team => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>

          {filteredTeams.length === 0 && (
            <div className="text-center py-12">
              <div className="text-slate-400 text-lg">No teams found matching your search.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;