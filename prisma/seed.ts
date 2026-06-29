import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Menus (mirror roles.service.ts MENUS) ────────────────────────────────────
const MENUS = [
  { menu: 'dashboard',   label: 'ภาพรวม' },
  { menu: 'sales',       label: 'สถิติเซล' },
  { menu: 'visits',      label: 'ประวัติการเยี่ยม' },
  { menu: 'approvals',   label: 'จัดการสลิป' },
  { menu: 'commissions', label: 'ค่าคอมมิชชัน' },
  { menu: 'users',       label: 'จัดการ Users' },
  { menu: 'roles',       label: 'จัดการสิทธิ์' },
  { menu: 'settings',    label: 'ตั้งค่า' },
  { menu: 'line',        label: 'LINE' },
];

// ── Roles ─────────────────────────────────────────────────────────────────────
const ROLES = [
  {
    name: 'admin',
    label: 'แอดมิน',
    permissions: MENUS.map((m) => ({ menu: m.menu, label: m.label, canView: true, canEdit: true, canDelete: true })),
    isSystem: true,
    isActive: true,
  },
  {
    name: 'manager',
    label: 'ผู้จัดการ',
    permissions: MENUS.map((m) => ({
      menu: m.menu,
      label: m.label,
      canView: true,
      canEdit: ['visits', 'approvals', 'users'].includes(m.menu),
      canDelete: false,
    })),
    isSystem: false,
    isActive: true,
  },
  {
    name: 'user',
    label: 'ผู้ใช้ทั่วไป',
    permissions: MENUS.map((m) => ({
      menu: m.menu,
      label: m.label,
      canView: ['dashboard', 'visits', 'commissions'].includes(m.menu),
      canEdit: false,
      canDelete: false,
    })),
    isSystem: false,
    isActive: true,
  },
];

// ── Users ────────────────────────────────────────────────────────────────────
const USERS = [
  { email: 'admin@beautyup.com',  fullName: 'Admin BeautyUp',    role: 'admin',   roleName: 'admin',   password: 'admin1234' },
  { email: 'sale1@beautyup.com',  fullName: 'สมชาย วงศ์ดี',      role: 'user',    roleName: 'user',    password: 'sale1234' },
  { email: 'sale2@beautyup.com',  fullName: 'สมหญิง ใจดี',        role: 'user',    roleName: 'user',    password: 'sale1234' },
  { email: 'sale3@beautyup.com',  fullName: 'วิชาญ รักงาน',       role: 'manager', roleName: 'manager', password: 'sale1234' },
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
];

const DISTRICTS: Record<string, string[]> = {
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

const TRIP_TYPES     = ['plan', 'off_plan'] as const;
const CUSTOMER_TYPES = ['new', 'existing'] as const;
const VISIT_TYPES    = ['tak', 'dem', 'tel'] as const;
const RESULTS        = ['buy', 'buy', 'buy', 'no_buy', 'not_found'] as const;
const SLIP_STATUSES  = ['verified', 'verified', 'approved', 'pending_approval', 'rejected', null];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}

function buildVisits(userId: string, count: number) {
  return Array.from({ length: count }, () => {
    const province  = rand(PROVINCES);
    const districts = DISTRICTS[province.name] || [];
    const district  = districts.length ? rand(districts) : '';
    const result    = rand(RESULTS);
    const orderAmount = result === 'buy' ? randInt(1, 50) * 100 : null;
    const slipStatus  = result === 'buy' ? rand(SLIP_STATUSES as any) : null;

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
      imageUrls:    [] as string[],
      slipStatus,
      createdAt:    daysAgo(randInt(0, 59)),
    };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding...\n');

  // 1. Upsert roles
  const roleMap: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where:  { name: r.name },
      update: { label: r.label, permissions: r.permissions, isActive: r.isActive },
      create: { name: r.name, label: r.label, permissions: r.permissions, isSystem: r.isSystem, isActive: r.isActive },
    });
    roleMap[r.name] = role.id;
    console.log(`  role: ${role.name} (${role.label}) — ${role.id}`);
  }

  // 2. Upsert users and assign roleId
  const createdUsers: { email: string; id: string; role: string }[] = [];
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: { roleId: roleMap[u.roleName] },
      create: {
        email: u.email,
        passwordHash: hash,
        fullName: u.fullName,
        role: u.role,
        roleId: roleMap[u.roleName],
      },
    });
    createdUsers.push({ email: user.email, id: user.id, role: user.role });
    console.log(`  user: ${user.email} (${u.fullName}) — role: ${u.roleName}`);
  }

  // 3. Visit records for sale users
  const saleUsers = createdUsers.filter((u) => u.role !== 'admin');
  let total = 0;

  for (const u of saleUsers) {
    const visits = buildVisits(u.id, randInt(15, 25));
    await prisma.visitRecord.createMany({ data: visits });
    total += visits.length;
    console.log(`  ${visits.length} visits -> ${u.email}`);
  }

  console.log(`\nDone — ${total} visit records, ${ROLES.length} roles, ${USERS.length} users`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
