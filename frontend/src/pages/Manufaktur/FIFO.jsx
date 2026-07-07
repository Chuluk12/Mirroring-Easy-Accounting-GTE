import { useCallback, useRef, useState } from 'react'
import {
  Button, Card, Col, Input, Row, Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  BarcodeOutlined, FileExcelOutlined, ReloadOutlined, SearchOutlined, WalletOutlined,
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

const FIFO_EXPORT_COLS = [
  { key: 'no_barang', label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'kategori_barang', label: 'Kategori Barang' },
  { key: 'stok_satuan_1', label: 'Stok Satuan 1', type: 'number' },
  { key: 'satuan_1', label: 'Satuan 1' },
  { key: 'stok_satuan_2', label: 'Stok Satuan 2', type: 'number' },
  { key: 'satuan_2', label: 'Satuan 2' },
  { key: 'stok_satuan_3', label: 'Stok Satuan 3', type: 'number' },
  { key: 'satuan_3', label: 'Satuan 3' },
  { key: 'harga_fifo', label: 'Harga FIFO', type: 'number' },
  { key: 'nilai_stock', label: 'Nilai Stok', type: 'number' },
  { key: 'sumber_harga', label: 'Sumber Harga' },
]

const emptySummary = {
  total_items: 0,
  total_stock_value: 0,
  categories: [],
}

function formatQty(value) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function StockUnit({ qty, unit }) {
  return (
    <Space size={4}>
      <Text strong>{formatQty(qty)}</Text>
      <Text type="secondary">{unit || ''}</Text>
    </Space>
  )
}

export default function FIFO() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState(emptySummary)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  })

  const searchRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchValue = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const response = await api.get('/api/fifo', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: searchValue,
        },
      })
      setData(response.data.data || [])
      setSummary({ ...emptySummary, ...(response.data.summary || {}) })
      setPagination({
        current: page,
        pageSize,
        total: response.data.total || 0,
      })
    } catch (error) {
      console.error('Gagal memuat FIFO:', error)
      message.error('Gagal memuat data FIFO')
    } finally {
      setLoading(false)
    }
  }, [])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, false)
  }, 30000, true, true)

  const applySearch = value => {
    searchRef.current = value
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value)
  }

  const handleReset = () => {
    setSearch('')
    pageRef.current = 1
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    applySearch('')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const response = await api.get('/api/fifo/export', {
        params: { search: searchRef.current },
      })
      return response.data.data || []
    },
    columns: filterExportColumnsByPermission('fifo', FIFO_EXPORT_COLS, user),
    filename: 'FIFOManufaktur',
    sheetName: 'FIFO',
    message,
    setExporting,
    loadingText: 'Mengambil semua data FIFO...',
  })

  const columns = [
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 170,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi Barang',
      dataIndex: 'deskripsi_barang',
      key: 'deskripsi_barang',
      width: 340,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Kategori Barang',
      dataIndex: 'kategori_barang',
      key: 'kategori_barang',
      width: 190,
      render: value => <Tag color="geekblue">{value || '-'}</Tag>,
    },
    {
      title: 'Satuan 1',
      dataIndex: 'stok_satuan_1',
      key: 'stok_satuan_1',
      width: 155,
      align: 'right',
      render: (value, record) => <StockUnit qty={value} unit={record.satuan_1} />,
    },
    {
      title: 'Satuan 2',
      dataIndex: 'stok_satuan_2',
      key: 'stok_satuan_2',
      width: 155,
      align: 'right',
      render: (value, record) => record.satuan_2 ? <StockUnit qty={value} unit={record.satuan_2} /> : '-',
    },
    {
      title: 'Satuan 3',
      dataIndex: 'stok_satuan_3',
      key: 'stok_satuan_3',
      width: 155,
      align: 'right',
      render: (value, record) => record.satuan_3 ? <StockUnit qty={value} unit={record.satuan_3} /> : '-',
    },
    {
      title: 'Harga FIFO',
      dataIndex: 'harga_fifo',
      key: 'harga_fifo',
      width: 145,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Nilai Stok',
      dataIndex: 'nilai_stock',
      key: 'nilai_stock',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: '#0b7a45' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Sumber Harga',
      dataIndex: 'sumber_harga',
      key: 'sumber_harga',
      width: 165,
      render: value => value ? <Tag color={value === 'FIFO' ? 'green' : 'orange'}>{value}</Tag> : '-',
    },
  ]

  const visibleColumns = filterColumnsByPermission('fifo', columns, user)
  const categories = summary.categories || []

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Total Barang FIFO" value={summary.total_items} prefix={<BarcodeOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Nilai Stok Halaman Ini" value={summary.total_stock_value} prefix={<WalletOutlined />} formatter={formatCurrency} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Space size={[6, 6]} wrap>
              {categories.map(item => (
                <Tag key={item.category} color="purple">
                  {item.category}: {formatQty(item.count)}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><BarcodeOutlined style={{ marginRight: 8, color: '#0b4fb3' }} />FIFO</span>}
        extra={(
          <Space wrap>
            <Search
              prefix={<SearchOutlined />}
              placeholder="Cari no barang, deskripsi, kategori..."
              allowClear
              value={search}
              onChange={event => {
                const next = event.target.value
                setSearch(next)
                if (!next) applySearch('')
              }}
              onSearch={applySearch}
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
          rowKey="no_barang"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1500, y: 'calc(100vh - 430px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} barang`,
            onChange: (page, pageSize) => {
              pageRef.current = page
              pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current)
            },
          }}
        />
      </Card>
    </Space>
  )
}
