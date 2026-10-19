# SETS Seal Tracker

Dashboard ติดตามสถานะงานตีตราและการต่อสัญญารอบใหม่ของ SET

- หน้าเว็บอยู่บน **GitHub Pages** (ฟรี)
- Log in และฐานข้อมูลอยู่บน **Supabase** (ฟรี) ข้อมูลลูกค้า **ไม่ได้** เก็บใน GitHub

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `styles.css`, `app.js` | หน้า Log in + Dashboard |
| `config.js` | ที่อยู่ของ Supabase (ต้องแก้ก่อนใช้งาน) |
| `supabase/v1.4.0.sql` | เพิ่มวันนัดติดตาม + ผู้รับผิดชอบ (รันหลัง setup.sql) |
| `supabase/setup.sql` | สคริปต์สร้างตาราง สิทธิ์ และความปลอดภัยใน Supabase |
| `CHANGELOG.md` | ประวัติเวอร์ชัน (ดูว่าแต่ละรุ่นเปลี่ยนอะไร) |
| `.gitignore` | กันไม่ให้ไฟล์ Excel/CSV ถูกอัปโหลดขึ้น GitHub โดยไม่ตั้งใจ |

ระดับสิทธิ์ผู้ใช้

| ระดับ | ทำอะไรได้ |
|---|---|
| ผู้ดูแล (admin) | ดู, Upload ไฟล์ Excel, บันทึกการติดตาม, เปลี่ยนสิทธิ์ผู้ใช้ |
| ทีมติดตาม (staff) | ดู, บันทึกการติดตามลูกค้า |
| ดูอย่างเดียว (viewer) | ดูอย่างเดียว (ค่าเริ่มต้นของผู้ใช้ใหม่) |

---

## ติดตั้งครั้งแรก (ประมาณ 20 นาที)

### ขั้นที่ 1 — สร้างโปรเจกต์ Supabase
1. ไปที่ <https://supabase.com> → **Start your project** → เลือก **Continue with GitHub** (ใช้บัญชี GitHub เดิมได้)
2. กด **New project**
   - Name: `set-dashboard`
   - Database Password: ตั้งรหัสที่เดายาก แล้ว **จดเก็บไว้** (ไม่ได้ใช้ในหน้าเว็บ แต่ต้องใช้ตอนดูแลระบบ)
   - Region: **Southeast Asia (Singapore)** (ใกล้ไทยที่สุด เร็วที่สุด)
3. กด **Create new project** แล้วรอประมาณ 1–2 นาที

### ขั้นที่ 2 — สร้างตารางและระบบสิทธิ์
1. เมนูซ้าย → **SQL Editor** → **New query**
2. เปิดไฟล์ `supabase/setup.sql` คัดลอกทั้งหมดมาวาง → กด **Run**
3. ต้องขึ้นว่า `Success. No rows returned` (รันซ้ำได้ ไม่ทำให้ข้อมูลหาย)

### ขั้นที่ 2.1 — เปิดให้ผู้ดูแลสร้างผู้ใช้จากหน้า Dashboard
1. **SQL Editor** → **New query** → วางไฟล์ `supabase/admin-users.sql` ทั้งหมด → **Run**
2. ต้องขึ้น `Success. No rows returned`

### ขั้นที่ 2.2 — อัปเดตฐานข้อมูลสำหรับ v1.4.0 (วันนัด + ผู้รับผิดชอบ)
1. **SQL Editor** → **New query** → วางไฟล์ `supabase/v1.4.0.sql` → **Run**

### ขั้นที่ 3 — ปิดการสมัครสมาชิกเอง
เพื่อให้มีแต่ผู้ดูแลเท่านั้นที่สร้างบัญชีได้
1. เมนูซ้าย → **Authentication** → **Sign In / Providers** (บางเวอร์ชันอยู่ใน Authentication → Settings)
2. ปิด **Allow new users to sign up** → **Save**
3. ตรวจว่า Provider **Email** ยังเปิดอยู่

### ขั้นที่ 4 — สร้างผู้ใช้
1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Email: `ชื่อผู้ใช้@set.local` เช่น `patt@set.local` · Password: ตั้งรหัส (อย่างน้อย 8 ตัว)
3. ติ๊ก **Auto Confirm User** → **Create user**
4. ทำซ้ำให้ครบทุกคน

> - **ผู้ใช้คนแรกที่สร้างจะเป็นผู้ดูแล (admin) อัตโนมัติ** ให้สร้างบัญชีของตัวเองก่อน
> - ตอน Log in พิมพ์แค่ `patt` ก็ได้ ระบบเติม `@set.local` ให้เอง
> - ถ้า Supabase ไม่รับอีเมล `@set.local` ให้ใช้อีเมลจริงของแต่ละคนแทน (Log in ด้วยอีเมลเต็มได้เหมือนกัน)
> - ชื่อที่แสดงในหน้าเว็บตั้งต้นเป็นชื่อผู้ใช้ แก้เป็นชื่อจริงได้ที่ **Table Editor → profiles → display_name**

### ขั้นที่ 5 — ใส่ค่าใน `config.js`
1. Supabase → **Project Settings** (ไอคอนเฟือง) → **API** (หรือ **Data API / API Keys**)
2. คัดลอก **Project URL** และ **Publishable key** (`sb_publishable_...`) หรือ **anon public key** (`eyJ...`) มาใส่ใน `config.js`
   - หาได้ง่ายสุดจากปุ่มสีเขียว **Connect** ด้านบนของโปรเจกต์ → แท็บ App Frameworks

```js
window.SET_CONFIG = {
  SUPABASE_URL: "https://abcdefghijk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  USERNAME_DOMAIN: "set.local"
};
```

> ⚠️ ใช้ **publishable / anon** key เท่านั้น **ห้าม** ใส่ `secret` หรือ `service_role` key เด็ดขาด
> anon key เปิดเผยได้ เพราะข้อมูลถูกป้องกันด้วยระบบสิทธิ์ (Row Level Security) ที่ตั้งไว้ในขั้นที่ 2 ถ้ายังไม่ Log in จะอ่านอะไรไม่ได้เลย

### ขั้นที่ 6 — เอาขึ้น GitHub Pages
1. GitHub → **New repository** → ชื่อ `set-dashboard` → **Public** → **Create repository**
2. กด **uploading an existing file** → ลากไฟล์ทั้งหมดในโฟลเดอร์นี้ (รวมโฟลเดอร์ `supabase`) วางลงไป → **Commit changes**
   - **อย่า** อัปโหลดไฟล์ Excel ข้อมูลลูกค้าขึ้น GitHub
3. **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**
4. รอ 1–2 นาที จะได้ลิงก์ `https://pattana2026.github.io/set-dashboard/`

### ขั้นที่ 7 — ทดสอบ
1. เปิดลิงก์ → Log in ด้วยบัญชีผู้ดูแล
2. กด **Upload ไฟล์ Excel** → เลือกไฟล์รูปแบบเดิม
3. กด **จัดการผู้ใช้** → เปลี่ยนระดับสิทธิ์ให้ทีม (ทีมติดตาม / ดูอย่างเดียว)
4. ลอง Log in ด้วยบัญชีทีมจากอีกเครื่อง → เปลี่ยนสถานะการติดตาม → อีกเครื่องต้องเห็นทันที

---

## การดูแลประจำ

**Upload ข้อมูลใหม่** — ผู้ดูแลกด Upload ไฟล์ Excel ได้ตลอด ข้อมูลชุดใหม่แทนชุดเดิม และทุกคนเห็นทันที ส่วนผลการติดตามลูกค้ายังอยู่ครบ (ผูกกับ Job no.)

**เพิ่มผู้ใช้ / ตั้งรหัสใหม่ / ลบผู้ใช้** — ผู้ดูแล Log in เข้า Dashboard → ปุ่ม **จัดการผู้ใช้** → กรอกชื่อผู้ใช้ ชื่อที่แสดง รหัสผ่าน (กด "สุ่ม" ได้) และระดับสิทธิ์ → **สร้างผู้ใช้** แล้วกด "คัดลอก" ส่งข้อมูลให้ผู้ใช้ทางช่องทางส่วนตัว

**ลบผู้ใช้ / พนักงานลาออก** — Supabase → Authentication → Users → เลือกผู้ใช้ → Delete user

**ผู้ใช้ลืมรหัสผ่าน** — Supabase → SQL Editor → รันคำสั่งนี้ (แก้อีเมลและรหัสใหม่)
```sql
update auth.users
set encrypted_password = extensions.crypt('รหัสใหม่อย่างน้อย8ตัว', extensions.gen_salt('bf'))
where email = 'somchai@set.local';
```
ผู้ใช้เปลี่ยนรหัสผ่านเองได้ที่ปุ่ม **เปลี่ยนรหัสผ่าน** หลัง Log in

**โปรเจกต์หยุดทำงาน (Paused)** — แพ็กเกจฟรีจะหยุดเองถ้าไม่มีใครใช้ 7 วัน เข้า Supabase แล้วกด **Restore project** (ข้อมูลไม่หาย)

**สำรองข้อมูล** — Supabase → Table Editor → เลือกตาราง `followups` (ผลการติดตาม) → **Export to CSV** แนะนำทำเดือนละครั้ง ส่วนข้อมูลงานมีไฟล์ Excel ต้นฉบับอยู่แล้ว

**แก้หน้าเว็บ** — แก้ไฟล์ใน GitHub แล้ว Commit หน้าเว็บจะอัปเดตภายใน 1–2 นาที

---

## รูปแบบไฟล์ Excel ที่รองรับ
ใช้แถวที่ 1 เป็นหัวตาราง ระบบจับคอลัมน์จากชื่อ (ไม่สนลำดับ):
`Work order`, `Job no.`, `Open date`, `Finished date`, `Brand`, `Code` (ID Station), `Name`, `InformBy`, `UserName`, `Sup.`, `Problem`, `Other`, `Deadline`, `Address`, `Month`, `เลขที่คำขอออนไลน์`, `วันที่ยื่นคำขอ`, `สถานะดำเนินการ`, `ครบรอบครั้งถัดไป`
และถ้ามี: `SerialNumber`, `InstallDate`, `WarrantDate`

ต้องมีอย่างน้อย `Work order` หรือ `Job no.` จึงจะ Upload ได้

## ต่อยอดในอนาคต (SMS API)
ระบบที่ดึงข้อมูลจาก SMS แค่ต้องเขียนข้อมูลลงตาราง `jobs` ด้วย `batch_id` ใหม่ แล้วเรียกฟังก์ชัน `finish_upload` แบบเดียวกับปุ่ม Upload หน้าเว็บไม่ต้องแก้
