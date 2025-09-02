import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import TeamPage from './pages/TeamPage';
import PlayerPage from './pages/PlayerPage';
import CoachDashboard from './pages/CoachDashboard';
import DonationModal from './components/DonationModal';
import { Team, Player, Equipment } from './types';

// Mock data
const mockTeams: Team[] = [
  {
    id: 'knoxville-high',
    name: 'Knoxville High Eagles',
    school: 'Knoxville High',
    location: 'Knoxville, TN',
    description: 'Supporting our Eagles as they soar to victory this season!',
    goalAmount: 15000,
    raisedAmount: 8750,
    playerCount: 45,
    image: 'https://images.pexels.com/photos/1618200/pexels-photo-1618200.jpeg?auto=compress&cs=tinysrgb&w=800',
    players: [
      {
        id: 'P00000001',
        firstName: 'John',
        lastName: 'Smith',
        number: 8,
        position: 'QB',
        year: 'Senior',
        teamId: 'knoxville-high',
        image: 'https://images.pexels.com/photos/1618200/pexels-photo-1618200.jpeg?auto=compress&cs=tinysrgb&w=400',
        equipment: [
          { id: 'helmet-1', label: 'Helmet', price: 300, funded: 150, x: 50, y: 15 },
          { id: 'gloves-1', label: 'Gloves', price: 80, funded: 80, x: 60, y: 50 },
          { id: 'cleats-1', label: 'Cleats', price: 150, funded: 75, x: 50, y: 90 }
        ]
      },
      {
        id: 'P00000002',
        firstName: 'Mike',
        lastName: 'Johnson',
        number: 21,
        position: 'RB',
        year: 'Junior',
        teamId: 'knoxville-high',
        image: 'https://images.pexels.com/photos/1618200/pexels-photo-1618200.jpeg?auto=compress&cs=tinysrgb&w=400',
        equipment: [
          { id: 'helmet-2', label: 'Helmet', price: 320, funded: 200, x: 48, y: 18 },
          { id: 'pads-2', label: 'Shoulder Pads', price: 240, funded: 120, x: 50, y: 40 },
        image: 'https://images.pexels.com/photos/209977/pexels-photo-209977.jpeg?auto=compress&cs=tinysrgb&w=800',
        ]
      }
    ]
  },
  {
    id: 'central-high',
    name: 'Central High Warriors',
    school: 'Central High',
    location: 'Memphis, TN',
    description: 'Help our Warriors gear up for an amazing season ahead!',
    goalAmount: 12000,
    raisedAmount: 4200,
    playerCount: 38,
    image: 'https://images.pexels.com/photos/1618200/pexels-photo-1618200.jpeg?auto=compress&cs=tinysrgb&w=800',
    players: []
  }
];

function App() {
  const [teams] = useState<Team[]>(mockTeams);
  const [selectedEquipment, setSelectedEquipment] = useState<{
    equipment: Equipment;
    player: Player;
  } | null>(null);

  const handleDonationComplete = (amount: number) => {
    if (selectedEquipment) {
      // Update the equipment funding
      const updatedTeams = teams.map(team => ({
        ...team,
        players: team.players.map(player => {
          if (player.id === selectedEquipment.player.id) {
            return {
              ...player,
              equipment: player.equipment.map(eq => {
                if (eq.id === selectedEquipment.equipment.id) {
                  return {
                    ...eq,
                    funded: Math.min(eq.funded + amount, eq.price)
                  };
                }
                return eq;
              })
            };
          }
          return player;
        })
      }));
      
      setSelectedEquipment(null);
    }
  };

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100">
        {/* Background layers */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-slate-900 to-slate-900" />
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }}
          />
          <div 
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.06'/></svg>")`,
              backgroundSize: '200px 200px'
            }}
          />
        </div>

        <Header />
        
        <Routes>
          <Route path="/" element={<HomePage teams={teams} />} />
          <Route path="/team/:teamId" element={<TeamPage teams={teams} />} />
          <Route path="/player/:playerId" element={<PlayerPage teams={teams} onEquipmentClick={setSelectedEquipment} />} />
          <Route path="/coach" element={<CoachDashboard />} />
        </Routes>

        {selectedEquipment && (
          <DonationModal
            equipment={selectedEquipment.equipment}
            player={selectedEquipment.player}
            onClose={() => setSelectedEquipment(null)}
            onDonate={handleDonationComplete}
          />
        )}
      </div>
    </Router>
  );
}

export default App;