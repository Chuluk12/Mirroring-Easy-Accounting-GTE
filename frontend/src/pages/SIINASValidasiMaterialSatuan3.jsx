import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Col, Input, Row, Space, Statistic, Table, Typography, message } from 'antd'
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons'
import api, { getApiErrorMessage } from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'

const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 50

const numberFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 })

const exportColumns = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'rasio_3_excel', label: 'Rasio 3 Excel', type: 'number' },
  { key: 'unit_3_excel', label: 'Unit 3 Excel' },
]

const columns = [
  {
    title: 'No Barang',
    dataIndex: 'no_barang',
    key: 'no_barang',
    width: 210,
    fixed: 'left',
    render: value => <Text strong>{value || '-'}</Text>,
  },
  {
    title: 'Deskripsi Barang',
    dataIndex: 'deskripsi_barang',
    key: 'deskripsi_barang',
    width: 320,
    render: value => value || '-',
  },
  {
    title: 'Rasio 3 Excel',
    dataIndex: 'rasio_3_excel',
    key: 'rasio_3_excel',
    width: 150,
    align: 'right',
    render: value => numberFormatter.format(Number(value || 0)),
  },
  {
    title: 'Unit 3 Excel',
    dataIndex: 'unit_3_excel',
    key: 'unit_3_excel',
    width: 130,
    render: value => value || '-',
  },
]

export default function SIINASValidasiMaterialSatuan3() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [summary, setSummary] = useState({ total: 0 })
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const fetchRows = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchValue = search,
  ) => {
    setLoading(true)
    try {
      const res = await api.get('/api/siinas/validasi-material-satuan-3', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: searchValue,
        },
      })
      setRows(res.data.data || [])
      setSummary(res.data.summary || {})
      setSource(res.data.source || '')
      setPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat Validasi Material Satuan 3'))
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchRows(1, DEFAULT_PAGE_SIZE, '')
  }, [fetchRows])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/api/siinas/validasi-material-satuan-3', {
        params: {
          offset: 0,
          limit: 100000,
          search,
        },
      })
      exportRowsToXLS({
        rows: (res.data.data || []).map((row, index) => ({ no: index + 1, ...row })),
        columns: exportColumns,
        filename: 'siinas-validasi-material-satuan-3.xls',
      })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal mengekspor Validasi Material Satuan 3'))
    } finally {
      setExporting(false)
    }
  }

  const toolbar = (
    <Space wrap>
      <Search
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Cari no barang, deskripsi, unit..."
        value={search}
        style={{ width: 340 }}
        onChange={event => setSearch(event.target.value)}
        onSearch={(value) => {
          setSearch(value)
          fetchRows(1, pagination.pageSize, value)
        }}
      />
      <Button type="primary" icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>
        Export XLS
      </Button>
      {source && <Text type="secondary">Sumber: {source}</Text>}
    </Space>
  )

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}>
            <Statistic title="Total Data" value={summary.total || 0} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Validasi Material Satuan 3"
        extra={toolbar}
        style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}
        styles={{ body: { padding: 16 } }}
      >
        <Table
          rowKey={(record, index) => `${record.no_barang}-${index}`}
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          bordered
          scroll={{ x: 810, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} item`,
            onChange: (page, pageSize) => fetchRows(page, pageSize, search),
          }}
        />
      </Card>
    </Space>
  )
}
