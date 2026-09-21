const prisma = require('../prisma');

// Home-screen slide banners shown to the app - managed from the admin
// dashboard so adding/removing/reordering one never needs a new app release.
async function listActive() {
  return prisma.banner.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

async function listAll() {
  return prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

async function getById(id) {
  return prisma.banner.findUnique({ where: { id: Number(id) } });
}

async function create({ imageUrl, linkUrl, sortOrder, isActive }) {
  return prisma.banner.create({
    data: {
      imageUrl,
      linkUrl: linkUrl || null,
      sortOrder: sortOrder ?? 0,
      isActive: isActive !== false,
    },
  });
}

async function update(id, { imageUrl, linkUrl, sortOrder, isActive }) {
  const current = await getById(id);
  if (!current) return null;
  return prisma.banner.update({
    where: { id: Number(id) },
    data: {
      imageUrl: imageUrl ?? current.imageUrl,
      linkUrl: linkUrl !== undefined ? linkUrl || null : current.linkUrl,
      sortOrder: sortOrder ?? current.sortOrder,
      isActive: isActive === undefined || isActive === null ? current.isActive : !!isActive,
    },
  });
}

async function remove(id) {
  const current = await getById(id);
  if (!current) return null;
  await prisma.banner.delete({ where: { id: Number(id) } });
  return current;
}

module.exports = { listActive, listAll, getById, create, update, remove };
