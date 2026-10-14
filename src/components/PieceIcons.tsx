import {V5Piece,V5Power} from './V5Art.tsx';
import React from 'react';
import { ExpansionPieceIcon } from './ExpansionPieceIcon.tsx';
import { StandardPieceIcon } from './StandardPieceIcon.tsx';
import { PlayerColor, StandardPieceType, ChampionType, PieceType } from '../types.ts';

interface PieceIconProps {
  type: StandardPieceType | 'm' | 'sp' | 'sn' | ChampionType;
  color?: PlayerColor;
  className?: string;
  awakened?: boolean;
}

export const PieceIcon: React.FC<PieceIconProps> = ({ type, color = 'w', className = 'w-full h-full', awakened = false }) => {
  return <V5Piece type={type} color={color} className={className} awakened={awakened}/>;
};

export const BeaconCardIcon: React.FC<{ className?: string }> = ({className='w-6 h-6'}) => <V5Power type="beacon" className={className}/>;

export const StaticCardIcon: React.FC<{ className?: string }> = ({className='w-6 h-6'}) => <V5Power type="static" className={className}/>;

export const ClockCardIcon: React.FC<{ className?: string }> = ({className='w-6 h-6'}) => <V5Power type="clock" className={className}/>;

export const ChampionCardIcon: React.FC<{ className?: string }> = ({className='w-6 h-6'}) => <V5Piece type="unknown" className={className}/>;

export const ShieldMarkerIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path
      d="M12 2L4 5V11C4 16.5 7.5 21.5 12 23C16.5 21.5 20 16.5 20 11V5L12 2Z"
      fill="#ffffff"
      fillOpacity="0.3"
      stroke="#ffffff"
      strokeWidth="2.2"
    />
    <path d="M9 12L11 14L15 10" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SpiralMarkerIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path
      d="M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a3.5 3.5 0 1 0 -7 0a5.5 5.5 0 1 0 11 0a7.5 7.5 0 1 0 -15 0"
      stroke="#38bdf8"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="12" r="1.5" fill="#38bdf8" />
  </svg>
);

export const AwakeningCardIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none">
    <circle cx="50" cy="50" r="42" fill="#ef4444" fillOpacity="0.2" stroke="#f87171" strokeWidth="2.5" />
    {/* Raging Awakening Phoenix Flame / Nova Flare */}
    <path
      d="M50 14 C56 26, 68 34, 76 46 C84 58, 80 72, 70 80 C60 88, 40 88, 30 80 C20 72, 16 58, 24 46 C32 34, 44 26, 50 14 Z"
      fill="#ef4444"
      stroke="#fca5a5"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Inner golden flame heart */}
    <path
      d="M50 34 C54 42, 62 48, 66 56 C70 64, 66 72, 60 76 C54 80, 46 80, 40 76 C34 72, 30 64, 34 56 C38 48, 46 42, 50 34 Z"
      fill="#f59e0b"
      stroke="#fef08a"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <polygon points="50,42 53,52 62,54 55,60 57,69 50,64 43,69 45,60 38,54 47,52" fill="#ffffff" />
  </svg>
);



