import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { AuthProvider, useAuth } from './context/AuthContext'
import MainLayout from './components/MainLayout'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Stock = lazy(() => import('./pages/Stock'))
const SIINAS = lazy(() => import('./pages/SIINAS'))
const SIINASReferensi = lazy(() => import('./pages/SIINASReferensi'))
const SIINASValidasiMaterialSatuan3 = lazy(() => import('./pages/SIINASValidasiMaterialSatuan3'))
const BarangBaru = lazy(() => import('./pages/BarangBaru'))
const Riwayat = lazy(() => import('./pages/Riwayat'))
const Users = lazy(() => import('./pages/Users'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Login = lazy(() => import('./pages/Login'))

// Sub-halaman Pembelian
const DaftarPermintaan = lazy(() => import('./pages/Pembelian/DaftarPermintaan'))
const DaftarPembelian = lazy(() => import('./pages/Pembelian/DaftarPembelian'))
const DaftarPenerimaan = lazy(() => import('./pages/Pembelian/DaftarPenerimaan'))
const DaftarFPB = lazy(() => import('./pages/Pembelian/DaftarFPB'))

// Sub-halaman Penjualan
const DaftarPenjualan = lazy(() => import('./pages/Penjualan/DaftarPenjualan'))
const DaftarPengiriman = lazy(() => import('./pages/Penjualan/DaftarPengiriman'))
const DaftarInvoice = lazy(() => import('./pages/Penjualan/DaftarInvoice'))

// Sub-halaman Manufaktur
const SPK = lazy(() => import('./pages/Manufaktur/SPK'))
const MonitoringSPK = lazy(() => import('./pages/Manufaktur/MonitoringSPK'))
const Formula = lazy(() => import('./pages/Manufaktur/Formula'))
const MonitoringFormula = lazy(() => import('./pages/Manufaktur/MonitoringFormula'))
const SPM = lazy(() => import('./pages/Manufaktur/SPM'))
const GP = lazy(() => import('./pages/Manufaktur/GP'))
const BiayaProduksi = lazy(() => import('./pages/Manufaktur/BiayaProduksi'))
const StandarisasiHarga = lazy(() => import('./pages/Manufaktur/StandarisasiHarga'))
const FIFO = lazy(() => import('./pages/Manufaktur/FIFO'))
const ProfitLoss = lazy(() => import('./pages/Akuntansi/ProfitLoss'))
const Aset = lazy(() => import('./pages/Akuntansi/Aset'))
const Pengembangan = lazy(() => import('./pages/Akuntansi/Pengembangan'))

function PrivateRoute({ children, module }) {
  const { user, loading, hasPermission } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (module && !hasPermission(module)) return <Navigate to="/" />
  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="stock"       element={<PrivateRoute module="stock"><Stock /></PrivateRoute>} />
          <Route path="siinas/monitoring-report" element={<PrivateRoute module="siinas"><SIINAS /></PrivateRoute>} />
          <Route path="siinas/referensi" element={<PrivateRoute module="siinas"><SIINASReferensi /></PrivateRoute>} />
          <Route path="siinas/validasi-material-satuan-3" element={<PrivateRoute module="siinas"><SIINASValidasiMaterialSatuan3 /></PrivateRoute>} />
          <Route path="siinas" element={<Navigate to="/siinas/monitoring-report" replace />} />
          <Route path="barang-baru" element={<PrivateRoute module="barang-baru"><BarangBaru /></PrivateRoute>} />
          <Route path="riwayat"     element={<PrivateRoute module="riwayat"><Riwayat /></PrivateRoute>} />
          <Route path="users"       element={<PrivateRoute module="users"><Users /></PrivateRoute>} />
          <Route path="audit-log"   element={<PrivateRoute module="audit"><AuditLog /></PrivateRoute>} />

          {/* Sub-menu Pembelian */}
          <Route path="pembelian/permintaan" element={<PrivateRoute module="pembelian_permintaan"><DaftarPermintaan /></PrivateRoute>} />
          <Route path="pembelian/pembelian"  element={<PrivateRoute module="pembelian_pembelian"><DaftarPembelian /></PrivateRoute>} />
          <Route path="pembelian/penerimaan" element={<PrivateRoute module="pembelian_penerimaan"><DaftarPenerimaan /></PrivateRoute>} />
          <Route path="pembelian/fpb"        element={<PrivateRoute module="pembelian_fpb"><DaftarFPB /></PrivateRoute>} />
          <Route path="pembelian" element={<Navigate to="/pembelian/permintaan" replace />} />

          {/* Sub-menu Penjualan */}
          <Route path="penjualan/penjualan"  element={<PrivateRoute module="penjualan_penjualan"><DaftarPenjualan /></PrivateRoute>} />
          <Route path="penjualan/pengiriman" element={<PrivateRoute module="penjualan_pengiriman"><DaftarPengiriman /></PrivateRoute>} />
          <Route path="penjualan/invoice"    element={<PrivateRoute module="penjualan_invoice"><DaftarInvoice /></PrivateRoute>} />
          <Route path="penjualan" element={<Navigate to="/penjualan/penjualan" replace />} />

          {/* Sub-menu Manufaktur */}
          <Route path="manufaktur/spk" element={<PrivateRoute module="spk_spk"><SPK /></PrivateRoute>} />
          <Route path="manufaktur/monitoring-spk" element={<PrivateRoute module="spk_monitoring"><MonitoringSPK /></PrivateRoute>} />
          <Route path="manufaktur/formula" element={<PrivateRoute module="spk_formula"><Formula /></PrivateRoute>} />
          <Route path="manufaktur/monitoring-formula" element={<PrivateRoute module="spk_monitoring_formula"><MonitoringFormula /></PrivateRoute>} />
          <Route path="manufaktur/spm" element={<PrivateRoute module="spk_spm"><SPM /></PrivateRoute>} />
          <Route path="manufaktur/gp"  element={<PrivateRoute module="spk_gp"><GP  /></PrivateRoute>} />
          <Route path="manufaktur/biaya-produksi" element={<PrivateRoute module="spk_biaya_produksi"><BiayaProduksi /></PrivateRoute>} />
          <Route path="manufaktur/standarisasi-harga" element={<PrivateRoute module="spk_standarisasi_harga"><StandarisasiHarga /></PrivateRoute>} />
          <Route path="manufaktur/fifo" element={<PrivateRoute module="spk_fifo"><FIFO /></PrivateRoute>} />
          <Route path="manufaktur" element={<Navigate to="/manufaktur/spk" replace />} />

          {/* Legacy redirect kalau ada link lama ke /spk */}
          <Route path="spk" element={<Navigate to="/manufaktur/spk" replace />} />

          {/* Sub-menu Akuntansi */}
          <Route path="akuntansi/hpp" element={<PrivateRoute module="akuntansi"><Pengembangan title="HPP" /></PrivateRoute>} />
          <Route path="akuntansi/profit-loss" element={<PrivateRoute module="akuntansi"><ProfitLoss /></PrivateRoute>} />
          <Route path="akuntansi/aset" element={<PrivateRoute module="akuntansi"><Aset /></PrivateRoute>} />
          <Route path="akuntansi/beban-gaji" element={<PrivateRoute module="akuntansi"><Pengembangan title="Beban" /></PrivateRoute>} />
          <Route path="akuntansi" element={<Navigate to="/akuntansi/profit-loss" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0b4fb3',
          colorSuccess: '#1f9d55',
          colorInfo: '#1b4fd8',
          colorWarning: '#f59e0b',
          colorError: '#e8212a',
          colorBgLayout: '#f2f6fc',
          colorText: '#0d1a3a',
          colorTextSecondary: '#64748b',
          borderRadius: 8,
          wireframe: false,
        },
        components: {
          Layout: {
            bodyBg: '#f2f6fc',
            headerBg: 'rgba(255,255,255,0.88)',
            siderBg: '#061a44',
          },
          Card: {
            headerBg: 'transparent',
            borderRadiusLG: 8,
          },
          Button: {
            borderRadius: 8,
            controlHeight: 36,
          },
          Table: {
            headerBg: '#f7f9fd',
            headerColor: '#1e2b4f',
            rowHoverBg: '#eef5ff',
          },
          Menu: {
            darkItemBg: '#061a44',
            darkSubMenuItemBg: '#041330',
            darkItemSelectedBg: '#0b4fb3',
            darkItemSelectedColor: '#ffffff',
            darkItemHoverBg: 'rgba(255,255,255,0.08)',
          },
        },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
