import { useCallback, useEffect, useState } from 'react'
import { Button, Card, DatePicker, Input, Modal, message, Space, Table, Typography } from 'antd'
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'
import './SIINAS.css'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20
const numberFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const moneyFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integerFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

function formatInteger(value) {
  return integerFormatter.format(Number(value || 0))
}

const monitoringColumns = [
  { title: 'Kode Kategori', dataIndex: 'kode_kategori', key: 'kode_kategori', width: 145 },
  { title: 'Jumlah Tanggal', dataIndex: 'tanggal_count', key: 'tanggal_count', width: 130, align: 'right', render: value => formatInteger(value) },
  { title: 'Jumlah Detail', dataIndex: 'detail_count', key: 'detail_count', width: 120, align: 'right', render: value => formatInteger(value) },
  { title: 'Nilai Produksi GP', dataIndex: 'nilai_produksi_gp', key: 'nilai_produksi_gp', width: 175, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Kts Satuan Asli', dataIndex: 'kts_satuan_asli', key: 'kts_satuan_asli', width: 145, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Kts Standar Kgm', dataIndex: 'kts_standar_kgm', key: 'kts_standar_kgm', width: 155, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Nilai Produksi (Kgm)', dataIndex: 'nilai_produksi_kgm', key: 'nilai_produksi_kgm', width: 180, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Nilai Produksi (Asli)', dataIndex: 'nilai_produksi_asli', key: 'nilai_produksi_asli', width: 180, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
]

const dateColumns = [
  { title: 'Tgl. Hasil Produksi', dataIndex: 'tanggal_gp', key: 'tanggal_gp', width: 145, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'Jumlah Detail', dataIndex: 'detail_count', key: 'detail_count', width: 120, align: 'right', render: value => formatInteger(value) },
  { title: 'Nilai Produksi GP', dataIndex: 'nilai_produksi_gp', key: 'nilai_produksi_gp', width: 175, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Kts Satuan Asli', dataIndex: 'kts_satuan_asli', key: 'kts_satuan_asli', width: 145, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Kts Standar Kgm', dataIndex: 'kts_standar_kgm', key: 'kts_standar_kgm', width: 155, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Nilai Produksi (Kgm)', dataIndex: 'nilai_produksi_kgm', key: 'nilai_produksi_kgm', width: 180, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Nilai Produksi (Asli)', dataIndex: 'nilai_produksi_asli', key: 'nilai_produksi_asli', width: 180, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
]

function buildDetailColumns(onOpenMaterial) {
  return [
  {
    title: 'No Hasil Produksi',
    dataIndex: 'no_hasil',
    key: 'no_hasil',
    width: 160,
    render: (value, record) => (
      <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onOpenMaterial(record)}>
        {value || '-'}
      </Button>
    ),
  },
  { title: 'Tgl GP', dataIndex: 'tgl_hasil', key: 'tgl_hasil', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'No Perintah Kerja', dataIndex: 'no_perintah_kerja', key: 'no_perintah_kerja', width: 165 },
  { title: 'Tgl PK', dataIndex: 'tgl_perintah_kerja', key: 'tgl_perintah_kerja', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'No Barang', dataIndex: 'no_barang_hasil', key: 'no_barang_hasil', width: 170 },
  { title: 'Deskripsi', dataIndex: 'nama_barang_hasil', key: 'nama_barang_hasil', width: 260 },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 120, render: value => value || '-' },
  { title: 'Produk Barang Jadi', dataIndex: 'produk_barang_jadi', key: 'produk_barang_jadi', width: 190, render: value => value || '-' },
  { title: 'Qty Hasil', dataIndex: 'qty_hasil', key: 'qty_hasil', width: 120, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Unit', dataIndex: 'unit_hasil', key: 'unit_hasil', width: 80 },
  { title: 'Unit Cost', dataIndex: 'unit_cost', key: 'unit_cost', width: 130, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Total Cost', dataIndex: 'total_cost', key: 'total_cost', width: 140, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Unit 2', dataIndex: 'unit_2', key: 'unit_2', width: 90, render: value => value || '-' },
  { title: 'Rasio 2', dataIndex: 'rasio_2_barang', key: 'rasio_2_barang', width: 105, align: 'right', render: value => Number(value || 0) ? numberFormatter.format(Number(value || 0)) : '-' },
  { title: 'Unit 3', dataIndex: 'unit_3', key: 'unit_3', width: 90, render: value => value || '-' },
  { title: 'Rasio 3', dataIndex: 'rasio_3_barang', key: 'rasio_3_barang', width: 105, align: 'right', render: value => Number(value || 0) ? numberFormatter.format(Number(value || 0)) : '-' },
  { title: 'Qty SPK', dataIndex: 'qty_perintah_kerja', key: 'qty_perintah_kerja', width: 110, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Unit SPK', dataIndex: 'unit_perintah_kerja', key: 'unit_perintah_kerja', width: 90 },
  ]
}

const materialColumns = [
  { title: 'No Barang', dataIndex: 'no_barang', key: 'no_barang', width: 170, fixed: 'left' },
  { title: 'Nama Barang', dataIndex: 'nama_barang', key: 'nama_barang', width: 280, fixed: 'left' },
  { title: 'Akun Persediaan', dataIndex: 'akun_persediaan', key: 'akun_persediaan', width: 210, render: value => value || '-' },
  { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 120, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Stok', dataIndex: 'stok_akhir', key: 'stok_akhir', width: 120, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 90 },
  { title: 'Nilai', dataIndex: 'nilai', key: 'nilai', width: 140, align: 'right', render: value => moneyFormatter.format(Number(value || 0)) },
  { title: 'Negara Pemasok', dataIndex: 'negara_pemasok', key: 'negara_pemasok', width: 170, render: value => value || '-' },
  { title: 'Kode Negara', dataIndex: 'kode_negara', key: 'kode_negara', width: 120, render: value => value || '-' },
  { title: 'HS Code', dataIndex: 'hs_code', key: 'hs_code', width: 130, render: value => value || '-' },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 120, render: value => value || '-' },
  { title: 'Unit 1', dataIndex: 'unit1', key: 'unit1', width: 90 },
  { title: 'Unit 2', dataIndex: 'unit2', key: 'unit2', width: 90 },
  { title: 'Unit 3', dataIndex: 'unit3', key: 'unit3', width: 90 },
  { title: 'Qty KGM Validasi', dataIndex: 'kg_qty', key: 'kg_qty', width: 150, align: 'right', render: value => value === null || value === undefined ? '-' : numberFormatter.format(Number(value || 0)) },
  { title: 'Unit KGM', dataIndex: 'kg_unit', key: 'kg_unit', width: 90 },
  { title: 'Rasio 3 Validasi', dataIndex: 'rasio_3_validasi', key: 'rasio_3_validasi', width: 145, align: 'right', render: value => Number(value || 0) ? numberFormatter.format(Number(value || 0)) : '-' },
]

const inventoryAccountOrder = [
  'persediaan bahan baku',
  'persediaan bahan pembantu',
  'persediaan gudang',
]

function getInventoryAccountRank(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const index = inventoryAccountOrder.findIndex(account => normalized.includes(account))
  return index === -1 ? inventoryAccountOrder.length : index
}

function sortMaterialsByInventoryAccount(materials) {
  return [...materials].sort((a, b) => {
    const accountRank = getInventoryAccountRank(a.akun_persediaan) - getInventoryAccountRank(b.akun_persediaan)
    if (accountRank !== 0) return accountRank

    const accountName = String(a.akun_persediaan || '').localeCompare(String(b.akun_persediaan || ''), 'id')
    if (accountName !== 0) return accountName

    return String(a.no_barang || '').localeCompare(String(b.no_barang || ''), 'id')
  })
}

function MaterialBreakdown({ detail }) {
  const nonKgMaterials = sortMaterialsByInventoryAccount(detail.material_non_kg || [])
  const kgMaterials = sortMaterialsByInventoryAccount(detail.material_kg || [])

  return (
    <Space className="siinas-material-breakdown" direction="vertical" size={14}>
      <div className="siinas-material-section">
        <div className="siinas-material-title">
          <Text strong>Material tanpa validasi satuan 3 KGM</Text>
        </div>
        <Table
          rowKey={(row, index) => `non-kg-${row.no_barang}-${index}`}
          columns={materialColumns}
          dataSource={nonKgMaterials}
          size="small"
          pagination={false}
          scroll={{ x: 2315 }}
          locale={{ emptyText: 'Tidak ada material tanpa validasi satuan 3 KGM' }}
        />
      </div>
      <div className="siinas-material-section">
        <div className="siinas-material-title">
          <Text strong>Material dengan validasi satuan 3 KGM</Text>
        </div>
        <Table
          rowKey={(row, index) => `kg-${row.no_barang}-${index}`}
          columns={materialColumns}
          dataSource={kgMaterials}
          size="small"
          pagination={false}
          scroll={{ x: 2315 }}
          locale={{ emptyText: 'Tidak ada material dengan validasi satuan 3 KGM' }}
        />
      </div>
    </Space>
  )
}

function DateDetailTable({ dateRow, kodeKategori, detailColumns }) {
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState([])

  useEffect(() => {
    let cancelled = false
    const fetchDetails = async () => {
      setLoading(true)
      try {
        const res = await api.get('/api/siinas/monitoring-report/details', {
          params: {
            kode_kategori: kodeKategori,
            tanggal_gp: dateRow.tanggal_gp,
          },
        })
        if (!cancelled) setDetails(res.data.data || [])
      } catch (error) {
        if (!cancelled) {
          message.error(getApiErrorMessage(error, 'Gagal memuat detail hasil produksi'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDetails()
    return () => {
      cancelled = true
    }
  }, [dateRow.tanggal_gp, kodeKategori])

  return (
    <Table
      rowKey={(detail, index) => `${detail.no_hasil}-${detail.wodet_id}-${detail.no_barang_hasil}-${index}`}
      columns={detailColumns}
      dataSource={details}
      loading={loading}
      size="small"
      pagination={false}
      scroll={{ x: 2380 }}
    />
  )
}

function makePagination(pagination, onChange) {
  return {
    ...pagination,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100, 200],
    showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} item`,
    onChange,
  }
}

export default function SIINAS() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState([])
  const [materialDetail, setMaterialDetail] = useState(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const detailColumns = buildDetailColumns(setMaterialDetail)

  const fetchMonitoring = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchValue = search, range = dateRange) => {
    setLoading(true)
    try {
      const res = await api.get('/api/siinas/monitoring-report', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: searchValue,
          date_from: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
          date_to: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
        },
      })
      setRows(res.data.data || [])
      setExpandedCategoryKeys([])
      setPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat SIINAS Monitoring Report'))
    } finally {
      setLoading(false)
    }
  }, [dateRange, search])

  useEffect(() => {
    fetchMonitoring(1, DEFAULT_PAGE_SIZE, '')
  }, [fetchMonitoring])

  const exportMonitoring = async () => {
    try {
      const res = await api.get('/api/siinas/monitoring-report', {
        params: {
          offset: 0,
          limit: 100000,
          search,
          date_from: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : '',
          date_to: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : '',
        },
      })
      const exportRows = (res.data.data || []).flatMap(category => (
        (category.dates || []).map(dateRow => ({
          ...dateRow,
          kode_kategori: category.kode_kategori,
        }))
      ))
      exportRowsToXLS({
        rows: exportRows,
        columns: [
          { key: 'kode_kategori', label: 'Kode Kategori' },
          ...dateColumns.map(column => ({
          key: column.dataIndex,
          label: column.title,
          type: column.dataIndex === 'tanggal_gp' ? 'date' : 'number',
          })),
        ],
        filename: 'siinas-monitoring-report.xls',
      })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal mengekspor Monitoring Report'))
    }
  }

  const toolbar = (
    <Space wrap>
      <RangePicker
        value={dateRange}
        format="DD/MM/YYYY"
        onChange={(value) => {
          const nextRange = value || null
          setDateRange(nextRange)
          fetchMonitoring(1, pagination.pageSize, search, nextRange)
        }}
        style={{ width: 245 }}
      />
      <Search
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Cari Code Product..."
        style={{ width: 300 }}
        onSearch={(value) => {
          setSearch(value)
          fetchMonitoring(1, pagination.pageSize, value)
        }}
      />
      <Button type="primary" icon={<FileExcelOutlined />} onClick={exportMonitoring}>
        Export XLS
      </Button>
    </Space>
  )

  return (
    <Card
      style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}
      styles={{ body: { padding: 16 } }}
    >
      <Table
        rowKey={(record) => record.kode_kategori || '__EMPTY__'}
        title={() => toolbar}
        columns={monitoringColumns}
        dataSource={rows}
        loading={loading}
        size="small"
        bordered
        scroll={{ x: 1240, y: 'calc(100vh - 300px)' }}
        pagination={makePagination(pagination, (page, pageSize) => fetchMonitoring(page, pageSize, search))}
        expandable={{
          expandedRowKeys: expandedCategoryKeys,
          onExpandedRowsChange: keys => setExpandedCategoryKeys(keys),
          rowExpandable: record => (record.dates || []).length > 0,
          expandedRowRender: record => (
            <Table
              rowKey={(dateRow) => `${record.kode_kategori}-${dateRow.tanggal_gp}`}
              columns={dateColumns}
              dataSource={record.dates || []}
              size="small"
              pagination={false}
              scroll={{ x: 1160 }}
              expandable={{
                expandRowByClick: true,
                rowExpandable: () => true,
                expandedRowRender: dateRow => (
                  <DateDetailTable
                    dateRow={dateRow}
                    kodeKategori={record.kode_kategori}
                    detailColumns={detailColumns}
                  />
                ),
              }}
            />
          ),
        }}
      />
      <Modal
        open={Boolean(materialDetail)}
        onCancel={() => setMaterialDetail(null)}
        footer={null}
        title={`Detail Material ${materialDetail?.no_hasil || ''}`}
        width={1180}
      >
        {materialDetail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>{materialDetail.no_barang_hasil || '-'}</Text>
              <Text type="secondary"> - {materialDetail.nama_barang_hasil || '-'}</Text>
            </div>
            <MaterialBreakdown detail={materialDetail} />
          </Space>
        )}
      </Modal>
    </Card>
  )
}
