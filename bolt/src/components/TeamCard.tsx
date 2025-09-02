import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Users, Target } from 'lucide-react';
import { Team } from '../types';

interface TeamCardProps {
  team: Team;
}

const TeamCard: React.FC<TeamCardProps> = ({ team }) => {
  const progressPercentage = Math.round((team.raisedAmount / team.goalAmount) * 100);

  return (
    <Link to={`/team/${team.id}`} className="group block">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden hover:border-emerald-500/50 transition-all duration-300 hover:transform hover:scale-105">
        <div className="aspect-video relative overflow-hidden">
          <img
            src={team.image}
            alt={team.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-xl font-bold text-white mb-1">{team.name}</h3>
            <div className="flex items-center text-slate-300 text-sm">
              <MapPin className="w-4 h-4 mr-1" />
              {team.location}
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-slate-300 mb-4 line-clamp-2">{team.description}</p>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">Progress</span>
              <span className="text-emerald-400 font-semibold">{progressPercentage}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-slate-400">${team.raisedAmount.toLocaleString()}</span>
              <span className="text-slate-400">${team.goalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-sm">
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
    </Link>
  );
};

export default TeamCard;