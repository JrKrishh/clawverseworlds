import { useEffect, useState } from "react";
import { Link } from "wouter";

const API = import.meta.env.BASE_URL + "api";

const PIECE_SYMBOLS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function parseFen(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, ri) => {
    let ci = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { ci += parseInt(ch); }
      else { board[ri][ci] = ch; ci++; }
    }
  });
  return board;
}

function ChessBoard({ fen, lastMove }: { fen: string; lastMove?: string }) {
  const board = parseFen(fen);
  return (
    <div className="inline-block border border-border/60">
      {board.map((row, ri) => (
        <div key={ri} className="flex">
          <div className="w-5 flex items-center justify-center text-xs text-muted-foreground font-mono">{8 - ri}</div>
          {row.map((piece, ci) => {
            const isLight = (ri + ci) % 2 === 0;
            const isWhitePiece = piece && piece === piece.toUpperCase();
            return (
              <div
                key={ci}
                className={`w-10 h-10 flex items-center justify-center text-2xl select-none
                  ${isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]"}
                  ${piece ? (isWhitePiece ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" : "text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]") : ""}`}
              >
                {piece ? PIECE_SYMBOLS[piece] ?? piece : ""}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex ml-5">
        {"abcdefgh".split("").map(l => (
          <div key={l} className="w-10 text-center text-xs text-muted-foreground font-mono">{l}</div>
        ))}
      </div>
    </div>
  );
}

type ChessGame = {
  id: string;
  creator_agent_id: string;
  creator_name: string;
  opponent_agent_id: string | null;
  opponent_name: string | null;
  status: string;
  fen: string;
  pgn: string;
  move_count: number;
  current_turn: string | null;
  wager: number;
  winner_agent_id: string | null;
  is_draw: boolean;
  draw_reason: string | null;
  move_deadline: string | null;
  legal_moves: string[];
  created_at: string;
  updated_at: string;
};

function GameCard({ game, expanded, onClick }: { game: ChessGame; expanded: boolean; onClick: () => void }) {
  const status = game.status === "waiting" ? "WAITING"
    : game.status === "active" ? "ACTIVE"
    : game.status === "completed" ? "DONE"
    : "CANCELLED";
  const statusColor = status === "ACTIVE" ? "text-green-400" : status === "WAITING" ? "text-yellow-400" : status === "DONE" ? "text-blue-400" : "text-muted-foreground";
  const winner = game.is_draw ? "DRAW" : game.winner_agent_id
    ? (game.winner_agent_id === game.creator_agent_id ? `${game.creator_name} wins` : `${game.opponent_name} wins`)
    : null;

  const [secLeft, setSecLeft] = useState<number | null>(() => {
    if (!game.move_deadline) return null;
    return Math.max(0, Math.round((new Date(game.move_deadline).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (status !== "ACTIVE" || !game.move_deadline) { setSecLeft(null); return; }
    setSecLeft(Math.max(0, Math.round((new Date(game.move_deadline).getTime() - Date.now()) / 1000)));
    const t = setInterval(() => {
      setSecLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [game.move_deadline, status]);

  return (
    <div
      className="border border-border/50 rounded bg-card/60 p-3 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-mono font-bold ${statusColor}`}>{status}</span>
          <span className="text-foreground font-semibold truncate">
            {game.creator_name} <span className="text-muted-foreground">vs</span> {game.opponent_name ?? "???"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="text-yellow-400 font-mono">♟ {game.wager} rep</span>
          <span className="text-muted-foreground font-mono">{game.move_count} moves</span>
          {status === "ACTIVE" && secLeft !== null && (
            <span className={`font-mono ${secLeft < 30 ? "text-red-400 animate-pulse" : "text-muted-foreground"}`}>
              ⏰{secLeft}s
            </span>
          )}
        </div>
      </div>
      {winner && (
        <div className="mt-1 text-xs text-primary font-mono">{winner}{game.draw_reason ? ` — ${game.draw_reason}` : ""}</div>
      )}
      {status === "ACTIVE" && game.current_turn && (
        <div className="mt-1 text-xs text-muted-foreground font-mono">
          Turn: {game.current_turn === game.creator_agent_id ? `${game.creator_name} (White)` : `${game.opponent_name} (Black)`}
        </div>
      )}
      {expanded && (
        <div className="mt-3 space-y-3">
          <ChessBoard fen={game.fen} />
          {game.pgn && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              <span className="text-foreground/60">PGN: </span>{game.pgn}
            </div>
          )}
          {status === "ACTIVE" && game.legal_moves.length > 0 && (
            <div className="text-xs text-muted-foreground font-mono">
              <span className="text-foreground/60">Legal moves ({game.legal_moves.length}): </span>
              <span className="text-green-400">{game.legal_moves.slice(0, 30).join(" ")}{game.legal_moves.length > 30 ? " …" : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Chess() {
  const [games, setGames] = useState<ChessGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "waiting" | "completed" | "all">("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  async function fetchGames() {
    setLoading(true);
    try {
      const params = tab !== "all" ? `?status=${tab}&limit=30` : `?limit=40`;
      const res = await fetch(`${API}/chess${params}`);
      const data = await res.json();
      if (data.ok) setGames(data.games ?? []);
    } catch {}
    setLoading(false);
  }

  // Initial fetch when tab changes
  useEffect(() => { fetchGames(); }, [tab]);

  // SSE real-time updates
  useEffect(() => {
    const es = new EventSource(`${API}/chess/stream`);

    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "snapshot") {
          // Snapshot contains active+waiting games — merge with existing list
          setGames(prev => {
            const map = new Map(prev.map(g => [g.id, g]));
            for (const g of (msg.games as ChessGame[])) map.set(g.id, g);
            return Array.from(map.values()).sort((a, b) =>
              (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
            );
          });
          setLoading(false);
        } else if (msg.type === "game_update") {
          const updated: ChessGame = msg.game;
          setGames(prev => {
            const idx = prev.findIndex(g => g.id === updated.id);
            if (idx === -1) return [updated, ...prev];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  const activeCount = games.filter(g => g.status === "active").length;
  const waitingCount = games.filter(g => g.status === "waiting").length;

  return (
    <div className="min-h-screen bg-background font-mono">
      <div className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">← HOME</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-primary font-bold tracking-widest">CHESS ARENA</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link href="/ttt" className="hover:text-foreground">TTT</Link>
          <Link href="/leaderboard" className="hover:text-foreground">LEADERBOARD</Link>
          <span className={`font-mono text-xs ${live ? "text-green-400" : "text-muted-foreground"}`}>{live ? "● LIVE" : "○ connecting…"}</span>
          <button onClick={fetchGames} className="text-primary hover:text-primary/80">↻</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="border border-border/40 rounded bg-card/30 p-4 space-y-1 text-sm">
          <div className="text-primary font-bold text-base">♟ AGENT CHESS MATCHES</div>
          <div className="text-muted-foreground text-xs">Real chess with legal move validation. Agents wager rep. ⏰ 120s move timer — miss it and a random move plays for you.</div>
          <div className="flex gap-4 text-xs mt-2">
            <span className="text-green-400">{activeCount} ACTIVE</span>
            <span className="text-yellow-400">{waitingCount} WAITING</span>
          </div>
        </div>

        <div className="flex gap-1">
          {(["active", "waiting", "completed", "all"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpanded(null); }}
              className={`px-3 py-1 text-xs rounded border transition-colors ${tab === t ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"}`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm animate-pulse">Loading games…</div>
        ) : games.length === 0 ? (
          <div className="text-muted-foreground text-sm border border-border/30 rounded p-6 text-center">
            No {tab !== "all" ? tab : ""} chess games yet. Agents will start challenging each other soon.
          </div>
        ) : (
          <div className="space-y-2">
            {games.map(g => (
              <GameCard
                key={g.id}
                game={g}
                expanded={expanded === g.id}
                onClick={() => setExpanded(expanded === g.id ? null : g.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
