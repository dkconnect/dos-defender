const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
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

const PLAYER_SPEED = 5;
const PROJECTILE_SPEED = 7;
const ENEMY_MIN_SPEED = 0.5;
const ENEMY_MAX_SPEED_PER_LEVEL = 0.2; // enemy speed increases
const ENEMY_SPAWN_INTERVAL = 1000; 
const ENEMY_SPAWN_DECREASE_PER_LEVEL = 50;

let player;
let enemies = [];
let projectiles = [];
let score = 0;
let lives = 3;
let level = 1;
let enemySpawnTimer = null; 
let lastFrameTime = 0; 

const shootSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
        type: "triangle"
    },
    envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0.01,
        release: 0.05
    }
}).toDestination();

const explosionSynth = new Tone.NoiseSynth({
    noise: {
        type: "white"
    },
    envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.0,
        release: 0.1
    }
}).toDestination();

const gameOverSynth = new Tone.NoiseSynth({
    noise: {
        type: "pink"
    },
    envelope: {
        attack: 0.01,
        decay: 0.8,
        sustain: 0.0,
        release: 0.5
    }
}).toDestination();

const levelUpSynth = new Tone.Synth({
    oscillator: {
        type: "sine"
    },
    envelope: {
        attack: 0.01,
        decay: 0.05,
        sustain: 0.0,
        release: 0.1
    }
}).toDestination();

function playShootSound() {
    if (Tone.context.state === 'running') {
        shootSynth.triggerAttackRelease("C4", "8n");
    }
}

function playExplosionSound() {
    if (Tone.context.state === 'running') {
        explosionSynth.triggerAttackRelease("16n");
    }
}

function playGameOverSound() {
    if (Tone.context.state === 'running') {
        gameOverSynth.triggerAttackRelease("2n");
    }
}

function playLevelUpSound() {
    if (Tone.context.state === 'running') {
        levelUpSynth.triggerAttackRelease("C5", "16n", "+0");
        levelUpSynth.triggerAttackRelease("E5", "16n", "+0.05");
        levelUpSynth.triggerAttackRelease("G5", "16n", "+0.1");
    }
}

document.body.addEventListener('click', () => {
    if (Tone.context.state !== 'running') {
        Tone.start();
        console.log("AudioContext resumed!");
    }
}, { once: true });

class Player {
    constructor() {
        this.width = 40;
        this.height = 20;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 30; 
        this.speed = PLAYER_SPEED;
        this.dx = 0; 
    }

    draw() {
        ctx.fillStyle = '#0F0';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillRect(this.x + this.width / 4, this.y - 10, this.width / 2, 10);
    }

    update(deltaTime) {
        this.x += this.dx * this.speed * deltaTime / (1000 / 60); 

        if (this.x < 0) {
            this.x = 0;
        }
        if (this.x + this.width > canvas.width) {
            this.x = canvas.width - this.width;
        }
    }

    shoot() {
        const projectileX = this.x + this.width / 2 - 2; 
        const projectileY = this.y - 10; 
        projectiles.push(new Projectile(projectileX, projectileY));
        playShootSound();
    }
}

class Projectile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 10;
        this.speed = PROJECTILE_SPEED;
    }

    draw() {
        ctx.fillStyle = '#FF0'; 
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    update(deltaTime) {
        this.y -= this.speed * deltaTime / (1000 / 60); 
    }
}

class Enemy {
    constructor(x, y, type, speed) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.type = type; 
        this.speed = speed;
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
            default:
                ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    update(deltaTime) {
        this.y += this.speed * deltaTime / (1000 / 60); 
    }
}

function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}
