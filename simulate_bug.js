// A script to see if players[localId] is somehow preserved or recreated when fromPeerId !== localId.
// We will mock the necessary parts of Game and Network to trace execution.

const Game = (() => {
    let players = {};
    let localId = null;

    function createCar(id) { return { id, x: 0, y: 0 }; }

    function addPlayer(id) {
        if (players[id]) return players[id];
        players[id] = createCar(id);
        return players[id];
    }

    function removePlayer(id) { delete players[id]; }
    function setLocalId(id) { localId = id; }
    function getLocalPlayer() { return players[localId]; }

    function applyState(state) {
        for (const id of Object.keys(state)) {
            const s = state[id];
            if (!players[id]) {
                console.log(`[applyState] Creating ${id}`);
                addPlayer(id);
            }
            const c = players[id];
            // c.x += (s.x - c.x) * 0.3; // etc
        }
        for (const id of Object.keys(players)) {
            if (!state[id]) {
                console.log(`[applyState] Removing ${id}`);
                removePlayer(id);
            }
        }
    }

    return { players, addPlayer, removePlayer, setLocalId, getLocalPlayer, applyState, get localId() { return localId; } };
})();

// Scenario: client connects, localId is 'client-123', but host registers as 'host-assigned-123'.
Game.setLocalId('client-123');

// Receive state where host only knows 'host-assigned-123'
const hostState = {
    'host-assigned-123': { x: 100, y: 100 }
};

Game.applyState(hostState);

console.log("Players map:", Object.keys(Game.players));
console.log("Local player target:", Game.getLocalPlayer());
