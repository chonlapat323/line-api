import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@beautyup.com' },
    update: {},
    create: {
      email: 'admin@beautyup.com',
      passwordHash: hash,
      fullName: 'Admin BeautyUp',
      role: 'admin',
    },
  });
  console.log('✅ Seeded user:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
