const prisma = require('../prisma');

// Slide banners shown at the top of a home screen, managed from the admin
// dashboard so adding/removing/reordering one never needs a new release.
//
// Two independent lists, one per surface. The app's carousel is a phone-width
// card and the website's is a wide 2.4:1 strip, so a single image almost never
// suits both - keeping them apart is simpler than teaching one list to render
// two shapes. 'app' is the default everywhere below, which is what makes an
// already-installed build (it asks without naming a surface) keep seeing
// exactly the list it saw before this column existed.
const PLATFORMS = ['app', 'web'];
const DEFAULT_PLATFORM = 'app';

function normalizePlatform(value, fallback = DEFAULT_PLATFORM) {
  const platform = String(value ?? '').trim().toLowerCase();
  return PLATFORMS.includes(platform) ? platform : fallback;
}

async function listActive(platform) {
  return prisma.banner.findMany({
    where: { isActive: true, platform: normalizePlatform(platform) },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

// `platform` omitted means every surface - the admin list page asks per tab,
// but an export or a one-off script has no reason to be forced to pick one.
async function listAll(platform) {
  const where = PLATFORMS.includes(platform) ? { platform } : undefined;
  return prisma.banner.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

async function getById(id) {
  return prisma.banner.findUnique({ where: { id: Number(id) } });
}

async function create({ imageUrl, linkUrl, sortOrder, isActive, platform }) {
  return prisma.banner.create({
    data: {
      imageUrl,
      linkUrl: linkUrl || null,
      sortOrder: sortOrder ?? 0,
      isActive: isActive !== false,
      platform: normalizePlatform(platform),
    },
  });
}

async function update(id, { imageUrl, linkUrl, sortOrder, isActive, platform }) {
  const current = await getById(id);
  if (!current) return null;
  return prisma.banner.update({
    where: { id: Number(id) },
    data: {
      imageUrl: imageUrl ?? current.imageUrl,
      linkUrl: linkUrl !== undefined ? linkUrl || null : current.linkUrl,
      sortOrder: sortOrder ?? current.sortOrder,
      isActive: isActive === undefined || isActive === null ? current.isActive : !!isActive,
      // An unrecognised value falls back to the row's current surface rather
      // than to 'app', so a PUT that forgets the field can never silently move
      // a web banner into the app list.
      platform: normalizePlatform(platform, current.platform),
    },
  });
}

async function remove(id) {
  const current = await getById(id);
  if (!current) return null;
  await prisma.banner.delete({ where: { id: Number(id) } });
  return current;
}

module.exports = { PLATFORMS, normalizePlatform, listActive, listAll, getById, create, update, remove };
