import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, message, Row,
  Popover, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, FileExcelOutlined,
  FileSearchOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography
const DEFAULT_PAGE_SIZE = 20

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

const EXPORT_COLUMNS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'customer', label: 'Customer' },
  { key: 'no_faktur', label: 'No Faktur' },
  { key: 'no_do', label: 'No DO' },
  { key: 'no_so', label: 'No SO' },
  { key: 'no_po', label: 'No PO' },
  { key: 'tgl_faktur', label: 'Tgl Faktur', type: 'date' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'satuan', label: 'Satuan' },
  { key: 'harga_satuan', label: 'Harga Satuan', type: 'number' },
  { key: 'jumlah', label: 'Jumlah', type: 'number' },
  { key: 'hpp', label: 'HPP', type: 'number' },
  { key: 'laba_rugi', label: 'Laba/Rugi', type: 'number' },
  { key: 'persen', label: '%', type: 'number' },
  { key: 'reff_hpp', label: 'Reff HPP' },
  { key: 'no_spk', label: 'No SPK' },
  { key: 'remarks', label: 'Remarks' },
]

const emptySummary = {
  total_rows: 0,
  total_qty: 0,
  total_jumlah: 0,
  total_hpp: 0,
  laba_rugi: 0,
  margin_pct: 0,
}

const formatQty = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })
const formatNumber = (value, digits = 2) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: digits })
const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value || 0)

export default function ProfitLoss() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [marginFilter, setMarginFilter] = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const searchRef = useRef('')
  const marginFilterRef = useRef('')
  const dateRangeRef = useRef(getCurrentMonthRange())
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchVal = '',
    dates = getCurrentMonthRange(),
    marginVal = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      if (marginVal) params.margin_filter = marginVal

      const res = await api.get('/api/profit-loss', { params })
      if (res.data.error) message.warning(`Profit & Loss backend: ${res.data.error}`)
      setData(res.data.data || [])
      setSummary({ ...emptySummary, ...(res.data.summary || {}) })
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat Profit & Loss')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current, marginFilterRef.current)
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, marginFilterRef.current, false)
  }, 30000)

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, dateRangeRef.current, marginFilterRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates, marginFilterRef.current)
  }

  const handleTableChange = (pager, filters) => {
    const nextMarginFilter = (filters?.persen || [])[0] || ''
    const nextPage = pager?.current || 1
    const nextPageSize = pager?.pageSize || pageSizeRef.current

    marginFilterRef.current = nextMarginFilter
    setMarginFilter(nextMarginFilter)
    pageRef.current = nextPage
    pageSizeRef.current = nextPageSize
    fetchData(nextPage, nextPageSize, searchRef.current, dateRangeRef.current, nextMarginFilter)
  }

  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''
    marginFilterRef.current = ''
    dateRangeRef.current = currentMonth
    pageRef.current = 1
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    setSearch('')
    setMarginFilter('')
    setDateRange(currentMonth)
    fetchData(1, DEFAULT_PAGE_SIZE, '', currentMonth, '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      if (marginFilterRef.current) params.margin_filter = marginFilterRef.current
      const res = await api.get('/api/profit-loss/export', { params })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns: [
      EXPORT_COLUMNS[0],
      ...filterExportColumnsByPermission('profit_loss', EXPORT_COLUMNS.slice(1), user),
    ],
    filename: 'ProfitLoss',
    sheetName: 'Profit Loss',
    message,
    setExporting,
    loadingText: 'Mengambil semua data Profit & Loss...',
    auditModule: 'profit_loss',
    auditDescription: 'Export Profit & Loss',
  })

  const handleRemarkChange = (rowKey, value) => {
    setData(rows => rows.map(row => (
      row.row_key === rowKey ? { ...row, remarks: value } : row
    )))
  }

  const handleRemarkSave = async (record) => {
    try {
      await api.post('/api/profit-loss/remarks', {
        row_key: record.row_key,
        remarks: record.remarks || '',
      })
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal menyimpan remarks')
    }
  }

  const renderFifoDetails = details => (
    <div style={{ width: 560, maxWidth: '70vw' }}>
      <Table
        size="small"
        rowKey={(row, index) => `${row.source_itemhist_id || row.ref_no}-${index}`}
        dataSource={details || []}
        pagination={false}
        scroll={{ x: 540 }}
        columns={[
          {
            title: 'Tanggal',
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 95,
            render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
          },
          {
            title: 'Ref',
            dataIndex: 'ref_no',
            key: 'ref_no',
            width: 145,
            render: (value, row) => (
              <Tag color={row.ref_type === 'ADJ' ? 'orange' : row.ref_type === 'Penerimaan' ? 'blue' : 'cyan'}>
                {value || row.ref_type || 'FIFO'}
              </Tag>
            ),
          },
          {
            title: 'No SPK',
            dataIndex: 'no_spk',
            key: 'no_spk',
            width: 135,
            render: value => value || '-',
          },
          {
            title: 'Qty',
            dataIndex: 'qty',
            key: 'qty',
            width: 80,
            align: 'right',
            render: value => formatQty(value),
          },
          {
            title: 'HPP Satuan',
            dataIndex: 'hpp_satuan',
            key: 'hpp_satuan',
            width: 120,
            align: 'right',
            render: value => `Rp ${formatNumber(value, 4)}`,
          },
          {
            title: 'Total',
            dataIndex: 'hpp_total',
            key: 'hpp_total',
            width: 115,
            align: 'right',
            render: value => formatCurrency(value),
          },
        ]}
      />
    </div>
  )

  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      width: 190,
      fixed: 'left',
      ellipsis: { showTitle: false },
      render: value => value ? <Tooltip title={value}><Text strong>{value}</Text></Tooltip> : '-',
    },
    {
      title: 'No Faktur',
      dataIndex: 'no_faktur',
      key: 'no_faktur',
      width: 150,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'No DO',
      dataIndex: 'no_do',
      key: 'no_do',
      width: 145,
      render: value => value ? <Tag color="purple">{value}</Tag> : '-',
    },
    {
      title: 'No SO',
      dataIndex: 'no_so',
      key: 'no_so',
      width: 145,
      render: value => value ? <Tag color="geekblue">{value}</Tag> : '-',
    },
    {
      title: 'No PO',
      dataIndex: 'no_po',
      key: 'no_po',
      width: 150,
      ellipsis: { showTitle: false },
      render: value => value ? <Tooltip title={value}><Tag color="blue">{value}</Tag></Tooltip> : '-',
    },
    {
      title: 'Tgl Faktur',
      dataIndex: 'tgl_faktur',
      key: 'tgl_faktur',
      width: 112,
      render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 190,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><Text>{value || '-'}</Text></Tooltip>,
    },
    {
      title: 'Deskripsi Barang',
      dataIndex: 'deskripsi_barang',
      key: 'deskripsi_barang',
      width: 260,
      ellipsis: { showTitle: false },
      render: value => value ? <Tooltip title={value}><Text>{value}</Text></Tooltip> : '-',
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 100,
      align: 'right',
      render: value => formatQty(value),
    },
    {
      title: 'Satuan',
      dataIndex: 'satuan',
      key: 'satuan',
      width: 90,
      render: value => value || '-',
    },
    {
      title: 'Harga Satuan',
      dataIndex: 'harga_satuan',
      key: 'harga_satuan',
      width: 150,
      align: 'right',
      render: value => formatCurrency(value),
    },
    {
      title: 'Jumlah',
      dataIndex: 'jumlah',
      key: 'jumlah',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: '#00a92f' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'HPP',
      dataIndex: 'hpp',
      key: 'hpp',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: '#ff7a00' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Laba/Rugi',
      dataIndex: 'laba_rugi',
      key: 'laba_rugi',
      width: 150,
      align: 'right',
      render: value => (
        <Text strong style={{ color: Number(value || 0) >= 0 ? '#00a92f' : '#d41452' }}>
          {formatCurrency(value)}
        </Text>
      ),
    },
    {
      title: '%',
      dataIndex: 'persen',
      key: 'persen',
      width: 95,
      align: 'right',
      filters: [
        { text: '<0%', value: 'negative' },
        { text: '>0%', value: 'positive' },
      ],
      filterMultiple: false,
      filteredValue: marginFilter ? [marginFilter] : null,
      render: value => (
        <Text strong style={{ color: Number(value || 0) >= 0 ? '#00a92f' : '#d41452' }}>
          {Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%
        </Text>
      ),
    },
    {
      title: 'Reff HPP',
      dataIndex: 'reff_hpp',
      key: 'reff_hpp',
      width: 170,
      ellipsis: { showTitle: false },
      render: (value, record) => {
        const details = record.fifo_details || []
        const tag = (
          <Tag
            color={String(value).startsWith('FIFO') ? 'gold' : 'cyan'}
            style={details.length ? { cursor: 'pointer' } : undefined}
          >
            {value || '-'}
          </Tag>
        )
        if (!value) return '-'
        if (!details.length) return <Tooltip title={value}>{tag}</Tooltip>
        return (
          <Popover
            title="Detail FIFO HPP"
            content={renderFifoDetails(details)}
            trigger="click"
            placement="leftTop"
          >
            {tag}
          </Popover>
        )
      },
    },
    {
      title: 'No SPK',
      dataIndex: 'no_spk',
      key: 'no_spk',
      width: 170,
      ellipsis: { showTitle: false },
      render: value => value ? <Tooltip title={value}><Tag color="processing">{value}</Tag></Tooltip> : '-',
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 220,
      render: (value, record) => (
        <Input
          value={value}
          placeholder="Isi remarks..."
          onChange={event => handleRemarkChange(record.row_key, event.target.value)}
          onBlur={() => handleRemarkSave(record)}
          onPressEnter={event => event.currentTarget.blur()}
        />
      ),
    },
  ]

  const visibleColumns = filterColumnsByPermission('profit_loss', columns, user)
  const isProfit = Number(summary.laba_rugi || 0) >= 0

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>Profit &amp; Loss</Title>
        <Text type="secondary">Rincian faktur, DO, SO, nilai jual, dan HPP dari data Easy Accounting.</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Jumlah" value={formatCurrency(summary.total_jumlah)} valueStyle={{ color: '#00a92f' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="HPP" value={formatCurrency(summary.total_hpp)} valueStyle={{ color: '#ff7a00' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Laba/Rugi"
              value={formatCurrency(summary.laba_rugi)}
              prefix={isProfit ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              valueStyle={{ color: isProfit ? '#00a92f' : '#d41452' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Margin" value={summary.margin_pct} precision={2} suffix="%" valueStyle={{ color: isProfit ? '#11b7d8' : '#d41452' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><FileSearchOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Detail Profit &amp; Loss</span>}
        extra={
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']}
              style={{ width: 225 }}
            />
            <Search
              placeholder="Cari faktur, DO, SO, barang..."
              allowClear
              value={search}
              style={{ width: 280 }}
              prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={event => {
                setSearch(event.target.value)
                if (!event.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              onClick={handleExport}
              loading={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(row, index) => `${row.no_faktur}-${row.no_do}-${row.no_so}-${row.no_po}-${row.no_barang}-${index}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          sticky
          scroll={{ x: 2835, y: 'calc(100vh - 360px)' }}
          rowClassName={record => Number(record.laba_rugi || 0) < 0 ? 'profit-loss-row-loss' : ''}
          onChange={handleTableChange}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} baris`,
          }}
        />
      </Card>

      <style>{`
        .profit-loss-row-loss td { background: #fff1f0 !important; }
      `}</style>
    </div>
  )
}
