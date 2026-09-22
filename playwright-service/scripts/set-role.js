#!/usr/bin/env node
// Grant or revoke the admin role for one account from the server shell -
// the recovery path when nobody can reach the dashboard (first install,
// last admin demoted by mistake, Google login misconfigured...).
//
//   node scripts/set-role.js admin --email truongvq.se@gmail.com
//   node scripts/set-role.js admin --phone 0900000001
//   node scripts/set-role.js user  --id 42
//   node scripts/set-role.js list
//
// Runs against DATABASE_URL from .env like server.js does.
require('dotenv').config();
const prisma = require('../lib/prisma');
const usersRepo = require('../lib/repositories/users');

function usage(code) {
  console.log(
    [
      'Usage:',
      '  node scripts/set-role.js <admin|user> (--email <email> | --phone <phone> | --id <id>)',
      '  node scripts/set-role.js list',
    ].join('\n')
  );
  process.exit(code);
}

async function findTarget(args) {
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get('--email');
  const phone = get('--phone');
  const id = get('--id');
  if (email) return usersRepo.findByEmail(email);
  if (phone) return usersRepo.findByPhone(phone);
  if (id) return usersRepo.getById(id);
  return undefined;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'list') {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, fullName: true, email: true, phone: true },
      orderBy: { id: 'asc' },
    });
    if (admins.length === 0) {
      console.log('No admin accounts yet. Promote one with: node scripts/set-role.js admin --email <email>');
    } else {
      for (const a of admins) {
        console.log(`#${a.id}\t${a.fullName || '-'}\t${a.email || '-'}\t${a.phone || '-'}`);
      }
    }
    return;
  }

  if (!usersRepo.ROLES.includes(command)) usage(1);

  const target = await findTarget(rest);
  if (target === undefined) usage(1);
  if (!target) {
    console.error('No account matches. The person has to sign in on the site or app once before they can be promoted.');
    process.exit(2);
  }

  if (command === 'user' && target.role === 'admin' && (await usersRepo.countAdmins()) <= 1) {
    console.error(`Refusing: #${target.id} is the last admin. Promote someone else first.`);
    process.exit(3);
  }

  const updated = await usersRepo.setRole(target.id, command);
  console.log(`#${updated.id} (${updated.fullName || updated.email || updated.phone}) is now role=${updated.role}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
