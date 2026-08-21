/**
 * Seed proxy commission test data for the current month.
 * Run: npx ts-node prisma/seed-proxy.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Find up to 5 verified/approved slips this month that are not yet proxy
  const slips = await prisma.slipSubmission.findMany({
    where: {
      slipStatus: { in: ['verified', 'approved'] },
      isProxy: false,
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  if (slips.length === 0) {
    console.log('ไม่มีสลิปที่ verified/approved ในเดือนนี้ — ไม่มีอะไรให้ seed');
    return;
  }

  const ids = slips.map((s) => s.id);
  await prisma.slipSubmission.updateMany({
    where: { id: { in: ids } },
    data: { isProxy: true },
  });

  console.log(`Seeded ${ids.length} slips as isProxy=true:`);
  slips.forEach((s) => console.log(`  - ${s.id} | ${s.shopName} | ฿${s.amount}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
