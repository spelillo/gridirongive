import React, { useState } from 'react';
import { Shield, Users, DollarSign, Upload, Plus, Trash2, Save } from 'lucide-react';

interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  number: number;
  position: string;
  year: string;
  equipment: {
    id: string;
    label: string;
    price: number;
    funded: number;
  }[];
}

const CoachDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roster' | 'funds' | 'extract'>('roster');
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [newPlayer, setNewPlayer] = useState({
    firstName: '',
    lastName: '',
    number: '',
    position: '',
    year: ''
  });

  const generatePlayerId = () => {
    return 'P' + Math.floor(Math.random() * 90000000 + 10000000);
  };

  const defaultEquipment = () => [
    { id: 'helmet-' + Date.now(), label: 'Helmet', price: 300, funded: 0 },
    { id: 'pads-' + Date.now(), label: 'Shoulder Pads', price: 240, funded: 0 },
    { id: 'cleats-' + Date.now(), label: 'Cleats', price: 150, funded: 0 }
  ];

  const addPlayer = () => {
    if (!newPlayer.firstName || !newPlayer.lastName || !newPlayer.number) {
      alert('Please fill in required fields (name and number).');
      return;
    }

    const player: RosterPlayer = {
      id: generatePlayerId(),
      firstName: newPlayer.firstName,
      lastName: newPlayer.lastName,
      number: Number(newPlayer.number),
      position: newPlayer.position || 'N/A',
      year: newPlayer.year || 'N/A',
      equipment: defaultEquipment()
    };

    setRoster([...roster, player]);
    setNewPlayer({ firstName: '', lastName: '', number: '', position: '', year: '' });
  };

  const removePlayer = (id: string) => {
    setRoster(roster.filter(p => p.id !== id));
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    file.text().then(text => {
      const lines = text.trim().split('\n');
      const [header, ...data] = lines;
      
      const newPlayers = data.map(line => {
        const [firstName, lastName, number, position, year] = line.split(',').map(s => s.trim());
        return {
          id: generatePlayerId(),
          firstName: firstName || '',
          lastName: lastName || '',
          number: Number(number) || 0,
          position: position || 'N/A',
          year: year || 'N/A',
          equipment: defaultEquipment()
        };
      }).filter(p => p.firstName && p.lastName && p.number);

      setRoster([...roster, ...newPlayers]);
    });
  };

  const TabButton: React.FC<{ tab: string; label: string; icon: React.ReactNode }> = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab as any)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        activeTab === tab
          ? 'bg-emerald-500 text-white'
          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Coach Dashboard</h1>
        </div>
        <p className="text-slate-400">Manage your team roster and track funding progress</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <TabButton tab="roster" label="Manage Roster" icon={<Users className="w-4 h-4" />} />
        <TabButton tab="funds" label="View Funds" icon={<DollarSign className="w-4 h-4" />} />
        <TabButton tab="extract" label="Extract Funds" icon={<Upload className="w-4 h-4" />} />
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        {activeTab === 'roster' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-6">Manage Team Roster</h2>
            
            {/* Add Player Form */}
            <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Add New Player</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="First Name"
                  value={newPlayer.firstName}
                  onChange={(e) => setNewPlayer({...newPlayer, firstName: e.target.value})}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={newPlayer.lastName}
                  onChange={(e) => setNewPlayer({...newPlayer, lastName: e.target.value})}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="number"
                  placeholder="Number"
                  value={newPlayer.number}
                  onChange={(e) => setNewPlayer({...newPlayer, number: e.target.value})}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Position"
                  value={newPlayer.position}
                  onChange={(e) => setNewPlayer({...newPlayer, position: e.target.value})}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Year"
                  value={newPlayer.year}
                  onChange={(e) => setNewPlayer({...newPlayer, year: e.target.value})}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={addPlayer}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Player
              </button>
            </div>

            {/* CSV Upload */}
            <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Or Upload CSV</h3>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-500 file:text-white hover:file:bg-emerald-600"
              />
              <p className="text-xs text-slate-400 mt-2">
                CSV format: First Name, Last Name, Number, Position, Year
              </p>
            </div>

            {/* Roster Table */}
            {roster.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Player ID</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Name</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Number</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Position</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Year</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((player) => (
                      <tr key={player.id} className="border-b border-slate-700/50">
                        <td className="py-3 px-4 text-slate-300 font-mono text-sm">{player.id}</td>
                        <td className="py-3 px-4 text-white">{player.firstName} {player.lastName}</td>
                        <td className="py-3 px-4 text-slate-300">#{player.number}</td>
                        <td className="py-3 px-4 text-slate-300">{player.position}</td>
                        <td className="py-3 px-4 text-slate-300">{player.year}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => removePlayer(player.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'funds' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-6">Team Funding Status</h2>
            {roster.length === 0 ? (
              <p className="text-slate-400">No roster found. Please add your players first.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Player ID</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Name</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Funds Raised</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Goal</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((player) => {
                      const goal = player.equipment.reduce((sum, eq) => sum + eq.price, 0);
                      const raised = player.equipment.reduce((sum, eq) => sum + eq.funded, 0);
                      const percentage = Math.round((raised / goal) * 100);
                      
                      return (
                        <tr key={player.id} className="border-b border-slate-700/50">
                          <td className="py-3 px-4 text-slate-300 font-mono text-sm">{player.id}</td>
                          <td className="py-3 px-4 text-white">{player.firstName} {player.lastName}</td>
                          <td className="py-3 px-4 text-emerald-400 font-semibold">${raised}</td>
                          <td className="py-3 px-4 text-slate-300">${goal}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-20 bg-slate-700 rounded-full h-2">
                                <div
                                  className="bg-emerald-400 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                              </div>
                              <span className="text-emerald-400 font-semibold text-sm">{percentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'extract' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-6">Extract Funds</h2>
            {roster.length === 0 ? (
              <p className="text-slate-400">No roster found. Please add your players first.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-300 mb-4">
                  Request fund extraction for equipment purchases. Funds will be transferred to your registered account.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-3 px-4 text-slate-300 font-medium">Player</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-medium">Available</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-medium">Extract Amount</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((player) => {
                        const available = player.equipment.reduce((sum, eq) => sum + eq.funded, 0);
                        
                        return (
                          <tr key={player.id} className="border-b border-slate-700/50">
                            <td className="py-3 px-4 text-white">{player.firstName} {player.lastName}</td>
                            <td className="py-3 px-4 text-emerald-400 font-semibold">${available}</td>
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                min="0"
                                max={available}
                                placeholder="0"
                                className="w-24 px-3 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => {
                                  const input = document.querySelector(`tr:nth-child(${roster.indexOf(player) + 1}) input`) as HTMLInputElement;
                                  const amount = Number(input?.value || 0);
                                  if (amount > 0 && amount <= available) {
                                    alert(`Extraction request submitted for $${amount} for ${player.firstName} ${player.lastName}`);
                                    input.value = '';
                                  } else {
                                    alert('Please enter a valid amount.');
                                  }
                                }}
                                disabled={available === 0}
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded text-sm font-medium transition-colors"
                              >
                                Extract
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachDashboard;