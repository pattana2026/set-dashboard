// ตั้งค่าการเชื่อมต่อ Supabase (ดูคู่มือใน README.md ขั้นตอนที่ 3)
// ค่า publishable / anon key เปิดเผยได้ ปลอดภัยเพราะข้อมูลถูกป้องกันด้วย Row Level Security ใน setup.sql
// ห้ามใส่ secret / service_role key ในไฟล์นี้เด็ดขาด
window.SET_CONFIG = {
  SUPABASE_URL: "https://qupupbfoinphtgrlgkno.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_G-fb538iKxXTcdhYT8c3nQ_-n1G0-TI",
  // ผู้ใช้พิมพ์แค่ชื่อผู้ใช้ได้ ระบบจะเติม @set.local ให้อัตโนมัติ (ต้องตรงกับอีเมลที่สร้างใน Supabase)
  USERNAME_DOMAIN: "set.local"
};
