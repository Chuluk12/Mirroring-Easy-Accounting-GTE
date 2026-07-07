import { useState } from 'react'
import { Badge, Dropdown, Layout, Menu, Tag, Tooltip, theme } from 'antd'
import {
  BellOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  ContainerOutlined,
  DashboardOutlined,
  DollarOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  ImportOutlined,
  InboxOutlined,
  LogoutOutlined,
  PlusCircleOutlined,
  SafetyOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import useVisiblePolling from '../hooks/useVisiblePolling'

const { Header, Sider, Content } = Layout

const ROLE_COLOR = {
  admin: 'magenta',
  inventory: 'cyan',
  purchasing: 'orange',
  marketing: 'green',
  produksi: 'purple',
  ppc: 'geekblue',
  akutansi: 'gold',
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const { user, logout, hasPermission } = useAuth()

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        logout()
        navigate('/login')
      }
    },
  }

  const canSeeRiwayat = hasPermission('riwayat')

  const fetchNotif = async () => {
    try {
      const res = await api.get('/api/riwayat', {
        params: { limit: 1, offset: 0 },
      })
      setTodayCount(res.data.today_count)
    } catch (e) {}
  }

  useVisiblePolling(fetchNotif, 30000, canSeeRiwayat, true)

  const buildMenuItems = () => {
    const items = [
      { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    ]

    const persediaanChildren = []
    if (hasPermission('stock')) {
      persediaanChildren.push({ key: '/stock', icon: <InboxOutlined />, label: 'Stok Barang' })
    }
    if (hasPermission('barang-baru')) {
      persediaanChildren.push({ key: '/barang-baru', icon: <PlusCircleOutlined />, label: 'Barang Baru' })
    }
    if (hasPermission('riwayat')) {
      persediaanChildren.push({
        key: '/riwayat',
        icon: <HistoryOutlined />,
        label: (
          <span>
            Riwayat Persediaan{' '}
            {todayCount > 0 && (
              <Badge
                count={todayCount}
                overflowCount={999}
                style={{ marginLeft: 4, backgroundColor: '#e8212a', fontSize: 10 }}
              />
            )}
          </span>
        ),
      })
    }
    if (persediaanChildren.length > 0) {
      items.push({
        key: 'persediaan',
        icon: <InboxOutlined />,
        label: 'Persediaan',
        children: persediaanChildren,
      })
    }

    if (hasPermission('siinas')) {
      items.push({
        key: 'siinas-group',
        icon: <FileTextOutlined />,
        label: 'Siinas',
        children: [
          { key: '/siinas/monitoring-report', icon: <FileTextOutlined />, label: 'Monitoring Report' },
          { key: '/siinas/validasi-material-satuan-3', icon: <FileTextOutlined />, label: 'Validasi Material Satuan 3' },
          { key: '/siinas/referensi', icon: <FileTextOutlined />, label: 'Referensi' },
        ],
      })
    }

    const pembelianChildren = []
    if (hasPermission('pembelian_permintaan')) {
      pembelianChildren.push({ key: '/pembelian/permintaan', icon: <FileTextOutlined />, label: 'Daftar Permintaan' })
    }
    if (hasPermission('pembelian_pembelian')) {
      pembelianChildren.push({ key: '/pembelian/pembelian', icon: <ShoppingCartOutlined />, label: 'Daftar Pembelian' })
    }
    if (hasPermission('pembelian_penerimaan')) {
      pembelianChildren.push({ key: '/pembelian/penerimaan', icon: <ImportOutlined />, label: 'Daftar Penerimaan' })
    }
    if (hasPermission('pembelian_fpb')) {
      pembelianChildren.push({ key: '/pembelian/fpb', icon: <DollarOutlined />, label: 'Daftar FPB' })
    }
    if (pembelianChildren.length > 0) {
      items.push({
        key: 'pembelian-group',
        icon: <ShoppingCartOutlined />,
        label: 'Pembelian',
        children: pembelianChildren,
      })
    }

    const penjualanChildren = []
    if (hasPermission('penjualan_penjualan')) {
      penjualanChildren.push({ key: '/penjualan/penjualan', icon: <ShoppingOutlined />, label: 'Daftar Penjualan' })
    }
    if (hasPermission('penjualan_pengiriman')) {
      penjualanChildren.push({ key: '/penjualan/pengiriman', icon: <SendOutlined />, label: 'Daftar Pengiriman' })
    }
    if (hasPermission('penjualan_invoice')) {
      penjualanChildren.push({ key: '/penjualan/invoice', icon: <FileTextOutlined />, label: 'Daftar Invoice' })
    }
    if (penjualanChildren.length > 0) {
      items.push({
        key: 'penjualan-group',
        icon: <ShoppingOutlined />,
        label: 'Penjualan',
        children: penjualanChildren,
      })
    }

    const manufakturChildren = []
    if (hasPermission('spk_spk')) {
      manufakturChildren.push({ key: '/manufaktur/spk', icon: <ToolOutlined />, label: 'SPK' })
    }
    if (hasPermission('spk_monitoring')) {
      manufakturChildren.push({ key: '/manufaktur/monitoring-spk', icon: <ToolOutlined />, label: 'Monitoring SPK' })
    }
    if (hasPermission('spk_formula')) {
      manufakturChildren.push({ key: '/manufaktur/formula', icon: <FileTextOutlined />, label: 'Daftar Formula' })
    }
    if (hasPermission('spk_monitoring_formula')) {
      manufakturChildren.push({ key: '/manufaktur/monitoring-formula', icon: <FileTextOutlined />, label: 'Monitoring Formula' })
    }
    if (hasPermission('spk_spm')) {
      manufakturChildren.push({ key: '/manufaktur/spm', icon: <ContainerOutlined />, label: 'SPM' })
    }
    if (hasPermission('spk_gp')) {
      manufakturChildren.push({ key: '/manufaktur/gp', icon: <CheckCircleOutlined />, label: 'GP' })
    }
    if (hasPermission('spk_biaya_produksi')) {
      manufakturChildren.push({ key: '/manufaktur/biaya-produksi', icon: <DollarOutlined />, label: 'Biaya Produksi' })
    }
    if (hasPermission('spk_standarisasi_harga')) {
      manufakturChildren.push({ key: '/manufaktur/standarisasi-harga', icon: <SafetyOutlined />, label: 'Standarisasi Harga' })
    }
    if (hasPermission('spk_fifo')) {
      manufakturChildren.push({ key: '/manufaktur/fifo', icon: <InboxOutlined />, label: 'FIFO' })
    }
    if (manufakturChildren.length > 0) {
      items.push({
        key: 'manufaktur-group',
        icon: <ExperimentOutlined />,
        label: 'Manufaktur',
        children: manufakturChildren,
      })
    }

    if (hasPermission('akuntansi')) {
      const developmentTag = <Tag color="gold" style={{ marginLeft: 6, fontSize: 10 }}>Pengembangan</Tag>
      items.push({
        key: 'akuntansi-group',
        icon: <CalculatorOutlined />,
        label: 'Akuntansi',
        children: [
          {
            key: '/akuntansi/hpp',
            icon: <DollarOutlined />,
            label: <span>HPP {developmentTag}</span>,
            disabled: true,
          },
          { key: '/akuntansi/profit-loss', icon: <CalculatorOutlined />, label: 'Profit & Loss' },
          { key: '/akuntansi/aset', icon: <CalculatorOutlined />, label: 'Aset' },
          {
            key: '/akuntansi/beban-gaji',
            icon: <DollarOutlined />,
            label: <span>Beban {developmentTag}</span>,
            disabled: true,
          },
        ],
      })
    }

    if (hasPermission('users')) {
      items.push({
        key: 'admin-group',
        icon: <SafetyOutlined />,
        label: 'Administrasi',
        children: [
          { key: '/users', icon: <TeamOutlined />, label: 'User & Permission' },
          { key: '/audit-log', icon: <HistoryOutlined />, label: 'Audit Log' },
        ],
      })
    }

    return items
  }

  const getDefaultOpenKeys = () => {
    const path = location.pathname
    if (['/stock', '/barang-baru', '/riwayat'].includes(path)) return ['persediaan']
    if (path.startsWith('/pembelian')) return ['pembelian-group']
    if (path.startsWith('/penjualan')) return ['penjualan-group']
    if (path.startsWith('/manufaktur')) return ['manufaktur-group']
    if (path.startsWith('/akuntansi')) return ['akuntansi-group']
    if (path.startsWith('/siinas')) return ['siinas-group']
    if (path === '/users' || path === '/audit-log') return ['admin-group']
    return []
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f2f6fc' }}>
      <Sider
        collapsible
        collapsed={focusMode || collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={0}
        width={248}
        className="easy-sider"
      >
        <div className="easy-brand">
          {!collapsed && <div className="easy-brand-panel" />}
          <img src="/logo-gte-horizontal.jpg" alt="Grand Twins Engineering" className="easy-brand-logo" />
          {!collapsed && (
            <div className="easy-brand-copy">
              <div className="easy-brand-title">GTE Dashboard</div>
              <div className="easy-brand-subtitle">Internal Monitor</div>
            </div>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          className="easy-menu"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={getDefaultOpenKeys()}
          items={buildMenuItems()}
          onClick={({ key }) => {
            if (key.startsWith('/')) navigate(key)
          }}
        />
      </Sider>

      <Layout
        className="easy-main-layout"
        style={{
          background: 'transparent',
          marginLeft: focusMode || collapsed ? 0 : 248,
          transition: 'margin-left 0.2s ease',
        }}
      >
        <Header
          className="easy-header"
          style={{ background: token.colorBgContainer }}
        >
          <div className="easy-header-title">
            <div className="easy-header-mark">
              <DashboardOutlined />
            </div>
            <div>
              <div className="easy-header-name">Grand Twins Engineering</div>
              <div className="easy-header-subtitle">Dashboard GTE Monitoring System</div>
            </div>
          </div>

          <div className="easy-header-actions">
            <Tooltip title={focusMode ? 'Tampilkan sidebar' : 'Layar penuh'}>
              <button
                type="button"
                className="easy-icon-button"
                onClick={() => setFocusMode(current => !current)}
                aria-label={focusMode ? 'Tampilkan sidebar' : 'Layar penuh tanpa sidebar'}
              >
                {focusMode ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </Tooltip>
            {hasPermission('riwayat') && (
              <Badge count={todayCount} overflowCount={999}>
                <button
                  type="button"
                  className="easy-icon-button"
                  onClick={() => navigate('/riwayat')}
                  aria-label="Riwayat persediaan hari ini"
                >
                  <BellOutlined />
                </button>
              </Badge>
            )}
            <Dropdown menu={userMenu} placement="bottomRight">
              <span className="easy-user-chip">
                <UserOutlined className="easy-user-icon" />
                <span className="easy-user-name">{user?.name}</span>
                <Tag className="easy-user-role" color={ROLE_COLOR[user?.role] || 'default'}>
                  {user?.role?.toUpperCase()}
                </Tag>
              </span>
            </Dropdown>
          </div>
        </Header>

        <Content className="easy-content" style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
