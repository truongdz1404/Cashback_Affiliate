const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Banner artwork uploaded from an admin's machine. Stored on this service's
// disk rather than in client/public because Next bakes public/ into its
// image at build time - anything written there at runtime disappears on the
// next deploy. This directory is bind-mounted in docker-compose.yml, exactly
// like public/bank-logos, so uploads survive a rebuild.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'banner-uploads');
const PUBLIC_PREFIX = '/app/banner-uploads';
const MAX_BYTES = 8 * 1024 * 1024;

// Sniffed from the bytes, not from the Content-Type header: the header is
// whatever the browser guessed from the file extension, and a banner carousel
// that renders <img src> on both surfaces must never be handed an .svg (it can
// carry script) or a renamed .zip.
const SIGNATURES = [
  { ext: '.png', test: (b) => b.length > 8 && b.toString('hex', 0, 8) === '89504e470d0a1a0a' },
  { ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', test: (b) => b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
  {
    ext: '.webp',
    test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

function detectExtension(buffer) {
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? match.ext : null;
}

/**
 * Writes the uploaded bytes and returns the URL to store on the banner row.
 * The filename is generated, never taken from the client - the original name
 * only survives as a hint in the log line, so a crafted "../" name has nowhere
 * to go and two admins uploading "banner.png" can't overwrite each other.
 */
async function save(buffer, { baseUrl }) {
  if (!buffer || !buffer.length) {
    throw new Error('Tệp rỗng hoặc không đọc được.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Ảnh vượt quá ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
  }
  const ext = detectExtension(buffer);
  if (!ext) {
    throw new Error('Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF.');
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), buffer);

  // Absolute, on the API origin: the same row is read by the mobile app (which
  // has no notion of the website's origin) and by the website, so a relative
  // path would only ever work for one of them.
  return { url: `${String(baseUrl).replace(/\/+$/, '')}${PUBLIC_PREFIX}/${fileName}`, fileName, bytes: buffer.length };
}

module.exports = { save, detectExtension, UPLOAD_DIR, PUBLIC_PREFIX, MAX_BYTES };
