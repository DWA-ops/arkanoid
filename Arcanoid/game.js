const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const cw = canvas.width;
const ch = canvas.height;

// Формат экрана/поля как в макете (arkanoid.svg)
const screenBg = '#DAD5FF';
const field = {
  x: 13.3477,
  y: 64,
  width: 413.305,
  height: 820, // немного уменьшаем снизу, чтобы освободить место под UI
  radius: 40.7,
  bg: '#ffffff',
};

// Спрайты из Figma (SVG)
const sprites = {
  paddle: new Image(),
  ball: new Image(),
  bricks: [new Image(), new Image(), new Image(), new Image(), new Image()],
  pause: new Image(),
  play: new Image(),
  bonuses: {
    SKIDKA_2: new Image(),
    SKIDKA_4: new Image(),
    SKIDKA_5: new Image(),
    SKIDKA_7: new Image(),
  },
  brickWb: new Image(),
  wbDrop: new Image(),
  playAgain: new Image(),
  share: new Image(),
  startScreen: new Image(),
};
sprites.paddle.src = 'paddle.svg';
sprites.startScreen.src = 'main start.svg';
sprites.ball.src = 'assets/ball.svg';
sprites.bricks[0].src = 'assets/brick.svg';
sprites.bricks[1].src = 'assets/brick_b.svg';
sprites.bricks[2].src = 'assets/brick_c.svg';
sprites.bricks[3].src = 'assets/brick_d.svg';
sprites.bricks[4].src = 'assets/brick_e.svg';
sprites.pause.src = 'PAUSE.svg';
sprites.play.src = 'PLAY.svg';
sprites.bonuses.SKIDKA_2.src = 'SKIDKA_2.svg';
sprites.bonuses.SKIDKA_4.src = 'SKIDKA_4.svg';
sprites.bonuses.SKIDKA_5.src = 'SKIDKA_5.svg';
sprites.bonuses.SKIDKA_7.src = 'SKIDKA_7.svg';
sprites.brickWb.src = 'brick_wb.svg';
sprites.wbDrop.src = 'WB.svg';
sprites.playAgain.src = 'PLAY_AGAIN.svg';
sprites.share.src = 'SHARE.svg';

const bonusDefs = {
  SKIDKA_2: { color: '#7D6AFF' },
  SKIDKA_4: { color: '#FE2259' },
  SKIDKA_5: { color: '#08C4A9' },
  SKIDKA_7: { color: '#FE2259' },
};
const bonusKeys = Object.keys(bonusDefs);
const BONUS_CHANCE = 0.12;
const WB_BRICK_CHANCE = 0.03; // редкий бонусный кирпич WB

// Вибрация (Web Vibration API; на iOS не поддерживается)
function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

// Падающие бонусы (WB и т.д.)
const WB_DROP_W = 43;
const WB_DROP_H = 26;
const FALL_SPEED = 3;
const fallingDrops = [];

function spawnWbDrop(brickX, brickY) {
  fallingDrops.push({
    x: brickX + (brickWidth - WB_DROP_W) / 2,
    y: brickY,
    w: WB_DROP_W,
    h: WB_DROP_H,
    type: 'WB',
  });
}

function updateFallingDrops() {
  const paddleY = field.y + field.height - paddleHeight - 10;
  for (let i = fallingDrops.length - 1; i >= 0; i--) {
    const d = fallingDrops[i];
    d.y += FALL_SPEED;
    if (d.y > field.y + field.height) {
      fallingDrops.splice(i, 1);
      continue;
    }
    if (d.type === 'WB') {
      const overlap =
        d.y + d.h >= paddleY &&
        d.y <= paddleY + paddleHeight &&
        d.x + d.w > paddleX &&
        d.x < paddleX + paddleWidth;
      if (overlap) {
        fallingDrops.splice(i, 1);
        vibrate([50, 30, 50]);
        for (let r = 0; r < bricks.length; r++) {
          for (let c = 0; c < brickColumnCount; c++) {
            if (bricks[r][c].status === 1) {
              bricks[r][c].status = 0;
              score++;
            }
          }
        }
      }
    }
  }
}

function drawFallingDrops() {
  for (const d of fallingDrops) {
    if (d.type === 'WB') {
      if (sprites.wbDrop.complete && sprites.wbDrop.naturalWidth > 0) {
        ctx.drawImage(sprites.wbDrop, d.x, d.y, d.w, d.h);
      } else {
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(d.x, d.y, d.w, d.h);
      }
    }
  }
}

const ballState = {
  powered: false,
  color: null,
};
function setBallPowered(color) {
  ballState.powered = true;
  ballState.color = color;
}
function resetBallPower() {
  ballState.powered = false;
  ballState.color = null;
}

let gameStarted = false;
let isPaused = false;
let gameEnded = false;
let finalScore = 0;
const ROW_INTERVAL = 6000;
let lastRowTime = performance.now();

const ui = {
  pauseButton: {
    x: field.x,
    y: field.y + field.height + 4,
    width: 110,
    height: 63,
  },
  // Кнопка Play на стартовом экране (центр картинки main start.svg)
  startPlayButton: {
    x: cw / 2 - 62.5,
    y: ch / 2 - 36,
    w: 125,
    h: 72,
  },
  // Мини-меню по окончании игры (пропорции кнопок PLAY_AGAIN/SHARE 183×95 — не искажаем)
  gameOver: (() => {
    const btnH = 75;
    const btnAspect = 183 / 95;
    const btnW = btnH * btnAspect;
    const rectW = btnW * 2;
    const rectX = (cw - rectW) / 2;
    const rectY = 320;
    const rectH = 260;
    const btnY = rectY + rectH;
    return {
      rect: { x: rectX, y: rectY, w: rectW, h: rectH, radius: 55 },
      btnPlayAgain: { x: rectX, y: btnY, w: btnW, h: btnH, radius: btnH / 2 },
      btnShare: { x: rectX + btnW, y: btnY, w: btnW, h: btnH, radius: btnH / 2 },
    };
  })(),
};

function loadImages(imageList) {
  return Promise.all(
    imageList.map(
      (img) =>
        new Promise((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', () => reject(new Error('Failed to load sprite')), {
            once: true,
          });
        })
    )
  );
}

// Вспомогательная функция для скруглённых прямоугольников
function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawField() {
  ctx.fillStyle = screenBg;
  ctx.fillRect(0, 0, cw, ch);
  drawRoundedRect(field.x, field.y, field.width, field.height, field.radius);
  ctx.fillStyle = field.bg;
  ctx.fill();
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Платформа
const paddleScale = 1 / 1.5;
const paddleHeight = 44 * paddleScale;
const paddleWidth = 185 * paddleScale;
let paddleX = field.x + (field.width - paddleWidth) / 2;

// Мяч
const ballRadius = 16;
let x = field.x + field.width / 2;
let y = field.y + field.height - 120;
let dx = 3.2;
let dy = -3.2;

// Клавиши
let rightPressed = false;
let leftPressed = false;

// Кирпичи
const brickColumnCount = 4;
const brickWidth = 91.4165;
const brickHeight = 42.6611;
const brickPadding = 6;
const brickOffsetTop = field.y + 32;
const brickOffsetLeft =
  field.x +
  (field.width - (brickColumnCount * brickWidth + (brickColumnCount - 1) * brickPadding)) / 2;

let score = 0;
let lives = 3;
const SCORE_LIMIT = 1000; // победа при достижении этого количества очков

let brickSeed = 0;
const initialBrickRows = 8;

function makeBrick() {
  const i = brickSeed++;
  let bonusType = null;
  if (Math.random() < WB_BRICK_CHANCE) {
    bonusType = 'WB';
  } else if (Math.random() < BONUS_CHANCE) {
    bonusType = bonusKeys[Math.floor(Math.random() * bonusKeys.length)];
  }
  return {
    x: 0,
    y: 0,
    status: 1,
    bonusType,
    spriteIndex: i % sprites.bricks.length,
    hue: (i * 37) % 360, // чтобы каждый отличался
    flipX: (i % 2) ? -1 : 1,
  };
}

// bricks[r][c]
const bricks = [];
for (let r = 0; r < initialBrickRows; r++) {
  const row = [];
  for (let c = 0; c < brickColumnCount; c++) row.push(makeBrick());
  bricks.push(row);
}

function addBrickRow() {
  const paddleY = field.y + field.height - paddleHeight - 10;
  const rowHeight = brickHeight + brickPadding;
  const bottomYIfAdded = brickOffsetTop + bricks.length * rowHeight + brickHeight;

  // Если новый ряд залезет в зону платформы — убираем один нижний ряд, затем добавляем сверху (новые ряды не прекращаются)
  if (bottomYIfAdded >= paddleY && bricks.length > 0) {
    bricks.pop();
  }

  const row = [];
  for (let c = 0; c < brickColumnCount; c++) row.push(makeBrick());
  bricks.unshift(row);
}

// Управление с клавиатуры
document.addEventListener('keydown', keyDownHandler);
document.addEventListener('keyup', keyUpHandler);

function keyDownHandler(e) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = true;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = true;
  }
}

function keyUpHandler(e) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = false;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = false;
  }
}

// Управление тачем (телефон), только после старта игры
canvas.addEventListener(
  'touchmove',
  (e) => {
    if (!gameStarted) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const relativeX = (touch.clientX - rect.left) * (cw / rect.width);
    paddleX = clamp(relativeX - paddleWidth / 2, field.x, field.x + field.width - paddleWidth);
    e.preventDefault();
  },
  { passive: false }
);

// Управление мышью: платформа следует за курсором по горизонтали (только после старта игры)
canvas.addEventListener('mousemove', (e) => {
  if (!gameStarted) return;
  const rect = canvas.getBoundingClientRect();
  const canvasX = (e.clientX - rect.left) * (cw / rect.width);
  paddleX = clamp(canvasX - paddleWidth / 2, field.x, field.x + field.width - paddleWidth);
});

function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches[0]) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    };
  }
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function handlePauseToggle(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  const cx = (clientX - rect.left) * (cw / rect.width);
  const cy = (clientY - rect.top) * (ch / rect.height);

  if (!gameStarted) {
    if (hitTestButton(ui.startPlayButton, cx, cy)) {
      gameStarted = true;
      vibrate(20);
      e.preventDefault?.();
    }
    return;
  }

  if (gameEnded) {
    if (hitTestButton(ui.gameOver.btnPlayAgain, cx, cy)) {
      document.location.reload();
      e.preventDefault?.();
      return;
    }
    if (hitTestButton(ui.gameOver.btnShare, cx, cy)) {
      shareResult();
      e.preventDefault?.();
      return;
    }
    return;
  }

  const b = ui.pauseButton;
  if (hitTestButton(b, cx, cy)) {
    isPaused = !isPaused;
    e.preventDefault?.();
  }
}

canvas.addEventListener('click', handlePauseToggle);
canvas.addEventListener('touchstart', handlePauseToggle);

function collisionDetection() {
  for (let r = 0; r < bricks.length; r++) {
    for (let c = 0; c < brickColumnCount; c++) {
      const b = bricks[r][c];
      if (b.status !== 1) continue;
      // Учитываем радиус мяча
      const hit =
        x + ballRadius > b.x &&
        x - ballRadius < b.x + brickWidth &&
        y + ballRadius > b.y &&
        y - ballRadius < b.y + brickHeight;
      if (!hit) continue;

      b.status = 0;
      score++;
      vibrate(12);

      // Редкий кирпич WB: выпадает падающий бонус, поймать платформой — все кирпичи сгорают
      if (b.bonusType === 'WB') {
        const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
        const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
        spawnWbDrop(brickX, brickY);
        if (!ballState.powered) dy = -dy;
        continue;
      }

      // Бонусный блок: красим мяч и включаем "пробивание" до границы поля
      if (b.bonusType && bonusDefs[b.bonusType]) {
        setBallPowered(bonusDefs[b.bonusType].color);
        // не меняем направление — мяч должен пролетать дальше
        continue;
      }

      // Обычный блок: если мяч пробивной — не отскакиваем
      if (!ballState.powered) {
        dy = -dy;
      }
    }
  }
}

function drawBall() {
  const d = ballRadius * 2;
  if (ballState.powered && ballState.color) {
    ctx.beginPath();
    ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = ballState.color;
    ctx.fill();
    ctx.closePath();
    return;
  }
  if (sprites.ball.complete && sprites.ball.naturalWidth > 0) {
    ctx.drawImage(sprites.ball, x - ballRadius, y - ballRadius, d, d);
    return;
  }

  // фолбэк, если картинка ещё не успела загрузиться
  ctx.beginPath();
  ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#0f0';
  ctx.fill();
  ctx.closePath();
}

// Скруглённая платформа (почти как border-radius: 100%)
function drawPaddle() {
  const paddleY = field.y + field.height - paddleHeight - 10;
  if (sprites.paddle.complete && sprites.paddle.naturalWidth > 0) {
    ctx.drawImage(sprites.paddle, paddleX, paddleY, paddleWidth, paddleHeight);
    return;
  }

  // фолбэк
  const radius = paddleHeight / 2;
  drawRoundedRect(paddleX, paddleY, paddleWidth, paddleHeight, radius);
  ctx.fillStyle = '#09f';
  ctx.fill();
}

// Скруглённые кирпичи (капсулы)
function drawBricks() {
  for (let r = 0; r < bricks.length; r++) {
    for (let c = 0; c < brickColumnCount; c++) {
      const b = bricks[r][c];
      if (b.status !== 1) continue;

      const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
      const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
      b.x = brickX;
      b.y = brickY;

      const img =
        b.bonusType === 'WB'
          ? sprites.brickWb
          : b.bonusType
            ? sprites.bonuses[b.bonusType]
            : sprites.bricks[b.spriteIndex];
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        if (!b.bonusType && !isPaused) {
          ctx.filter = `hue-rotate(${b.hue}deg)`;
          // флип по X вокруг центра кирпича
          if (b.flipX === -1) {
            ctx.translate(brickX + brickWidth / 2, 0);
            ctx.scale(-1, 1);
            ctx.translate(-(brickX + brickWidth / 2), 0);
          }
        }
        ctx.drawImage(img, brickX, brickY, brickWidth, brickHeight);
        ctx.restore();
      } else {
        // фолбэк
        const radius = brickHeight / 2;
        drawRoundedRect(brickX, brickY, brickWidth, brickHeight, radius);
        ctx.fillStyle = '#f90';
        ctx.fill();
      }
    }
  }
}

function drawScore() {
  ctx.font = 'italic 900 28px "Sofia Sans Extra Condensed", system-ui, sans-serif';
  ctx.fillStyle = '#7D6AFF';
  ctx.textAlign = 'left';
  ctx.fillText('ОЧКИ: ' + score, field.x + 16, field.y - 16);
}

function drawLives() {
  ctx.font = 'italic 900 28px "Sofia Sans Extra Condensed", system-ui, sans-serif';
  ctx.fillStyle = '#7D6AFF';
  ctx.textAlign = 'right';
  ctx.fillText('ЖИЗНИ: ' + lives, field.x + field.width - 16, field.y - 16);
  ctx.textAlign = 'left';
}

function drawPauseButton() {
  const b = ui.pauseButton;
  const img = isPaused ? sprites.play : sprites.pause;
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.drawImage(img, b.x, b.y, b.width, b.height);
  ctx.restore();
}

function drawStartScreen() {
  ctx.filter = 'none';
  if (sprites.startScreen.complete && sprites.startScreen.naturalWidth > 0) {
    ctx.drawImage(sprites.startScreen, 0, 0, cw, ch);
  } else {
    ctx.fillStyle = '#7D6AFF';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Загрузка…', cw / 2, ch / 2);
    ctx.textAlign = 'left';
  }
}

function drawGameOverMenu() {
  ctx.save();
  ctx.filter = 'none';

  const r = ui.gameOver.rect;
  const btn1 = ui.gameOver.btnPlayAgain;
  const btn2 = ui.gameOver.btnShare;

  // Прямоугольник по центру, скругление 55, цвет #DAD5FF
  drawRoundedRect(r.x, r.y, r.w, r.h, r.radius);
  ctx.fillStyle = '#DAD5FF';
  ctx.fill();

  // Две строки: "КЛАСС" и "ВЫ НАБРАЛИ:" — блок текста выше; расстояние до цифр уменьшено в 2 раза
  ctx.font = 'italic 900 40px "Sofia Sans Extra Condensed", system-ui, sans-serif';
  ctx.fillStyle = '#7D6AFF';
  ctx.textAlign = 'center';
  const cx = r.x + r.w / 2;
  ctx.fillText('КЛАСС', cx, r.y + 72);
  ctx.fillText('ВЫ НАБРАЛИ:', cx, r.y + 115);

  // Очки — размер 120, белый
  ctx.font = 'italic 900 120px "Sofia Sans Extra Condensed", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(finalScore), r.x + r.w / 2, r.y + 218);
  ctx.textAlign = 'left';

  // Кнопка «Играть ещё» — PLAY_AGAIN.svg
  if (sprites.playAgain.complete && sprites.playAgain.naturalWidth > 0) {
    ctx.drawImage(sprites.playAgain, btn1.x, btn1.y, btn1.w, btn1.h);
  } else {
    drawRoundedRect(btn1.x, btn1.y, btn1.w, btn1.h, btn1.radius);
    ctx.fillStyle = '#08C4A9';
    ctx.fill();
    ctx.font = 'italic 900 20px "Sofia Sans Extra Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('ИГРАТЬ', btn1.x + btn1.w / 2, btn1.y + btn1.h / 2 - 4);
    ctx.fillText('ЕЩЁ', btn1.x + btn1.w / 2, btn1.y + btn1.h / 2 + 14);
    ctx.textAlign = 'left';
  }

  // Кнопка «Поделись» — SHARE.svg
  if (sprites.share.complete && sprites.share.naturalWidth > 0) {
    ctx.drawImage(sprites.share, btn2.x, btn2.y, btn2.w, btn2.h);
  } else {
    drawRoundedRect(btn2.x, btn2.y, btn2.w, btn2.h, btn2.radius);
    ctx.fillStyle = '#7D6AFF';
    ctx.fill();
    ctx.font = 'italic 900 20px "Sofia Sans Extra Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('ПОДЕЛИСЬ', btn2.x + btn2.w / 2, btn2.y + btn2.h / 2 - 4);
    ctx.fillText('РЕЗУЛЬТАТОМ', btn2.x + btn2.w / 2, btn2.y + btn2.h / 2 + 14);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function hitTestButton(btn, px, py) {
  const w = btn.w ?? btn.width;
  const h = btn.h ?? btn.height;
  return px >= btn.x && px <= btn.x + w && py >= btn.y && py <= btn.y + h;
}

function shareResult() {
  canvas.toBlob(
    (blob) => {
      const file = new File([blob], 'arkanoid-result.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'Arkanoid',
          text: 'Набрал ' + finalScore + ' очков!',
        }).catch(() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'arkanoid-result.png';
          a.click();
          URL.revokeObjectURL(a.href);
        });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'arkanoid-result.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    },
    'image/png'
  );
}

function draw() {
  if (!gameStarted) {
    drawStartScreen();
    requestAnimationFrame(draw);
    return;
  }

  // Глобальный фильтр для паузы и экрана окончания игры
  ctx.filter = isPaused || gameEnded ? 'grayscale(1)' : 'none';

  drawField();

  // Всё игровое рисуем и считаем внутри поля
  ctx.save();
  drawRoundedRect(field.x, field.y, field.width, field.height, field.radius);
  ctx.clip();

  drawBricks();
  drawBall();
  drawPaddle();
  drawFallingDrops();

  const now = performance.now();

  if (!isPaused && !gameEnded) {
    collisionDetection();

    // Отскок от стен (с коррекцией позиции, чтобы не "залипать" в стену)
    if (x + dx > field.x + field.width - ballRadius) {
      if (ballState.powered) resetBallPower();
      dx = -dx;
      x = field.x + field.width - ballRadius;
    } else if (x + dx < field.x + ballRadius) {
      if (ballState.powered) resetBallPower();
      dx = -dx;
      x = field.x + ballRadius;
    }

    if (y + dy < field.y + ballRadius) {
      if (ballState.powered) resetBallPower();
      dy = -dy;
      y = field.y + ballRadius;
    } else if (dy > 0) {
      // Столкновение с платформой: отражаем и ставим мяч ровно над ней,
      // чтобы визуально он не "уходил внутрь" paddle.svg.
      const paddleY = field.y + field.height - paddleHeight - 10;
      const nextBottom = y + ballRadius + dy;
      const currBottom = y + ballRadius;

      const crossesPaddleTop = currBottom <= paddleY && nextBottom >= paddleY;
      const withinPaddleX = x >= paddleX && x <= paddleX + paddleWidth;

      if (crossesPaddleTop && withinPaddleX) {
        dy = -Math.abs(dy);
        y = paddleY - ballRadius;
        vibrate(15);
      } else if (y + ballRadius + dy > field.y + field.height) {
        // Упал вниз
        lives--;
        vibrate([100, 60, 100]);
        if (!lives) {
          gameEnded = true;
          finalScore = score;
        } else {
          x = field.x + field.width / 2;
          y = field.y + field.height - 120;
          dx = 3.2;
          dy = -3.2;
          paddleX = field.x + (field.width - paddleWidth) / 2;
        }
      }
    }

    // Движение платформы
    const paddleSpeed = 8;
    if (rightPressed) {
      paddleX += paddleSpeed;
      if (paddleX + paddleWidth > field.x + field.width)
        paddleX = field.x + field.width - paddleWidth;
    } else if (leftPressed) {
      paddleX -= paddleSpeed;
      if (paddleX < field.x) paddleX = field.x;
    }

    x += dx;
    y += dy;

    updateFallingDrops();

    // Добавление ряда: сразу, если игрок убрал все видимые кирпичи, иначе по таймеру (6 сек)
    const noBricksLeft = !bricks.some((row) => row.some((b) => b.status === 1));
    if (noBricksLeft || now - lastRowTime >= ROW_INTERVAL) {
      addBrickRow();
      lastRowTime = now;
    }

    // Победа при наборе лимита очков
    if (score >= SCORE_LIMIT) {
      gameEnded = true;
      finalScore = score;
      vibrate([80, 40, 80, 40, 150]);
    }
  }

  ctx.restore();

  if (gameEnded) {
    drawGameOverMenu();
  } else {
    drawScore();
    drawLives();
    drawPauseButton();
  }

  requestAnimationFrame(draw);
}

loadImages([
  sprites.paddle,
  sprites.ball,
  ...sprites.bricks,
  sprites.pause,
  sprites.play,
  sprites.brickWb,
  sprites.wbDrop,
  sprites.playAgain,
  sprites.share,
  sprites.startScreen,
  ...Object.values(sprites.bonuses),
])
  .catch(() => {
    // если не загрузились — игра всё равно будет работать на фолбэках
  })
  .finally(() => {
    draw();
  });