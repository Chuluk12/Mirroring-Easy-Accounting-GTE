import { useCallback, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, Row, Select, Space, Statistic, Table,
  Tag, Tooltip, Typography, message,
} from 'antd'
import {
  CheckCircleOutlined, FileExcelOutlined, FileProtectOutlined, InboxOutlined,
  ReloadOutlined, SearchOutlined, StopOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import { exportRowsToXLS } from '../../utils/exportXls'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import { withTableSorters } from '../../utils/tableSorters'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const EXPORT_COLUMNS = [
  { key: 'no_urut', label: 'No.', type: 'number' },
  { key: 'no_standarisasi', label: 'No. Standarisasi' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date' },
  { key: 'tanggal_standarisasi', label: 'Tanggal Standarisasi', type: 'date' },
  { key: 'template', label: 'Template' },
  { key: 'total_barang', label: 'Jumlah Barang', type: 'number' },
  { key: 'status', label: 'Status' },
]

const formatCurrency = value => Number(value || 0).toLocaleString('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const formatDate = value => value ? dayjs(value).format('DD MMM YYYY') : '-'

export default function StandarisasiHarga() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [detailsById, setDetailsById] = useState({})
  const [detailLoadingById, setDetailLoadingById] = useState({})
  const [summary, setSummary] = useState({
    total: 0, aktif: 0, tidak_aktif: 0, total_barang: 0,
  })
  const [pagination, setPagination] = useState({
    current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0,
  })

  const searchRef = useRef('')
  const statusRef = useRef('')
  const dateRangeRef = useRef(null)
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchValue = '',
    statusValue = '',
    dates = null,
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchValue) params.search = searchValue
      if (statusValue) params.status = statusValue
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const response = await api.get('/api/standarisasi-harga', { params })
      setData(response.data.data || [])
      setSummary(response.data.summary || {
        total: 0, aktif: 0, tidak_aktif: 0, total_barang: 0,
      })
      setPagination({
        current: page,
        pageSize,
        total: response.data.total || 0,
      })
    } catch (error) {
      console.error('Gagal memuat standarisasi harga:', error)
      message.error('Gagal memuat data standarisasi harga')
    } finally {
      setLoading(false)
    }
  }, [])

  useVisiblePolling(() => {
    fetchData(
      pageRef.current,
      pageSizeRef.current,
      searchRef.current,
      statusRef.current,
      dateRangeRef.current,
      false,
    )
  }, 30000, true, true)

  const applyFilters = (nextSearch, nextStatus, nextDates) => {
    searchRef.current = nextSearch
    statusRef.current = nextStatus
    dateRangeRef.current = nextDates
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, nextSearch, nextStatus, nextDates)
  }

  const handleReset = () => {
    setSearch('')
    setStatus('')
    setDateRange(null)
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    applyFilters('', '', null)
  }

  const loadDetail = async record => {
    if (detailsById[record.standar_id]) return
    setDetailLoadingById(current => ({ ...current, [record.standar_id]: true }))
    try {
      const response = await api.get(`/api/standarisasi-harga/${record.standar_id}/details`)
      setDetailsById(current => ({
        ...current,
        [record.standar_id]: response.data.data || [],
      }))
    } catch (error) {
      console.error('Gagal memuat detail standarisasi harga:', error)
      message.error('Gagal memuat rincian barang')
    } finally {
      setDetailLoadingById(current => ({ ...current, [record.standar_id]: false }))
    }
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (statusRef.current) params.status = statusRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const response = await api.get('/api/standarisasi-harga/export', { params })
      return (response.data.data || []).map((row, index) => ({
        ...row,
        no_urut: index + 1,
      }))
    },
    columns: [
      EXPORT_COLUMNS[0],
      ...filterExportColumnsByPermission('standarisasi_harga', EXPORT_COLUMNS.slice(1), user),
    ],
    filename: 'StandarisasiHarga',
    sheetName: 'Standarisasi Harga',
    message,
    setExporting,
    loadingText: 'Mengambil semua data standarisasi harga...',
  })

  const columns = [
    {
      title: 'No.',
      key: 'no_urut',
      width: 65,
      fixed: 'left',
      align: 'right',
      render: (_, __, index) => (
        (pagination.current - 1) * pagination.pageSize + index + 1
      ),
    },
    {
      title: 'No. Standarisasi',
      dataIndex: 'no_standarisasi',
      key: 'no_standarisasi',
      width: 170,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#722ed1' }}>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi',
      dataIndex: 'deskripsi',
      key: 'deskripsi',
      width: 390,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Tanggal Mulai',
      dataIndex: 'tanggal_mulai',
      key: 'tanggal_mulai',
      width: 150,
      render: value => value ? <Tag color="blue">{formatDate(value)}</Tag> : '-',
    },
    {
      title: 'Tanggal Standarisasi',
      dataIndex: 'tanggal_standarisasi',
      key: 'tanggal_standarisasi',
      width: 175,
      render: value => value ? <Tag color="geekblue">{formatDate(value)}</Tag> : '-',
    },
    {
      title: 'Template',
      dataIndex: 'template',
      key: 'template',
      width: 220,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Barang',
      dataIndex: 'total_barang',
      key: 'total_barang',
      width: 95,
      align: 'right',
      render: value => <Tag color="cyan">{value || 0}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 115,
      fixed: 'right',
      render: value => <Tag color={value === 'Aktif' ? 'green' : 'default'}>{value}</Tag>,
    },
  ]

  const detailColumns = [
    {
      title: 'No.',
      width: 60,
      align: 'right',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'No. Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 190,
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi Barang',
      dataIndex: 'deskripsi_barang',
      key: 'deskripsi_barang',
      width: 360,
      ellipsis: true,
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Biaya Barang',
      dataIndex: 'biaya_barang',
      key: 'biaya_barang',
      width: 150,
      align: 'right',
      render: formatCurrency,
    },
    {
      title: 'Biaya Standar Terakhir',
      dataIndex: 'biaya_standar_terakhir',
      key: 'biaya_standar_terakhir',
      width: 190,
      align: 'right',
      render: (value, record) => (
        <span>
          {formatCurrency(value)}
          {record.no_standar_terakhir && (
            <Text type="secondary" style={{ marginLeft: 5 }}>({record.no_standar_terakhir})</Text>
          )}
        </span>
      ),
    },
    {
      title: 'Biaya Standar Baru',
      dataIndex: 'biaya_standar_baru',
      key: 'biaya_standar_baru',
      width: 170,
      align: 'right',
      render: value => <Text strong style={{ color: '#389e0d' }}>{formatCurrency(value)}</Text>,
    },
  ]

  const visibleColumns = filterColumnsByPermission('standarisasi_harga', columns, user)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Total Standarisasi" value={summary.total} prefix={<FileProtectOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Aktif" value={summary.aktif} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#389e0d' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Tidak Aktif" value={summary.tidak_aktif} prefix={<StopOutlined />} valueStyle={{ color: '#8c8c8c' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Total Barang" value={summary.total_barang} prefix={<InboxOutlined />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><FileProtectOutlined style={{ marginRight: 8, color: '#722ed1' }} />Standarisasi Harga</span>}
        extra={(
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={dates => {
                setDateRange(dates)
                applyFilters(searchRef.current, statusRef.current, dates)
              }}
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
                applyFilters(searchRef.current, next, dateRangeRef.current)
              }}
              style={{ width: 150 }}
            />
            <Search
              prefix={<SearchOutlined />}
              placeholder="Cari nomor, deskripsi, atau template..."
              allowClear
              value={search}
              onChange={event => {
                const next = event.target.value
                setSearch(next)
                if (!next) applyFilters('', statusRef.current, dateRangeRef.current)
              }}
              onSearch={value => applyFilters(value, statusRef.current, dateRangeRef.current)}
              style={{ width: 320 }}
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
          rowKey="standar_id"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1450, y: 'calc(100vh - 485px)' }}
          expandable={{
            columnWidth: 48,
            rowExpandable: record => Number(record.total_barang || 0) > 0,
            onExpand: (expanded, record) => {
              if (expanded) loadDetail(record)
            },
            expandedRowRender: record => (
              <div style={{ padding: '8px 16px 16px 32px' }}>
                <div style={{ marginBottom: 10 }}>
                  <Text strong>Standarisasi Barang</Text>
                  <Tag color="magenta" style={{ marginLeft: 8 }}>
                    {record.total_barang || 0} baris
                  </Tag>
                </div>
                <Table
                  rowKey="detail_id"
                  columns={detailColumns}
                  dataSource={detailsById[record.standar_id] || []}
                  loading={!!detailLoadingById[record.standar_id]}
                  pagination={false}
                  size="small"
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: 'Tidak ada rincian barang' }}
                />
              </div>
            ),
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} standarisasi`,
            onChange: (page, pageSize) => {
              pageRef.current = page
              pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, statusRef.current, dateRangeRef.current)
            },
          }}
        />
      </Card>
    </Space>
  )
}
