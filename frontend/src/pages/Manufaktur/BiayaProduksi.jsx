import { useCallback, useRef, useState } from 'react'
import {
  Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip,
  Typography, message,
} from 'antd'
import {
  CheckCircleOutlined, DollarOutlined, FileExcelOutlined, ReloadOutlined,
  SearchOutlined, StopOutlined, ToolOutlined,
} from '@ant-design/icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import { exportRowsToXLS } from '../../utils/exportXls'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import { withTableSorters } from '../../utils/tableSorters'

const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const BIAYA_PRODUKSI_EXPORT_COLS = [
  { key: 'no_urut', label: 'No.', type: 'number' },
  { key: 'no_biaya_produksi', label: 'No. Biaya Produksi' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'biaya_per_jam', label: 'Biaya Per Jam', type: 'number' },
  { key: 'no_akun', label: 'No. Akun' },
  { key: 'nama_akun', label: 'Nama Akun' },
  { key: 'status', label: 'Status' },
]

const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value || 0))

export default function BiayaProduksi() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState('')
  const [status, setStatus] = useState('')
  const [summary, setSummary] = useState({
    total: 0, aktif: 0, tidak_aktif: 0, total_biaya: 0,
  })
  const [pagination, setPagination] = useState({
    current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0,
  })

  const searchRef = useRef('')
  const accountRef = useRef('')
  const statusRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchValue = '',
    accountValue = '',
    statusValue = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = {
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }
      if (searchValue) params.search = searchValue
      if (accountValue) params.account = accountValue
      if (statusValue) params.status = statusValue

      const response = await api.get('/api/biaya-produksi', { params })
      const rows = response.data.data || []
      setData(rows)
      setAccounts(response.data.accounts || [])
      setSummary(response.data.summary || {
        total: 0, aktif: 0, tidak_aktif: 0, total_biaya: 0,
      })
      setPagination({
        current: page,
        pageSize,
        total: response.data.total || 0,
      })
    } catch (error) {
      console.error('Gagal memuat biaya produksi:', error)
      message.error('Gagal memuat data biaya produksi')
    } finally {
      setLoading(false)
    }
  }, [])

  useVisiblePolling(() => {
    fetchData(
      pageRef.current,
      pageSizeRef.current,
      searchRef.current,
      accountRef.current,
      statusRef.current,
      false,
    )
  }, 30000, true, true)

  const applyFilters = (nextSearch, nextAccount, nextStatus) => {
    searchRef.current = nextSearch
    accountRef.current = nextAccount
    statusRef.current = nextStatus
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, nextSearch, nextAccount, nextStatus)
  }

  const handleReset = () => {
    setSearch('')
    setAccount('')
    setStatus('')
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    applyFilters('', '', '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (accountRef.current) params.account = accountRef.current
      if (statusRef.current) params.status = statusRef.current
      const response = await api.get('/api/biaya-produksi/export', { params })
      return (response.data.data || []).map((row, index) => ({
        ...row,
        no_urut: index + 1,
      }))
    },
    columns: [
      BIAYA_PRODUKSI_EXPORT_COLS[0],
      ...filterExportColumnsByPermission(
        'biaya_produksi',
        BIAYA_PRODUKSI_EXPORT_COLS.slice(1),
        user,
      ),
    ],
    filename: 'BiayaProduksi',
    sheetName: 'Biaya Produksi',
    message,
    setExporting,
    loadingText: 'Mengambil semua data biaya produksi...',
  })

  const columns = [
    {
      title: 'No.',
      key: 'no_urut',
      width: 70,
      fixed: 'left',
      align: 'right',
      render: (_, __, index) => (
        (pagination.current - 1) * pagination.pageSize + index + 1
      ),
    },
    {
      title: 'No. Biaya Produksi',
      dataIndex: 'no_biaya_produksi',
      key: 'no_biaya_produksi',
      width: 210,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#722ed1' }}>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi',
      dataIndex: 'deskripsi',
      key: 'deskripsi',
      width: 380,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Biaya Per Jam',
      dataIndex: 'biaya_per_jam',
      key: 'biaya_per_jam',
      width: 160,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'No. Akun',
      dataIndex: 'no_akun',
      key: 'no_akun',
      width: 140,
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Nama Akun',
      dataIndex: 'nama_akun',
      key: 'nama_akun',
      width: 240,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      fixed: 'right',
      render: value => (
        <Tag color={value === 'Aktif' ? 'green' : 'default'}>
          {value || 'Tidak Aktif'}
        </Tag>
      ),
    },
  ]

  const visibleColumns = filterColumnsByPermission('biaya_produksi', columns, user)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Total Biaya Produksi" value={summary.total} prefix={<ToolOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Aktif"
              value={summary.aktif}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#389e0d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Tidak Aktif"
              value={summary.tidak_aktif}
              prefix={<StopOutlined />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic
              title="Total Tarif"
              value={summary.total_biaya}
              prefix={<DollarOutlined />}
              formatter={value => formatCurrency(value)}
              valueStyle={{ color: '#722ed1', fontSize: 21 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><DollarOutlined style={{ marginRight: 8, color: '#722ed1' }} />Biaya Produksi</span>}
        extra={(
          <Space wrap>
            <Select
              placeholder="Semua Akun"
              allowClear
              showSearch
              optionFilterProp="label"
              value={account || undefined}
              options={accounts}
              onChange={value => {
                const next = value || ''
                setAccount(next)
                applyFilters(searchRef.current, next, statusRef.current)
              }}
              style={{ width: 240 }}
            />
            <Select
              placeholder="Semua Status"
              allowClear
              value={status || undefined}
              options={[
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Tidak Aktif' },
              ]}
              onChange={value => {
                const next = value || ''
                setStatus(next)
                applyFilters(searchRef.current, accountRef.current, next)
              }}
              style={{ width: 150 }}
            />
            <Search
              prefix={<SearchOutlined />}
              placeholder="Cari nomor, deskripsi, atau akun..."
              allowClear
              value={search}
              onChange={event => {
                const next = event.target.value
                setSearch(next)
                if (!next) applyFilters('', accountRef.current, statusRef.current)
              }}
              onSearch={value => applyFilters(value, accountRef.current, statusRef.current)}
              style={{ width: 310 }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              loading={exporting}
              onClick={handleExport}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        )}
      >
        <Table
          rowKey="no_biaya_produksi"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1250, y: 'calc(100vh - 485px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} biaya produksi`,
            onChange: (page, pageSize) => {
              pageRef.current = page
              pageSizeRef.current = pageSize
              fetchData(
                page,
                pageSize,
                searchRef.current,
                accountRef.current,
                statusRef.current,
              )
            },
          }}
        />
      </Card>
    </Space>
  )
}
