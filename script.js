const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED', 
    GAME_OVER: 'GAME_OVER',
    LEVEL_COMPLETE: 'LEVEL_COMPLETE'
};
let gameState = GameState.MENU;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');
const startButton = document.getElementById('startButton');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const levelDisplay = document.getElementById('levelDisplay');
const powerupIndicator = document.getElementById('powerupIndicator');

const PLAYER_SPEED = 5;
const PROJECTILE_SPEED = 7;
const ENEMY_MIN_SPEED = 0.5;
const ENEMY_MAX_SPEED_PER_LEVEL = 0.2;
const ENEMY_SPAWN_INTERVAL = 1000;
const ENEMY_SPAWN_DECREASE_PER_LEVEL = 50;
const RAPID_FIRE_DURATION = 5000; 
const SHIELD_DURATION = 7000; 
const ENEMY_SHOOT_CHANCE = 0.02; 
const ENEMY_PROJECTILE_SPEED = 4;
const POWERUP_DROP_CHANCE = 0.15; 
const MAX_ENEMIES_ON_SCREEN = 15; 

let player;
let enemies = [];
let projectiles = []; 
let enemyProjectiles = []; 
let powerUps = [];
let particles = [];

let score = 0;
let lives = 3;
let level = 1;
let highScore = parseInt(localStorage.getItem('dosDefenderHighScore') || '0');
let enemySpawnTimer = null;
let lastFrameTime = 0;
let totalEnemiesToSpawn = 0;
let enemiesSpawnedCount = 0;

let isRapidFire = false;
let rapidFireStartTime = 0;
let rapidFireTimer = null;
let isShielded = false;
let shieldStartTime = 0;
let shieldTimer = null;

const shootSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.01, release: 0.05 }
}).toDestination();

const enemyShootSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0.01, release: 0.02 }
}).toDestination();

const explosionSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.0, release: 0.1 }
}).toDestination();

const gameOverSynth = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0.0, release: 0.5 }
}).toDestination();

const levelUpSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.05, sustain: 0.0, release: 0.1 }
}).toDestination();

const powerupCollectSynth = new Tone.MembraneSynth().toDestination();

function playShootSound() { if (Tone.context.state === 'running') shootSynth.triggerAttackRelease("C4", "8n"); }
function playEnemyShootSound() { if (Tone.context.state === 'running') enemyShootSynth.triggerAttackRelease("C3", "16n"); }
function playExplosionSound() { if (Tone.context.state === 'running') explosionSynth.triggerAttackRelease("16n"); }
function playGameOverSound() { if (Tone.context.state === 'running') gameOverSynth.triggerAttackRelease("2n"); }
function playLevelUpSound() { if (Tone.context.state === 'running') { levelUpSynth.triggerAttackRelease("C5", "16n", "+0"); levelUpSynth.triggerAttackRelease("E5", "16n", "+0.05"); levelUpSynth.triggerAttackRelease("G5", "16n", "+0.1"); }}
function playPowerupCollectSound() { if (Tone.context.state === 'running') powerupCollectSynth.triggerAttackRelease("C6", "8n"); }

document.body.addEventListener('click', () => {
    if (Tone.context.state !== 'running') { Tone.start(); }
}, { once: true });

class Player {
    constructor() {
        this.width = 40;
        this.height = 20;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 30;
        this.speed = PLAYER_SPEED;
        this.dx = 0;
        this.isFlashing = false;
        this.flashTimeout = null;
        this.lastShotTime = 0;
        this.fireRate = 200;
    }

    draw() {
        if (this.isFlashing && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.fillStyle = '#FF0';
        } else if (isShielded) {
            ctx.fillStyle = '#0FF';
        } else {
            ctx.fillStyle = '#0F0';
        }

        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillRect(this.x + this.width / 4, this.y - 10, this.width / 2, 10);
    }

    update(deltaTime) {
        this.x += this.dx * this.speed * deltaTime / (1000 / 60);

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
    }

    shoot() {
        const currentTime = Date.now();
        let currentFireRate = isRapidFire ? this.fireRate / 2 : this.fireRate;

        if (currentTime - this.lastShotTime > currentFireRate) {
            const projectileX = this.x + this.width / 2 - 2;
            const projectileY = this.y - 10;
            projectiles.push(new Projectile(projectileX, projectileY, PROJECTILE_SPEED, 'player'));
            playShootSound();
            this.lastShotTime = currentTime;
        }
    }

    flash() {
        this.isFlashing = true;
        if (this.flashTimeout) clearTimeout(this.flashTimeout);
        this.flashTimeout = setTimeout(() => {
            this.isFlashing = false;
        }, 200);
    }
}

class Projectile {
    constructor(x, y, speed, owner) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 10;
        this.speed = speed;
        this.owner = owner;
    }

    draw() {
        ctx.fillStyle = (this.owner === 'player') ? '#FF0' : '#F00';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    update(deltaTime) {
        if (this.owner === 'player') {
            this.y -= this.speed * deltaTime / (1000 / 60);
        } else {
            this.y += this.speed * deltaTime / (1000 / 60);
        }
    }
}

class Enemy {
    constructor(x, y, type, speed, isShooter = false) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.type = type;
        this.speed = speed;
        this.isShooter = isShooter;
        this.lastShotTime = Date.now();
        this.fireRate = 1500 + Math.random() * 1000;
        this.dx = (Math.random() < 0.5) ? -1 : 1;
        const movementRoll = Math.random();
        if (movementRoll < 0.4) {
            this.movementType = 'horizontal';
        } else if (movementRoll < 0.6) {
            this.movementType = 'sine';
            this.amplitude = Math.random() * 50 + 20;
            this.frequency = Math.random() * 0.05 + 0.01;
            this.initialX = x;
        } else {
            this.movementType = 'vertical';
        }
    }

    draw() {
        ctx.fillStyle = '#0F0';
        ctx.strokeStyle = '#0F0';
        ctx.lineWidth = 2;

        switch (this.type) {
            case 'square':
                ctx.fillRect(this.x, this.y, this.width, this.height);
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(this.x + this.width / 2, this.y);
                ctx.lineTo(this.x, this.y + this.height);
                ctx.lineTo(this.x + this.width, this.y + this.height);
                ctx.closePath();
                ctx.fill();
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(this.x + this.width / 2, this.y);
                ctx.lineTo(this.x + this.width, this.y + this.height / 2);
                ctx.lineTo(this.x + this.width / 2, this.y + this.height);
                ctx.lineTo(this.x, this.y + this.height / 2);
                ctx.closePath();
                ctx.fill();
                break;
        }
        if (this.isShooter) {
            ctx.fillStyle = '#F00';
            ctx.fillRect(this.x + this.width / 2 - 2, this.y + this.height - 5, 4, 4);
        }
    }

    update(deltaTime) {
        this.y += this.speed * deltaTime / (1000 / 60);

        if (this.movementType === 'horizontal') {
            this.x += this.dx * (this.speed / 2) * deltaTime / (1000 / 60);
            if (this.x < 0 || this.x + this.width > canvas.width) {
                this.dx *= -1;
            }
        } else if (this.movementType === 'sine') {
            this.x = this.initialX + this.amplitude * Math.sin(this.y * this.frequency);
        }

        if (this.isShooter) {
            this.maybeShoot();
        }
    }

    maybeShoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime > this.fireRate) {
            enemyProjectiles.push(new Projectile(this.x + this.width / 2 - 2, this.y + this.height + 5, ENEMY_PROJECTILE_SPEED, 'enemy'));
            playEnemyShootSound();
            this.lastShotTime = currentTime;
        }
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.type = type;
        this.speed = 2;
    }

    draw() {
        ctx.fillStyle = (this.type === 'rapid_fire') ? '#0FF' : '#FF00FF';
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.width, this.height);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = '12px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.type === 'rapid_fire') {
            ctx.fillText('RF', this.x + this.width / 2, this.y + this.height / 2 + 2);
        } else if (this.type === 'shield') {
            ctx.fillText('SH', this.x + this.width / 2, this.y + this.height / 2 + 2);
        }
    }

    update(deltaTime) {
        this.y += this.speed * deltaTime / (1000 / 60);
    }
}

class Particle {
    constructor(x, y, color, dx, dy, size, decay) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.dx = dx;
        this.dy = dy;
        this.size = size;
        this.decay = decay;
        this.alpha = 1;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }

    update(deltaTime) {
        this.x += this.dx * deltaTime / (1000 / 60);
        this.y += this.dy * deltaTime / (1000 / 60);
        this.size -= this.decay * deltaTime / (1000 / 60);
        this.alpha -= 0.02 * deltaTime / (1000 / 60);

        return this.size > 0 && this.alpha > 0;
    }
}

let stars = [];
const NUM_STARS = 100;
function initStars() {
    stars = [];
    for (let i = 0; i < NUM_STARS; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 1,
            speed: Math.random() * 0.5 + 0.1
        });
    }
}

function drawStars(deltaTime) {
    ctx.fillStyle = '#050';
    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        ctx.fillRect(star.x, star.y, star.size, star.size);
        star.y += star.speed * deltaTime / (1000 / 60);
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    }
}

function createExplosion(x, y, color = '#0F0', numParticles = 10) {
    for (let i = 0; i < numParticles; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;
        const size = Math.random() * 4 + 2;
        const decay = 0.05;
        particles.push(new Particle(x, y, color, dx, dy, size, decay));
    }
}

function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function spawnEnemy() {
    if (gameState !== GameState.PLAYING || enemiesSpawnedCount >= totalEnemiesToSpawn || enemies.length >= MAX_ENEMIES_ON_SCREEN) {
        if (enemySpawnTimer) {
            clearInterval(enemySpawnTimer);
            enemySpawnTimer = null;
        }
        return;
    }

    const enemyTypes = ['square', 'triangle', 'diamond'];
    const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    const randomX = Math.random() * (canvas.width - 30);
    const enemySpeed = ENEMY_MIN_SPEED + (level - 1) * ENEMY_MAX_SPEED_PER_LEVEL;
    const isShooter = Math.random() < ENEMY_SHOOT_CHANCE + (level * 0.005);

    enemies.push(new Enemy(randomX, -30, randomType, enemySpeed, isShooter));
    enemiesSpawnedCount++;
}

function updateHUD() {
    scoreDisplay.textContent = `SCORE: ${String(score).padStart(5, '0')}`;
    livesDisplay.textContent = `LIVES: ${'#'.repeat(lives)}`;
    levelDisplay.textContent = `LEVEL: ${level}`;

    const currentTime = Date.now();
    let indicatorText = '';
    let indicatorColor = '#0F0';
    let displayIndicator = false;

    if (isRapidFire) {
        const remainingTime = Math.max(0, Math.ceil((rapidFireStartTime + RAPID_FIRE_DURATION - currentTime) / 1000));
        indicatorText = `RAPID FIRE: ${remainingTime}s`;
        indicatorColor = '#0FF';
        displayIndicator = true;
    } else if (isShielded) {
        const remainingTime = Math.max(0, Math.ceil((shieldStartTime + SHIELD_DURATION - currentTime) / 1000));
        indicatorText = `SHIELD: ${remainingTime}s`;
        indicatorColor = '#FF00FF';
        displayIndicator = true;
    }

    powerupIndicator.textContent = indicatorText;
    powerupIndicator.style.color = indicatorColor;
    powerupIndicator.style.display = displayIndicator ? 'block' : 'none';
}

function initGame() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    player = new Player();
    enemies = [];
    projectiles = [];
    enemyProjectiles = [];
    powerUps = [];
    particles = [];
    score = 0;
    lives = 3;
    level = 1;
    totalEnemiesToSpawn = 0;
    enemiesSpawnedCount = 0;
    isRapidFire = false;
    isShielded = false;
    if (rapidFireTimer) clearTimeout(rapidFireTimer);
    if (shieldTimer) clearTimeout(shieldTimer);
    updateHUD();
    initStars();

    if (enemySpawnTimer) {
        clearInterval(enemySpawnTimer);
        enemySpawnTimer = null;
    }
    highScore = parseInt(localStorage.getItem('dosDefenderHighScore') || '0');
    gameState = GameState.MENU;
    showOverlay(GameState.MENU);
}

function startGame() {
    gameState = GameState.PLAYING;
    hideOverlay();
    setupLevel();
    gameLoop(0);
}

function setupLevel() {
    enemies = [];
    projectiles = [];
    enemyProjectiles = [];
    powerUps = [];
    particles = [];
    player.x = canvas.width / 2 - player.width / 2;
    updateHUD();

    totalEnemiesToSpawn = 5 + (level * 3);
    enemiesSpawnedCount = 0;

    let currentSpawnInterval = Math.max(200, ENEMY_SPAWN_INTERVAL - (level - 1) * ENEMY_SPAWN_DECREASE_PER_LEVEL);
    if (enemySpawnTimer) {
        clearInterval(enemySpawnTimer);
    }
    enemySpawnTimer = setInterval(spawnEnemy, currentSpawnInterval);
}

function gameOver() {
    gameState = GameState.GAME_OVER;
    if (enemySpawnTimer) {
        clearInterval(enemySpawnTimer);
        enemySpawnTimer = null;
    }
    if (rapidFireTimer) clearTimeout(rapidFireTimer);
    if (shieldTimer) clearTimeout(shieldTimer);
    isRapidFire = false;
    isShielded = false;
    updateHUD();
    playGameOverSound();

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('dosDefenderHighScore', highScore.toString());
    }
    showOverlay(GameState.GAME_OVER);
}

function levelComplete() {
    gameState = GameState.LEVEL_COMPLETE;
    if (enemySpawnTimer) {
        clearInterval(enemySpawnTimer);
        enemySpawnTimer = null;
    }
    if (rapidFireTimer) clearTimeout(rapidFireTimer);
    if (shieldTimer) clearTimeout(shieldTimer);
    isRapidFire = false;
    isShielded = false;
    updateHUD();
    playLevelUpSound();
    overlayTitle.textContent = `LEVEL ${level} COMPLETE!`;
    overlayMessage.innerHTML = `Great job, Defender!<br>Prepare for Level ${level + 1}.`;
    startButton.textContent = `CONTINUE`;
    startButton.onclick = () => {
        level++;
        startGame();
    };
    gameOverlay.style.display = 'flex';
}

function activateRapidFire() {
    if (rapidFireTimer) clearTimeout(rapidFireTimer);
    isRapidFire = true;
    rapidFireStartTime = Date.now();
    playPowerupCollectSound();
    updateHUD();
    rapidFireTimer = setTimeout(() => {
        isRapidFire = false;
        rapidFireTimer = null;
        rapidFireStartTime = 0;
        updateHUD();
    }, RAPID_FIRE_DURATION);
}

function activateShield() {
    if (shieldTimer) clearTimeout(shieldTimer);
    isShielded = true;
    shieldStartTime = Date.now();
    playPowerupCollectSound();
    updateHUD();
    shieldTimer = setTimeout(() => {
        isShielded = false;
        shieldTimer = null;
        shieldStartTime = 0;
        updateHUD();
    }, SHIELD_DURATION);
}

function togglePause() {
    if (gameState === GameState.PLAYING) {
        gameState = GameState.PAUSED;
        showOverlay(GameState.PAUSED);
        if (enemySpawnTimer) {
            clearInterval(enemySpawnTimer);
        }
    } else if (gameState === GameState.PAUSED) {
        gameState = GameState.PLAYING;
        hideOverlay();
        let currentSpawnInterval = Math.max(200, ENEMY_SPAWN_INTERVAL - (level - 1) * ENEMY_SPAWN_DECREASE_PER_LEVEL);
        enemySpawnTimer = setInterval(spawnEnemy, currentSpawnInterval);
        gameLoop(0);
    }
}

function showOverlay(state) {
    gameOverlay.style.display = 'flex';
    if (state === GameState.MENU) {
        overlayTitle.textContent = 'DOS DEFENDER';
        overlayMessage.innerHTML = `HIGH SCORE: ${String(highScore).padStart(5, '0')}<br>Press START to begin, or ARROW keys to move, SPACEBAR to fire. Press 'P' to pause.`;
        startButton.textContent = 'START GAME';
        startButton.onclick = startGame;
    } else if (state === GameState.GAME_OVER) {
        overlayTitle.textContent = 'GAME OVER!';
        overlayMessage.innerHTML = `Your score: ${score}<br>HIGH SCORE: ${String(highScore).padStart(5, '0')}<br>The system has crashed.`;
        startButton.textContent = 'RESTART';
        startButton.onclick = initGame;
    } else if (state === GameState.PAUSED) {
        overlayTitle.textContent = 'PAUSED';
        overlayMessage.innerHTML = 'Press P to resume.';
        startButton.style.display = 'none';
    }
    if (state !== GameState.PAUSED) {
        startButton.style.display = 'block';
    }
}

function hideOverlay() {
    gameOverlay.style.display = 'none';
}

function gameLoop(currentTime) {
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    if (gameState === GameState.PLAYING) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawStars(deltaTime);

        player.update(deltaTime);
        player.draw();

        projectiles = projectiles.filter(p => {
            p.update(deltaTime);
            p.draw();
            return p.y > -p.height;
        });

        enemyProjectiles = enemyProjectiles.filter(ep => {
            ep.update(deltaTime);
            ep.draw();

            if (checkCollision(player, ep)) {
                createExplosion(ep.x + ep.width / 2, ep.y + ep.height / 2, '#F00', 10);
                if (isShielded) {
                    playPowerupCollectSound();
                    isShielded = false;
                    if (shieldTimer) clearTimeout(shieldTimer);
                    shieldTimer = null;
                    shieldStartTime = 0;
                    player.flash();
                    updateHUD();
                } else {
                    playExplosionSound();
                    lives--;
                    player.flash();
                    updateHUD();
                    if (lives <= 0) {
                        gameOver();
                    }
                }
                return false;
            }
            return ep.y < canvas.height;
        });

        powerUps = powerUps.filter(pu => {
            pu.update(deltaTime);
            pu.draw();

            if (checkCollision(player, pu)) {
                if (pu.type === 'rapid_fire') {
                    activateRapidFire();
                } else if (pu.type === 'shield') {
                    activateShield();
                }
                return false;
            }
            return pu.y < canvas.height;
        });

        particles = particles.filter(p => {
            p.draw();
            return p.update(deltaTime);
        });

        enemies = enemies.filter(enemy => {
            enemy.update(deltaTime);
            enemy.draw();

            if (checkCollision(player, enemy)) {
                createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#0F0', 15);
                if (isShielded) {
                    playPowerupCollectSound();
                    isShielded = false;
                    if (shieldTimer) clearTimeout(shieldTimer);
                    shieldTimer = null;
                    shieldStartTime = 0;
                    player.flash();
                    updateHUD();
                } else {
                    playExplosionSound();
                    lives--;
                    player.flash();
                    updateHUD();
                    if (lives <= 0) {
                        gameOver();
                    }
                }
                return false;
            }

            for (let i = 0; i < projectiles.length; i++) {
                if (checkCollision(projectiles[i], enemy)) {
                    createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FF0', 15);
                    playExplosionSound();
                    score += 100;
                    updateHUD();
                    projectiles.splice(i, 1);

                    if (Math.random() < POWERUP_DROP_CHANCE) {
                        const powerUpTypes = ['rapid_fire', 'shield'];
                        const randomPowerUpType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
                        powerUps.push(new PowerUp(enemy.x + enemy.width / 2 - 10, enemy.y + enemy.height / 2 - 10, randomPowerUpType));
                    }
                    return false;
                }
            }
            return enemy.y < canvas.height;
        });

        if (enemiesSpawnedCount >= totalEnemiesToSpawn && enemies.length === 0 && enemySpawnTimer === null) {
            levelComplete();
        }
    }

    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
        requestAnimationFrame(gameLoop);
    }
}

const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (e.key === 'p' || e.key === 'P') {
        togglePause();
        return;
    }

    if (gameState === GameState.PLAYING) {
        if (e.key === 'ArrowLeft') {
            keys.ArrowLeft = true;
            player.dx = -1;
        } else if (e.key === 'ArrowRight') {
            keys.ArrowRight = true;
            player.dx = 1;
        } else if (e.key === ' ') {
            player.shoot();
            keys.Space = true;
        }
    } else if (gameState === GameState.MENU || gameState === GameState.GAME_OVER || gameState === GameState.LEVEL_COMPLETE) {
        if (e.key === 'Enter') {
            startButton.click();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (gameState === GameState.PLAYING) {
        if (e.key === 'ArrowLeft') {
            keys.ArrowLeft = false;
            player.dx = keys.ArrowRight ? 1 : 0;
        } else if (e.key === 'ArrowRight') {
            keys.ArrowRight = false;
            player.dx = keys.ArrowLeft ? -1 : 0;
        } else if (e.key === ' ') {
            keys.Space = false;
        }
    }
});

window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    if (player) {
        player.x = canvas.width / 2 - player.width / 2;
        player.y = canvas.height - player.height - 30;
    }
    initStars();
    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawStars(0);
        player.draw();
        enemies.forEach(e => e.draw());
        projectiles.forEach(p => p.draw());
        enemyProjectiles.forEach(ep => ep.draw());
        powerUps.forEach(pu => pu.draw());
        particles.forEach(pa => pa.draw());
    }
});

window.onload = () => {
    initGame();
};
