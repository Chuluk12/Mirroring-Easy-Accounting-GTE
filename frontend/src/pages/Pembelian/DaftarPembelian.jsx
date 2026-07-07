import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, message
} from 'antd'
import {
  FileExcelOutlined, SearchOutlined, ReloadOutlined, ShoppingCartOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography

const formatRp  = val => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
const formatQty = val => parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const PEMBELIAN_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_pembelian', label: 'No. Pembelian' },
  { key: 'tgl_pembelian', label: 'Tgl Pembelian', type: 'date' },
  { key: 'tgl_ekspetasi', label: 'Tgl Ekspetasi', type: 'date' },
  { key: 'no_permintaan', label: 'No. Permintaan' },
  { key: 'tgl_permintaan', label: 'Tgl Permintaan', type: 'date' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'nama_pemasok', label: 'Nama Pemasok' },
  { key: 'deskripsi', label: 'Deskripsi PO' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'price', label: 'Harga Satuan', type: 'number' },
  { key: 'ppn_kode', label: 'PPN' },
  { key: 'ppn_amount', label: 'Nominal PPN', type: 'number' },
  { key: 'amount', label: 'Amount', type: 'number' },
]

export default function DaftarPembelian() {
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]     = useState({ total_rows: 0, total_amount: 0 })
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected]   = useState(null)
  const { user } = useAuth()

  const fetchData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = [null, null], showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search    = searchVal
      if (dates[0])  params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1])  params.date_to   = dates[1].format('YYYY-MM-DD')

      const res  = await api.get('/api/pembelian', { params })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({ ...prev, current: page, pageSize, total: page * pageSize + (rows.length === pageSize ? pageSize : 0) }))
      setSummary({ total_rows: rows.length, total_amount: rows.reduce((s, r) => s + (r.amount || 0), 0) })
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', getCurrentMonthRange())
    const interval = setInterval(() => {
      fetchData(pagination.current, pagination.pageSize, search, dateRange, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [dateRange, fetchData, pagination.current, pagination.pageSize, search])

  const handleSearch    = val  => { setSearch(val); fetchData(1, pagination.pageSize, val, dateRange) }
  const handleDateChange = dates => { setDateRange(dates || [null, null]); fetchData(1, pagination.pageSize, search, dates || [null, null]) }
  const handleReset     = ()   => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setDateRange(currentMonth)
    fetchData(1, pagination.pageSize, '', currentMonth)
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (search) params.search = search
      if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/api/pembelian/export', { params })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns: [
      PEMBELIAN_EXPORT_COLS[0],
      ...filterExportColumnsByPermission('pembelian', PEMBELIAN_EXPORT_COLS.slice(1), user),
    ],
    filename: 'DaftarPembelian',
    sheetName: 'Daftar Pembelian',
    message,
    setExporting,
  })

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }

  const columns = [
    { title: 'No. Pembelian',   dataIndex: 'no_pembelian',    key: 'no_pembelian',    width: 160, fixed: 'left', render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'Tgl Pembelian',   dataIndex: 'tgl_pembelian',   key: 'tgl_pembelian',   width: 120, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Ekspetasi',   dataIndex: 'tgl_ekspetasi',   key: 'tgl_ekspetasi',   width: 120, render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No. Permintaan',  dataIndex: 'no_permintaan',   key: 'no_permintaan',   width: 155, render: v => v ? <Tag color="cyan">{v}</Tag> : <Text type="secondary">-</Text> },
    { title: 'Tgl Permintaan',  dataIndex: 'tgl_permintaan',  key: 'tgl_permintaan',  width: 125, render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No. Pemasok',     dataIndex: 'no_pemasok',      key: 'no_pemasok',      width: 110, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Pemasok',    dataIndex: 'nama_pemasok',    key: 'nama_pemasok',    width: 200, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Deskripsi PO',    dataIndex: 'deskripsi',       key: 'deskripsi',       width: 200, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span style={{ color: '#666' }}>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang',      dataIndex: 'no_barang',       key: 'no_barang',       width: 160, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang',dataIndex: 'deskripsi_barang',key: 'deskripsi_barang',width: 260, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty',             dataIndex: 'qty',             key: 'qty',             width: 80,  align: 'right', render: v => formatQty(v) },
    { title: 'UoM',             dataIndex: 'uom',             key: 'uom',             width: 70,  align: 'center', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Harga Satuan',    dataIndex: 'price',           key: 'price',           width: 130, align: 'right', render: v => formatRp(v) },
    { title: 'PPN',             dataIndex: 'ppn_kode',        key: 'ppn',             width: 80,  align: 'center', render: (k, r) => k ? <Tag color="volcano">{k} {r.ppn_rate > 0 ? `(${r.ppn_rate}%)` : ''}</Tag> : <Tag>Non-PKP</Tag> },
    { title: 'Nominal PPN',     dataIndex: 'ppn_amount',      key: 'ppn_amount',      width: 130, align: 'right', render: v => <Text style={{ color: '#fa8c16' }}>{formatRp(v)}</Text> },
    { title: 'Amount',          dataIndex: 'amount',          key: 'amount',          width: 140, align: 'right', fixed: 'right', render: v => <Text strong style={{ color: '#52c41a' }}>{formatRp(v)}</Text> },
  ]

  const detailRows = selected
    ? data.filter(row => row.no_pembelian === selected.no_pembelian)
    : []

  const detailFields = [
    { key: 'no_pembelian', label: 'No. Pembelian', render: v => <Text strong>{v}</Text> },
    { key: 'tgl_pembelian', label: 'Tanggal Pembelian', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'tgl_ekspetasi', label: 'Tanggal Ekspetasi', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_permintaan', label: 'No. Permintaan', render: v => v || '-' },
    { key: 'tgl_permintaan', label: 'Tanggal Permintaan', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_pemasok', label: 'No. Pemasok' },
    { key: 'nama_pemasok', label: 'Nama Pemasok' },
    { key: 'deskripsi', label: 'Deskripsi PO' },
  ]

  const detailColumns = [
    { title: 'No Barang', dataIndex: 'no_barang', width: 130, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 220, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right', render: v => formatQty(v) },
    { title: 'UoM', dataIndex: 'uom', width: 70, render: v => v || '-' },
    { title: 'Harga', dataIndex: 'price', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
  ]

  const visibleColumns = [serialColumn, ...filterColumnsByPermission('pembelian', columns, user)]
  const visibleDetailFields = filterExportColumnsByPermission('pembelian', detailFields, user)
  const visibleDetailColumns = filterColumnsByPermission('pembelian', detailColumns, user)

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Total Baris Ditampilkan" value={summary.total_rows} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Total Amount (halaman ini)" value={summary.total_amount} formatter={v => formatRp(v)} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
      </Row>

      <Card
        title={<span><ShoppingCartOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Pembelian</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDateChange} placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Search placeholder="Cari no PO, permintaan, pemasok, barang..." allowClear value={search} style={{ width: 290 }}
              prefix={<SearchOutlined />} onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
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
          className="pembelian-freeze-table"
          rowKey={(r, i) => `${r.no_pembelian}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          scroll={{ x: 2050, y: 'calc(100vh - 340px)' }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t} baris`,
            onChange: (page, pageSize) => fetchData(page, pageSize, search, dateRange)
          }}
        />
      </Card>
      <style>{`
        .pembelian-freeze-table .ant-table-thead > tr > th {
          position: sticky;
          top: 0;
          z-index: 3;
        }
        .pembelian-freeze-table .ant-table-tbody > tr > td {
          color: #20243a;
        }
      `}</style>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail PO ${selected?.no_pembelian || ''}`}
        subtitle={selected?.nama_pemasok}
        record={selected}
        fields={visibleDetailFields}
        lineTitle="Detail Barang PO"
        lineRows={detailRows}
        lineColumns={visibleDetailColumns}
      />
    </div>
  )
}
