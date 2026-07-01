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
const SLIP_STATUSES: (string | null)[] = ['verified', 'verified', 'approved', 'pending_approval', 'rejected', null];

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
    const slipStatus  = result === 'buy' ? rand(SLIP_STATUSES) : null;

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

// ── June 2026 Mockup — 77 จังหวัด ────────────────────────────────────────────
const JUNE_WORKDAYS: number[] = [];
for (let d = 1; d <= 30; d++) {
  if (new Date(2026, 5, d).getDay() !== 0) JUNE_WORKDAYS.push(d);
}
function juneDate(): Date {
  const day = rand(JUNE_WORKDAYS);
  return new Date(2026, 5, day, randInt(8, 17), randInt(0, 59), 0);
}
function gpsOff(): number { return (Math.random() - 0.5) * 0.04; }

const MOCKUP_USERS = [
  { email: 'sale.bkk1@beautyup.com',    fullName: 'สมหญิง ใจดี',    bankName: 'กสิกรไทย',    bankAccount: '012-3-45678-9' },
  { email: 'sale.bkk2@beautyup.com',    fullName: 'สมชาย วงษ์ดี',   bankName: 'กรุงเทพ',     bankAccount: '123-4-56789-0' },
  { email: 'sale.central@beautyup.com', fullName: 'วิมล รักดี',      bankName: 'ไทยพาณิชย์',  bankAccount: '234-5-67890-1' },
  { email: 'sale.north1@beautyup.com',  fullName: 'สมศรี แก้วใจ',   bankName: 'กรุงไทย',     bankAccount: '345-6-78901-2' },
  { email: 'sale.north2@beautyup.com',  fullName: 'ธนกร ทองดี',      bankName: 'กสิกรไทย',    bankAccount: '456-7-89012-3' },
  { email: 'sale.east@beautyup.com',    fullName: 'สุดา ยิ้มแย้ม',   bankName: 'ไทยพาณิชย์',  bankAccount: '567-8-90123-4' },
  { email: 'sale.neast1@beautyup.com',  fullName: 'มานพ หมื่นดี',    bankName: 'กรุงเทพ',     bankAccount: '678-9-01234-5' },
  { email: 'sale.neast2@beautyup.com',  fullName: 'สมพร พิมพ์ดี',   bankName: 'กรุงไทย',     bankAccount: '789-0-12345-6' },
  { email: 'sale.neast3@beautyup.com',  fullName: 'ประสิทธิ์ นาดี',  bankName: 'กสิกรไทย',    bankAccount: '890-1-23456-7' },
  { email: 'sale.south1@beautyup.com',  fullName: 'รัตนา ดวงใจ',    bankName: 'ไทยพาณิชย์',  bankAccount: '901-2-34567-8' },
  { email: 'sale.south2@beautyup.com',  fullName: 'ชนิกา ศรีดี',    bankName: 'กรุงเทพ',     bankAccount: '012-3-45679-0' },
];

interface ProvMock { name: string; lat: number; lng: number; visits: number; email: string; districts?: string[] }

const MOCKUP_PROVINCES: ProvMock[] = [
  // bkk1
  { name: 'กรุงเทพมหานคร',    lat: 13.7563, lng: 100.5018, visits: 25, email: 'sale.bkk1@beautyup.com',
    districts: ['ลาดพร้าว','บางรัก','สาทร','ห้วยขวาง','คลองเตย','จตุจักร','บางนา','ดอนเมือง','ลาดกระบัง','มีนบุรี'] },
  // bkk2
  { name: 'นนทบุรี',          lat: 13.8621, lng: 100.5144, visits: 10, email: 'sale.bkk2@beautyup.com' },
  { name: 'ปทุมธานี',         lat: 14.0208, lng: 100.5253, visits:  9, email: 'sale.bkk2@beautyup.com' },
  { name: 'สมุทรปราการ',      lat: 13.5991, lng: 100.5998, visits:  9, email: 'sale.bkk2@beautyup.com' },
  { name: 'นครปฐม',           lat: 13.8199, lng: 100.0621, visits:  6, email: 'sale.bkk2@beautyup.com' },
  { name: 'สมุทรสาคร',        lat: 13.5475, lng: 100.2747, visits:  5, email: 'sale.bkk2@beautyup.com' },
  { name: 'สมุทรสงคราม',      lat: 13.4098, lng: 100.0023, visits:  4, email: 'sale.bkk2@beautyup.com' },
  // central
  { name: 'พระนครศรีอยุธยา',  lat: 14.3692, lng: 100.5877, visits:  7, email: 'sale.central@beautyup.com' },
  { name: 'ลพบุรี',            lat: 14.7995, lng: 100.6534, visits:  5, email: 'sale.central@beautyup.com' },
  { name: 'สระบุรี',           lat: 14.5289, lng: 100.9100, visits:  5, email: 'sale.central@beautyup.com' },
  { name: 'ชัยนาท',            lat: 15.1851, lng: 100.1253, visits:  3, email: 'sale.central@beautyup.com' },
  { name: 'สิงห์บุรี',         lat: 14.8910, lng: 100.3969, visits:  3, email: 'sale.central@beautyup.com' },
  { name: 'อ่างทอง',           lat: 14.5896, lng: 100.4553, visits:  3, email: 'sale.central@beautyup.com' },
  { name: 'นครนายก',           lat: 14.2069, lng: 101.2130, visits:  3, email: 'sale.central@beautyup.com' },
  { name: 'ปราจีนบุรี',        lat: 14.0524, lng: 101.3705, visits:  4, email: 'sale.central@beautyup.com' },
  { name: 'สระแก้ว',           lat: 13.8240, lng: 102.0643, visits:  3, email: 'sale.central@beautyup.com' },
  { name: 'สุพรรณบุรี',        lat: 14.4744, lng: 100.1177, visits:  5, email: 'sale.central@beautyup.com' },
  { name: 'ราชบุรี',            lat: 13.5282, lng:  99.8134, visits:  6, email: 'sale.central@beautyup.com' },
  { name: 'เพชรบุรี',           lat: 13.1119, lng:  99.9390, visits:  5, email: 'sale.central@beautyup.com' },
  { name: 'ประจวบคีรีขันธ์',   lat: 11.8126, lng:  99.7974, visits:  4, email: 'sale.central@beautyup.com' },
  // north1
  { name: 'เชียงใหม่',         lat: 18.7883, lng:  98.9853, visits: 18, email: 'sale.north1@beautyup.com' },
  { name: 'เชียงราย',          lat: 19.9105, lng:  99.8406, visits:  7, email: 'sale.north1@beautyup.com' },
  { name: 'ลำพูน',             lat: 18.5745, lng:  99.0087, visits:  5, email: 'sale.north1@beautyup.com' },
  { name: 'ลำปาง',             lat: 18.2888, lng:  99.4929, visits:  6, email: 'sale.north1@beautyup.com' },
  { name: 'น่าน',               lat: 18.7756, lng: 100.7930, visits:  3, email: 'sale.north1@beautyup.com' },
  { name: 'พะเยา',              lat: 19.1663, lng:  99.9009, visits:  3, email: 'sale.north1@beautyup.com' },
  { name: 'แพร่',               lat: 18.1455, lng: 100.1406, visits:  4, email: 'sale.north1@beautyup.com' },
  { name: 'แม่ฮ่องสอน',        lat: 19.3020, lng:  97.9654, visits:  2, email: 'sale.north1@beautyup.com' },
  // north2
  { name: 'พิษณุโลก',          lat: 16.8211, lng: 100.2659, visits:  8, email: 'sale.north2@beautyup.com' },
  { name: 'ตาก',                lat: 16.8839, lng:  99.1258, visits:  4, email: 'sale.north2@beautyup.com' },
  { name: 'สุโขทัย',           lat: 17.0071, lng:  99.8265, visits:  5, email: 'sale.north2@beautyup.com' },
  { name: 'อุตรดิตถ์',         lat: 17.6200, lng: 100.0993, visits:  4, email: 'sale.north2@beautyup.com' },
  { name: 'กำแพงเพชร',         lat: 16.4827, lng:  99.5226, visits:  4, email: 'sale.north2@beautyup.com' },
  { name: 'พิจิตร',             lat: 16.4419, lng: 100.3491, visits:  3, email: 'sale.north2@beautyup.com' },
  { name: 'เพชรบูรณ์',          lat: 16.4191, lng: 101.1591, visits:  5, email: 'sale.north2@beautyup.com' },
  { name: 'นครสวรรค์',          lat: 15.7030, lng: 100.1373, visits:  6, email: 'sale.north2@beautyup.com' },
  { name: 'อุทัยธานี',          lat: 15.3835, lng: 100.0255, visits:  3, email: 'sale.north2@beautyup.com' },
  // east
  { name: 'ชลบุรี',             lat: 13.3611, lng: 100.9847, visits: 16, email: 'sale.east@beautyup.com' },
  { name: 'ระยอง',               lat: 12.6814, lng: 101.2816, visits:  7, email: 'sale.east@beautyup.com' },
  { name: 'จันทบุรี',            lat: 12.6110, lng: 102.1040, visits:  4, email: 'sale.east@beautyup.com' },
  { name: 'ตราด',                lat: 12.2427, lng: 102.5178, visits:  3, email: 'sale.east@beautyup.com' },
  { name: 'ฉะเชิงเทรา',         lat: 13.6891, lng: 101.0783, visits:  5, email: 'sale.east@beautyup.com' },
  { name: 'กาญจนบุรี',          lat: 14.0023, lng:  99.5328, visits:  5, email: 'sale.east@beautyup.com' },
  // neast1
  { name: 'ขอนแก่น',            lat: 16.4419, lng: 102.8360, visits: 14, email: 'sale.neast1@beautyup.com' },
  { name: 'อุดรธานี',           lat: 17.4156, lng: 102.7872, visits: 12, email: 'sale.neast1@beautyup.com' },
  { name: 'หนองคาย',            lat: 17.8783, lng: 102.7420, visits:  5, email: 'sale.neast1@beautyup.com' },
  { name: 'หนองบัวลำภู',        lat: 17.2028, lng: 102.4430, visits:  4, email: 'sale.neast1@beautyup.com' },
  { name: 'เลย',                 lat: 17.4860, lng: 101.7223, visits:  4, email: 'sale.neast1@beautyup.com' },
  { name: 'บึงกาฬ',              lat: 18.3609, lng: 103.6466, visits:  3, email: 'sale.neast1@beautyup.com' },
  // neast2
  { name: 'สกลนคร',              lat: 17.1554, lng: 104.1348, visits:  5, email: 'sale.neast2@beautyup.com' },
  { name: 'นครพนม',              lat: 17.3920, lng: 104.7793, visits:  4, email: 'sale.neast2@beautyup.com' },
  { name: 'กาฬสินธุ์',           lat: 16.4336, lng: 103.5067, visits:  5, email: 'sale.neast2@beautyup.com' },
  { name: 'มุกดาหาร',            lat: 16.5432, lng: 104.7236, visits:  3, email: 'sale.neast2@beautyup.com' },
  { name: 'ร้อยเอ็ด',            lat: 16.0538, lng: 103.6520, visits:  6, email: 'sale.neast2@beautyup.com' },
  { name: 'มหาสารคาม',           lat: 16.1851, lng: 103.3002, visits:  5, email: 'sale.neast2@beautyup.com' },
  { name: 'ยโสธร',               lat: 15.7922, lng: 104.1452, visits:  3, email: 'sale.neast2@beautyup.com' },
  { name: 'อำนาจเจริญ',          lat: 15.8656, lng: 104.6253, visits:  3, email: 'sale.neast2@beautyup.com' },
  // neast3
  { name: 'นครราชสีมา',          lat: 14.9799, lng: 102.0977, visits: 13, email: 'sale.neast3@beautyup.com' },
  { name: 'บุรีรัมย์',            lat: 14.9951, lng: 103.1116, visits:  6, email: 'sale.neast3@beautyup.com' },
  { name: 'สุรินทร์',             lat: 14.8824, lng: 103.4937, visits:  5, email: 'sale.neast3@beautyup.com' },
  { name: 'ศรีสะเกษ',            lat: 15.1186, lng: 104.3222, visits:  5, email: 'sale.neast3@beautyup.com' },
  { name: 'ชัยภูมิ',              lat: 15.8068, lng: 102.0318, visits:  5, email: 'sale.neast3@beautyup.com' },
  { name: 'อุบลราชธานี',          lat: 15.2448, lng: 104.8473, visits:  7, email: 'sale.neast3@beautyup.com' },
  // south1
  { name: 'สุราษฎร์ธานี',        lat:  9.1382, lng:  99.3217, visits:  8, email: 'sale.south1@beautyup.com' },
  { name: 'นครศรีธรรมราช',       lat:  8.4321, lng:  99.9633, visits:  7, email: 'sale.south1@beautyup.com' },
  { name: 'ชุมพร',                lat: 10.4930, lng:  99.1800, visits:  4, email: 'sale.south1@beautyup.com' },
  { name: 'ระนอง',                lat:  9.9529, lng:  98.6084, visits:  2, email: 'sale.south1@beautyup.com' },
  { name: 'พังงา',                lat:  8.4509, lng:  98.5255, visits:  3, email: 'sale.south1@beautyup.com' },
  { name: 'กระบี่',               lat:  8.0863, lng:  98.9063, visits:  5, email: 'sale.south1@beautyup.com' },
  { name: 'ภูเก็ต',               lat:  7.9519, lng:  98.3381, visits: 11, email: 'sale.south1@beautyup.com' },
  // south2
  { name: 'สงขลา',                lat:  7.1756, lng: 100.6142, visits: 12, email: 'sale.south2@beautyup.com' },
  { name: 'ตรัง',                 lat:  7.5645, lng:  99.6237, visits:  5, email: 'sale.south2@beautyup.com' },
  { name: 'พัทลุง',               lat:  7.6167, lng: 100.0746, visits:  4, email: 'sale.south2@beautyup.com' },
  { name: 'สตูล',                 lat:  6.6238, lng: 100.0674, visits:  3, email: 'sale.south2@beautyup.com' },
  { name: 'ปัตตานี',              lat:  6.8685, lng: 101.2500, visits:  3, email: 'sale.south2@beautyup.com' },
  { name: 'ยะลา',                 lat:  6.5418, lng: 101.2803, visits:  3, email: 'sale.south2@beautyup.com' },
  { name: 'นราธิวาส',             lat:  6.4255, lng: 101.8253, visits:  3, email: 'sale.south2@beautyup.com' },
];

async function seedMockupJune2026() {
  console.log('\n── Mockup June 2026 ─────────────────────────────');
  const hash = await bcrypt.hash('sale1234', 10);
  const userMap: Record<string, string> = {};
  const userRole = await prisma.role.findFirst({ where: { name: 'user' } });

  for (const u of MOCKUP_USERS) {
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: { fullName: u.fullName, bankName: u.bankName, bankAccount: u.bankAccount },
      create: { email: u.email, passwordHash: hash, fullName: u.fullName,
                role: 'user', roleId: userRole?.id ?? null,
                bankName: u.bankName, bankAccount: u.bankAccount },
    });
    userMap[u.email] = user.id;
    console.log(`  user: ${u.fullName.padEnd(18)} ${u.email}`);
  }

  const userIds = Object.values(userMap);
  const cleared = await prisma.visitRecord.deleteMany({
    where: { userId: { in: userIds },
             createdAt: { gte: new Date(2026, 5, 1), lte: new Date(2026, 5, 30, 23, 59, 59) } },
  });
  if (cleared.count > 0) console.log(`  cleared ${cleared.count} existing June 2026 visits`);

  const rows: any[] = [];
  let txn = 1;

  for (const p of MOCKUP_PROVINCES) {
    const userId = userMap[p.email];
    if (!userId) continue;
    for (let i = 0; i < p.visits; i++) {
      const result      = rand(RESULTS);
      const isBuy       = result === 'buy';
      const orderAmount = isBuy ? randInt(5, 150) * 100 : null;
      const slipStatus  = isBuy ? rand(SLIP_STATUSES) : null;
      rows.push({
        userId,
        shopName:     rand(SHOP_NAMES),
        province:     p.name,
        district:     p.districts ? rand(p.districts) : null,
        latitude:     p.lat + gpsOff(),
        longitude:    p.lng + gpsOff(),
        tripType:     rand(TRIP_TYPES),
        customerType: rand(CUSTOMER_TYPES),
        visitType:    rand(VISIT_TYPES),
        result,
        details:      isBuy ? 'ลูกค้าสนใจสินค้า พร้อมสั่งซื้อ' : '',
        orderAmount,
        imageUrls:    [`https://picsum.photos/400/300?random=${txn}`],
        slipStatus,
        transRef:     isBuy ? `TXN2606${String(txn++).padStart(4, '0')}` : null,
        createdAt:    juneDate(),
      });
    }
  }

  await prisma.visitRecord.createMany({ data: rows });
  const buy = rows.filter((r) => r.result === 'buy').length;
  console.log(`  created ${rows.length} visits — ซื้อ ${buy} / ไม่ซื้อ ${rows.filter(r=>r.result==='no_buy').length} / ไม่พบ ${rows.filter(r=>r.result==='not_found').length}`);
  console.log(`  77 provinces, 11 sales users, password: sale1234`);
}

// ── July 2026 Mockup — เยอะๆ เพื่อดูหน้าจ่ายค่าคอม ──────────────────────────
const JULY_WORKDAYS: number[] = [];
for (let d = 1; d <= 31; d++) {
  const day = new Date(2026, 6, d).getDay();
  if (day !== 0 && day !== 6) JULY_WORKDAYS.push(d);
}
function julyDate(): Date {
  const day = rand(JULY_WORKDAYS);
  return new Date(2026, 6, day, randInt(8, 17), randInt(0, 59), 0);
}
// buy เยอะ, slip ทุกใบเป็น verified/approved (นับ commission ได้)
const JULY_RESULTS      = ['buy','buy','buy','buy','buy','buy','buy','no_buy','not_found','not_found'] as const;
const JULY_SLIP_CONFIRM = ['verified', 'verified', 'verified', 'approved'] as const;

async function seedMockupJuly2026() {
  console.log('\n── Mockup July 2026 ─────────────────────────────');

  // upsert commission settings (rate 3%, threshold 30,000 บาท)
  await prisma.setting.upsert({
    where:  { key: 'commission_rate' },
    update: { value: '3' },
    create: { key: 'commission_rate', value: '3' },
  });
  await prisma.setting.upsert({
    where:  { key: 'commission_threshold' },
    update: { value: '30000' },
    create: { key: 'commission_threshold', value: '30000' },
  });
  console.log('  commission_rate=3%, threshold=฿30,000');

  const userMap: Record<string, string> = {};
  for (const u of MOCKUP_USERS) {
    const user = await prisma.user.findUnique({ where: { email: u.email } });
    if (user) userMap[u.email] = user.id;
  }
  const userIds = Object.values(userMap);
  if (!userIds.length) { console.log('  ไม่พบ mockup users — รัน seedMockupJune2026 ก่อน'); return; }

  const cleared = await prisma.visitRecord.deleteMany({
    where: { userId: { in: userIds },
             createdAt: { gte: new Date(2026, 6, 1), lte: new Date(2026, 6, 31, 23, 59, 59) } },
  });
  if (cleared.count > 0) console.log(`  cleared ${cleared.count} existing July 2026 visits`);

  const rows: any[] = [];
  let txn = 1;

  for (const p of MOCKUP_PROVINCES) {
    const userId = userMap[p.email];
    if (!userId) continue;
    const visits = Math.ceil(p.visits * 1.4);
    for (let i = 0; i < visits; i++) {
      const result      = rand(JULY_RESULTS);
      const isBuy       = result === 'buy';
      const orderAmount = isBuy ? randInt(15, 400) * 100 : null;
      rows.push({
        userId,
        shopName:     rand(SHOP_NAMES),
        province:     p.name,
        district:     p.districts ? rand(p.districts) : null,
        latitude:     p.lat + gpsOff(),
        longitude:    p.lng + gpsOff(),
        tripType:     rand(TRIP_TYPES),
        customerType: rand(CUSTOMER_TYPES),
        visitType:    rand(VISIT_TYPES),
        result,
        details:      isBuy ? 'ลูกค้าสนใจสินค้า พร้อมสั่งซื้อ' : '',
        orderAmount,
        imageUrls:    [`https://picsum.photos/400/300?random=${500 + txn}`],
        slipStatus:   isBuy ? rand(JULY_SLIP_CONFIRM) : null,
        transRef:     isBuy ? `TXN2607${String(txn++).padStart(4, '0')}` : null,
        createdAt:    julyDate(),
      });
    }
  }

  await prisma.visitRecord.createMany({ data: rows });
  const buy = rows.filter((r) => r.result === 'buy').length;
  const totalAmt = rows.reduce((s, r) => s + (r.orderAmount ?? 0), 0);
  console.log(`  created ${rows.length} visits — ซื้อ ${buy} / ไม่ซื้อ ${rows.filter(r=>r.result==='no_buy').length} / ไม่พบ ${rows.filter(r=>r.result==='not_found').length}`);
  console.log(`  ยอดขายรวม ฿${totalAmt.toLocaleString('th-TH')}`);
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

  // 4. Mockup June 2026 — 77 provinces, 11 sales users
  await seedMockupJune2026();

  // 5. Mockup July 2026 — buy เยอะ + commission settings
  await seedMockupJuly2026();
}

main().catch(console.error).finally(() => prisma.$disconnect());
