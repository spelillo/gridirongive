import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Users, Target, ArrowLeft, ExternalLink } from 'lucide-react';
import { Team } from '../types';
import PlayerCard from '../components/PlayerCard';

interface TeamPageProps {
  teams: Team[];
}

const TeamPage: React.FC<TeamPageProps> = ({ teams }) => {
  const { teamId } = useParams<{ teamId: string }>();
  const team = teams.find(t => t.id === teamId);

  if (!team) {
    return (
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-300 mb-4">Team not found</h1>
        <Link to="/" className="text-emerald-400 hover:text-emerald-300">
          ← Back to teams
        </Link>
      </div>
    );
  }

  const progressPercentage = Math.round((team.raisedAmount / team.goalAmount) * 100);

  return (
    <div className="relative z-10">
      {/* Hero Section */}
      <section className="relative">
        <div className="aspect-[21/9] relative overflow-hidden">
          <img
            src={team.image}
            alt={team.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
        </div>
        
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
            <Link
              to="/"
              className="inline-flex items-center text-slate-300 hover:text-emerald-400 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to teams
            </Link>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  {team.name}
                </h1>
                <div className="flex items-center text-slate-300 mb-4">
                  <MapPin className="w-5 h-5 mr-2" />
                  {team.location}
                </div>
                <p className="text-lg text-slate-200 leading-relaxed">
                  {team.description}
                </p>
              </div>

              <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Funding Progress</h3>
                  <span className="text-2xl font-bold text-emerald-400">{progressPercentage}%</span>
                </div>
                
                <div className="w-full bg-slate-700 rounded-full h-3 mb-4">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">Raised</div>
                    <div className="text-xl font-bold text-white">${team.raisedAmount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Goal</div>
                    <div className="text-xl font-bold text-white">${team.goalAmount.toLocaleString()}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center text-slate-400">
                    <Users className="w-4 h-4 mr-1" />
                    {team.playerCount} players
                  </div>
                  <div className="flex items-center text-slate-400">
                    <Target className="w-4 h-4 mr-1" />
                    ${(team.goalAmount - team.raisedAmount).toLocaleString()} needed
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Players Section */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-white">Team Roster</h2>
            <div className="text-slate-400">
              {team.players.length} of {team.playerCount} players need funding
            </div>
          </div>

          {team.players.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {team.players.map(player => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700/50">
                <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-300 mb-2">
                  Player profiles coming soon
                </h3>
                <p className="text-slate-400 mb-6">
                  The coaching staff is setting up individual player funding pages.
                </p>
                <Link
                  to="/coach"
                  className="inline-flex items-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  Coach Portal
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default TeamPage;