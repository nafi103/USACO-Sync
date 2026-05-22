const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const ICON_SIZES = [16, 32, 48, 128];
const CRC_TABLE = createCrcTable();

fs.mkdirSync(ASSETS_DIR, { recursive: true });

for (const size of ICON_SIZES) {
  const rgba = renderIcon(size);
  const png = encodePng(size, size, rgba);
  fs.writeFileSync(path.join(ASSETS_DIR, `icon-${size}.png`), png);
}

console.log(`Generated ${ICON_SIZES.map((size) => `assets/icon-${size}.png`).join(", ")}`);

function renderIcon(size) {
  const scale = 4;
  const width = size * scale;
  const high = new Uint8ClampedArray(width * width * 4);

  drawRoundedGradient(high, width);
  drawArc(high, width, 0.5, 0.5, 0.285, degrees(205), degrees(335), 0.066, hex("#e0f2fe"), 0.94);
  drawArrow(high, width, 0.5, 0.5, 0.285, degrees(335), 0.087, hex("#e0f2fe"), 0.94);
  drawArc(high, width, 0.5, 0.5, 0.285, degrees(25), degrees(155), 0.066, hex("#dcfce7"), 0.94);
  drawArrow(high, width, 0.5, 0.5, 0.285, degrees(155), 0.087, hex("#dcfce7"), 0.94);
  drawCircle(high, width, 0.5, 0.5, 0.176, hex("#ffffff"), 0.94);
  drawLine(high, width, 0.412, 0.504, 0.473, 0.566, 0.066, hex("#0f766e"), 1);
  drawLine(high, width, 0.473, 0.566, 0.598, 0.426, 0.066, hex("#0f766e"), 1);
  drawCircle(high, width, 0.727, 0.609, 0.029, hex("#fbbf24"), 1);

  return downsample(high, width, size);
}

function drawRoundedGradient(data, width) {
  const x0 = 0.094 * width;
  const y0 = 0.094 * width;
  const x1 = 0.906 * width;
  const y1 = 0.906 * width;
  const radius = 0.188 * width;
  const c1 = hex("#2563eb");
  const c2 = hex("#0891b2");
  const c3 = hex("#16a34a");

  for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
      if (!insideRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, radius)) continue;

      const t = clamp((x + y) / (width * 2), 0, 1);
      const color = t < 0.55
        ? mix(c1, c2, t / 0.55)
        : mix(c2, c3, (t - 0.55) / 0.45);
      blend(data, width, x, y, color, 1);
    }
  }
}

function insideRoundedRect(x, y, x0, y0, x1, y1, radius) {
  const cx = clamp(x, x0 + radius, x1 - radius);
  const cy = clamp(y, y0 + radius, y1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawCircle(data, width, nx, ny, nr, color, alpha) {
  const cx = nx * width;
  const cy = ny * width;
  const radius = nr * width;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(width - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        blend(data, width, x, y, color, alpha);
      }
    }
  }
}

function drawLine(data, width, x1, y1, x2, y2, stroke, color, alpha) {
  const ax = x1 * width;
  const ay = y1 * width;
  const bx = x2 * width;
  const by = y2 * width;
  const radius = (stroke * width) / 2;
  const pad = radius + 2;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + pad));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const maxY = Math.min(width - 1, Math.ceil(Math.max(ay, by) + pad));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= radius) {
        blend(data, width, x, y, color, alpha);
      }
    }
  }
}

function drawArc(data, width, nx, ny, nr, start, end, stroke, color, alpha) {
  const cx = nx * width;
  const cy = ny * width;
  const radius = nr * width;
  const halfStroke = (stroke * width) / 2;
  const outer = radius + halfStroke + 2;
  const minX = Math.max(0, Math.floor(cx - outer));
  const maxX = Math.min(width - 1, Math.ceil(cx + outer));
  const minY = Math.max(0, Math.floor(cy - outer));
  const maxY = Math.min(width - 1, Math.ceil(cy + outer));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = normalizeAngle(Math.atan2(dy, dx));
      const onStroke = Math.abs(distance - radius) <= halfStroke && angleBetween(angle, start, end);
      const onStartCap = pointDistance(x + 0.5, y + 0.5, cx + radius * Math.cos(start), cy + radius * Math.sin(start)) <= halfStroke;
      const onEndCap = pointDistance(x + 0.5, y + 0.5, cx + radius * Math.cos(end), cy + radius * Math.sin(end)) <= halfStroke;

      if (onStroke || onStartCap || onEndCap) {
        blend(data, width, x, y, color, alpha);
      }
    }
  }
}

function drawArrow(data, width, nx, ny, nr, angle, size, color, alpha) {
  const cx = nx * width;
  const cy = ny * width;
  const radius = nr * width;
  const tip = {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
  const tangent = {
    x: -Math.sin(angle),
    y: Math.cos(angle)
  };
  const normal = {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
  const length = size * width;
  const widthHalf = length * 0.5;
  const base = {
    x: tip.x - tangent.x * length,
    y: tip.y - tangent.y * length
  };
  const points = [
    tip,
    { x: base.x + normal.x * widthHalf, y: base.y + normal.y * widthHalf },
    { x: base.x - normal.x * widthHalf, y: base.y - normal.y * widthHalf }
  ];

  fillTriangle(data, width, points, color, alpha);
}

function fillTriangle(data, width, points, color, alpha) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(width - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  const [a, b, c] = points;
  const area = edge(a, b, c);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x: x + 0.5, y: y + 0.5 };
      const w0 = edge(b, c, point);
      const w1 = edge(c, a, point);
      const w2 = edge(a, b, point);
      if ((area >= 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        blend(data, width, x, y, color, alpha);
      }
    }
  }
}

function downsample(source, sourceWidth, targetWidth) {
  const scale = sourceWidth / targetWidth;
  const target = new Uint8ClampedArray(targetWidth * targetWidth * 4);

  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const totals = [0, 0, 0, 0];

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const index = (((y * scale + sy) * sourceWidth) + (x * scale + sx)) * 4;
          totals[0] += source[index];
          totals[1] += source[index + 1];
          totals[2] += source[index + 2];
          totals[3] += source[index + 3];
        }
      }

      const samples = scale * scale;
      const targetIndex = (y * targetWidth + x) * 4;
      target[targetIndex] = Math.round(totals[0] / samples);
      target[targetIndex + 1] = Math.round(totals[1] / samples);
      target[targetIndex + 2] = Math.round(totals[2] / samples);
      target[targetIndex + 3] = Math.round(totals[3] / samples);
    }
  }

  return target;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function blend(data, width, x, y, color, alpha) {
  if (x < 0 || x >= width || y < 0 || y >= width || alpha <= 0) return;

  const index = (y * width + x) * 4;
  const dstAlpha = data[index + 3] / 255;
  const srcAlpha = clamp(alpha, 0, 1);
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (outAlpha <= 0) return;

  data[index] = Math.round((color.r * srcAlpha + data[index] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  data[index + 1] = Math.round((color.g * srcAlpha + data[index + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  data[index + 2] = Math.round((color.b * srcAlpha + data[index + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha);
  data[index + 3] = Math.round(outAlpha * 255);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  return pointDistance(px, py, ax + dx * t, ay + dy * t);
}

function pointDistance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function edge(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function angleBetween(angle, start, end) {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  return s <= e ? a >= s && a <= e : a >= s || a <= e;
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function degrees(value) {
  return (value * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hex(value) {
  const clean = value.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function mix(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}
