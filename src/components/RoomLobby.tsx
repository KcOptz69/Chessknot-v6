import {FrontierIntro} from './FrontierUI.tsx';
import type {RuleSectionId} from './rulebookData.ts';
import { useLoopMusic } from '../utils/music.ts';
import { Modal } from "./UI";
import "./RoomLobby.css";
import React from "react";
import {
  PlayerColor,
  RoomPlayer,
  RoomLobbyConfig,
  GameExpansionsConfig,
} from "../types.ts";

import {Timer, Share2, Check, Crown, Dices, BookOpen, Swords, Mountain, Info, X, CheckSquare, Sun, Moon, Music, VolumeX, LogIn, Edit2, User, RotateCcw, SlidersHorizontal, Ban} from "lucide-react";
import { V5Power } from "./V5Art.tsx";
import { GROUND_NAMES, type GroundType } from "../utils/grounds.ts";
import { useTheme } from "../context/ThemeContext.tsx";

interface RoomLobbyProps {
  roomTools?: React.ReactNode;
  onClaimArbiter?:()=>void;
  onReturnAsPlayer?:(color?: "w" | "b")=>void;
  roomId: string;
  mode: "online" | "pass_and_play";
  players: Record<string, RoomPlayer>;
  myPlayerId: string;
  myColor: PlayerColor | "spectator";
  lobbyConfig: RoomLobbyConfig;
  onUpdateConfig: (config: {
    allowArbiter?:boolean;
    colorPreference?: "w" | "b" | "random";
    clockEnabled?: boolean;
    initialMinutes?: number;
    incrementSeconds?: number;
    mode?: "online" | "pass_and_play";
    expansions?: GameExpansionsConfig;
  }) => void;
  onStartGame: () => void;
  onOpenRules: (section?: RuleSectionId) => void;
  onSwitchMode: (mode: "online" | "pass_and_play") => void;
  onJoinRoom?: (roomId: string, mode: "online" | "pass_and_play") => void;
  onRenamePlayer?: (newName: string, targetPlayerId?: string) => void;
  onExitLobby?: () => void;
  onRegenerateRoom?: () => void;
  onSetPlayerReady?: (isReady: boolean) => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  roomTools,onClaimArbiter,onReturnAsPlayer,
  roomId,
  mode,
  players,
  myPlayerId,
  myColor,
  lobbyConfig,
  onUpdateConfig,
  onStartGame,
  onOpenRules,
  onSwitchMode,
  onJoinRoom,
  onRenamePlayer,
  onExitLobby,
  onRegenerateRoom,
  onSetPlayerReady,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [musicEnabled, setMusicEnabled] = React.useState(() => localStorage.getItem('chessknot_menu_music') !== 'false');
  useLoopMusic(musicEnabled ? 'menu-music' : null, 0.42);
  const [copied, setCopied] = React.useState(false);
  const [isConfigureGroundsOpen, setIsConfigureGroundsOpen] =
    React.useState(false);
  const [configuredGrounds, setConfiguredGrounds] = React.useState<
    GroundType[]
  >(() => {
    return (
      (lobbyConfig.expansions?.treacherousGroundsSelected as GroundType[]) || []
    );
  });

  React.useEffect(() => {
    setConfiguredGrounds(
      (lobbyConfig.expansions?.treacherousGroundsSelected as GroundType[]) ||
        [],
    );
  }, [lobbyConfig.expansions?.treacherousGroundsSelected]);

  // Username rename states
  const [isRenameModalOpen, setIsRenameModalOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<string | undefined>();
  const [isSetupOpen, setIsSetupOpen] = React.useState(false);
  const [frontierDetails,setFrontierDetails]=React.useState(false);
  const [futurePack, setFuturePack] = React.useState<{
    title: string;
    description: string;
    art: string;
  } | null>(null);
  const [renameModalInput, setRenameModalInput] = React.useState("");

  // Join Room by Code in Staging Lobby state
  const [isJoinOpen, setIsJoinOpen] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState("");
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = React.useState<string | null>(null);

  const handleJoinSubmit = () => {
    const clean = joinCode.trim().toUpperCase();
    if (!clean) {
      setJoinError("Please enter a room code");
      return;
    }
    if (clean === roomId.toUpperCase()) {
      setJoinError(`You are already in room ${clean}`);
      return;
    }
    if (clean.length < 2) {
      setJoinError("Room code must be at least 2 characters");
      return;
    }
    setJoinError(null);
    setJoinSuccess(`Connecting to room ${clean}...`);
    if (onJoinRoom) {
      onJoinRoom(clean, "online");
    }
    setTimeout(() => {
      setJoinSuccess(null);
      setIsJoinOpen(false);
      setJoinCode("");
    }, 1500);
  };

  const handleGenerateRandomRoom = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let newCode = "";
    for (let i = 0; i < 6; i++) {
      newCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setJoinError(null);
    setJoinSuccess(`Created room ${newCode}!`);
    if (onJoinRoom) {
      onJoinRoom(newCode, "online");
    }
    setTimeout(() => {
      setJoinSuccess(null);
      setIsJoinOpen(false);
      setJoinCode("");
    }, 1500);
  };

  const playerList = Object.values(players);
  const myPlayer = players[myPlayerId];
  // In Online mode, only the designated room host is host; Player 2 is strictly non-host.
  const isHost =
    lobbyConfig.hostId
        ? lobbyConfig.hostId === myPlayerId
        : myPlayer
          ? Boolean(myPlayer.isHost)
          : false;
  const opponent = playerList.find(
    (p) => p.id !== myPlayerId && p.color !== "spectator" && p.connected,
  );
  const isMyReady = Boolean(myPlayer?.isReady);
  const isOpponentReady = Boolean(opponent?.isReady);

  const isShiftedParadigmActive =
    lobbyConfig.expansions?.shiftedParadigm !== false;
  const isChampionsOfTheMonolithActive =
    lobbyConfig.expansions?.championsOfTheMonolith !== false;
  const isGroundsActive = lobbyConfig.expansions?.treacherousGrounds !== false;
  const isTheAwakeningActive = lobbyConfig.expansions?.theAwakening !== false;

  const handleToggleShiftedParadigm = () => {
    if (!isHost) return;
    const nextVal = !isShiftedParadigmActive;
    onUpdateConfig({
      expansions: {
        ...lobbyConfig.expansions,
        treacherousGrounds: isGroundsActive,
        shiftedParadigm: nextVal,
        treacherousGroundsSelected:
          lobbyConfig.expansions?.treacherousGroundsSelected,
        championsOfTheMonolith: isChampionsOfTheMonolithActive,
        theAwakening: isTheAwakeningActive,
      },
    });
  };

  const handleToggleChampionsOfTheMonolith = () => {
    if (!isHost) return;
    const nextVal = !isChampionsOfTheMonolithActive;
    onUpdateConfig({
      expansions: {
        ...lobbyConfig.expansions,
        treacherousGrounds: isGroundsActive,
        shiftedParadigm: isShiftedParadigmActive,
        championsOfTheMonolith: nextVal,
        treacherousGroundsSelected:
          lobbyConfig.expansions?.treacherousGroundsSelected,
        theAwakening: isTheAwakeningActive,
      },
    });
  };

  const handleToggleTheAwakening = () => {
    if (!isHost) return;
    const nextVal = !isTheAwakeningActive;
    onUpdateConfig({
      expansions: {
        ...lobbyConfig.expansions,
        treacherousGrounds: isGroundsActive,
        shiftedParadigm: isShiftedParadigmActive,
        championsOfTheMonolith: isChampionsOfTheMonolithActive,
        theAwakening: nextVal,
        treacherousGroundsSelected:
          lobbyConfig.expansions?.treacherousGroundsSelected,
      },
    });
  };

  const handleToggleTreacherousGrounds = () => {
    if (!isHost) return;
    const nextVal = !isGroundsActive;
    onUpdateConfig({
      expansions: {
        ...lobbyConfig.expansions,
        treacherousGrounds: nextVal,
        shiftedParadigm: isShiftedParadigmActive,
        championsOfTheMonolith: isChampionsOfTheMonolithActive,
        theAwakening: isTheAwakeningActive,
        treacherousGroundsSelected:
          lobbyConfig.expansions?.treacherousGroundsSelected,
      },
    });
  };

  const handleCopyLink = () => {
    const origin = window.location.origin;
    const url = `${origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSelectColor = (color: "w" | "b" | "random") => {
    if (!isHost) return;
    onUpdateConfig({ colorPreference: color });
  };

  const handleToggleClock = (enabled: boolean) => {
    if (!isHost) return;
    onUpdateConfig({ clockEnabled: enabled });
  };

  const applyPreset = (minutes: number, increment: number) => {
    if (!isHost) return;
    onUpdateConfig({
      clockEnabled: true,
      initialMinutes: minutes,
      incrementSeconds: increment,
    });
  };

  const packList = [
    {
      key: "shifted",
      id: "shifted-paradigm",
      title: "Shifting Paradigm",
      art: "shifting",
      enabled: isShiftedParadigmActive,
      toggle: handleToggleShiftedParadigm,
      description: "Push, switch, restrict, and deploy the Monolith.",
    },
    {
      key: "champions",
      id: "champions-of-the-monolith",
      title: "Champions of the Monolith",
      art: "champions",
      enabled: isChampionsOfTheMonolithActive,
      toggle: handleToggleChampionsOfTheMonolith,
      description: "Four champions, Beacon protection, and Static.",
    },
    {
      key: "awakening",
      id: "the-awakening",
      title: "The Awakening",
      art: "awakening",
      enabled: isTheAwakeningActive,
      toggle: handleToggleTheAwakening,
      description: "Six Awakening cards with powerful skills or Wild moves.",
    },
    {
      key: "grounds",
      id: "treacherous-grounds",
      title: "The Treacherous Grounds",
      art: "grounds",
      enabled: isGroundsActive,
      toggle: handleToggleTreacherousGrounds,
      description: "Hidden traps and powered tiles transform the battlefield.",
    },
    {
      key: "frontier",
      id: "arcane-frontier",
      title: "Arcane Frontier",
      art: "frontier",
      enabled: lobbyConfig.expansions?.arcaneFrontier===true,
      toggle: ()=>{if(isHost)onUpdateConfig({expansions:{...lobbyConfig.expansions,arcaneFrontier:lobbyConfig.expansions?.arcaneFrontier!==true}});},
      description: "An expanded board, a Golem Boss, and items to discover.",
    },
    {
      key: "elements",
      id: "elemental-kings",
      title: "Elemental Kings",
      art: "elements",
      description:
        "Your King acquires the powers of fire, water, earth, and air.",
    },
    {
      key: "glory",
      id: "quest-for-glory",
      title: "Quest for Glory",
      art: "glory",
      description: "Shared objectives offer rewards for both players.",
    },
    {
      key: "artifacts",
      id: "forbidden-artifacts",
      title: "Forbidden Artifacts",
      art: "artifacts",
      description: "Equip your pieces with mysterious enchanted artifacts.",
    },
  ];
  const openRename = (id: string, name: string) => {
    setRenameTarget(id);
    setRenameModalInput(name);
    setIsRenameModalOpen(true);
  };
  const seated=playerList.filter(p=>p.color!=='spectator'&&p.connected);
  const arbiter=playerList.find(p=>p.role==='arbiter');
  const canStart = seated.length===2&&seated.every(p=>p.id===lobbyConfig.hostId||p.isReady);
  const openGroundConfig = () => {
    setConfiguredGrounds(
      (lobbyConfig.expansions?.treacherousGroundsSelected as GroundType[]) ||
        [],
    );
    setIsConfigureGroundsOpen(true);
  };

  return (
    <div className="ck-menu">
      {frontierDetails&&<FrontierIntro onClose={()=>setFrontierDetails(false)}/>}
      <header className="ck-menu-header">
        <div className="ck-menu-brand">
          <img src="/logo.png?v=5-blue-knot" alt="ChessKnot logo" />
          <div>
            <h1>ChessKnot</h1>
            <p>made by Kaze</p>
          </div>
        </div>
        <div className="ck-menu-tools">
          <button
            id="lobby-rules-btn"
            onClick={()=>onOpenRules()}
            aria-label="Read rules"
          >
            <BookOpen size={17} />
            <span>Rules</span>
          </button>
          <button
            id="lobby-music-toggle"
            aria-label={musicEnabled ? "Turn menu music off" : "Turn menu music on"}
            title={musicEnabled ? "Menu music on" : "Menu music off"}
            aria-pressed={musicEnabled}
            onClick={() => setMusicEnabled(value => {localStorage.setItem('chessknot_menu_music', String(!value)); return !value;})}
          >
            {musicEnabled ? <Music size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            id="lobby-theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <section className="ck-menu-hero" aria-label="Welcome to ChessKnot">
        <img
          className="ck-menu-cover"
          src={`/art/menu/hero-${isDark ? "dark" : "light"}.webp`}
          alt="White and black chess pieces with glowing cards on a chessboard"
        />
        <h2>
          <span>Chess meets cards:</span>
          <strong>Your next move changes everything.</strong>
        </h2>

      </section>
      <div className="ck-menu-content">
        <section
          className="ck-menu-packs"
          id="lobby-expansion-packs-section"
          aria-labelledby="ck-packs-title"
        >
          <div className="ck-menu-section-title">
            <h2 id="ck-packs-title">Expansion Packs</h2>
            <span>
              {
                [
                  isShiftedParadigmActive,
                  isChampionsOfTheMonolithActive,
                  isTheAwakeningActive,
                  isGroundsActive,
                ].filter(Boolean).length
              }{" "}
              active
            </span>
          </div>
          <div className="ck-menu-pack-grid">
            {packList.map((pack, index) => {
              const available = "toggle" in pack;
              return (
                <article
                  key={pack.key}
                  className={`ck-menu-pack ${available && pack.enabled ? "is-enabled" : ""} ${!available ? "is-future" : ""}`}
                >
                  <button
                    className="ck-menu-pack-art"
                    onClick={() =>
                      pack.key==='frontier'?setFrontierDetails(true):available
                        ? onOpenRules(({shifted:'expansion1',champions:'expansion2',awakening:'expansion3',grounds:'expansion4'} as Record<string,RuleSectionId>)[pack.key])
                        : setFuturePack(pack)
                    }
                    aria-label={`Details about ${pack.title}`}
                  >
                    <img
                      src={`/art/menu/${pack.art}.webp?v=6-wide`}
                      alt=""
                      loading={index < 4 ? "eager" : "lazy"}
                    />
                  </button>
                  <h3>
                    {["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][index]}{" "}
                    · {pack.title}
                  </h3>
                  <p className="ck-menu-pack-description">
                    {available
                      ? pack.description
                      : [
                          "A new frontier is taking shape. Stay tuned for more adventures.",
                          "Elemental powers are still in development. More details coming soon.",
                          "Your next great quest awaits. Stay tuned for the royal reveal.",
                          "Forbidden discoveries are in development. Their secrets will be revealed soon.",
                        ][index - 4]}
                  </p>
                  <div className="ck-menu-pack-controls">
                    <button
                      className="ck-menu-icon-button"
                      onClick={() =>
                        pack.key==='frontier'?setFrontierDetails(true):available
                          ? onOpenRules(({shifted:'expansion1',champions:'expansion2',awakening:'expansion3',grounds:'expansion4'} as Record<string,RuleSectionId>)[pack.key])
                          : setFuturePack(pack)
                      }
                      aria-label={`Details about ${pack.title}`}
                    >
                      <Info size={16} />
                    </button>
                    {pack.key === "grounds" && (
                      <button
                        className="ck-menu-icon-button"
                        id="btn-configure-treacherous-grounds"
                        disabled={!isHost}
                        onClick={openGroundConfig}
                        aria-label="Configure tile power-ups"
                        title="Choose two tiles or Random"
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    )}
                    {!available && (
                      <span className="ck-menu-coming">Coming Soon</span>
                    )}
                    <button
                      className="ck-menu-switch"
                      id={`checkbox-${pack.id}`}
                      role="switch"
                      aria-label={pack.title}
                      aria-checked={available && Boolean(pack.enabled)}
                      disabled={!available || !isHost}
                      onClick={() => {
                        if (available) pack.toggle?.();
                      }}
                    >
                      <span />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!isHost && (
            <p className="ck-menu-caption">
              The host chooses the match settings and expansions.
            </p>
          )}
        </section>
        <section className="ck-menu-setup" aria-labelledby="ck-setup-title">
          <div className="ck-menu-section-title">
            <h2 id="ck-setup-title">Match Setup</h2>
          </div>
          <div className="ck-menu-room">
            <>
                <label>Room code</label>
                <div className="ck-menu-code-row">
                  <strong>{roomId}</strong>
                  {isHost && onRegenerateRoom && (
                    <button
                      className="ck-menu-icon-button"
                      onClick={onRegenerateRoom}
                      aria-label="Generate new room code"
                      title="Generate a new code and free Player 2's seat"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                  {/* Spectator count and chat belong in the active match, not the pre-game lobby. */}
                </div>
                <div className="ck-menu-room-actions">
                  <button id="lobby-btn-share-link" onClick={handleCopyLink}>
                    {copied ? <Check size={14} /> : <Share2 size={14} />}{" "}
                    {copied ? "Copied" : "Invite"}
                  </button>
                  <button
                    id="lobby-btn-toggle-join"
                    onClick={() => {
                      setIsJoinOpen(true);
                      setJoinError(null);
                    }}
                  >
                    <LogIn size={14} />
                    Join by code
                  </button>
                </div>
</>
          </div>
          <div className="ck-menu-players ck-menu-seats" aria-label="Seats in room">
            {(['w','b'] as const).map(color=>{
              const p=playerList.find(p=>p.color===color&&p.connected);
              const canClaim=!p&&myPlayer?.role==='arbiter';
              return <div key={color}>
                <User size={15}/>
                <strong>{p?.name||`Waiting for ${color==='w'?'White':'Black'} player`}</strong>
                {p&&(p.id===myPlayerId||isHost)&&<button className="ck-menu-icon-button" aria-label={`Rename ${p.name}`} onClick={()=>openRename(p.id,p.name)}><Edit2 size={13}/></button>}
                {canClaim?<button type="button" className="ck-seat-claim" onClick={()=>onReturnAsPlayer?.(color)}>CLAIM</button>:<span>{p?.isHost?'Host':p?.isReady?'Ready':p?'Not ready':''}</span>}
                <i className={p?.isHost||p?.isReady?'is-ready':''}/>
              </div>;
            })}
            {lobbyConfig.allowArbiter&&<div className="ck-arbiter-seat-row">
              <User size={15}/>
              <strong>{arbiter?.name||'Waiting for Arbiter'}</strong>
              {arbiter?.id===myPlayerId&&<button className="ck-menu-icon-button" aria-label="Rename Arbiter" onClick={()=>openRename(myPlayerId,arbiter.name)}><Edit2 size={13}/></button>}
              {!arbiter&&myPlayer?.role!=='arbiter'&&<button type="button" className="ck-seat-claim" onClick={onClaimArbiter}>CLAIM</button>}
              <i className={arbiter?.connected?'is-ready':''}/>
            </div>}
          </div>
          <div className="ck-menu-setting-rows">
            <div className="ck-menu-side">
              <label>Host's side</label>
              <div>
                {(["w", "b", "random"] as const).map((color) => (
                  <button
                    key={color}
                    id={`lobby-choose-${color === "w" ? "white" : color === "b" ? "black" : "random"}`}
                    aria-pressed={lobbyConfig.colorPreference === color}
                    disabled={!isHost}
                    onClick={() => handleSelectColor(color)}
                  >
                    {color === "random" ? (
                      <Dices size={14} />
                    ) : (
                      <span className={`ck-menu-side-dot ${color}`} />
                    )}{" "}
                    {color === "w"
                      ? "White"
                      : color === "b"
                        ? "Black"
                        : "Random"}
                  </button>
                ))}
              </div>
            </div>
            <div className="ck-menu-timer">
              <label htmlFor="ck-menu-timer">Timer</label>
              <select
                id="ck-menu-timer"
                disabled={!isHost}
                value={
                  lobbyConfig.clockEnabled
                    ? String(lobbyConfig.initialMinutes)
                    : "off"
                }
                onChange={(e) =>
                  e.target.value === "off"
                    ? handleToggleClock(false)
                    : onUpdateConfig({
                        clockEnabled: true,
                        initialMinutes: Number(e.target.value),
                      })
                }
              >
                <option value="off">Untimed</option>
                {[
                  ...new Set([
                    1,
                    3,
                    5,
                    10,
                    15,
                    30,
                    60,
                    lobbyConfig.initialMinutes,
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((min) => (
                    <option key={min} value={min}>
                      {min} min
                    </option>
                  ))}
              </select>
              <button
                className="ck-menu-icon-button"
                onClick={() => setIsSetupOpen(true)}
                aria-label="Configure match settings"
                title="Set custom timer and increment"
              >
                <Timer size={16} />
              </button>
              
            </div>
          </div>
          <div className="ck-menu-setup-foot">
          <p className="ck-menu-caption">
            {lobbyConfig.clockEnabled
              ? `${lobbyConfig.initialMinutes} min + ${lobbyConfig.incrementSeconds}s per move`
              : "No chess clock"}
            {isGroundsActive &&
              ` · Tiles: ${lobbyConfig.expansions?.treacherousGroundsSelected?.length === 2 ? lobbyConfig.expansions.treacherousGroundsSelected.map((t) => GROUND_NAMES[t as GroundType]).join(" & ") : "Random"}`}
          </p>
          <label className="ck-arbiter-toggle ck-arbiter-timer-toggle"><span>Allow Arbiter</span><input type="checkbox" role="switch" aria-label="Allow Arbiter" checked={!!lobbyConfig.allowArbiter} disabled={!isHost} onChange={e=>onUpdateConfig({allowArbiter:e.target.checked})}/><span className="ck-arbiter-toggle-track" aria-hidden="true" /></label>
          </div>
        </section>
        <footer className="ck-menu-launch">
          {isHost ? (
            <button
              id="lobby-btn-start-match"
              className="ck-menu-primary"
              onClick={onStartGame}
              disabled={!canStart}
            >
              <Swords size={19} />
              Start Match
            </button>
          ) : myColor !== "spectator" ? (
            <>
              <button
                className="ck-menu-primary"
                id="lobby-btn-ready"
                aria-pressed={isMyReady}
                onClick={() => onSetPlayerReady?.(!isMyReady)}
              >
                <CheckSquare size={18} />
                {isMyReady ? "Ready!" : "Ready"}
              </button>
              {onExitLobby && (
                <button
                  className="ck-menu-exit"
                  id="lobby-btn-exit"
                  onClick={onExitLobby}
                >
                  Exit lobby
                </button>
              )}
            </>
          ) : (
            <button className="ck-menu-exit" onClick={onExitLobby}>Quit viewing</button>
          )}
          <p className="ck-menu-caption">
            {isHost
              ? canStart
                ? "Ready to play"
                : opponent
                  ? "Waiting for Player 2 to ready"
                  : "Invite Player 2 to start"
              : isMyReady
                ? "Waiting for the host to start"
                : "Ready when you are"}
          </p>
        </footer>
      </div>

      {isJoinOpen && (
        <Modal className="ck-menu-modal">
          <section aria-labelledby="ck-join-title">
            <div className="ck-menu-section-title">
              <h2 id="ck-join-title">Join by code</h2>
              <button
                className="ck-menu-icon-button"
                onClick={() => setIsJoinOpen(false)}
                aria-label="Close dialog"
              >
                <X size={19} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleJoinSubmit();
              }}
            >
              <label htmlFor="ck-join-code">Room code</label>
              <input
                id="ck-join-code"
                autoFocus
                value={joinCode}
                maxLength={12}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
              />
              {joinError && <p role="alert">{joinError}</p>}
              {joinSuccess && <p role="status">{joinSuccess}</p>}
              <button
                className="ck-menu-primary"
                disabled={!joinCode.trim()}
                type="submit"
              >
                Join room
              </button>
              <button type="button" onClick={handleGenerateRandomRoom}>
                Create a new room
              </button>
            </form>
          </section>
        </Modal>
      )}
      {isSetupOpen && (
        <Modal className="ck-menu-modal">
          <section aria-labelledby="ck-custom-title">
            <div className="ck-menu-section-title">
              <h2 id="ck-custom-title">Match settings</h2>
              <button
                className="ck-menu-icon-button"
                onClick={() => setIsSetupOpen(false)}
                aria-label="Close dialog"
              >
                <X size={19} />
              </button>
            </div>
            <label className="ck-menu-check">
              <input
                type="checkbox"
                checked={lobbyConfig.clockEnabled}
                disabled={!isHost}
                onChange={(e) => handleToggleClock(e.target.checked)}
              />
              Chess clock
            </label>
            <div className="ck-menu-custom-timer">
              <label>
                Minutes
                <input
                  type="number"
                  min={1}
                  max={60}
                  disabled={!isHost || !lobbyConfig.clockEnabled}
                  value={lobbyConfig.initialMinutes}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= 60)
                      onUpdateConfig({ initialMinutes: n });
                  }}
                />
              </label>
              <label>
                Increment (seconds)
                <input
                  type="number"
                  min={0}
                  max={30}
                  disabled={!isHost || !lobbyConfig.clockEnabled}
                  value={lobbyConfig.incrementSeconds}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 0 && n <= 30)
                      onUpdateConfig({ incrementSeconds: n });
                  }}
                />
              </label>
            </div>
            {isHost && (
              <button
                onClick={() => {
                  applyPreset(5, 3);
                }}
              >
                5 min + 3s preset
              </button>
            )}
            <button
              className="ck-menu-primary"
              onClick={() => setIsSetupOpen(false)}
            >
              Done
            </button>
          </section>
        </Modal>
      )}
      {futurePack && (
        <Modal className="ck-menu-modal">
          <section aria-labelledby="ck-future-title">
            <div className="ck-menu-section-title">
              <h2 id="ck-future-title">{futurePack.title}</h2>
              <button
                className="ck-menu-icon-button"
                onClick={() => setFuturePack(null)}
                aria-label="Close dialog"
              >
                <X size={19} />
              </button>
            </div>
            <img
              className="ck-menu-future-art"
              src={`/art/menu/${futurePack.art}.webp?v=6-wide`}
              alt=""
            />
            <p>{futurePack.description}</p>
            <p className="ck-menu-caption">
              Coming Soon · not playable in this build.
            </p>
            <button
              className="ck-menu-primary"
              onClick={() => setFuturePack(null)}
            >
              Got it
            </button>
          </section>
        </Modal>
      )}
      {/* TREACHEROUS GROUNDS EXPANSION DETAILS MODAL */}
      {/* CONFIGURE TREACHEROUS GROUNDS POWER-UPS MODAL */}
      {isConfigureGroundsOpen && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/50 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 dark:from-stone-900 dark:via-emerald-950/30 dark:to-stone-900 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-xs">
                  <SlidersHorizontal className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900 dark:text-stone-100 font-sans tracking-wide">
                    Configure Treacherous Grounds
                  </h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold">
                    Select exactly 2 power-ups to appear in this match (or
                    choose Random)
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsConfigureGroundsOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selection Grid */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1 custom-scrollbar">
              <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-800/80 p-3 rounded-xl border border-stone-200 dark:border-stone-700">
                <span className="font-bold text-stone-700 dark:text-stone-300">
                  Power-ups Selected:{" "}
                  <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-mono">
                    {configuredGrounds.length} / 2
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setConfiguredGrounds([])}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                >
                  Set to Random (Any 2)
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-red-800 dark:text-red-400 flex items-center gap-1.5 font-sans">
                  <Ban className="w-3.5 h-3.5" />
                  <span>Hidden Traps (Plant on Friendly Half)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(["mine", "poison", "disarm", "banish"] as const).map(
                    (type) => {
                      const isSelected = configuredGrounds.includes(type);
                      return (
                        <button
                          type="button"
                          key={type}
                          onClick={() => {
                            if (isSelected) {
                              setConfiguredGrounds(
                                configuredGrounds.filter((t) => t !== type),
                              );
                            } else {
                              if (configuredGrounds.length >= 2) {
                                setConfiguredGrounds([
                                  configuredGrounds[1],
                                  type,
                                ]);
                              } else {
                                setConfiguredGrounds([
                                  ...configuredGrounds,
                                  type,
                                ]);
                              }
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer relative ${
                            isSelected
                              ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-300/40 dark:ring-emerald-500/20"
                              : "bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-stone-700 dark:text-stone-300"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-700 p-1 flex items-center justify-center shrink-0 border border-stone-200 dark:border-stone-600">
                            <V5Power type={type} className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="font-extrabold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                              <span>{GROUND_NAMES[type]}</span>
                            </div>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
                              {type === "mine" &&
                                "Immediate lethal kill upon landing. Full points awarded."}
                              {type === "poison" &&
                                "Contagious poison kills after 3 turns. Melee spread."}
                              {type === "disarm" &&
                                "Permanently removes ability to capture pieces."}
                              {type === "banish" &&
                                "Exiles piece into the astral void for 10 turns."}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center absolute top-2.5 right-2.5 font-bold text-[10px]">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5 font-sans">
                  <Mountain className="w-3.5 h-3.5" />
                  <span>Elemental & Power Tiles (Visible Modifiers)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(["boost", "gravity", "defense", "portal"] as const).map(
                    (type) => {
                      const isSelected = configuredGrounds.includes(type);
                      return (
                        <button
                          type="button"
                          key={type}
                          onClick={() => {
                            if (isSelected) {
                              setConfiguredGrounds(
                                configuredGrounds.filter((t) => t !== type),
                              );
                            } else {
                              if (configuredGrounds.length >= 2) {
                                setConfiguredGrounds([
                                  configuredGrounds[1],
                                  type,
                                ]);
                              } else {
                                setConfiguredGrounds([
                                  ...configuredGrounds,
                                  type,
                                ]);
                              }
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer relative ${
                            isSelected
                              ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-300/40 dark:ring-emerald-500/20"
                              : "bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-stone-700 dark:text-stone-300"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-700 p-1 flex items-center justify-center shrink-0 border border-stone-200 dark:border-stone-600">
                            <V5Power type={type} className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="font-extrabold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                              <span>{GROUND_NAMES[type]}</span>
                            </div>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
                              {type === "boost" &&
                                "Move across ranks like a Queen (non-capture)."}
                              {type === "gravity" &&
                                "Step 1 square in any direction like a King."}
                              {type === "defense" &&
                                "Invulnerability ward against all captures. Cures poison."}
                              {type === "portal" &&
                                "Warp or swap across linked portal gateways."}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center absolute top-2.5 right-2.5 font-bold text-[10px]">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 sm:p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {configuredGrounds.length === 0
                  ? "Default: 2 power-ups chosen randomly at match start."
                  : configuredGrounds.length === 1
                    ? "Select 1 more power-up (or leave 0 for random)."
                    : "Ready! 2 power-ups selected."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigureGroundsOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-bold text-xs hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-save-ground-config"
                  onClick={() => {
                    // An empty array survives JSON transport and clears the server’s saved pair.
                    const toSave =
                      configuredGrounds.length === 2 ? configuredGrounds : [];
                    onUpdateConfig({
                      expansions: {
        ...lobbyConfig.expansions,
                        shiftedParadigm: isShiftedParadigmActive,
                        championsOfTheMonolith: isChampionsOfTheMonolithActive,
                        theAwakening: isTheAwakeningActive,
                        treacherousGrounds: true,
                        treacherousGroundsSelected: toSave,
                      },
                    });
                    setIsConfigureGroundsOpen(false);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Save Power-ups
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* Rename Username Modal */}
      {isRenameModalOpen && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700">
                  <User className="w-4 h-4 stroke-[2.5]" />
                </div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Rename Your Username
                </h3>
              </div>
              <button
                aria-label="Close dialog"
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = renameModalInput.trim().slice(0, 24);
                if (clean && onRenamePlayer) {
                  onRenamePlayer(clean, renameTarget || myPlayerId);

                }
                setIsRenameModalOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[11px] uppercase font-bold text-stone-500 dark:text-stone-400 mb-1 tracking-wider">
                  New Username
                </label>
                <input
                  type="text"
                  autoFocus
                  maxLength={20}
                  value={renameModalInput}
                  onChange={(e) => setRenameModalInput(e.target.value)}
                  placeholder="e.g. Grandmaster Bobby"
                  className="w-full bg-stone-50 dark:bg-stone-800 border-2 border-blue-400/80 focus:border-blue-500 rounded-xl px-3 py-2 text-sm font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-inner"
                />
                <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 block">
                  This username will appear on your card hand, player badge, and
                  match log.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameModalInput.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-stone-950 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-blue-500/20 active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Save Name</span>
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
};
