// ===== BUMPING CARS — NETWORKING (PeerJS / WebRTC) =====
// Host/Client architecture. Host runs physics, clients send input.

const Network = (() => {
    let peer = null;
    let connections = {}; // peerId -> DataConnection
    let isHost = false;
    let roomCode = '';
    let localId = '';
    let localName = '';
    let localColorIndex = 0;
    let playerRegistry = {}; // gamePeerId -> { name, colorIndex, connId }
    let connToGameId = {}; // conn.peer -> gamePeerId
    let onPlayerJoin = null;
    let onPlayerLeave = null;
    let onGameStart = null;
    let onToast = null;
    let colorCounter = 0;

    const TICK_RATE = 50; // ms between state broadcasts (20 ticks/sec)
    let lastTickTime = 0;

    // ---- Generate short room code ----
    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    // ---- Create Room (Host) ----
    function createRoom(name, callbacks) {
        return new Promise((resolve, reject) => {
            roomCode = generateCode();
            localName = name || 'Host';
            isHost = true;
            localColorIndex = colorCounter++;

            onPlayerJoin = callbacks.onPlayerJoin;
            onPlayerLeave = callbacks.onPlayerLeave;
            onGameStart = callbacks.onGameStart;
            onToast = callbacks.onToast;

            const peerId = 'bumpcars-' + roomCode;
            peer = new Peer(peerId, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            peer.on('open', (id) => {
                localId = id;
                // Add host to game
                Game.addPlayer(localId, localName, localColorIndex);
                Game.setLocalId(localId);
                playerRegistry[localId] = { name: localName, colorIndex: localColorIndex, connId: 'host' };
                connToGameId['host'] = localId;
                
                if (onPlayerJoin) onPlayerJoin(localId, localName, localColorIndex);
                resolve({ roomCode, peerId: localId });
            });

            peer.on('connection', (conn) => {
                handleNewConnection(conn);
            });

            peer.on('error', (err) => {
                console.error('PeerJS error:', err);
                reject(err);
            });
        });
    }

    // ---- Join Room (Client) ----
    function joinRoom(code, name, callbacks) {
        return new Promise((resolve, reject) => {
            roomCode = code.toUpperCase().trim();
            localName = name || 'Player';
            isHost = false;

            onPlayerJoin = callbacks.onPlayerJoin;
            onPlayerLeave = callbacks.onPlayerLeave;
            onGameStart = callbacks.onGameStart;
            onToast = callbacks.onToast;

            let settled = false;
            let joinTimeout = null;

            peer = new Peer(undefined, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            peer.on('open', (id) => {
                localId = id;
                Game.setLocalId(localId);

                const hostPeerId = 'bumpcars-' + roomCode;
                const conn = peer.connect(hostPeerId, { reliable: true });

                // Timeout: if connection doesn't open within 8 seconds, reject
                joinTimeout = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        conn.close();
                        peer.destroy();
                        peer = null;
                        reject(new Error('Room not found or host is unreachable'));
                    }
                }, 8000);

                conn.on('open', () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(joinTimeout);
                    connections[hostPeerId] = conn;
                    // Send join message
                    conn.send({ type: 'join', name: localName, peerId: localId });
                    resolve({ roomCode, peerId: localId });
                });

                conn.on('data', (data) => {
                    handleClientMessage(data);
                });

                conn.on('close', () => {
                    if (onToast) onToast('Disconnected from host');
                });

                conn.on('error', (err) => {
                    console.error('Connection error:', err);
                    if (!settled) {
                        settled = true;
                        clearTimeout(joinTimeout);
                        reject(err);
                    }
                });
            });

            peer.on('error', (err) => {
                console.error('PeerJS error:', err);
                if (!settled) {
                    settled = true;
                    if (joinTimeout) clearTimeout(joinTimeout);
                    reject(err);
                }
            });
        });
    }

    // ---- Host: handle new peer connections ----
    function handleNewConnection(conn) {
        conn.on('open', () => {
            connections[conn.peer] = conn;
        });

        conn.on('data', (data) => {
            handleHostMessage(conn.peer, data);
        });

        conn.on('close', () => {
            const gameId = connToGameId[conn.peer];
            if (!gameId) return;

            const reg = playerRegistry[gameId];
            const playerName = reg ? reg.name : 'Player';
            
            delete connections[conn.peer];
            delete playerRegistry[gameId];
            delete connToGameId[conn.peer];
            
            Game.removePlayer(gameId);
            if (onPlayerLeave) onPlayerLeave(gameId, playerName);
            if (onToast) onToast(playerName + ' left the game');

            // Notify all peers about the disconnect
            broadcast({ type: 'player-left', peerId: gameId, name: playerName });
        });
    }

    // ---- Host: handle messages from clients ----
    function handleHostMessage(fromPeerId, data) {
        switch (data.type) {
            case 'join': {
                const ci = colorCounter++;
                const actualId = data.peerId || fromPeerId; // Use explicit ID to avoid WebRTC mismatches
                
                playerRegistry[actualId] = { name: data.name, colorIndex: ci, connId: fromPeerId };
                connToGameId[fromPeerId] = actualId;
                
                Game.addPlayer(actualId, data.name, ci);

                if (onPlayerJoin) onPlayerJoin(actualId, data.name, ci);
                if (onToast) onToast(data.name + ' joined!');

                // Send current player list to the new player
                const playerList = {};
                for (const pid of Object.keys(playerRegistry)) {
                    playerList[pid] = { name: playerRegistry[pid].name, colorIndex: playerRegistry[pid].colorIndex };
                }
                connections[fromPeerId].send({ type: 'player-list', players: playerList, yourColor: ci });

                // Notify other players
                broadcast({ type: 'player-joined', peerId: actualId, name: data.name, colorIndex: ci }, fromPeerId);
                break;
            }
            case 'input': {
                const gameId = connToGameId[fromPeerId];
                if (gameId) {
                    Game.setInput(gameId, data.input);
                }
                break;
            }
        }
    }

    // ---- Client: handle messages from host ----
    function handleClientMessage(data) {
        switch (data.type) {
            case 'player-list': {
                localColorIndex = data.yourColor;
                // Add self to registry first (avoid duplicate from the list)
                playerRegistry[localId] = { name: localName, colorIndex: localColorIndex };
                for (const pid of Object.keys(data.players)) {
                    const p = data.players[pid];
                    // Skip if we already registered this player (prevents duplicates)
                    if (pid === localId) continue;
                    playerRegistry[pid] = p;
                    if (onPlayerJoin) onPlayerJoin(pid, p.name, p.colorIndex);
                }
                // Fire join for self only once
                if (onPlayerJoin) onPlayerJoin(localId, localName, localColorIndex);
                break;
            }
            case 'player-joined': {
                playerRegistry[data.peerId] = { name: data.name, colorIndex: data.colorIndex };
                if (onPlayerJoin) onPlayerJoin(data.peerId, data.name, data.colorIndex);
                if (onToast) onToast(data.name + ' joined!');
                break;
            }
            case 'player-left': {
                delete playerRegistry[data.peerId];
                if (onPlayerLeave) onPlayerLeave(data.peerId, data.name);
                if (onToast) onToast(data.name + ' left');
                break;
            }
            case 'state': {
                Game.applyState(data.state);
                break;
            }
            case 'start': {
                if (onGameStart) onGameStart(false);
                break;
            }
            case 'score-event': {
                if (onToast && data.scorer && data.victim) {
                    const scorerName = playerRegistry[data.scorer]?.name || 'Someone';
                    const victimName = playerRegistry[data.victim]?.name || 'someone';
                    onToast(`${scorerName} bumped ${victimName}! +${data.points}`);
                }
                break;
            }
        }
    }

    // ---- Host: broadcast to all peers or exclude one ----
    function broadcast(msg, excludePeerId) {
        for (const pid of Object.keys(connections)) {
            if (pid === excludePeerId) continue;
            try {
                connections[pid].send(msg);
            } catch (e) {
                // connection may be closed
            }
        }
    }

    // ---- Send input to host (client only) ----
    function sendInput(input) {
        if (isHost) {
            Game.setInput(localId, input);
        } else {
            const hostPeerId = 'bumpcars-' + roomCode;
            if (connections[hostPeerId]) {
                connections[hostPeerId].send({ type: 'input', input });
            }
        }
    }

    // ---- Host: start game ----
    function startGame() {
        if (!isHost) return;
        broadcast({ type: 'start' });
        if (onGameStart) onGameStart(true);
    }

    // ---- Tick (called from game loop) ----
    function tick(scoreEvents) {
        if (!isHost) return;

        const now = performance.now();
        if (now - lastTickTime < TICK_RATE) return;
        lastTickTime = now;

        // Broadcast game state
        broadcast({ type: 'state', state: Game.serializeState() });

        // Broadcast score events
        if (scoreEvents && scoreEvents.length > 0) {
            for (const ev of scoreEvents) {
                broadcast({ type: 'score-event', scorer: ev.scorer, victim: ev.victim, points: ev.points });
                // Also show toast locally for host
                if (onToast) {
                    const scorerName = playerRegistry[ev.scorer]?.name || 'Someone';
                    const victimName = playerRegistry[ev.victim]?.name || 'someone';
                    onToast(`${scorerName} bumped ${victimName}! +${ev.points}`);
                }
            }
        }
    }

    // ---- Cleanup ----
    function disconnect() {
        if (peer) {
            peer.destroy();
            peer = null;
        }
        connections = {};
        playerRegistry = {};
        connToGameId = {};
        isHost = false;
        roomCode = '';
        colorCounter = 0;
    }

    // ---- Public API ----
    return {
        createRoom, joinRoom, sendInput, startGame, tick, disconnect, broadcast,
        get isHost() { return isHost; },
        get roomCode() { return roomCode; },
        get localId() { return localId; },
        get playerRegistry() { return playerRegistry; }
    };
})();
