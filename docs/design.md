---
version: alpha
name: Ungu Laundry Calm Operations
description: Design system for a premium but practical laundry SaaS dashboard.
colors:
  mint: "#95DFD3"
  teal: "#1F4B5D"
  paper: "#FAFAFA"
  surface: "#FFFFFF"
  surfaceSoft: "#F4FBF9"
  border: "#CFE9E4"
  borderSoft: "#E7F5F2"
  text: "#1F4B5D"
  muted: "#60757C"
  success: "#2F7D63"
  warning: "#9A6A22"
  danger: "#A8424A"
typography:
  pageTitle:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: 0
  sectionTitle:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 18px
  xl: 28px
  desktopMaxWidth: 1200px
components:
  buttonPrimary:
    background: "#1F4B5D"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  card:
    background: "#FAFAFA"
    borderColor: "#CFE9E4"
    rounded: "{rounded.md}"
  statusChip:
    rounded: "{rounded.full}"
    typography: "{typography.label}"
---

# Ungu Laundry Design Guide

## Overview

Ungu Laundry adalah aplikasi operasional laundry B2B2C: customer membuat order, admin outlet mengelola pesanan, chat, pembayaran, stok, dan finance. UI harus terasa bersih, stabil, dan dipercaya untuk kerja harian, bukan seperti landing page promosi.

Target emosionalnya adalah tenang dan rapi. Palette mint-teal dipakai untuk menurunkan rasa bising visual: warna utama lembut, teks tegas, permukaan terang, dan status mudah discan. Interface tidak boleh membuat user gelisah karena spacing tidak rata, warna terlalu banyak, card bertumpuk, atau teks kepotong.

## Colors

Palette utama tidak berubah:

| Token | Value | Usage |
| --- | --- | --- |
| Mint | `#95DFD3` | Accent lembut, selected state, skeleton, background highlight |
| Teal | `#1F4B5D` | Text utama, primary action, active navigation, chart line |
| Paper | `#FAFAFA` | Base page background dan card surface |
| Surface soft | `#F4FBF9` | Dashboard band, empty state, secondary surface |
| Border | `#CFE9E4` | Card, input, table, list divider |
| Muted | `#60757C` | Helper text, metadata, caption |
| Success | `#2F7D63` | Paid, selesai, subscription aktif |
| Warning | `#9A6A22` | Pending, menunggu harga, butuh aksi admin |
| Danger | `#A8424A` | Failed, batal, error |

Rules:

- Gunakan teal untuk teks penting dan aksi utama.
- Gunakan mint sebagai highlight, focus ring, selected state, dan skeleton lembut, bukan sebagai background besar.
- Gunakan putih/paper sebagai mayoritas permukaan agar UI terasa lega.
- Status semantik boleh memakai success/warning/danger, tetapi tetap dalam tone soft.
- Hindari menambah ungu, biru terang, neon, beige dominan, glow, dan decorative gradient.
- Gradient hanya boleh muncul untuk micro utility yang tidak terbaca sebagai dekorasi, seperti skeleton shimmer atau arrow select CSS.

## Typography

- Gunakan Inter/system sans seperti implementasi saat ini.
- Semua letter spacing tetap `0`; jangan pakai tracking negatif.
- Page title desktop ideal di 28-40px. Android ideal di 21-26px.
- Section title dashboard harus compact, bukan hero-scale.
- Label operasional gunakan 12-13px bold.
- Copy harus Indonesia ringkas: `Pesanan`, `Riwayat`, `Bayar`, `Stok`, `Keuangan`, `Dicuci`, `Disetrika`, `Selesai`.

## Layout

- Desktop memakai max-width sekitar `1200px`, bukan full-width tanpa batas.
- Android memakai satu kolom, padding 14-16px, bottom space cukup untuk tabbar.
- Admin screen harus dense tetapi tidak sesak: table/list lebih penting daripada dekorasi.
- Customer order flow harus mudah discan dari atas ke bawah: outlet -> layanan -> lokasi/alamat -> submit -> ringkasan.
- Landing/home screen harus terasa seperti dashboard entry point, bukan poster. Hero boleh ada, tetapi rendah, compact, dan langsung menyediakan action.
- Jangan taruh card di dalam card jika tidak perlu. Kalau markup membutuhkan nesting, inner card harus flat: shadow minimal, border lembut.
- Gunakan grid 8px rhythm: gap 8, 14, 18, 28.
- Jangan biarkan button, chip, select, atau heading resize layout saat hover.

## Elevation & Depth

Depth dibuat dengan tonal layer, border, dan shadow kecil. Heavy floating card tidak dipakai untuk dashboard biasa.

Default card shadow harus halus. Dashboard admin, table, list chat, dan finance lebih cocok terlihat seperti work surface daripada poster promosi.

Gunakan flat surfaces:

- Page background: `#F4FBF9` atau `#FAFAFA`.
- Card background: `#FFFFFF`.
- Border: `#CFE9E4` atau teal dengan opacity rendah.
- Shadow: optional, sangat halus, hanya untuk device frame/tabbar jika perlu.

## Shapes

- Radius utama: 8px.
- Radius kecil: 6px untuk receipt, thumbnail, dan compact controls.
- Radius pill hanya untuk status chip, badge, dan segmented control.
- Jangan campur radius besar 20px+ pada card biasa.

## Components

Buttons:

- Primary hanya untuk aksi utama per section: `Buat Order`, `Simpan`, `Bayar Sekarang`.
- Secondary untuk navigasi atau aksi pendukung: `Chat`, `Riwayat`, `Refresh`.
- Destructive hanya untuk hapus, batal, failed.
- Button harus punya icon jika aksinya berulang.
- Primary button solid teal. Jangan pakai gradient button.

Inputs and Selects:

- Input/select memakai border teal-soft, focus ring mint transparan.
- Native select harus tetap terlihat modern dengan arrow custom.
- Label field harus jelas, pendek, dan dekat dengan input.

Cards and Panels:

- Card dipakai untuk item berulang, form, table surface, modal, dan tool surface.
- Section besar jangan dibuat seperti card mengambang jika hanya pemisah halaman.
- Inner card dalam dashboard harus flat tanpa shadow berat.
- Promo, membership, dan ad panel memakai card putih dengan accent strip kiri mint, bukan banner gradient.
- Android topbar, tabbar, dan page background harus flat. Hindari device mockup dekoratif jika tidak punya fungsi langsung.

Tables and Lists:

- Admin order list harus mengutamakan scan cepat: nota, customer/detail, status, harga, aksi.
- Header table boleh punya background mint soft.
- Row hover cukup tonal, bukan warna keras.

Status:

- Status order konsisten: `PENDING`, `DITERIMA`, `DICUCI`, `DISETRIKA`, `SELESAI`, `DIBATALKAN`.
- Status payment konsisten: `UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`.
- Status chip harus pendek dan mudah dibaca.

Receipt:

- Receipt preview memakai monospace.
- Ukuran visual mengikuti thermal receipt 58mm/80mm.
- Jangan jadikan receipt sebagai dekorasi besar; ia adalah preview kerja.

## Do's and Don'ts

Do:

- Do keep the palette calm: mint, teal, paper.
- Do make admin screens compact and operational.
- Do use skeleton loaders instead of plain spinners where possible.
- Do keep Android screens one-column and touch-friendly.
- Do verify text does not clip inside buttons, tabs, and chips.
- Do make the first screen feel like a real app, not a generated showcase.

Don't:

- Don't add new colors outside the palette without a semantic reason.
- Don't make every section a floating card.
- Don't use oversized marketing hero type inside dashboards.
- Don't let the home hero become a poster or fake phone showcase.
- Don't rely on color only; pair status color with text.
- Don't use native-looking dropdowns without styling.
- Don't use decorative radial gradients, glow blobs, glossy cards, or fake mockup panels.
