# 🏎️ Bumping Cars — Online Multiplayer

A fast-paced multiplayer bumping cars game built with **pure HTML/CSS/JavaScript** — no game engine! Host a room, share the code, and bump your friends off the arena.

## 🎮 How to Play

| Control | PC | Mobile |
|---|---|---|
| Accelerate | W / ↑ | Joystick up |
| Reverse | S / ↓ | Joystick down |
| Steer left | A / ← | Joystick left |
| Steer right | D / → | Joystick right |
| Boost | Space / Shift | 🔥 button |

### Scoring
- **+10 points** for bumping another car
- The **faster** car at impact gets the points
- Boost has a **5-second cooldown** — use it strategically!

---

## 🚀 Deploy to GitHub Pages (Step-by-Step)

### 1. Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it something like `bumping-cars`
3. Set it to **Public**
4. Click **Create repository**

### 2. Push the Game Files

Open a terminal in the `bumping-cars` folder and run:

```bash
git init
git add .
git commit -m "Initial commit - Bumping Cars game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bumping-cars.git
git push -u origin main
```

> Replace `YOUR_USERNAME` with your actual GitHub username.

### 3. Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose **main** branch, folder **/ (root)**
4. Click **Save**
5. Wait ~1 minute, then your game is live at:
   ```
   https://YOUR_USERNAME.github.io/bumping-cars/
   ```

### 4. Play With Friends!

1. Open the link above on your computer or phone
2. Enter your name and click **Create Room**
3. Share the **5-letter room code** with friends
4. Friends open the same link → enter the room code → click **Join Room**
5. Once everyone's in, the host clicks **Start Game**
6. **BUMP!** 🚗💥🚗

---

## 🔧 Run Locally

Just open `index.html` in any modern browser. For multiplayer to work, both players need internet access (PeerJS uses a free cloud signaling server for WebRTC).

For local development with auto-reload:
```bash
npx serve .
```

---

## 📁 Project Structure

```
bumping-cars/
├── index.html    ← Main page (menu, lobby, game)
├── style.css     ← Dark-themed glassmorphism UI
├── game.js       ← Physics, rendering, collision, scoring
├── network.js    ← PeerJS WebRTC multiplayer
├── ui.js         ← Input handling, screens, joystick
└── README.md     ← You are here
```

## 🛠️ Tech Stack

- **Rendering**: Canvas 2D API
- **Physics**: Custom collision detection + impulse response
- **Multiplayer**: PeerJS (WebRTC data channels)
- **Hosting**: GitHub Pages (static files only)
- **UI**: Vanilla CSS with glassmorphism + Google Fonts
