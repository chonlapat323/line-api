import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Users ────────────────────────────────────────────────────────────────────
const USERS = [
  { email: 'admin@beautyup.com',  fullName: 'Admin BeautyUp',    role: 'admin', password: 'admin1234' },
  { email: 'sale1@beautyup.com',  fullName: 'สมชาย วงศ์ดี',      role: 'user',  password: 'sale1234' },
  { email: 'sale2@beautyup.com',  fullName: 'สมหญิง ใจดี',        role: 'user',  password: 'sale1234' },
  { email: 'sale3@beautyup.com',  fullName: 'วิชาญ รักงาน',       role: 'user',  password: 'sale1234' },
];

// ── Province data ─────────────────────────────────────────────────────────────
const PROVINCES = [
  { name: 'กรุงเทพมหานคร',   lat: 13.7563, lng: 100.5018 },
  { name: 'เชียงใหม่',        lat: 18.7883, lng: 98.9853  },
  { name: 'ชลบุรี',           lat: 13.3611, lng: 100.9847 },
  { name: 'ขอนแก่น',          lat: 16.4419, lng: 102.8360 },
  { name: 'นครราชสีมา',       lat: 14.9799, lng: 102.0978 },
  { name: 'สงขลา',            lat: 7.1756,  lng: 100.6142 },
  { name: 'ภูเก็ต',           lat: 7.8804,  lng: 98.3923  },
  { name: 'อุดรธานี',         lat: 17.4138, lng: 102.7876 },
  { name: 'นนทบุรี',          lat: 13.8621, lng: 100.5144 },
  { name: 'ระยอง',            lat: 12.6813, lng: 101.2816 },
  { name: 'สุราษฎร์ธานี',    lat: 9.1382,  lng: 99.3217  },
  { name: 'เชียงราย',         lat: 19.9105, lng: 99.8406  },
];

const DISTRICTS: Record<string, string[]> = {
  'กรุงเทพมหานคร': ['ลาดพร้าว', 'บางรัก', 'จตุจักร', 'สาทร', 'ห้วยขวาง', 'ดอนเมือง'],
  'เชียงใหม่':      ['เมือง', 'สันทราย', 'หางดง'],
  'ชลบุรี':         ['เมือง', 'บางละมุง', 'ศรีราชา'],
};

const SHOP_NAMES = [
  'ร้านบิ๊กบิวตี้', 'ร้านสวยครบจบ', 'ร้านหล่อสวยดี', 'ร้านโอ้โหสวย',
  'ร้านแม่กบ', 'ร้านสีสัน', 'ร้านบิวตี้พลัส', 'ร้านสวยทุกวัน',
  'ร้านแจ่มจรัส', 'ร้านงามตา', 'ร้านดอกไม้', 'ร้านพิมพ์ใจ',
  'ร้านนกน้อย', 'ร้านดาวเรือง', 'ร้านเจ้าสาว', 'ร้านคุณนาย',
  'ร้านมนต์เสน่ห์', 'ร้านรุ้งทอง', 'ร้านดวงดาว', 'ร้านทองหล่อ',
];

const TRIP_TYPES   = ['plan', 'off_plan'] as const;
const CUSTOMER_TYPES = ['new', 'existing'] as const;
const VISIT_TYPES  = ['tak', 'dem', 'tel'] as const;
const RESULTS = ['buy', 'buy', 'no_buy', 'not_found'] as const; // buy weighted higher

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}

// ── Build visit records for a user ───────────────────────────────────────────
function buildVisits(userId: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const province = rand(PROVINCES);
    const districts = DISTRICTS[province.name] || [];
    const district  = districts.length ? rand(districts) : '';
    const result    = rand(RESULTS);
    const orderAmount = result === 'buy' ? randInt(1, 50) * 100 : null;

    return {
      userId,
      shopName:     rand(SHOP_NAMES),
      province:     province.name,
      district,
      latitude:     province.lat  + (Math.random() - 0.5) * 0.05,
      longitude:    province.lng  + (Math.random() - 0.5) * 0.05,
      tripType:     rand(TRIP_TYPES),
      customerType: rand(CUSTOMER_TYPES),
      visitType:    rand(VISIT_TYPES),
      result,
      details:      result === 'buy' ? 'ลูกค้าสนใจสินค้า พร้อมสั่งซื้อ' : '',
      orderAmount,
      imageUrls:    [] as string[],
      createdAt:    daysAgo(i % 30),
    };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding...\n');

  // 1. Upsert users (skip if email exists)
  const createdUsers: { email: string; id: string }[] = [];
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: { email: u.email, passwordHash: hash, fullName: u.fullName, role: u.role },
    });
    createdUsers.push({ email: user.email, id: user.id });
    console.log(`  ✅ user: ${user.email} (${user.fullName})`);
  }

  // 2. Visit records — delete existing mock records then recreate fresh
  const saleUsers = createdUsers.filter((u) => u.email !== 'admin@beautyup.com');
  let visitCount = 0;

  for (const u of saleUsers) {
    const deleted = await prisma.visitRecord.deleteMany({ where: { userId: u.id } });
    if (deleted.count > 0) {
      console.log(`  🗑️  deleted ${deleted.count} old visits for ${u.email}`);
    }

    const visits = buildVisits(u.id, randInt(10, 20));
    await prisma.visitRecord.createMany({ data: visits });
    visitCount += visits.length;
    console.log(`  📋 created ${visits.length} visits for ${u.email}`);
  }

  console.log(`\n✅ Done — ${visitCount} visit records created`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
