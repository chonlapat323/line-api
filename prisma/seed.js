const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin1234', 10);
  await prisma.user.upsert({
    where: { email: 'admin@beautyup.com' },
    update: {},
    create: {
      email: 'admin@beautyup.com',
      passwordHash: hash,
      fullName: 'Admin BeautyUp',
      role: 'admin',
    },
  });
  console.log('Seed complete');
}

main().catch(console.error).finally(() => prisma.$disconnect());
