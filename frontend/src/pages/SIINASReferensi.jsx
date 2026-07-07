import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Col, Input, Row, Space, Statistic, Table, Typography, message } from 'antd'
import { FileExcelOutlined, GlobalOutlined, NumberOutlined, SearchOutlined } from '@ant-design/icons'
import api, { getApiErrorMessage } from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'

const { Search } = Input
const { Text } = Typography

const negaraColumns = [
  { title: 'Negara Pemasok', dataIndex: 'negara_pemasok', key: 'negara_pemasok', width: 260 },
  { title: 'Kode Negara', dataIndex: 'kode_negara', key: 'kode_negara', width: 140 },
]

const uraianColumns = [
  { title: 'Uraian', dataIndex: 'uraian', key: 'uraian', width: 260 },
  { title: 'Kode', dataIndex: 'kode', key: 'kode', width: 140 },
]

export default function SIINASReferensi() {
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [negaraRows, setNegaraRows] = useState([])
  const [uraianRows, setUraianRows] = useState([])
  const [summary, setSummary] = useState({ negara_count: 0, uraian_count: 0 })
  const [source, setSource] = useState('')

  const fetchReferensi = useCallback(async (searchValue = search) => {
    setLoading(true)
    try {
      const res = await api.get('/api/siinas/referensi', {
        params: { search: searchValue },
      })
      setNegaraRows(res.data.negara || [])
      setUraianRows(res.data.uraian || [])
      setSummary(res.data.summary || {})
      setSource(res.data.source || '')
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat referensi SIINAS'))
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchReferensi('')
  }, [fetchReferensi])

  const exportReferensi = () => {
    const rows = [
      ...negaraRows.map(row => ({
        jenis_referensi: 'Negara Pemasok',
        nama: row.negara_pemasok,
        kode: row.kode_negara,
      })),
      ...uraianRows.map(row => ({
        jenis_referensi: 'Uraian',
        nama: row.uraian,
        kode: row.kode,
      })),
    ]
    if (!rows.length) {
      message.warning('Tidak ada data untuk diekspor')
      return
    }
    exportRowsToXLS({
      rows,
      columns: [
        { key: 'jenis_referensi', label: 'Jenis Referensi' },
        { key: 'nama', label: 'Nama/Uraian' },
        { key: 'kode', label: 'Kode' },
      ],
      filename: 'siinas-referensi.xls',
    })
  }

  const toolbar = (
    <Space wrap>
      <Search
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Cari negara, uraian, atau kode..."
        style={{ width: 320 }}
        onSearch={(value) => {
          setSearch(value)
          fetchReferensi(value)
        }}
      />
      <Button type="primary" icon={<FileExcelOutlined />} onClick={exportReferensi}>
        Export XLS
      </Button>
      {source && <Text type="secondary">Sumber: {source}</Text>}
    </Space>
  )

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}>
            <Statistic
              title="Negara Pemasok"
              value={summary.negara_count || 0}
              prefix={<GlobalOutlined style={{ color: '#11b7d8' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}>
            <Statistic
              title="Uraian/Kode"
              value={summary.uraian_count || 0}
              prefix={<NumberOutlined style={{ color: '#00a92f' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Referensi SIINAS"
        extra={toolbar}
        style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}
        styles={{ body: { padding: 16 } }}
      >
        <Row gutter={[14, 14]}>
          <Col xs={24} lg={12}>
            <Table
              rowKey={(record, index) => `${record.kode_negara}-${record.negara_pemasok}-${index}`}
              title={() => <Text strong>Negara Pemasok</Text>}
              columns={negaraColumns}
              dataSource={negaraRows}
              loading={loading}
              size="small"
              bordered
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ x: 420, y: 'calc(100vh - 430px)' }}
            />
          </Col>
          <Col xs={24} lg={12}>
            <Table
              rowKey={(record, index) => `${record.kode}-${record.uraian}-${index}`}
              title={() => <Text strong>Uraian dan Kode</Text>}
              columns={uraianColumns}
              dataSource={uraianRows}
              loading={loading}
              size="small"
              bordered
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ x: 420, y: 'calc(100vh - 430px)' }}
            />
          </Col>
        </Row>
      </Card>
    </Space>
  )
}
