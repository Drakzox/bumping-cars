// ===== BUMPING CARS — GAME ENGINE =====
// Pure vanilla JS, no game engine. Canvas 2D rendering + simple physics.

const Game = (() => {
    // ---- Constants ----
    const ARENA_W = 1600;
    const ARENA_H = 1000;
    const CAR_W = 50;
    const CAR_H = 30;
    const CAR_RADIUS = 28; // collision radius
    const MAX_SPEED = 5;
    const ACCEL = 0.18;
    const BRAKE_DECEL = 0.12;
    const FRICTION = 0.97;
    const TURN_SPEED = 0.045;
    const BOUNCE_FACTOR = 1.6; // Increased from 0.6 for more knockback
    const WALL_BOUNCE = 0.5;
    const BUMP_COOLDOWN = 500; // ms between scoring same pair
    const BOOST_MULTIPLIER = 1.8;
    const BOOST_DURATION = 1500;
    const BOOST_COOLDOWN = 5000;
    const PARTICLE_LIFETIME = 600;

    const CAR_COLORS = [
        '#ff4d6d', '#4cc9f0', '#06d6a0', '#ffd166', '#a855f7', '#fb923c'
    ];
    const CAR_COLOR_NAMES = [
        'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'
    ];

    // ---- State ----
    let canvas, ctx;
    let players = {}; // id -> car
    let localId = null;
    let particles = [];
    let camera = { x: 0, y: 0, scale: 1 };
    let lastTime = 0;
    let running = false;
    let bumpLog = {}; // "id1-id2" -> timestamp of last scored bump

    // ---- Car factory ----
    function createCar(id, name, colorIndex) {
        return {
            id,
            name: name || 'Player',
            colorIndex: colorIndex % CAR_COLORS.length,
            color: CAR_COLORS[colorIndex % CAR_COLORS.length],
            x: 200 + Math.random() * (ARENA_W - 400),
            y: 200 + Math.random() * (ARENA_H - 400),
            vx: 0,
            vy: 0,
            angle: Math.random() * Math.PI * 2,
            score: 0,
            input: { up: false, down: false, left: false, right: false, boost: false },
            boosting: false,
            boostEnd: 0,
            boostCooldownEnd: 0,
            alive: true
        };
    }

    // ---- Init ----
    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // ---- Player management ----
    function addPlayer(id, name, colorIndex) {
        if (players[id]) return players[id]; // prevent duplicates
        players[id] = createCar(id, name, colorIndex);
        return players[id];
    }

    function removePlayer(id) {
        delete players[id];
    }

    function setLocalId(id) {
        localId = id;
    }

    function getPlayer(id) {
        return players[id];
    }

    function getAllPlayers() {
        return players;
    }

    function getLocalPlayer() {
        return players[localId];
    }

    function setInput(id, input) {
        if (players[id]) {
            players[id].input = input;
        }
    }

    // ---- Physics (called by host) ----
    function updatePhysics(dt) {
        const ids = Object.keys(players);
        const now = performance.now();

        // Move each car
        for (const id of ids) {
            const car = players[id];
            if (!car.alive) continue;

            const inp = car.input;

            // Boost
            if (inp.boost && !car.boosting && now > car.boostCooldownEnd) {
                car.boosting = true;
                car.boostEnd = now + BOOST_DURATION;
                car.boostCooldownEnd = now + BOOST_COOLDOWN;
            }
            if (car.boosting && now > car.boostEnd) {
                car.boosting = false;
            }

            const speedMult = car.boosting ? BOOST_MULTIPLIER : 1;

            // Steering
            const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
            if (speed > 0.3) {
                if (inp.left) car.angle -= TURN_SPEED * (speed / MAX_SPEED);
                if (inp.right) car.angle += TURN_SPEED * (speed / MAX_SPEED);
            }

            // Acceleration
            if (inp.up) {
                car.vx += Math.cos(car.angle) * ACCEL * speedMult;
                car.vy += Math.sin(car.angle) * ACCEL * speedMult;
            }
            if (inp.down) {
                car.vx -= Math.cos(car.angle) * BRAKE_DECEL;
                car.vy -= Math.sin(car.angle) * BRAKE_DECEL;
            }

            // Friction
            car.vx *= FRICTION;
            car.vy *= FRICTION;

            // Clamp speed
            const maxS = MAX_SPEED * speedMult;
            const sp = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
            if (sp > maxS) {
                car.vx = (car.vx / sp) * maxS;
                car.vy = (car.vy / sp) * maxS;
            }

            // Move
            car.x += car.vx;
            car.y += car.vy;

            // Wall bounce
            let hitWall = false;
            if (car.x - CAR_RADIUS < 0) { car.x = CAR_RADIUS; car.vx = Math.abs(car.vx) * WALL_BOUNCE; hitWall = true; }
            if (car.x + CAR_RADIUS > ARENA_W) { car.x = ARENA_W - CAR_RADIUS; car.vx = -Math.abs(car.vx) * WALL_BOUNCE; hitWall = true; }
            if (car.y - CAR_RADIUS < 0) { car.y = CAR_RADIUS; car.vy = Math.abs(car.vy) * WALL_BOUNCE; hitWall = true; }
            if (car.y + CAR_RADIUS > ARENA_H) { car.y = ARENA_H - CAR_RADIUS; car.vy = -Math.abs(car.vy) * WALL_BOUNCE; hitWall = true; }
            if (hitWall) {
                spawnParticles(car.x, car.y, '#ffffff', 3);
            }
        }

        // Collisions between cars
        const scoreEvents = [];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = players[ids[i]];
                const b = players[ids[j]];
                if (!a.alive || !b.alive) continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < CAR_RADIUS * 2) {
                    // Separate
                    const overlap = CAR_RADIUS * 2 - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;

                    // Impulse
                    const relVx = a.vx - b.vx;
                    const relVy = a.vy - b.vy;
                    const relDot = relVx * nx + relVy * ny;

                    if (relDot > 0) {
                        const impulse = relDot * BOUNCE_FACTOR;
                        a.vx -= impulse * nx;
                        a.vy -= impulse * ny;
                        b.vx += impulse * nx;
                        b.vy += impulse * ny;
                    }

                    // Scoring
                    const pairKey = ids[i] < ids[j] ? ids[i] + '-' + ids[j] : ids[j] + '-' + ids[i];
                    if (!bumpLog[pairKey] || now - bumpLog[pairKey] > BUMP_COOLDOWN) {
                        bumpLog[pairKey] = now;

                        const speedA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
                        const speedB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

                        // Faster car gets the points
                        if (speedA > speedB) {
                            a.score += 10;
                            scoreEvents.push({ scorer: a.id, victim: b.id, points: 10 });
                        } else {
                            b.score += 10;
                            scoreEvents.push({ scorer: b.id, victim: a.id, points: 10 });
                        }
                    }

                    // Particles
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    spawnParticles(mx, my, a.color, 5);
                    spawnParticles(mx, my, b.color, 5);
                }
            }
        }

        // Update particles
        particles = particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 16;
            p.vy += 0.05; // gravity
            return p.life > 0;
        });

        return scoreEvents;
    }

    // ---- Particles ----
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                color,
                size: 2 + Math.random() * 4,
                life: PARTICLE_LIFETIME
            });
        }
    }

    // ---- Serialize / Deserialize state (for networking) ----
    function serializeState() {
        const state = {};
        for (const id of Object.keys(players)) {
            const c = players[id];
            state[id] = {
                x: Math.round(c.x * 10) / 10,
                y: Math.round(c.y * 10) / 10,
                vx: Math.round(c.vx * 100) / 100,
                vy: Math.round(c.vy * 100) / 100,
                angle: Math.round(c.angle * 1000) / 1000,
                score: c.score,
                boosting: c.boosting,
                name: c.name,
                colorIndex: c.colorIndex,
                color: c.color
            };
        }
        return state;
    }

    function applyState(state) {
        for (const id of Object.keys(state)) {
            const s = state[id];
            if (!players[id]) {
                addPlayer(id, s.name, s.colorIndex);
            }
            const c = players[id];
            // Interpolation and client-side prediction between ticks
            // Local car lerps very fast, remote cars lerp smoothly
            const lerp = (id === localId) ? 0.7 : 0.4;
            c.x += (s.x - c.x) * lerp;
            c.y += (s.y - c.y) * lerp;
            c.angle += angleDiff(c.angle, s.angle) * lerp;
            c.score = s.score;
            
            // Apply host's velocity so the client can predict movement 
            // between network ticks in the render loop
            c.vx = s.vx;
            c.vy = s.vy;
            c.boosting = s.boosting;
            c.name = s.name;
            c.color = s.color;
            c.colorIndex = s.colorIndex;
        }
        // Remove players no longer in state
        for (const id of Object.keys(players)) {
            if (!state[id]) removePlayer(id);
        }
    }

    function angleDiff(from, to) {
        let d = to - from;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    // ---- Rendering ----
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Camera follows local player
        const local = getLocalPlayer();
        if (local) {
            const targetX = local.x - canvas.width / 2;
            const targetY = local.y - canvas.height / 2;
            camera.x += (targetX - camera.x) * 0.08;
            camera.y += (targetY - camera.y) * 0.08;
        }

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Draw arena
        drawArena();

        // Draw particles
        for (const p of particles) {
            const alpha = p.life / PARTICLE_LIFETIME;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Draw cars
        const sorted = Object.values(players).sort((a, b) => a.y - b.y);
        for (const car of sorted) {
            drawCar(car);
        }

        ctx.restore();
    }

    function drawArena() {
        // Floor
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, ARENA_W, ARENA_H);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= ARENA_W; x += 80) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ARENA_H);
            ctx.stroke();
        }
        for (let y = 0; y <= ARENA_H; y += 80) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(ARENA_W, y);
            ctx.stroke();
        }

        // Border walls - glowing
        ctx.shadowColor = '#ff4d6d';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
        ctx.shadowBlur = 0;

        // Corner decorations
        const cs = 30;
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 2;
        // Top-left
        ctx.beginPath(); ctx.moveTo(0, cs); ctx.lineTo(0, 0); ctx.lineTo(cs, 0); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(ARENA_W - cs, 0); ctx.lineTo(ARENA_W, 0); ctx.lineTo(ARENA_W, cs); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(0, ARENA_H - cs); ctx.lineTo(0, ARENA_H); ctx.lineTo(cs, ARENA_H); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(ARENA_W - cs, ARENA_H); ctx.lineTo(ARENA_W, ARENA_H); ctx.lineTo(ARENA_W, ARENA_H - cs); ctx.stroke();
    }

    function drawCar(car) {
        const { x, y, angle, color, name, score, boosting } = car;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Boost trail
        if (boosting) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            const grad = ctx.createLinearGradient(-CAR_W / 2 - 30, 0, -CAR_W / 2, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, '#ff8800');
            ctx.fillStyle = grad;
            ctx.fillRect(-CAR_W / 2 - 30, -8, 30, 16);
            ctx.restore();
        }

        // Shadow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        roundRect(ctx, -CAR_W / 2 + 3, -CAR_H / 2 + 3, CAR_W, CAR_H, 6);
        ctx.fill();
        ctx.restore();

        // Body
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = boosting ? 25 : 12;
        ctx.beginPath();
        roundRect(ctx, -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Roof
        ctx.fillStyle = shadeColor(color, -30);
        ctx.beginPath();
        roundRect(ctx, -CAR_W / 2 + 8, -CAR_H / 2 + 5, CAR_W - 16, CAR_H - 10, 3);
        ctx.fill();

        // Headlights
        ctx.fillStyle = '#ffee88';
        ctx.shadowColor = '#ffee88';
        ctx.shadowBlur = 8;
        ctx.fillRect(CAR_W / 2 - 4, -CAR_H / 2 + 3, 4, 6);
        ctx.fillRect(CAR_W / 2 - 4, CAR_H / 2 - 9, 4, 6);
        ctx.shadowBlur = 0;

        // Taillights
        ctx.fillStyle = '#ff2222';
        ctx.fillRect(-CAR_W / 2, -CAR_H / 2 + 3, 3, 6);
        ctx.fillRect(-CAR_W / 2, CAR_H / 2 - 9, 3, 6);

        ctx.restore();

        // Name tag
        ctx.save();
        ctx.font = '700 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(name, x, y - CAR_H / 2 - 14);
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(score + ' pts', x, y - CAR_H / 2 - 4);
        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function shadeColor(hex, percent) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + percent));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
        return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // ---- Game Loop ----
    function startLoop(isHost) {
        running = true;
        lastTime = performance.now();

        function loop(now) {
            if (!running) return;
            const dt = now - lastTime;
            lastTime = now;

            let scoreEvents = [];
            if (isHost) {
                scoreEvents = updatePhysics(dt);
            } else {
                // Client-side smoothing: keep cars moving using their last known velocity
                // Scaled roughly by the frame delta (16.6ms is one 60fps frame)
                const frameScale = dt / 16.66;
                for (const id of Object.keys(players)) {
                    const c = players[id];
                    c.x += c.vx * frameScale;
                    c.y += c.vy * frameScale;
                }
            }

            render();

            // Update HUD
            const local = getLocalPlayer();
            if (local) {
                const scoreEl = document.getElementById('hud-score-value');
                if (scoreEl) scoreEl.textContent = local.score;
            }
            updateScoreboard();

            // Networking tick (handled by Network module)
            if (typeof Network !== 'undefined' && Network.tick) {
                Network.tick(scoreEvents);
            }

            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    function stopLoop() {
        running = false;
    }

    function updateScoreboard() {
        const list = document.getElementById('scoreboard-list');
        if (!list) return;

        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        list.innerHTML = '';
        for (const car of sorted) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="sb-color" style="background:${car.color}"></span>
                            <span class="sb-name">${car.name}</span>
                            <span class="sb-score">${car.score}</span>`;
            list.appendChild(li);
        }
    }

    // ---- Public API ----
    return {
        ARENA_W, ARENA_H, CAR_COLORS, CAR_COLOR_NAMES,
        init, resize,
        addPlayer, removePlayer, setLocalId, getPlayer, getLocalPlayer, getAllPlayers,
        setInput,
        updatePhysics, serializeState, applyState,
        startLoop, stopLoop,
        render, spawnParticles
    };
})();
