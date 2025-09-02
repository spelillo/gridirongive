import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Target, Heart } from 'lucide-react';
import { Team, Player, Equipment } from '../types';

interface PlayerPageProps {
  teams: Team[];
  onEquipmentClick: (data: { equipment: Equipment; player: Player }) => void;
}

const PlayerPage: React.FC<PlayerPageProps> = ({ teams, onEquipmentClick }) => {
  const { playerId } = useParams<{ playerId: string }>();
  
  let player: Player | undefined;
  let team: Team | undefined;
  
  for (const t of teams) {
    const foundPlayer = t.players.find(p => p.id === playerId);
    if (foundPlayer) {
      player = foundPlayer;
      team = t;
      break;
    }
  }

  if (!player || !team) {
    return (
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-300 mb-4">Player not found</h1>
        <Link to="/" className="text-emerald-400 hover:text-emerald-300">
          ← Back to teams
        </Link>
      </div>
    );
  }

  const totalGoal = player.equipment.reduce((sum, eq) => sum + eq.price, 0);
  const totalFunded = player.equipment.reduce((sum, eq) => sum + eq.funded, 0);
  const progressPercentage = Math.round((totalFunded / totalGoal) * 100);

  return (
    <div className="relative z-10">
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          to={`/team/${team.id}`}
          className="inline-flex items-center text-slate-300 hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {team.name}
        </Link>
      </div>

      {/* Player Header */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-400">#{player.number}</span>
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-white mb-2">
                    {player.firstName} {player.lastName}
                  </h1>
                  <div className="flex items-center gap-4 text-slate-300">
                    <span className="font-semibold">{player.position}</span>
                    <span>•</span>
                    <span>{player.year}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center text-slate-400 mb-6">
                <MapPin className="w-5 h-5 mr-2" />
                {team.school} • {team.location}
              </div>

              {/* Funding Progress */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Equipment Funding</h3>
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
                    <div className="text-xl font-bold text-white">${totalFunded.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Goal</div>
                    <div className="text-xl font-bold text-white">${totalGoal.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Player Image */}
            <div className="relative">
              <div className="aspect-[3/4] relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
                <img
                  src={player.image}
                  alt={`${player.firstName} ${player.lastName}`}
                  className="w-full h-full object-cover"
                />
                
                {/* Equipment Tags */}
                {player.equipment.map((equipment) => {
                  const equipmentProgress = Math.round((equipment.funded / equipment.price) * 100);
                  return (
                    <button
                      key={equipment.id}
                      onClick={() => onEquipmentClick({ equipment, player })}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-slate-800/90 hover:border-emerald-500/50 transition-all duration-200 hover:scale-105"
                      style={{ left: `${equipment.x}%`, top: `${equipment.y}%` }}
                    >
                      <div className="text-xs text-slate-300 mb-1">{equipment.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">${equipment.funded}</span>
                        <span className="text-slate-400">/ ${equipment.price}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1 mt-1">
                        <div
                          className="bg-emerald-400 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(equipmentProgress, 100)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 text-center text-slate-400 text-sm">
                Click on equipment items to make a donation
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Equipment List */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Equipment Needs</h2>
          
          <div className="grid gap-4">
            {player.equipment.map((equipment) => {
              const equipmentProgress = Math.round((equipment.funded / equipment.price) * 100);
              const remaining = equipment.price - equipment.funded;
              
              return (
                <div
                  key={equipment.id}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-emerald-500/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{equipment.label}</h3>
                      <div className="text-slate-400">
                        ${equipment.funded} raised of ${equipment.price} goal
                      </div>
                    </div>
                    <button
                      onClick={() => onEquipmentClick({ equipment, player })}
                      className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <Heart className="w-4 h-4" />
                      Donate
                    </button>
                  </div>

                  <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(equipmentProgress, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-400 font-semibold">{equipmentProgress}% funded</span>
                    <span className="text-slate-400">${remaining} remaining</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlayerPage;