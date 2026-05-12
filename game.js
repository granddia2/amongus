/* ============================================================
   AMONG US — Multiplayer  (PeerJS P2P, GitHub Pages ready)
   ============================================================ */

// ── CONSTANTS ───────────────────────────────────────────────
const PLAYER_COLORS = [
  { name:'Red',    hex:'#c51111' }, { name:'Blue',   hex:'#132ed1' },
  { name:'Green',  hex:'#117f2d' }, { name:'Pink',   hex:'#ed54ba' },
  { name:'Orange', hex:'#ef7d0e' }, { name:'Yellow', hex:'#f5f557' },
  { name:'Black',  hex:'#3f474e' }, { name:'White',  hex:'#d6e0f0' },
  { name:'Purple', hex:'#6b2fbb' }, { name:'Brown',  hex:'#71491e' },
];
const SPEED = 180;          // px/s
const KILL_RANGE  = 55;
const TASK_RANGE  = 60;
const REPORT_RANGE= 70;
const KILL_COOLDOWN_SECS = 25;
const VOTE_DURATION_SECS = 60;
const IMPOSTOR_COUNT = 1;   // 1 impostor per game (scales if we want)

// ── MAP DEFINITION ──────────────────────────────────────────
// Simple top-down Skeld-inspired map
const MAP_W = 1600, MAP_H = 900;

const ROOMS = [
  { name:'Cafeteria',    x:560,  y:40,   w:480, h:220 },
  { name:'Weapons',      x:1100, y:40,   w:280, h:160 },
  { name:'Navigation',   x:1280, y:180,  w:200, h:160 },
  { name:'O2',           x:1100, y:220,  w:160, h:120 },
  { name:'Shields',      x:1320, y:380,  w:200, h:160 },
  { name:'Comms',        x:1100, y:580,  w:200, h:160 },
  { name:'Storage',      x:800,  y:580,  w:240, h:200 },
  { name:'Admin',        x:880,  y:320,  w:180, h:200 },
  { name:'MedBay',       x:580,  y:280,  w:160, h:140 },
  { name:'Security',     x:400,  y:280,  w:160, h:140 },
  { name:'Reactor',      x:80,   y:200,  w:260, h:220 },
  { name:'Upper Engine', x:160,  y:80,   w:200, h:140 },
  { name:'Lower Engine', x:160,  y:580,  w:200, h:160 },
  { name:'Electrical',   x:440,  y:480,  w:220, h:180 },
  { name:'UpperHallway', x:360,  y:200,  w:240, h:80  },
  { name:'LowerHallway', x:360,  y:420,  w:440, h:80  },
  { name:'RightHallway', x:1060, y:300,  w:80,  h:280 },
];

const CORRIDORS = [
  // connect rooms visually — just open spaces
  { x:340,  y:120, w:240, h:100 }, // upper left
  { x:340,  y:420, w:440, h:80  },
  { x:780,  y:200, w:120, h:400 },
  { x:1040, y:160, w:100, h:500 },
  { x:600,  y:700, w:500, h:80  },
  { x:340,  y:600, w:120, h:180 },
  { x:600,  y:200, w:60,  h:100 },
];

// Emergency meeting button position
const EMERGENCY_BTN = { x: 790, y: 130, r: 28 };

// Tasks placed around the map
const TASK_DEFS = [
  { id:'wires_elec',  name:'Fix Wiring',       room:'Electrical',   x:480,  y:540,  type:'wires' },
  { id:'wires_med',   name:'Fix Wiring',       room:'MedBay',       x:620,  y:340,  type:'wires' },
  { id:'wires_nav',   name:'Fix Wiring',       room:'Navigation',   x:1320, y:240,  type:'wires' },
  { id:'simon_weap',  name:'Calibrate Weapons',room:'Weapons',      x:1180, y:100,  type:'simon' },
  { id:'simon_react', name:'Start Reactor',    room:'Reactor',      x:160,  y:300,  type:'simon' },
  { id:'simon_comms', name:'Reset Comms',      room:'Comms',        x:1160, y:640,  type:'simon' },
  { id:'simon_shields',name:'Prime Shields',   room:'Shields',      x:1380, y:440,  type:'simon' },
];
const TASKS_PER_PLAYER = 3;

// ── STATE ────────────────────────────────────────────────────
let peer, connections = {};   // peerId -> DataConnection
let myId = '';
let isHost = false;
let roomCode = '';

// local player config
let myName = '', myColor = PLAYER_COLORS[0];

// game state (authoritative on host, synced to clients)
let gs = null; // GameState object

// client-side only
let myPeerId = null;
let keys = {};
let lastTime = 0;
let animFrame = null;
let canvas, ctx;
let cam = { x: 0, y: 0 };
let joystick = { dx: 0, dy: 0 };
let killCooldown = 0;
let taskMinigame = null;  // active minigame state
let currentScreen = 'screen-menu';
let meetingVoteTimer = 0;
let meetingTimerInterval = null;

// ── INIT ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  buildColorGrid();
  setupKeyboard();
  setupJoystick();
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  showScreen('screen-menu');
});

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ── UI HELPERS ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentScreen = id;
}

function buildColorGrid() {
  const grid = document.getElementById('color-grid');
  PLAYER_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = c.hex;
    sw.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      myColor = c;
    };
    grid.appendChild(sw);
  });
}

function goToLobby() {
  const n = document.getElementById('player-name').value.trim();
  if (!n) { alert('Please enter a name'); return; }
  myName = n;
  showScreen('screen-lobby');
}

function copyCode() {
  navigator.clipboard.writeText(roomCode).catch(() => {});
}

// ── PEER SETUP ───────────────────────────────────────────────
function initPeer(onOpen) {
  // Use public PeerJS cloud server
  peer = new Peer(undefined, {
    host: '0.peerjs.com', port: 443, path: '/', secure: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
  peer.on('open', id => { myPeerId = id; onOpen(id); });
  peer.on('error', err => { alert('Connection error: ' + err.type + '\n' + err.message); });
  peer.on('connection', conn => { if (isHost) hostHandleConn(conn); });
}

// ── HOSTING ─────────────────────────────────────────────────
function createRoom() {
  initPeer(id => {
    isHost = true;
    // Use last 6 chars of peer ID as room code
    roomCode = id.slice(-6).toUpperCase();
    document.getElementById('display-code').textContent = roomCode;

    // Init host game state
    gs = createInitialGameState();
    addPlayerToGS(myPeerId, myName, myColor.hex);

    renderWaitingRoom();
    showScreen('screen-waiting');
    document.getElementById('start-btn').style.display = '';
  });
}

function hostHandleConn(conn) {
  conn.on('open', () => {
    connections[conn.peer] = conn;
    conn.on('data', data => hostReceive(conn.peer, data));
    conn.on('close', () => {
      delete connections[conn.peer];
      if (gs) {
        gs.players = gs.players.filter(p => p.id !== conn.peer);
        if (currentScreen === 'screen-waiting') renderWaitingRoom();
        else hostBroadcast({ type:'gs', gs });
      }
    });
  });
}

function hostReceive(fromId, msg) {
  if (msg.type === 'join') {
    // Validate name/color uniqueness
    addPlayerToGS(fromId, msg.name, msg.color);
    // Send current state back
    connections[fromId].send({ type:'welcome', gs, roomCode, hostId: myPeerId });
    hostBroadcast({ type:'gs', gs });
    if (currentScreen === 'screen-waiting') renderWaitingRoom();
  } else if (msg.type === 'move') {
    const p = gsPlayer(fromId);
    if (p && p.alive && !p.ghost) {
      p.x = msg.x; p.y = msg.y;
      hostBroadcast({ type:'move', id: fromId, x: msg.x, y: msg.y });
    }
  } else if (msg.type === 'kill') {
    hostProcessKill(fromId, msg.targetId);
  } else if (msg.type === 'report') {
    hostStartMeeting(fromId, msg.bodyId, false);
  } else if (msg.type === 'emergency') {
    hostStartMeeting(fromId, null, true);
  } else if (msg.type === 'task_done') {
    hostProcessTaskDone(fromId, msg.taskId);
  } else if (msg.type === 'vote') {
    hostProcessVote(fromId, msg.targetId);
  } else if (msg.type === 'chat') {
    const p = gsPlayer(fromId);
    if (p) hostBroadcast({ type:'chat', name: p.name, color: p.color, text: msg.text, ghost: !p.alive });
  }
}

function hostBroadcast(msg, excludeId) {
  Object.entries(connections).forEach(([id, conn]) => {
    if (id !== excludeId) conn.send(msg);
  });
}
function hostSendAll(msg) {
  // to all clients AND process locally
  hostBroadcast(msg);
  clientReceive(msg); // host processes own events too
}

// ── JOINING ─────────────────────────────────────────────────
function joinRoom() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 4) { alert('Enter a room code'); return; }
  initPeer(id => {
    isHost = false;
    // The host peer ID has the code as last 6 chars — we need to find the full ID
    // Workaround: host's peer ID ends with the code, client stores it
    // We'll just try to connect using the code as suffix search
    // Actually PeerJS lets us connect by full peer ID.
    // We encode: room code IS the last 6 of host peer ID → we need the full host ID
    // Solution: use a well-known prefix so host ID = 'amgus-' + code (we set this on create)
    const hostId = 'amgus-' + code.toLowerCase();
    attemptJoin(hostId, code);
  });
}

function attemptJoin(hostId, code) {
  const conn = peer.connect(hostId, { reliable: true });
  connections['host'] = conn;
  conn.on('open', () => {
    roomCode = code;
    conn.send({ type:'join', name: myName, color: myColor.hex });
    conn.on('data', data => {
      if (data.type === 'welcome') {
        gs = data.gs;
        roomCode = data.roomCode;
        document.getElementById('display-code').textContent = roomCode;
        renderWaitingRoom();
        showScreen('screen-waiting');
      } else {
        clientReceive(data);
      }
    });
    conn.on('close', () => alert('Disconnected from host.'));
  });
  conn.on('error', () => alert('Could not connect. Check the room code.'));
}

// Override createRoom to use fixed peer ID with room code
function createRoomWithCode(code) {
  const fixedId = 'amgus-' + code.toLowerCase();
  peer = new Peer(fixedId, {
    host: '0.peerjs.com', port: 443, path: '/', secure: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
  peer.on('open', id => {
    myPeerId = id;
    isHost = true;
    roomCode = code;
    document.getElementById('display-code').textContent = roomCode;
    gs = createInitialGameState();
    addPlayerToGS(myPeerId, myName, myColor.hex);
    renderWaitingRoom();
    showScreen('screen-waiting');
    document.getElementById('start-btn').style.display = '';
  });
  peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      // Code taken, generate new one
      const newCode = randomCode();
      createRoomWithCode(newCode);
    } else {
      alert('Error: ' + err.message);
    }
  });
  peer.on('connection', conn => { if (isHost) hostHandleConn(conn); });
}

// Override createRoom
function createRoom() {
  const code = randomCode();
  createRoomWithCode(code);
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── CLIENT RECEIVE ───────────────────────────────────────────
function clientReceive(msg) {
  if (msg.type === 'gs') {
    gs = msg.gs;
    if (currentScreen === 'screen-waiting') renderWaitingRoom();
  } else if (msg.type === 'start') {
    gs = msg.gs;
    startLocalGame();
  } else if (msg.type === 'move') {
    const p = gsPlayer(msg.id);
    if (p && msg.id !== myPeerId) { p.x = msg.x; p.y = msg.y; }
  } else if (msg.type === 'kill_event') {
    const p = gsPlayer(msg.targetId);
    if (p) { p.alive = false; p.ghost = true; p.bodyX = msg.x; p.bodyY = msg.y; }
    if (msg.targetId === myPeerId) becomeGhost();
  } else if (msg.type === 'meeting_start') {
    gs.phase = 'meeting';
    gs.meeting = msg.meeting;
    showMeeting();
  } else if (msg.type === 'chat') {
    appendChat(msg);
  } else if (msg.type === 'vote_update') {
    gs.meeting.votes = msg.votes;
    gs.meeting.votedIds = msg.votedIds;
    renderVoteList();
    updateVoteStatus();
  } else if (msg.type === 'meeting_result') {
    showMeetingResult(msg);
  } else if (msg.type === 'game_over') {
    showGameOver(msg);
  } else if (msg.type === 'task_update') {
    gs.tasksDone = msg.tasksDone;
    updateTaskBar();
  }
}

// ── GAME STATE HELPERS ───────────────────────────────────────
function createInitialGameState() {
  return {
    phase: 'lobby', // lobby | playing | meeting | ended
    players: [],
    bodies: [],
    tasks: [],
    tasksDone: 0,
    tasksTotal: 0,
    meeting: null,
    impostors: [],
  };
}

function addPlayerToGS(id, name, color) {
  if (gs.players.find(p => p.id === id)) return;
  gs.players.push({
    id, name, color,
    x: 790, y: 155, // spawn at cafeteria
    alive: true, ghost: false,
    role: 'crewmate',
    tasks: [],
    tasksCompleted: [],
  });
}

function gsPlayer(id) { return gs.players.find(p => p.id === id); }
function myPlayer()   { return gsPlayer(myPeerId); }

// ── START GAME ───────────────────────────────────────────────
function startGame() {
  if (!isHost) return;
  if (gs.players.length < 2) { alert('Need at least 2 players!'); return; }
  hostBeginGame();
}

function hostBeginGame() {
  // Assign roles
  const shuffled = [...gs.players].sort(() => Math.random() - .5);
  const numImpostors = Math.max(1, Math.floor(gs.players.length / 5));
  gs.impostors = shuffled.slice(0, numImpostors).map(p => p.id);
  gs.players.forEach(p => {
    p.role = gs.impostors.includes(p.id) ? 'impostor' : 'crewmate';
  });

  // Assign tasks
  gs.tasks = [];
  gs.tasksDone = 0;
  let totalTasks = 0;
  gs.players.forEach(p => {
    if (p.role === 'crewmate') {
      const shuffTasks = [...TASK_DEFS].sort(() => Math.random() - .5).slice(0, TASKS_PER_PLAYER);
      p.tasks = shuffTasks.map(t => t.id);
      p.tasksCompleted = [];
      totalTasks += p.tasks.length;
    } else {
      p.tasks = [];
      p.tasksCompleted = [];
    }
  });
  gs.tasksTotal = totalTasks;

  // Scatter spawn points
  const spawns = [
    {x:700,y:130},{x:760,y:130},{x:820,y:130},{x:880,y:130},
    {x:700,y:175},{x:760,y:175},{x:820,y:175},{x:880,y:175},
    {x:700,y:220},{x:760,y:220}
  ];
  gs.players.forEach((p, i) => {
    const sp = spawns[i % spawns.length];
    p.x = sp.x; p.y = sp.y;
    p.alive = true; p.ghost = false;
  });
  gs.bodies = [];
  gs.phase = 'playing';

  hostBroadcast({ type:'start', gs });
  startLocalGame();
}

function startLocalGame() {
  showScreen('screen-game');
  document.getElementById('ghost-label').style.display = 'none';
  killCooldown = KILL_COOLDOWN_SECS;
  updateHUD();
  updateTaskBar();
  lastTime = performance.now();
  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop(lastTime);
}

// ── GAME LOOP ────────────────────────────────────────────────
function gameLoop(ts) {
  animFrame = requestAnimationFrame(gameLoop);
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  if (gs && gs.phase === 'playing') {
    updatePlayer(dt);
    render();
  }
}

function updatePlayer(dt) {
  const me = myPlayer();
  if (!me || !me.alive) return;

  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
  if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;
  dx += joystick.dx; dy += joystick.dy;

  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }

  me.x = clamp(me.x + dx * SPEED * dt, 20, MAP_W - 20);
  me.y = clamp(me.y + dy * SPEED * dt, 20, MAP_H - 20);

  // Sync position
  sendToHost({ type:'move', x: me.x, y: me.y });

  // Kill cooldown
  if (killCooldown > 0) {
    killCooldown -= dt;
    document.getElementById('kill-cooldown').textContent =
      killCooldown > 0 ? `Kill ready in ${Math.ceil(killCooldown)}s` : '';
  } else {
    document.getElementById('kill-cooldown').textContent = '';
  }

  // Camera
  cam.x = clamp(me.x - canvas.width/2,  0, MAP_W - canvas.width);
  cam.y = clamp(me.y - canvas.height/2, 0, MAP_H - canvas.height);

  updateActionButtons();
}

// ── RENDERING ────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawMap();
  drawBodies();
  drawPlayers();
  drawTaskMarkers();
  ctx.restore();
}

function drawMap() {
  // Background
  ctx.fillStyle = '#0d0d1e';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Rooms
  ROOMS.forEach(r => {
    ctx.fillStyle = '#1a1a3a';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.strokeStyle = '#2a2a5a';
    ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.stroke();
    // Room name
    ctx.fillStyle = '#334';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, r.x + r.w/2, r.y + r.h/2 + 4);
  });

  // Corridors
  CORRIDORS.forEach(c => {
    ctx.fillStyle = '#161628';
    ctx.fillRect(c.x, c.y, c.w, c.h);
  });

  // Emergency button
  ctx.fillStyle = '#cc1111';
  ctx.beginPath();
  ctx.arc(EMERGENCY_BTN.x, EMERGENCY_BTN.y, EMERGENCY_BTN.r, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EMERGENCY', EMERGENCY_BTN.x, EMERGENCY_BTN.y + 3);
}

function drawBodies() {
  gs.bodies.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    // Lying crewmate (rotated)
    ctx.rotate(Math.PI / 2);
    drawCrewmate(ctx, b.color, 22, false);
    ctx.restore();
    // X eyes
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×', b.x, b.y - 5);
  });
}

function drawPlayers() {
  gs.players.forEach(p => {
    if (!p.alive && !p.ghost) return;
    const isMe = p.id === myPeerId;
    const meGhost = myPlayer() && myPlayer().ghost;

    // Ghosts only visible to ghosts and impostors (always show to self)
    if (p.ghost && !meGhost && myPlayer()?.role !== 'impostor' && !isMe) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = p.ghost ? 0.4 : 1;
    drawCrewmate(ctx, p.color, 24, p.role === 'impostor' && isMe);
    ctx.restore();

    // Name tag
    ctx.globalAlpha = p.ghost ? 0.4 : 1;
    ctx.fillStyle = '#fff';
    ctx.font = `${isMe ? 'bold ' : ''}11px sans-serif`;
    ctx.textAlign = 'center';
    const tag = p.ghost ? `👻 ${p.name}` : p.name;
    ctx.fillText(tag, p.x, p.y - 34);
    ctx.globalAlpha = 1;
  });
}

function drawCrewmate(ctx, color, r, isImp) {
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 4, r * 0.72, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  // Visor
  ctx.fillStyle = '#aaddff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, -r * 0.3, r * 0.48, r * 0.32, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#88bbdd';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Backpack
  ctx.fillStyle = shadeColor(color, -30);
  ctx.fillRect(r * 0.3, -r * 0.1, r * 0.38, r * 0.55);
  // Impostor indicator (visible only to self)
  if (isImp) {
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('IMP', 0, r + 10);
  }
}

function drawTaskMarkers() {
  const me = myPlayer();
  if (!me) return;
  TASK_DEFS.forEach(td => {
    const done = me.tasksCompleted && me.tasksCompleted.includes(td.id);
    const assigned = me.tasks && me.tasks.includes(td.id);
    if (!assigned) return;
    ctx.beginPath();
    ctx.arc(td.x, td.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = done ? '#44dd44' : '#ffdd22';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(done ? '✓' : '!', td.x, td.y + 4);
  });
  // Emergency button label
  ctx.fillStyle = '#fff';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EMERGENCY', EMERGENCY_BTN.x, EMERGENCY_BTN.y + EMERGENCY_BTN.r + 12);
}

// ── ACTION BUTTONS ───────────────────────────────────────────
function updateActionButtons() {
  const me = myPlayer();
  if (!me || !me.alive) return;

  let canUse = false, canKill = false, canReport = false, canEmerg = false, canSab = false;

  // Task nearby?
  if (me.role === 'crewmate' || me.role === 'impostor') {
    const near = nearbyTask(me);
    if (near && me.role === 'crewmate') canUse = true;
  }

  // Emergency button nearby?
  const distEmerg = Math.hypot(me.x - EMERGENCY_BTN.x, me.y - EMERGENCY_BTN.y);
  if (distEmerg < EMERGENCY_BTN.r + 30) canEmerg = true;

  // Kill (impostor)
  if (me.role === 'impostor' && killCooldown <= 0) {
    const target = nearbyAliveCrewmate(me);
    if (target) canKill = true;
  }

  // Report body
  if (nearbyBody(me)) canReport = true;

  // Sabotage
  if (me.role === 'impostor') canSab = true;

  show('btn-use',     canUse);
  show('btn-kill',    canKill);
  show('btn-report',  canReport);
  show('btn-emerg',   canEmerg);
  show('btn-sabotage',canSab);
}

function show(id, visible) {
  document.getElementById(id).style.display = visible ? '' : 'none';
}

function pressAction(type) {
  const me = myPlayer();
  if (!me || !me.alive) return;
  if (type === 'use') {
    const t = nearbyTask(me);
    if (t) openTask(t);
  } else if (type === 'kill') {
    const target = nearbyAliveCrewmate(me);
    if (target) sendToHost({ type:'kill', targetId: target.id });
  } else if (type === 'report') {
    const b = nearbyBody(me);
    if (b) sendToHost({ type:'report', bodyId: b.id });
  } else if (type === 'emerg') {
    sendToHost({ type:'emergency' });
  } else if (type === 'sabotage') {
    // Simple sabotage: add tasks to all crewmates
    // (just UI feedback for now — could extend)
    alert('Sabotage is not yet implemented in this version!');
  }
}

// ── PROXIMITY HELPERS ────────────────────────────────────────
function nearbyTask(me) {
  if (me.role !== 'crewmate') return null;
  return TASK_DEFS.find(td => {
    const assigned = me.tasks && me.tasks.includes(td.id);
    const done     = me.tasksCompleted && me.tasksCompleted.includes(td.id);
    if (!assigned || done) return false;
    return Math.hypot(me.x - td.x, me.y - td.y) < TASK_RANGE;
  });
}

function nearbyAliveCrewmate(me) {
  return gs.players.find(p =>
    p.id !== me.id && p.alive && p.role === 'crewmate' &&
    Math.hypot(me.x - p.x, me.y - p.y) < KILL_RANGE
  );
}

function nearbyBody(me) {
  return gs.bodies.find(b => Math.hypot(me.x - b.x, me.y - b.y) < REPORT_RANGE);
}

// ── SEND TO HOST ─────────────────────────────────────────────
function sendToHost(msg) {
  if (isHost) {
    hostReceive(myPeerId, msg);
  } else {
    connections['host']?.send(msg);
  }
}

// ── HOST GAME LOGIC ──────────────────────────────────────────
function hostProcessKill(killerId, targetId) {
  const killer = gsPlayer(killerId);
  const target = gsPlayer(targetId);
  if (!killer || !target) return;
  if (!killer.alive || !target.alive) return;
  if (killer.role !== 'impostor') return;

  target.alive = false;
  target.ghost = true;
  gs.bodies.push({ id: targetId, x: target.x, y: target.y, color: target.color });

  hostSendAll({ type:'kill_event', targetId, x: target.x, y: target.y });
  hostCheckWin();
}

function hostProcessTaskDone(playerId, taskId) {
  const p = gsPlayer(playerId);
  if (!p || p.role !== 'crewmate') return;
  if (!p.tasks.includes(taskId) || p.tasksCompleted.includes(taskId)) return;
  p.tasksCompleted.push(taskId);
  gs.tasksDone++;
  hostSendAll({ type:'task_update', tasksDone: gs.tasksDone });
  hostCheckWin();
}

function hostStartMeeting(callerId, bodyId, isEmergency) {
  if (gs.phase !== 'playing') return;
  gs.phase = 'meeting';
  // Clean up body if reported
  if (bodyId) gs.bodies = gs.bodies.filter(b => b.id !== bodyId);
  const caller = gsPlayer(callerId);
  gs.meeting = {
    callerId, callerName: caller?.name || '?',
    isEmergency,
    votes: {},   // voterId -> targetId (or 'skip')
    votedIds: [],
    chat: [],
  };
  hostSendAll({ type:'meeting_start', meeting: gs.meeting });
  // Start vote timer on host
  let timeLeft = VOTE_DURATION_SECS;
  if (meetingTimerInterval) clearInterval(meetingTimerInterval);
  meetingTimerInterval = setInterval(() => {
    timeLeft--;
    // Broadcast timer
    hostBroadcast({ type:'vote_timer', t: timeLeft });
    updateVoteTimerDisplay(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(meetingTimerInterval);
      hostTallyVotes();
    }
  }, 1000);
}

function hostProcessVote(voterId, targetId) {
  if (!gs.meeting || gs.meeting.votedIds.includes(voterId)) return;
  gs.meeting.votes[voterId] = targetId;
  gs.meeting.votedIds.push(voterId);
  hostSendAll({ type:'vote_update', votes: gs.meeting.votes, votedIds: gs.meeting.votedIds });

  // Auto-tally if everyone voted
  const alivePlayers = gs.players.filter(p => p.alive);
  if (gs.meeting.votedIds.length >= alivePlayers.length) {
    if (meetingTimerInterval) clearInterval(meetingTimerInterval);
    setTimeout(() => hostTallyVotes(), 800);
  }
}

function hostTallyVotes() {
  const votes = gs.meeting.votes;
  const tally = {};
  Object.values(votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });

  let maxVotes = 0, ejectedId = null, tie = false;
  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) { maxVotes = count; ejectedId = id; tie = false; }
    else if (count === maxVotes) { tie = true; }
  });
  if (tie || ejectedId === 'skip' || !ejectedId) ejectedId = null;

  let ejectedPlayer = null;
  if (ejectedId) {
    ejectedPlayer = gsPlayer(ejectedId);
    if (ejectedPlayer) {
      ejectedPlayer.alive = false;
      ejectedPlayer.ghost = true;
    }
  }

  gs.phase = 'playing';
  gs.bodies = [];
  // Reset positions to cafeteria
  gs.players.forEach((p, i) => {
    const bases = [{x:700,y:130},{x:760,y:130},{x:820,y:130},{x:880,y:130},{x:700,y:175},{x:760,y:175}];
    const sp = bases[i % bases.length];
    if (p.alive) { p.x = sp.x; p.y = sp.y; }
  });

  const result = {
    type: 'meeting_result',
    ejectedId,
    ejectedName: ejectedPlayer?.name || null,
    ejectedRole: ejectedPlayer?.role || null,
    tally,
    players: gs.players,
  };
  hostSendAll(result);
  hostCheckWin();
}

function hostCheckWin() {
  const alive = gs.players.filter(p => p.alive);
  const aliveImps  = alive.filter(p => p.role === 'impostor');
  const aliveCrew  = alive.filter(p => p.role === 'crewmate');

  if (aliveImps.length === 0) {
    // Crewmates win
    hostSendAll({ type:'game_over', winner:'crewmate', reason:'All impostors ejected!', players: gs.players });
    gs.phase = 'ended';
    return true;
  }
  if (aliveImps.length >= aliveCrew.length) {
    // Impostors win
    hostSendAll({ type:'game_over', winner:'impostor', reason:'Impostors outnumber crewmates!', players: gs.players });
    gs.phase = 'ended';
    return true;
  }
  if (gs.tasksDone >= gs.tasksTotal && gs.tasksTotal > 0) {
    hostSendAll({ type:'game_over', winner:'crewmate', reason:'All tasks completed!', players: gs.players });
    gs.phase = 'ended';
    return true;
  }
  return false;
}

// ── MEETING UI ───────────────────────────────────────────────
function showMeeting() {
  // Pause game rendering
  showScreen('screen-meeting');
  const mtg = gs.meeting;
  document.getElementById('meeting-title').textContent =
    mtg.isEmergency ? '🚨 EMERGENCY MEETING' : '💀 DEAD BODY REPORTED';
  document.getElementById('meeting-caller').textContent =
    `Called by ${mtg.callerName}`;
  document.getElementById('meeting-chat').innerHTML = '';
  renderVoteList();
  updateVoteStatus();
  meetingVoteTimer = VOTE_DURATION_SECS;
  if (!isHost) startClientVoteTimer();
}

function startClientVoteTimer() {
  if (meetingTimerInterval) clearInterval(meetingTimerInterval);
  let t = VOTE_DURATION_SECS;
  meetingTimerInterval = setInterval(() => { t--; updateVoteTimerDisplay(t); if(t<=0) clearInterval(meetingTimerInterval); }, 1000);
}
function updateVoteTimerDisplay(t) {
  const el = document.getElementById('vote-timer');
  if (el) el.textContent = t > 0 ? `⏱ ${t}s` : '';
}

function renderVoteList() {
  const vl = document.getElementById('vote-list');
  vl.innerHTML = '';
  const me = myPlayer();
  const myVote = gs.meeting?.votes?.[myPeerId];

  gs.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'vote-card' + (p.alive ? '' : ' is-dead') + (myVote === p.id ? ' voted-this' : '');
    const voteCount = Object.values(gs.meeting?.votes || {}).filter(v => v === p.id).length;
    card.innerHTML = `
      <div class="vc-dot" style="background:${p.color}"></div>
      <div class="vc-name">${p.name}${p.id === myPeerId ? ' (You)' : ''}${!p.alive ? ' 💀' : ''}</div>
      <div class="vc-votes">${voteCount > 0 ? `${voteCount} vote${voteCount>1?'s':''}` : ''}</div>`;
    if (p.alive && me?.alive && !gs.meeting?.votedIds?.includes(myPeerId)) {
      card.onclick = () => sendVote(p.id);
    }
    vl.appendChild(card);
  });

  // Skip button
  const skip = document.createElement('div');
  skip.className = 'vote-skip';
  const skipCount = Object.values(gs.meeting?.votes || {}).filter(v => v === 'skip').length;
  skip.textContent = `⏭ Skip Vote${skipCount > 0 ? ` (${skipCount})` : ''}`;
  if (me?.alive && !gs.meeting?.votedIds?.includes(myPeerId)) {
    skip.onclick = () => sendVote('skip');
  }
  vl.appendChild(skip);
}

function updateVoteStatus() {
  const voted = gs.meeting?.votedIds?.length || 0;
  const total = gs.players.filter(p => p.alive).length;
  document.getElementById('vote-status').textContent = `${voted} / ${total} voted`;
}

function sendVote(targetId) {
  sendToHost({ type:'vote', targetId });
}

function sendChat() {
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  sendToHost({ type:'chat', text });
}

function chatKey(e) { if (e.key === 'Enter') sendChat(); }

function appendChat(msg) {
  const chat = document.getElementById('meeting-chat');
  if (!chat) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="name" style="color:${msg.color}">${msg.name}</span>${msg.ghost ? ' <span class="ghost-tag">[ghost]</span>' : ''}: ${escHtml(msg.text)}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ── MEETING RESULT ───────────────────────────────────────────
function showMeetingResult(msg) {
  if (meetingTimerInterval) clearInterval(meetingTimerInterval);
  gs.players = msg.players;

  let title = '', ejectedText = '';
  if (msg.ejectedId) {
    const isImp = msg.ejectedRole === 'impostor';
    title = isImp ? '☠️ Impostor Ejected!' : '❌ Wrong Choice...';
    ejectedText = `${msg.ejectedName} was ${isImp ? 'an Impostor' : 'a Crewmate'}.`;
  } else {
    title = '⏭ No one was ejected.';
    ejectedText = 'The vote was skipped or tied.';
  }

  document.getElementById('results-title').textContent = title;
  document.getElementById('results-ejected').textContent = ejectedText;

  const list = document.getElementById('results-list');
  list.innerHTML = '';
  gs.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'result-chip';
    chip.style.background = p.color + '33';
    chip.style.border = `2px solid ${p.color}`;
    chip.textContent = `${p.name} ${!p.alive ? '💀' : ''}`;
    list.appendChild(chip);
  });

  document.getElementById('results-continue').style.display = '';
  document.getElementById('results-menu').style.display = 'none';
  showScreen('screen-results');
}

function continueAfterMeeting() {
  // Reset back to game
  gs.phase = 'playing';
  showScreen('screen-game');
  lastTime = performance.now();
  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop(lastTime);
  const me = myPlayer();
  if (me && !me.alive) becomeGhost();
}

// ── GAME OVER ────────────────────────────────────────────────
function showGameOver(msg) {
  if (meetingTimerInterval) clearInterval(meetingTimerInterval);
  if (animFrame) cancelAnimationFrame(animFrame);

  const winner = msg.winner;
  const isWinner = (winner === 'crewmate' && myPlayer()?.role === 'crewmate') ||
                   (winner === 'impostor'  && myPlayer()?.role === 'impostor');

  document.getElementById('results-title').textContent =
    winner === 'crewmate' ? '🚀 Crewmates Win!' : '💀 Impostors Win!';
  document.getElementById('results-ejected').textContent = msg.reason + (isWinner ? ' · You Win! 🎉' : ' · You Lose.');

  const list = document.getElementById('results-list');
  list.innerHTML = '';
  (msg.players || gs.players).forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'result-chip';
    chip.style.background = p.color + '33';
    chip.style.border = `2px solid ${p.color}`;
    chip.textContent = `${p.name} — ${p.role}${!p.alive ? ' 💀' : ''}`;
    list.appendChild(chip);
  });

  document.getElementById('results-continue').style.display = 'none';
  document.getElementById('results-menu').style.display = '';
  showScreen('screen-results');
}

function backToMenu() {
  if (peer) { peer.destroy(); peer = null; }
  connections = {};
  gs = null;
  if (animFrame) cancelAnimationFrame(animFrame);
  showScreen('screen-menu');
}

function leaveRoom() {
  if (peer) { peer.destroy(); peer = null; }
  connections = {};
  gs = null;
  showScreen('screen-lobby');
}

// ── GHOST ────────────────────────────────────────────────────
function becomeGhost() {
  document.getElementById('ghost-label').style.display = '';
  document.getElementById('btn-kill').style.display = 'none';
  document.getElementById('btn-use').style.display  = 'none';
}

// ── TASK MINI-GAMES ─────────────────────────────────────────
function openTask(taskDef) {
  taskMinigame = { id: taskDef.id, type: taskDef.type };
  document.getElementById('task-title').textContent = taskDef.name;
  const content = document.getElementById('task-content');
  content.innerHTML = '';

  if (taskDef.type === 'wires') renderWiresTask(content, taskDef.id);
  if (taskDef.type === 'simon') renderSimonTask(content, taskDef.id);

  showScreen('screen-task');
  // Temporarily hide game
}

function closeTask() {
  taskMinigame = null;
  showScreen('screen-game');
  lastTime = performance.now();
}

function completeTask(taskId) {
  sendToHost({ type:'task_done', taskId });
  const me = myPlayer();
  if (me && !me.tasksCompleted.includes(taskId)) me.tasksCompleted.push(taskId);
  updateTaskBar();
  closeTask();
}

// WIRES TASK
function renderWiresTask(container, taskId) {
  const colors = ['#ff4444','#44aaff','#ffdd22','#44dd44'];
  const shuffled = [...colors].sort(() => Math.random() - .5);
  let selectedPlug = null;
  const connected = {}; // left color -> true

  const wrap = document.createElement('div');
  wrap.className = 'wire-task';

  colors.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'wire-row';

    const plug = document.createElement('div');
    plug.className = 'wire-plug';
    plug.style.background = c;
    plug.dataset.color = c;
    plug.onclick = () => {
      if (connected[c]) return;
      document.querySelectorAll('.wire-plug').forEach(p => p.classList.remove('selected'));
      plug.classList.add('selected');
      selectedPlug = c;
    };

    const line = document.createElement('div');
    line.className = 'wire-line';
    line.id = 'wline-' + i;

    const socket = document.createElement('div');
    socket.className = 'wire-socket';
    socket.style.background = shuffled[i];
    socket.dataset.color = shuffled[i];
    socket.onclick = () => {
      if (!selectedPlug) return;
      if (shuffled[i] === selectedPlug) {
        connected[selectedPlug] = true;
        plug.classList.remove('selected');
        plug.classList.add('connected');
        socket.classList.add('connected');
        const wl = document.getElementById('wline-' + i);
        wl.style.background = selectedPlug;
        wl.style.height = '4px';
        selectedPlug = null;
        if (Object.keys(connected).length === colors.length) {
          setTimeout(() => completeTask(taskId), 300);
        }
      } else {
        // Wrong connection flash
        socket.style.outline = '3px solid #ff0000';
        setTimeout(() => socket.style.outline = '', 500);
        selectedPlug = null;
        document.querySelectorAll('.wire-plug').forEach(p => p.classList.remove('selected'));
      }
    };

    row.appendChild(plug);
    row.appendChild(line);
    row.appendChild(socket);
    wrap.appendChild(row);
  });

  container.appendChild(wrap);
  const hint = document.createElement('p');
  hint.style.cssText = 'color:#aaa;font-size:.8rem;margin-top:.8rem;text-align:center';
  hint.textContent = 'Click a plug, then its matching socket.';
  container.appendChild(hint);
}

// SIMON TASK
function renderSimonTask(container, taskId) {
  const colors = ['#ff4444','#4444ff','#ffdd22','#44dd44'];
  const SEQ_LEN = 4;
  const sequence = Array.from({length: SEQ_LEN}, () => Math.floor(Math.random()*4));
  let playerSeq = [];
  let showing = false;

  const wrap = document.createElement('div');
  wrap.className = 'btn-task';

  const status = document.createElement('p');
  status.style.cssText = 'color:#aaa;font-size:.85rem;text-align:center';
  status.textContent = 'Watch the sequence…';

  const grid = document.createElement('div');
  grid.className = 'simon-grid';
  const btns = colors.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'simon-btn';
    b.style.background = c;
    b.dataset.idx = i;
    b.onclick = () => {
      if (showing) return;
      b.classList.add('lit');
      setTimeout(() => b.classList.remove('lit'), 180);
      playerSeq.push(i);
      if (playerSeq[playerSeq.length-1] !== sequence[playerSeq.length-1]) {
        // Wrong — reset
        playerSeq = [];
        status.textContent = 'Wrong! Try again…';
        showSequence();
        return;
      }
      if (playerSeq.length === sequence.length) {
        status.textContent = '✓ Complete!';
        setTimeout(() => completeTask(taskId), 400);
      } else {
        status.textContent = `${playerSeq.length}/${sequence.length} correct`;
      }
    };
    grid.appendChild(b);
    return b;
  });

  wrap.appendChild(status);
  wrap.appendChild(grid);
  container.appendChild(wrap);

  function showSequence() {
    showing = true;
    status.textContent = 'Watch carefully…';
    let i = 0;
    const interval = setInterval(() => {
      if (i > 0) btns[sequence[i-1]].classList.remove('lit');
      if (i === sequence.length) { clearInterval(interval); showing = false; status.textContent = 'Your turn!'; return; }
      btns[sequence[i]].classList.add('lit');
      i++;
    }, 700);
  }
  setTimeout(showSequence, 500);
}

// ── HUD ──────────────────────────────────────────────────────
function updateHUD() {
  const me = myPlayer();
  if (!me) return;
  const roleEl = document.getElementById('hud-role');
  if (me.role === 'impostor') {
    roleEl.textContent = '🔪 IMPOSTOR';
    roleEl.style.color = '#ff4444';
  } else {
    roleEl.textContent = '🧑‍🚀 CREWMATE';
    roleEl.style.color = '#44dd44';
  }
  const kills = document.getElementById('hud-kills');
  kills.textContent = me.role === 'impostor' ? '💀 Eliminate crewmates!' : '';
}

function updateTaskBar() {
  const me = myPlayer();
  const pct = gs.tasksTotal > 0 ? (gs.tasksDone / gs.tasksTotal) * 100 : 0;
  document.getElementById('task-bar-fill').style.width = pct + '%';
}

// ── WAITING ROOM RENDER ──────────────────────────────────────
function renderWaitingRoom() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  (gs?.players || []).forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.innerHTML = `<div class="player-dot" style="background:${p.color}"></div>
      <span>${p.name}</span>
      ${i === 0 ? '<span class="host-badge">HOST</span>' : ''}`;
    list.appendChild(chip);
  });
  const count = gs?.players?.length || 0;
  const tip = document.getElementById('wait-tip');
  tip.textContent = count < 2 ? 'Waiting for players… (need 2 minimum)' : `${count} player${count>1?'s':''} ready`;
  if (isHost) {
    document.getElementById('start-btn').style.display = count >= 2 ? '' : 'none';
  }
}

// ── KEYBOARD ─────────────────────────────────────────────────
function setupKeyboard() {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === 'e' || e.key === 'E' || e.key === ' ') && currentScreen === 'screen-game') {
      const me = myPlayer();
      if (!me || !me.alive) return;
      const t = nearbyTask(me);
      if (t) { openTask(t); return; }
      const b = nearbyBody(me);
      if (b) { pressAction('report'); return; }
      if (me.role === 'impostor' && killCooldown <= 0) pressAction('kill');
    }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
}

// ── JOYSTICK ─────────────────────────────────────────────────
function setupJoystick() {
  const zone  = document.getElementById('joystick-zone');
  const base  = document.getElementById('joystick-base');
  const knob  = document.getElementById('joystick-knob');
  const MAX_R = 30;
  let active = false, startX = 0, startY = 0;

  function onStart(cx, cy) {
    active = true; startX = cx; startY = cy;
  }
  function onMove(cx, cy) {
    if (!active) return;
    let dx = cx - startX, dy = cy - startY;
    const d = Math.hypot(dx, dy);
    if (d > MAX_R) { dx = dx/d * MAX_R; dy = dy/d * MAX_R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    joystick.dx = dx / MAX_R;
    joystick.dy = dy / MAX_R;
  }
  function onEnd() {
    active = false;
    knob.style.transform = '';
    joystick.dx = 0; joystick.dy = 0;
  }

  base.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onStart(t.clientX, t.clientY); }, {passive:false});
  window.addEventListener('touchmove', e => { if(active){const t=e.touches[0];onMove(t.clientX,t.clientY);} }, {passive:true});
  window.addEventListener('touchend', () => onEnd());

  base.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => { if(active) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => onEnd());
}

// ── UTILITIES ────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);
  ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r);
  ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function shadeColor(hex, amt) {
  const num = parseInt(hex.replace('#',''), 16);
  const r = clamp((num>>16)+amt,0,255);
  const g = clamp(((num>>8)&0xff)+amt,0,255);
  const b = clamp((num&0xff)+amt,0,255);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
