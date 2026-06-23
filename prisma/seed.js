const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const USERS = [
  { email: 'admin@beautyup.com', fullName: 'Admin BeautyUp',  role: 'admin', password: 'admin1234' },
  { email: 'sale1@beautyup.com', fullName: 'สมชาย วงศ์ดี',   role: 'user',  password: 'sale1234' },
  { email: 'sale2@beautyup.com', fullName: 'สมหญิง ใจดี',     role: 'user',  password: 'sale1234' },
  { email: 'sale3@beautyup.com', fullName: 'วิชาญ รักงาน',    role: 'user',  password: 'sale1234' },
];

const PROVINCES = [
  { name: 'กรุงเทพมหานคร', lat: 13.7563, lng: 100.5018 },
  { name: 'เชียงใหม่',      lat: 18.7883, lng: 98.9853  },
  { name: 'ชลบุรี',         lat: 13.3611, lng: 100.9847 },
  { name: 'ขอนแก่น',        lat: 16.4419, lng: 102.8360 },
  { name: 'นครราชสีมา',     lat: 14.9799, lng: 102.0978 },
  { name: 'สงขลา',          lat: 7.1756,  lng: 100.6142 },
  { name: 'ภูเก็ต',         lat: 7.8804,  lng: 98.3923  },
  { name: 'อุดรธานี',       lat: 17.4138, lng: 102.7876 },
  { name: 'นนทบุรี',        lat: 13.8621, lng: 100.5144 },
  { name: 'ระยอง',          lat: 12.6813, lng: 101.2816 },
];

const DISTRICTS = {
  'กรุงเทพมหานคร': ['ลาดพร้าว', 'บางรัก', 'จตุจักร', 'สาทร', 'ห้วยขวาง', 'ดอนเมือง'],
  'เชียงใหม่':     ['เมือง', 'สันทราย', 'หางดง'],
  'ชลบุรี':        ['เมือง', 'บางละมุง', 'ศรีราชา'],
};

const SHOP_NAMES = [
  'ร้านบิ๊กบิวตี้', 'ร้านสวยครบจบ', 'ร้านหล่อสวยดี', 'ร้านโอ้โหสวย',
  'ร้านแม่กบ', 'ร้านสีสัน', 'ร้านบิวตี้พลัส', 'ร้านสวยทุกวัน',
  'ร้านแจ่มจรัส', 'ร้านงามตา', 'ร้านดอกไม้', 'ร้านพิมพ์ใจ',
  'ร้านนกน้อย', 'ร้านดาวเรือง', 'ร้านเจ้าสาว', 'ร้านคุณนาย',
  'ร้านมนต์เสน่ห์', 'ร้านรุ้งทอง', 'ร้านดวงดาว', 'ร้านทองหล่อ',
];

const TRIP_TYPES    = ['plan', 'off_plan'];
const CUSTOMER_TYPES = ['new', 'existing'];
const VISIT_TYPES   = ['tak', 'dem', 'tel'];
const RESULTS       = ['buy', 'buy', 'buy', 'no_buy', 'not_found'];
// slipStatus distribution for buy records
const SLIP_STATUSES = ['verified', 'verified', 'approved', 'pending_approval', 'rejected', null];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}

function buildVisits(userId, count) {
  return Array.from({ length: count }, (_, i) => {
    const province   = rand(PROVINCES);
    const districts  = DISTRICTS[province.name] || [];
    const district   = districts.length ? rand(districts) : '';
    const result     = rand(RESULTS);
    const orderAmount = result === 'buy' ? randInt(1, 50) * 100 : null;
    const slipStatus  = result === 'buy' ? rand(SLIP_STATUSES) : null;
    // spread across last 60 days (2 months)
    const daysBack   = randInt(0, 59);

    return {
      userId,
      shopName:     rand(SHOP_NAMES),
      province:     province.name,
      district,
      latitude:     province.lat + (Math.random() - 0.5) * 0.05,
      longitude:    province.lng + (Math.random() - 0.5) * 0.05,
      tripType:     rand(TRIP_TYPES),
      customerType: rand(CUSTOMER_TYPES),
      visitType:    rand(VISIT_TYPES),
      result,
      details:      result === 'buy' ? 'ลูกค้าสนใจสินค้า พร้อมสั่งซื้อ' : '',
      orderAmount,
      imageUrls:    [],
      slipStatus,
      createdAt:    daysAgo(daysBack),
    };
  });
}

async function main() {
  console.log('🌱 Seeding...\n');

  // 1. Upsert users
  const createdUsers = [];
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: { email: u.email, passwordHash: hash, fullName: u.fullName, role: u.role },
    });
    createdUsers.push(user);
    console.log(`  ✅ user: ${user.email} (${user.fullName})`);
  }

  // 2. Visit records
  const saleUsers = createdUsers.filter((u) => u.role !== 'admin');
  let total = 0;

  for (const u of saleUsers) {
    const visits = buildVisits(u.id, randInt(15, 25));
    await prisma.visitRecord.createMany({ data: visits });
    total += visits.length;
    console.log(`  📋 ${visits.length} visits → ${u.fullName}`);
  }

  console.log(`\n✅ Seed complete — ${total} visit records created`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
