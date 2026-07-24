# Easy Dashboard Integration API v1

API ini adalah jalur read-only untuk aplikasi Calculator. Calculator tidak
perlu dan tidak boleh terhubung langsung ke Firebird.

```text
Calculator backend -> HTTPS -> Easy Dashboard Integration API -> data internal
```

## Base URL

Base path aplikasi:

```text
/api/integration/v1
```

Setelah domain API dipasang, bentuk URL-nya misalnya:

```text
https://api-dashboard.gte.co.id/api/integration/v1
```

Domain publik final ditentukan saat reverse proxy/DNS disiapkan.

## Autentikasi

Semua endpoint membutuhkan API key melalui header:

```http
X-API-Key: <API_KEY>
```

API key harus disimpan di backend Calculator, bukan di JavaScript/browser.
Key tidak boleh dimasukkan ke source code atau Git.

Konfigurasi Easy Dashboard berada di `backend/.env`:

```text
EASY_INTEGRATION_API_KEYS=<API_KEY>
```

Setiap key minimal 32 karakter. Beberapa key dapat dipasang dengan pemisah koma
untuk rotasi tanpa downtime:

```text
EASY_INTEGRATION_API_KEYS=<KEY_LAMA>,<KEY_BARU>
```

## Endpoint

```text
GET /health
GET /spk
GET /stock
GET /stock-item-material
GET /biaya-produksi
GET /standarisasi-harga
GET /fifo
GET /standarisasi-harga/{standar_id}/details
```

Semua endpoint hanya menerima `GET` dan `OPTIONS`. Respons diberi
`Cache-Control: no-store` serta `X-Request-ID` untuk penelusuran log.

## Pagination dan filter

Endpoint daftar menerima `offset` dan `limit`. Default `limit` adalah 100 dan
maksimum 500.

- SPK: `search`, `date_from`, `date_to`, `status`
- Stok: `search`, `itemno`, `description`, `description2`, `quantity`,
  `minimum_qty`, `stock_note`, `code_product`, `cost_description`, `unit`,
  `category`, `sort_field`, `sort_order`
- Stock Item Material: `search`, `itemno`, `description`, `description2`, `quantity`,
  `minimum_qty`, `stock_note`, `code_product`, `cost_description`, `unit`,
  `category`, `sort_field`, `sort_order`
- Biaya Produksi: `search`, `account`, `status`
- Standarisasi Harga: `search`, `status`, `date_from`, `date_to`
- FIFO: `search`

Parameter yang tidak didukung menghasilkan status `400`.

Contoh:

```http
GET /api/integration/v1/spk?offset=0&limit=100&date_from=2026-06-01
X-API-Key: <API_KEY>
```

Format respons daftar:

```json
{
  "success": true,
  "api_version": "v1",
  "resource": "spk",
  "generated_at": "2026-06-20T12:00:00+07:00",
  "data": [],
  "meta": {
    "offset": 0,
    "limit": 100,
    "count": 100,
    "total": 250,
    "has_more": true
  }
}
```

Calculator mengambil halaman berikutnya dengan menambah `offset` sebesar
`count`, sampai `has_more` bernilai `false`.

## Status dan error

| HTTP | Arti |
|---:|---|
| 200 | Request berhasil |
| 400 | Pagination atau parameter tidak valid |
| 401 | API key tidak ada/tidak valid |
| 404 | Resource tidak ditemukan |
| 429 | Batas request terlampaui |
| 500 | Sumber data internal gagal |
| 503 | API key Easy Dashboard belum dikonfigurasi dengan benar |

Format error:

```json
{
  "success": false,
  "api_version": "v1",
  "error": {
    "code": "invalid_api_key",
    "message": "API key tidak valid"
  }
}
```

Jika menerima `429`, baca header `Retry-After` sebelum mencoba kembali.

## Konfigurasi Easy Dashboard

Salin nilai dari `.env.example` dan isi konfigurasi berikut:

```text
EASY_JWT_SECRET_KEY=<RANDOM_SECRET_MIN_32_KARAKTER>
EASY_INTEGRATION_API_KEYS=<RANDOM_API_KEY_MIN_32_KARAKTER>
EASY_INTEGRATION_RATE_LIMIT_PER_MINUTE=120
EASY_INTEGRATION_CORS_ORIGINS=https://calculator.gte.co.id
EASY_LOG_LEVEL=INFO
EASY_TRUST_PROXY=0
```

`EASY_TRUST_PROXY=1` hanya digunakan bila Easy Dashboard tepat berada di
belakang reverse proxy tepercaya. Pengaturan ini membuat alamat IP pada log dan
rate limit mengikuti header proxy.

CORS hanya berpengaruh pada request browser. Integrasi backend-to-backend tetap
dapat berjalan tanpa memasukkan origin.

## Pengujian dari server Easy Dashboard

PowerShell:

```powershell
$headers = @{ "X-API-Key" = "<API_KEY>" }
Invoke-RestMethod `
  -Uri "http://127.0.0.1:5000/api/integration/v1/health" `
  -Headers $headers
```

Tes satu record:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:5000/api/integration/v1/stock-item-material?limit=1" `
  -Headers $headers
```

Tes FIFO:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:5000/api/integration/v1/fifo?limit=20&search=ACB-SS4X-00.50" `
  -Headers $headers
```

Tes FIFO:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:5000/api/integration/v1/fifo?limit=20&search=ACB-SS4X-00.50" `
  -Headers $headers
```

## Checklist sebelum Calculator dihubungkan

- Easy Dashboard backend berjalan stabil dan otomatis hidup setelah restart.
- API hanya dipublikasikan melalui HTTPS.
- Reverse proxy meneruskan request ke port backend internal.
- Firewall tidak membuka port Firebird ke internet.
- API key diberikan melalui kanal privat kepada pengelola backend Calculator.
- Log `X-Request-ID`, status, durasi, IP, dan identitas key dipantau.
- Backup `.env` disimpan aman dan tidak masuk Git.
- Key lama dan key baru diuji melalui prosedur rotasi.

## Rotasi API key

1. Tambahkan key baru setelah key lama, dipisahkan koma.
2. Restart backend Easy Dashboard.
3. Ubah backend Calculator agar memakai key baru.
4. Pastikan endpoint health dan data berhasil.
5. Hapus key lama dari `.env`, lalu restart kembali.

Tidak perlu mengubah URL endpoint saat rotasi key.
