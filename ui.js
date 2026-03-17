// ===== BUMPING CARS — UI CONTROLLER =====
// Handles screens, input (keyboard + joystick), toasts, and wiring everything together.

const UI = (() => {
    // ---- DOM refs ----
    const screens = {
        menu: document.getElementById('menu-screen'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen')
    };
    const els = {
        playerNameInput: document.getElementById('player-name-input'),
        createRoomBtn: document.getElementById('create-room-btn'),
        joinRoomBtn: document.getElementById('join-room-btn'),
        roomCodeInput: document.getElementById('room-code-input'),
        roomCodeValue: document.getElementById('room-code-value'),
        copyCodeBtn: document.getElementById('copy-code-btn'),
        playerCount: document.getElementById('player-count'),
        playersUl: document.getElementById('players-ul'),
        startGameBtn: document.getElementById('start-game-btn'),
        waitingText: document.getElementById('waiting-text'),
        leaveLobbyBtn: document.getElementById('leave-lobby-btn'),
        hudCode: document.getElementById('hud-code'),
        canvas: document.getElementById('game-canvas'),
        toastContainer: document.getElementById('toast-container'),
        boostBtn: document.getElementById('boost-btn')
    };

    // ---- Input state ----
    let keys = { up: false, down: false, left: false, right: false, boost: false };
    let joystickInput = { up: false, down: false, left: false, right: false };
    let boostPressed = false;

    // ---- Screen transition ----
    function showScreen(name) {
        for (const key of Object.keys(screens)) {
            screens[key].classList.toggle('active', key === name);
        }
    }

    // ---- Toast notifications ----
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        els.toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3000);
    }

    // ---- Lobby player list ----
    let lobbyPlayers = {};

    function addLobbyPlayer(id, name, colorIndex) {
        if (lobbyPlayers[id]) return; // prevent duplicate entries
        lobbyPlayers[id] = { name, colorIndex };
        refreshLobbyList();
    }

    function removeLobbyPlayer(id) {
        delete lobbyPlayers[id];
        refreshLobbyList();
    }

    function refreshLobbyList() {
        const ids = Object.keys(lobbyPlayers);
        els.playerCount.textContent = `(${ids.length}/6)`;
        els.playersUl.innerHTML = '';
        let first = true;
        for (const id of ids) {
            const p = lobbyPlayers[id];
            const li = document.createElement('li');
            const color = Game.CAR_COLORS[p.colorIndex % Game.CAR_COLORS.length];
            li.innerHTML = `<span class="player-color" style="background:${color}"></span>
                            <span>${p.name}</span>
                            ${first ? '<span class="host-badge">HOST</span>' : ''}`;
            els.playersUl.appendChild(li);
            first = false;
        }
    }

    // ---- Network callbacks ----
    const netCallbacks = {
        onPlayerJoin: (id, name, colorIndex) => {
            addLobbyPlayer(id, name, colorIndex);
        },
        onPlayerLeave: (id, name) => {
            removeLobbyPlayer(id);
        },
        onGameStart: (asHost) => {
            startGameplay(asHost);
        },
        onToast: (msg) => {
            showToast(msg);
        }
    };

    // ---- Create Room ----
    els.createRoomBtn.addEventListener('click', async () => {
        const name = els.playerNameInput.value.trim() || 'Player';
        els.createRoomBtn.disabled = true;
        els.createRoomBtn.textContent = 'Creating...';

        try {
            const result = await Network.createRoom(name, netCallbacks);
            els.roomCodeValue.textContent = result.roomCode;
            els.hudCode.textContent = result.roomCode;
            els.startGameBtn.style.display = '';
            els.waitingText.style.display = 'none';
            showScreen('lobby');
        } catch (err) {
            showToast('Failed to create room: ' + err.message);
        }

        els.createRoomBtn.disabled = false;
        els.createRoomBtn.innerHTML = '<span class="btn-icon">🏁</span> Create Room';
    });

    // ---- Join Room ----
    els.joinRoomBtn.addEventListener('click', async () => {
        const name = els.playerNameInput.value.trim() || 'Player';
        const code = els.roomCodeInput.value.trim();
        if (!code) {
            showToast('Please enter a room code');
            return;
        }
        els.joinRoomBtn.disabled = true;
        els.joinRoomBtn.textContent = 'Joining...';

        try {
            const result = await Network.joinRoom(code, name, netCallbacks);
            els.roomCodeValue.textContent = result.roomCode;
            els.hudCode.textContent = result.roomCode;
            els.startGameBtn.style.display = 'none';
            els.waitingText.style.display = '';
            showScreen('lobby');
        } catch (err) {
            showToast('Failed to join room: ' + err.message);
        }

        els.joinRoomBtn.disabled = false;
        els.joinRoomBtn.innerHTML = '<span class="btn-icon">🚗</span> Join Room';
    });

    // ---- Copy Room Code ----
    els.copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(Network.roomCode).then(() => {
            showToast('Room code copied!');
        }).catch(() => {
            showToast('Could not copy');
        });
    });

    // ---- Start Game (Host) ----
    els.startGameBtn.addEventListener('click', () => {
        Network.startGame();
    });

    // ---- Leave Lobby ----
    els.leaveLobbyBtn.addEventListener('click', () => {
        Network.disconnect();
        lobbyPlayers = {};
        refreshLobbyList();
        showScreen('menu');
    });

    // ---- Start Gameplay ----
    function startGameplay(asHost) {
        showScreen('game');
        Game.init(els.canvas);

        if (!asHost) {
            // Client: game state comes from host
        }

        Game.startLoop(asHost);
    }

    // ===== KEYBOARD INPUT =====
    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') keys.up = true;
        if (k === 's' || k === 'arrowdown') keys.down = true;
        if (k === 'a' || k === 'arrowleft') keys.left = true;
        if (k === 'd' || k === 'arrowright') keys.right = true;
        if (k === ' ' || k === 'shift') keys.boost = true;
        sendCombinedInput();
    });

    document.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') keys.up = false;
        if (k === 's' || k === 'arrowdown') keys.down = false;
        if (k === 'a' || k === 'arrowleft') keys.left = false;
        if (k === 'd' || k === 'arrowright') keys.right = false;
        if (k === ' ' || k === 'shift') keys.boost = false;
        sendCombinedInput();
    });

    // ===== VIRTUAL JOYSTICK =====
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');
    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };
    const JOYSTICK_RADIUS = 45;

    function getTouch(e, id) {
        for (const t of e.changedTouches) {
            if (t.identifier === id) return t;
        }
        return null;
    }

    let joystickTouchId = null;

    document.getElementById('joystick-zone').addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        // Always recalculate center from the actual rendered position
        // Force layout recalc to ensure correct values after screen transition
        joystickBase.offsetHeight; // trigger reflow
        const rect = joystickBase.getBoundingClientRect();
        joystickCenter.x = rect.left + rect.width / 2;
        joystickCenter.y = rect.top + rect.height / 2;
        joystickActive = true;
        updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!joystickActive || joystickTouchId === null) return;
        const touch = getTouch(e, joystickTouchId);
        if (touch) {
            e.preventDefault();
            updateJoystick(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    function handleTouchEnd(e) {
        if (joystickTouchId === null) return;
        const touch = getTouch(e, joystickTouchId);
        if (touch) {
            joystickActive = false;
            joystickTouchId = null;
            joystickThumb.style.transform = 'translate(0px, 0px)';
            joystickInput = { up: false, down: false, left: false, right: false };
            sendCombinedInput();
        }
    }

    function updateJoystick(tx, ty) {
        let dx = tx - joystickCenter.x;
        let dy = ty - joystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > JOYSTICK_RADIUS) {
            dx = (dx / dist) * JOYSTICK_RADIUS;
            dy = (dy / dist) * JOYSTICK_RADIUS;
        }

        joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;

        const deadzone = 15;
        joystickInput.up = dy < -deadzone;
        joystickInput.down = dy > deadzone;
        joystickInput.left = dx < -deadzone;
        joystickInput.right = dx > deadzone;
        sendCombinedInput();
    }

    // ---- Boost button (mobile) ----
    if (els.boostBtn) {
        els.boostBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            boostPressed = true;
            sendCombinedInput();
        }, { passive: false });
        els.boostBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            boostPressed = false;
            sendCombinedInput();
        }, { passive: false });
    }

    // ---- Combine keyboard + joystick input and send ----
    function sendCombinedInput() {
        const combined = {
            up: keys.up || joystickInput.up,
            down: keys.down || joystickInput.down,
            left: keys.left || joystickInput.left,
            right: keys.right || joystickInput.right,
            boost: keys.boost || boostPressed
        };
        Network.sendInput(combined);
    }

    // ---- Init ----
    showScreen('menu');

    // Persist name from localStorage
    const savedName = localStorage.getItem('bumpcars-name');
    if (savedName) els.playerNameInput.value = savedName;
    els.playerNameInput.addEventListener('change', () => {
        localStorage.setItem('bumpcars-name', els.playerNameInput.value);
    });

    return { showScreen, showToast };
})();
