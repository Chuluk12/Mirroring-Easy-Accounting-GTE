import { useEffect, useState } from 'react'
import { Button, Card, DatePicker, Input, Space, Statistic, Table, Tooltip, Typography, message } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { downloadWorkbookXLS } from '../../utils/exportXls'

const { RangePicker } = DatePicker
const { Text } = Typography
const initialRange = () => [dayjs().startOf('year'), dayjs()]
const money = value => value == null ? '-' : Number(value).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 })
const quantity = value => value == null ? '-' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 })
const exportColumns = [
  { key: 'tanggal', label: 'Tanggal Pembelian', type: 'date' },
  { key: 'no_pembelian', label: 'No. Faktur Pembelian' },
  { key: 'no_formulir', label: 'No. Formulir' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'nama_pemasok', label: 'Nama Pemasok' },
  { key: 'no_material', label: 'No. Material' },
  { key: 'nama_material', label: 'Nama Material' },
  { key: 'qty', label: 'Kuantitas', type: 'number' },
  { key: 'unit', label: 'Satuan' },
  { key: 'harga_satuan', label: 'Harga per Unit', type: 'accounting' },
  { key: 'diskon_persen', label: 'Diskon (%)', type: 'number' },
  { key: 'diskon_asli', label: 'Nilai Diskon Tersimpan' },
  { key: 'status_perhitungan', label: 'Status Perhitungan' },
  { key: 'total', label: 'Total Pembelian', type: 'accounting' },
  { key: 'deskripsi_transaksi', label: 'Keterangan' },
]

export default function AnalisisPembelianMaterial() {
  const [dates, setDates] = useState(initialRange)
  const [search, setSearch] = useState('')
  const [data, setData] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  const fetchData = async (range = dates, query = search, page = pagination.current, pageSize = pagination.pageSize) => {
    if (!range?.[0] || !range?.[1]) return message.warning('Pilih periode tanggal')
    setLoading(true)
    try {
      const response = await api.get('/api/analisis-pembelian-material', {
        params: {
          date_from: range[0].format('YYYY-MM-DD'), date_to: range[1].format('YYYY-MM-DD'),
          search: query, limit: pageSize, offset: (page - 1) * pageSize,
        },
      })
      setData(response.data.data || [])
      setPagination({ current: page, pageSize, total: response.data.total || 0 })
      setHasRun(true)
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat riwayat pembelian material')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(dates, search, 1, pagination.pageSize) }, [dates])

  const reset = () => {
    const nextDates = initialRange()
    setSearch('')
    setDates(nextDates)
    setPagination(previous => ({ ...previous, current: 1 }))
    if (dates?.[0]?.isSame(nextDates[0], 'day') && dates?.[1]?.isSame(nextDates[1], 'day')) {
      fetchData(nextDates, '', 1, pagination.pageSize)
    }
  }

  const exportReport = async () => {
    if (!pagination.total) return message.info('Tidak ada data untuk diekspor')
    setExporting(true)
    try {
      const rows = []
      const pageSize = 100
      for (let offset = 0; offset < pagination.total; offset += pageSize) {
        const response = await api.get('/api/analisis-pembelian-material', {
          params: {
            date_from: dates[0].format('YYYY-MM-DD'), date_to: dates[1].format('YYYY-MM-DD'),
            search, limit: pageSize, offset,
          },
        })
        rows.push(...(response.data.data || []))
      }
      downloadWorkbookXLS([{ name: 'Riwayat Pembelian Material', columns: exportColumns, rows }],
        `Riwayat_Pembelian_Material_${dates[0].format('YYYYMMDD')}_${dates[1].format('YYYYMMDD')}`)
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal mengekspor riwayat pembelian')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { title: 'Tanggal Pembelian', dataIndex: 'tanggal', key: 'tanggal', width: 140, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No. Faktur Pembelian', dataIndex: 'no_pembelian', key: 'no_pembelian', width: 180, render: value => <Text strong style={{ color: '#1677ff' }}>{value || '-'}</Text> },
    { title: 'No. Formulir', dataIndex: 'no_formulir', key: 'no_formulir', width: 150, render: value => value || '-' },
    { title: 'Pemasok', dataIndex: 'nama_pemasok', key: 'nama_pemasok', width: 220, ellipsis: true, render: (value, row) => <Tooltip title={`${row.no_pemasok} ${value}`}>{value || row.no_pemasok || '-'}</Tooltip> },
    { title: 'No. Material', dataIndex: 'no_material', key: 'no_material', width: 190, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Material', dataIndex: 'nama_material', key: 'nama_material', width: 280, ellipsis: true },
    { title: 'Kuantitas', dataIndex: 'qty', key: 'qty', width: 125, align: 'right', render: (value, row) => `${quantity(value)} ${row.unit || ''}`.trim() },
    { title: 'Harga per Unit', dataIndex: 'harga_satuan', key: 'harga_satuan', width: 155, align: 'right', render: money },
    { title: 'Diskon', dataIndex: 'diskon_persen', key: 'diskon_persen', width: 110, align: 'right', render: (value, row) => value == null ? <Tooltip title={`Nilai di database: ${row.diskon_asli || '-'}`}>Perlu cek</Tooltip> : `${quantity(value)}%` },
    { title: 'Total Pembelian', dataIndex: 'total', key: 'total', width: 165, align: 'right', render: money },
    { title: 'Status Perhitungan', dataIndex: 'status_perhitungan', key: 'status_perhitungan', width: 190, render: value => value === 'OK' ? <Text type="success">OK</Text> : <Text type="warning">{value}</Text> },
    { title: 'Keterangan', dataIndex: 'deskripsi_transaksi', key: 'deskripsi_transaksi', width: 220, ellipsis: true },
  ]

  return <Card title="Riwayat Pembelian Material" extra={<Space wrap>
    <RangePicker value={dates} format="DD/MM/YYYY" onChange={value => {
      setDates(value || initialRange())
      setPagination(previous => ({ ...previous, current: 1 }))
    }} />
    <Input.Search allowClear placeholder="Cari material, pemasok, faktur..." value={search} onChange={event => setSearch(event.target.value)} onSearch={value => {
      setSearch(value)
      fetchData(dates, value, 1, pagination.pageSize)
    }} style={{ width: 260 }} enterButton={<SearchOutlined />} />
    <Button icon={<ReloadOutlined />} loading={loading} onClick={() => fetchData(dates, search, pagination.current, pagination.pageSize)}>Muat Ulang</Button>
    <Button icon={<ReloadOutlined />} onClick={reset}>Reset</Button>
    <Button icon={<DownloadOutlined />} loading={exporting} disabled={!pagination.total} onClick={exportReport}>Export XLS</Button>
  </Space>}>
    <Typography.Paragraph type="secondary">
      Riwayat faktur pembelian pemasok sesuai periode. Tampil 20 baris per halaman; klik ekspor untuk mengunduh seluruh hasil filter.
    </Typography.Paragraph>
    {hasRun && <Statistic title="Total baris pembelian" value={pagination.total} style={{ marginBottom: 16 }} />}
    <Table rowKey={(row, index) => `${row.no_pembelian}-${row.no_material}-${index}`} size="small" loading={loading} columns={columns} dataSource={data}
      pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: total => `${total} baris`, onChange: (page, size) => fetchData(dates, search, page, size) }}
      scroll={{ x: 1700 }} locale={{ emptyText: hasRun ? 'Tidak ada transaksi pembelian pada periode ini' : 'Memuat riwayat pembelian...' }} />
  </Card>
}
