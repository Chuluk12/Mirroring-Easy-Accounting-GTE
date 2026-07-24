import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, Input, message, Modal, Row, Select, Space,
  Statistic, Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import api, { getApiErrorMessage } from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'

const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const PEMASOK_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'nama_pemasok', label: 'Nama Pemasok' },
  { key: 'alamat_1', label: 'Alamat 1' },
  { key: 'alamat_2', label: 'Alamat 2' },
  { key: 'kota', label: 'Kota' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'negara', label: 'Negara' },
  { key: 'kontak', label: 'Kontak' },
  { key: 'telp', label: 'Telp' },
  { key: 'fax', label: 'Fax' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'saldo', label: 'Saldo', type: 'number' },
  { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
  { key: 'mata_uang', label: 'Mata Uang' },
  { key: 'catatan', label: 'Catatan' },
  { key: 'dihentikan', label: 'Dihentikan' },
]

const emptySummary = { total: 0, aktif: 0, nonaktif: 0, saldo: 0 }

function formatCurrency(value, currency = 'IDR') {
  const number = Number(value || 0)
  const code = String(currency || 'IDR').trim() || 'IDR'
  return `${code} ${number.toLocaleString('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

export default function Pemasok() {
  const { user, hasPermission } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const searchRef = useRef('')
  const statusRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const canEdit = hasPermission('pembelian_pemasok_edit')

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchVal = '', statusVal = '', showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await api.get('/api/pemasok', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: searchVal,
          status: statusVal,
          include_total: 1,
        },
      })
      setData(res.data.data || [])
      setSummary({ ...emptySummary, ...(res.data.summary || {}) })
      setPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
      pageRef.current = page
      pageSizeRef.current = pageSize
      searchRef.current = searchVal
      statusRef.current = statusVal
    } catch (e) {
      console.error(e)
      message.error(getApiErrorMessage(e, 'Gagal memuat data pemasok'))
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, statusRef.current, false)
  }, 30000)

  const handleSearch = value => {
    setSearch(value)
    fetchData(1, pageSizeRef.current, value, statusRef.current)
  }

  const handleStatus = value => {
    setStatus(value || '')
    fetchData(1, pageSizeRef.current, searchRef.current, value || '')
  }

  const handleReset = () => {
    setSearch('')
    setStatus('')
    fetchData(1, DEFAULT_PAGE_SIZE, '', '')
  }

  const handleToggle = record => {
    const nextSuspended = record.dihentikan !== 'Ya'
    const actionText = nextSuspended ? 'nonaktifkan' : 'aktifkan'
    Modal.confirm({
      title: `${nextSuspended ? 'Nonaktifkan' : 'Aktifkan'} pemasok?`,
      content: `${record.no_pemasok} - ${record.nama_pemasok}`,
      okText: nextSuspended ? 'Nonaktifkan' : 'Aktifkan',
      okButtonProps: { danger: nextSuspended },
      cancelText: 'Batal',
      onOk: async () => {
        setSavingId(record.id)
        try {
          await api.post(`/api/pemasok/${record.id}/suspended`, { suspended: nextSuspended })
          message.success(`Pemasok berhasil di${actionText}`)
          fetchData(pageRef.current, pageSizeRef.current, searchRef.current, statusRef.current, false)
        } catch (e) {
          console.error(e)
          message.error(getApiErrorMessage(e, 'Gagal mengubah status pemasok'))
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get('/api/pemasok/export', {
        params: { search: searchRef.current, status: statusRef.current },
      })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns: [
      PEMASOK_EXPORT_COLS[0],
      ...filterExportColumnsByPermission('pemasok', PEMASOK_EXPORT_COLS.slice(1), user),
    ],
    filename: 'Pemasok',
    sheetName: 'Pemasok',
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
    { title: 'No. Pemasok', dataIndex: 'no_pemasok', key: 'no_pemasok', width: 130, fixed: 'left', render: value => <Text code>{value}</Text> },
    { title: 'Nama Pemasok', dataIndex: 'nama_pemasok', key: 'nama_pemasok', width: 260, fixed: 'left', ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><Text strong>{value || '-'}</Text></Tooltip> },
    { title: 'Alamat 1', dataIndex: 'alamat_1', key: 'alamat_1', width: 260, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: 'Alamat 2', dataIndex: 'alamat_2', key: 'alamat_2', width: 220, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: 'Kota', dataIndex: 'kota', key: 'kota', width: 140, render: value => value || '-' },
    { title: 'Provinsi', dataIndex: 'provinsi', key: 'provinsi', width: 140, render: value => value || '-' },
    { title: 'Kode Pos', dataIndex: 'kode_pos', key: 'kode_pos', width: 110, render: value => value || '-' },
    { title: 'Negara', dataIndex: 'negara', key: 'negara', width: 140, render: value => value || '-' },
    { title: 'Kontak', dataIndex: 'kontak', key: 'kontak', width: 160, render: value => value || '-' },
    { title: 'Telp', dataIndex: 'telp', key: 'telp', width: 150, render: value => value || '-' },
    { title: 'Fax', dataIndex: 'fax', key: 'fax', width: 140, render: value => value || '-' },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 210, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: 'Website', dataIndex: 'website', key: 'website', width: 180, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: 'Saldo', dataIndex: 'saldo', key: 'saldo', width: 150, align: 'right', render: (value, row) => formatCurrency(value, row.mata_uang) },
    { title: 'Credit Limit', dataIndex: 'credit_limit', key: 'credit_limit', width: 150, align: 'right', render: (value, row) => formatCurrency(value, row.mata_uang) },
    { title: 'Mata Uang', dataIndex: 'mata_uang', key: 'mata_uang', width: 100, render: value => value || '-' },
    { title: 'Catatan', dataIndex: 'catatan', key: 'catatan', width: 220, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    {
      title: 'Dihentikan',
      dataIndex: 'dihentikan',
      key: 'dihentikan',
      width: 120,
      render: value => <Tag color={value === 'Ya' ? 'red' : 'green'}>{value}</Tag>,
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => canEdit ? (
        <Button
          size="small"
          danger={record.dihentikan !== 'Ya'}
          loading={savingId === record.id}
          icon={record.dihentikan === 'Ya' ? <CheckCircleOutlined /> : <StopOutlined />}
          onClick={() => handleToggle(record)}
        >
          {record.dihentikan === 'Ya' ? 'Aktifkan' : 'Nonaktif'}
        </Button>
      ) : <Text type="secondary">-</Text>,
    },
  ]

  const visibleColumns = [
    serialColumn,
    ...filterColumnsByPermission('pemasok', columns, user),
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small"><Statistic title="Total Pemasok" value={summary.total} prefix={<TeamOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small"><Statistic title="Aktif" value={summary.aktif} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small"><Statistic title="Dihentikan" value={summary.nonaktif} prefix={<StopOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small"><Statistic title="Total Saldo" value={summary.saldo} precision={0} prefix="IDR" valueStyle={{ color: '#7c3aed' }} /></Card>
        </Col>
      </Row>

      <Card
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Pemasok</span>}
        extra={
          <Space wrap>
            <Select
              allowClear
              placeholder="Status"
              value={status || undefined}
              style={{ width: 150 }}
              options={[
                { value: 'aktif', label: 'Aktif' },
                { value: 'nonaktif', label: 'Dihentikan' },
              ]}
              onChange={handleStatus}
            />
            <Search
              placeholder="Cari no/nama pemasok, kota, kontak..."
              allowClear
              value={search}
              style={{ width: 320 }}
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
          rowKey="id"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 2500, y: 'calc(100vh - 340px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} pemasok`,
            onChange: (page, pageSize) => fetchData(page, pageSize, searchRef.current, statusRef.current),
          }}
        />
      </Card>
    </div>
  )
}
