export interface Equipment {
  id: string;
  label: string;
  price: number;
  funded: number;
  x: number;
  y: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  number: number;
  position: string;
  year: string;
  teamId: string;
  image: string;
  equipment: Equipment[];
}

export interface Team {
  id: string;
  name: string;
  school: string;
  location: string;
  description: string;
  goalAmount: number;
  raisedAmount: number;
  playerCount: number;
  image: string;
  players: Player[];
}

export interface Donation {
  id: string;
  amount: number;
  donorName?: string;
  message?: string;
  isAnonymous: boolean;
  equipmentId: string;
  playerId: string;
  timestamp: Date;
}