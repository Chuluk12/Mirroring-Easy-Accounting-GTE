import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, DatePicker, Input, Modal, message, Space, Table, Tabs, Typography } from 'antd'
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../api/client'
import { downloadWorkbookXLS } from '../utils/exportXls'
import './SIINAS.css'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20
const numberFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const ratioFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
const moneyFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integerFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const indonesiaMonthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

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

const gpMaterialColumns = [
  { title: 'No Material', dataIndex: 'no_barang', key: 'no_barang', width: 170, fixed: 'left', render: value => value || '-' },
  { title: 'Deskripsi Material', dataIndex: 'nama_barang', key: 'nama_barang', width: 300, fixed: 'left', render: value => value || '-' },
  { title: 'HS Code', dataIndex: 'hs_code', key: 'hs_code', width: 160, render: value => value || '-' },
  { title: 'Akun Persediaan Barang', dataIndex: 'akun_persediaan', key: 'akun_persediaan', width: 240, render: value => value || '-' },
  { title: 'Satuan', dataIndex: 'unit', key: 'unit', width: 100, render: value => value || '-' },
  {
    title: 'Kuantitas Masuk (ID)', dataIndex: 'kuantitas_masuk_id', key: 'kuantitas_masuk_id', width: 165, align: 'right',
    render: (value, record) => (
      <Button
        type="link"
        size="small"
        disabled={!Number(value || 0)}
        style={{ padding: 0 }}
        onClick={() => Modal.info({
          title: `Pembelian ID - ${record.no_barang || '-'}`,
          width: 900,
          okText: 'Tutup',
          content: <PurchaseTransactionsTable record={record} origin="ID" />,
        })}
      >
        {numberFormatter.format(Number(value || 0))}
      </Button>
    ),
  },
  { title: 'Persentase (ID)', dataIndex: 'persentase_id', key: 'persentase_id', width: 140, align: 'right', render: value => `${moneyFormatter.format(Number(value || 0))}%` },
  {
    title: 'Kuantitas Masuk (LN)', dataIndex: 'kuantitas_masuk_ln', key: 'kuantitas_masuk_ln', width: 165, align: 'right',
    render: (value, record) => (
      <Button
        type="link"
        size="small"
        disabled={!Number(value || 0)}
        style={{ padding: 0 }}
        onClick={() => Modal.info({
          title: `Pembelian LN - ${record.no_barang || '-'}`,
          width: 900,
          okText: 'Tutup',
          content: <PurchaseTransactionsTable record={record} origin="LN" />,
        })}
      >
        {numberFormatter.format(Number(value || 0))}
      </Button>
    ),
  },
  { title: 'Persentase (LN)', dataIndex: 'persentase_ln', key: 'persentase_ln', width: 140, align: 'right', render: value => `${moneyFormatter.format(Number(value || 0))}%` },
  { title: 'Kode Negara', dataIndex: 'kode_negara', key: 'kode_negara', width: 125, render: value => value || '-' },
  { title: 'Tgl Stock Akhir', dataIndex: 'tgl_stock_akhir', key: 'tgl_stock_akhir', width: 145, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
]

function formatQtyWithUnit(qty, unit) {
  const qtyText = qty === null || qty === undefined ? '-' : numberFormatter.format(Number(qty || 0))
  const unitText = String(unit || '').trim()
  return unitText ? `${qtyText} ${unitText}` : qtyText
}

function normalizeMaterialUnit(value) {
  return String(value || '').trim().toUpperCase()
}

function getMaterialKgmQty(material) {
  if (material.kg_qty !== null && material.kg_qty !== undefined) {
    return Number(material.kg_qty || 0)
  }

  if (['KG', 'KGS', 'KGM'].includes(normalizeMaterialUnit(material.unit))) {
    return Number(material.qty || 0)
  }

  return null
}

function getMaterialStockKgmQty(material) {
  if (material.stok_akhir_kgm !== null && material.stok_akhir_kgm !== undefined) {
    return Number(material.stok_akhir_kgm || 0)
  }

  const ratio = Number(material.rasio_3_validasi || 0)
  if (ratio) {
    return Number(material.stok_akhir || 0) / ratio
  }

  if (['KG', 'KGS', 'KGM'].includes(normalizeMaterialUnit(material.unit))) {
    return Number(material.stok_akhir || 0)
  }

  return null
}

function InfoRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', columnGap: 16, alignItems: 'start' }}>
      <Text type="secondary">{label}</Text>
      <Text strong>{children}</Text>
    </div>
  )
}

function StockTransactionsTable({ record, direction }) {
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState([])
  const isIncoming = direction === 'in'

  useEffect(() => {
    let cancelled = false
    const fetchTransactions = async () => {
      setLoading(true)
      try {
        const res = await api.get(`/api/siinas/monitoring-report/stock-${direction}-transactions`, {
          params: {
            item_no: record.no_barang,
            date_to: record.tgl_stock_akhir,
          },
        })
        if (!cancelled) setTransactions(res.data.data || [])
      } catch (error) {
        if (!cancelled) message.error(getApiErrorMessage(error, `Gagal memuat transaksi ${isIncoming ? 'masuk' : 'keluar'}`))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTransactions()
    return () => {
      cancelled = true
    }
  }, [direction, isIncoming, record.no_barang, record.tgl_stock_akhir])

  return (
    <Table
      rowKey={(transaction) => transaction.itemhist_id}
      size="small"
      bordered
      loading={loading}
      style={{ marginTop: 16 }}
      pagination={{ pageSize: 10, showSizeChanger: false, showTotal: total => `${total} transaksi` }}
      columns={[
        { title: 'No Transaksi', dataIndex: 'no_transaksi', key: 'no_transaksi', render: value => value || '-' },
        { title: 'Jenis', dataIndex: 'jenis_transaksi', key: 'jenis_transaksi', width: 125, render: value => value || '-' },
        { title: 'Tanggal', dataIndex: 'tanggal', key: 'tanggal', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
        { title: isIncoming ? 'Qty Masuk' : 'Qty Keluar', dataIndex: 'qty', key: 'qty', width: 135, align: 'right', render: value => formatQtyWithUnit(value, record.unit) },
      ]}
      dataSource={transactions}
      locale={{ emptyText: `Tidak ada transaksi ${isIncoming ? 'masuk' : 'keluar'}` }}
    />
  )
}

function PurchaseTransactionsTable({ record, origin }) {
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    let cancelled = false
    const fetchTransactions = async () => {
      setLoading(true)
      try {
        const res = await api.get('/api/siinas/monitoring-report/purchase-transactions', {
          params: {
            item_no: record.no_barang,
            date_to: record.tgl_stock_akhir,
            origin,
          },
        })
        if (!cancelled) setTransactions(res.data.data || [])
      } catch (error) {
        if (!cancelled) message.error(getApiErrorMessage(error, `Gagal memuat transaksi pembelian ${origin}`))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTransactions()
    return () => {
      cancelled = true
    }
  }, [origin, record.no_barang, record.tgl_stock_akhir])

  return (
    <Table
      rowKey={(transaction) => transaction.transaction_key}
      size="small"
      bordered
      loading={loading}
      style={{ marginTop: 16 }}
      pagination={{ pageSize: 10, showSizeChanger: false, showTotal: total => `${total} transaksi` }}
      columns={[
        { title: 'No Transaksi', dataIndex: 'no_transaksi', key: 'no_transaksi', width: 180, render: value => value || '-' },
        { title: 'Jenis', dataIndex: 'jenis_transaksi', key: 'jenis_transaksi', width: 110, render: value => value || '-' },
        { title: 'Tanggal', dataIndex: 'tanggal', key: 'tanggal', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
        { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', render: value => value || '-' },
        { title: 'Negara', dataIndex: 'negara', key: 'negara', width: 120, render: value => value || '-' },
        { title: 'Qty Masuk', dataIndex: 'qty', key: 'qty', width: 135, align: 'right', render: value => formatQtyWithUnit(value, record.unit) },
      ]}
      dataSource={transactions}
      locale={{ emptyText: `Tidak ada transaksi pembelian ${origin}` }}
    />
  )
}

const stokBahanMaterialColumns = [
  { title: 'No Material', dataIndex: 'no_barang', key: 'no_barang', width: 170, fixed: 'left', render: value => value || '-' },
  { title: 'Deskripsi Material', dataIndex: 'nama_barang', key: 'nama_barang', width: 300, fixed: 'left', render: value => value || '-' },
  { title: 'Akun Persediaan Barang', dataIndex: 'akun_persediaan', key: 'akun_persediaan', width: 240, render: value => value || '-' },
  { title: 'Tgl Stock Akhir', dataIndex: 'tgl_stock_akhir', key: 'tgl_stock_akhir', width: 145, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'Satuan', dataIndex: 'unit', key: 'unit', width: 95, render: value => value || '-' },
  {
    title: 'Stok Awal',
    dataIndex: 'stok_awal',
    key: 'stok_awal',
    width: 135,
    align: 'right',
    render: () => numberFormatter.format(0),
  },
  {
    title: 'Masuk',
    dataIndex: 'stok_masuk',
    key: 'stok_masuk',
    width: 125,
    align: 'right',
    render: (value, record) => (
      <Button
        type="link"
        size="small"
        disabled={!Number(value || 0)}
        style={{ padding: 0 }}
        onClick={() => Modal.info({
          title: `Transaksi Masuk - ${record.no_barang || '-'}`,
          width: 760,
          okText: 'Tutup',
          content: <StockTransactionsTable record={record} direction="in" />,
        })}
      >
        {numberFormatter.format(Number(value || 0))}
      </Button>
    ),
  },
  {
    title: 'Keluar',
    dataIndex: 'stok_keluar',
    key: 'stok_keluar',
    width: 125,
    align: 'right',
    render: (value, record) => (
      <Button
        type="link"
        size="small"
        disabled={!Number(value || 0)}
        style={{ padding: 0 }}
        onClick={() => Modal.info({
          title: `Transaksi Keluar - ${record.no_barang || '-'}`,
          width: 760,
          okText: 'Tutup',
          content: <StockTransactionsTable record={record} direction="out" />,
        })}
      >
        {numberFormatter.format(Number(value || 0))}
      </Button>
    ),
  },
  {
    title: 'Stok Akhir',
    dataIndex: 'stok_akhir',
    key: 'stok_akhir',
    width: 135,
    align: 'right',
    render: (value, record) => formatQtyWithUnit(value, record.unit),
  },
  {
    title: 'Stok Akhir KGM',
    key: 'stok_akhir_kgm',
    width: 155,
    align: 'right',
    render: (_, record) => {
      const kgmQty = getMaterialStockKgmQty(record)
      return kgmQty === null ? '-' : formatQtyWithUnit(kgmQty, 'KGM')
    },
  },
]

const bahanMaterialColumns = [
  { title: 'No Material', dataIndex: 'no_barang', key: 'no_barang', width: 170, fixed: 'left', render: value => value || '-' },
  { title: 'Deskripsi Material', dataIndex: 'nama_barang', key: 'nama_barang', width: 300, fixed: 'left', render: value => value || '-' },
  { title: 'Akun Persediaan Barang', dataIndex: 'akun_persediaan', key: 'akun_persediaan', width: 240, render: value => value || '-' },
  { title: 'HS Code', dataIndex: 'hs_code', key: 'hs_code', width: 160, render: value => value || '-' },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 130, render: value => value || '-' },
  { title: 'Produk Jadi', dataIndex: 'produk_jadi', key: 'produk_jadi', width: 190, render: value => value || '-' },
  { title: 'Unit 1', dataIndex: 'unit1', key: 'unit_1', width: 100, render: value => value || '-' },
  {
    title: 'Qty Satuan Asli',
    dataIndex: 'qty',
    key: 'qty_satuan_asli',
    width: 155,
    align: 'right',
    render: value => numberFormatter.format(Number(value || 0)),
  },
  {
    title: 'Qty Satuan KGM',
    key: 'qty_satuan_kgm',
    width: 155,
    align: 'right',
    render: (_, record) => {
      const kgmQty = getMaterialKgmQty(record)
      if (kgmQty === null) return '-'

      const ratio = Number(record.rasio_3_validasi || 0)
      if (!ratio) return numberFormatter.format(kgmQty)

      return (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => Modal.info({
            title: `Rasio KGM - ${record.no_barang || '-'}`,
            width: 520,
            okText: 'Tutup',
            content: (
              <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
                <InfoRow label="Qty Satuan Asli">{formatQtyWithUnit(record.qty, record.unit)}</InfoRow>
                <InfoRow label={`Rasio 3 ${record.sumber_rasio_3 || 'Data Validasi'}`}>{ratioFormatter.format(ratio)}</InfoRow>
                <InfoRow label="Rumus">Qty Asli / Rasio 3</InfoRow>
                <InfoRow label="Perhitungan">{numberFormatter.format(Number(record.qty || 0))} / {ratioFormatter.format(ratio)} = {numberFormatter.format(kgmQty)} KGM</InfoRow>
                <InfoRow label="Hasil Qty KGM">{formatQtyWithUnit(kgmQty, 'KGM')}</InfoRow>
              </Space>
            ),
          })}
        >
          {numberFormatter.format(kgmQty)}
        </Button>
      )
    },
  },
  {
    title: 'Rasio 3',
    dataIndex: 'rasio_3_validasi',
    key: 'rasio_3',
    width: 130,
    align: 'right',
    render: value => Number(value || 0) ? ratioFormatter.format(Number(value)) : '-',
  },
  {
    title: 'Nilai KGM (Rp)',
    dataIndex: 'nilai',
    key: 'nilai_kgm',
    width: 155,
    align: 'right',
    render: (value, record) => {
      const kgmQty = getMaterialKgmQty(record)
      if (kgmQty === null) return '-'

      const totalValue = Number(value || 0)
      const originalQty = Number(record.qty || 0)
      const originalUnitCost = originalQty ? totalValue / originalQty : 0
      const kgmUnitCost = kgmQty ? totalValue / kgmQty : 0
      const priceReference = record.referensi_harga || {}

      return (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => Modal.info({
            title: `Referensi Nilai KGM - ${record.no_barang || '-'}`,
            width: 560,
            okText: 'Tutup',
            content: (
              <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
                <InfoRow label="Qty Satuan Asli">{formatQtyWithUnit(originalQty, record.unit)}</InfoRow>
                <InfoRow label="Qty Satuan KGM">{formatQtyWithUnit(kgmQty, 'KGM')}</InfoRow>
                <InfoRow label={`Harga per ${record.unit || 'satuan asli'}`}>Rp{moneyFormatter.format(originalUnitCost)}</InfoRow>
                <InfoRow label="Harga per KGM">Rp{moneyFormatter.format(kgmUnitCost)}</InfoRow>
                <InfoRow label="Rumus nilai">Qty Asli x Harga Satuan Asli</InfoRow>
                <InfoRow label="Perhitungan">{numberFormatter.format(originalQty)} x Rp{moneyFormatter.format(originalUnitCost)} = Rp{moneyFormatter.format(totalValue)}</InfoRow>
                <InfoRow label="Nilai KGM">Rp{moneyFormatter.format(totalValue)}</InfoRow>
                <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0 2px' }} />
                <InfoRow label="Jenis transaksi harga">{priceReference.jenis_transaksi || '-'}</InfoRow>
                <InfoRow label="No transaksi">{priceReference.no_transaksi || '-'}</InfoRow>
                <InfoRow label="Tanggal transaksi">{priceReference.tanggal ? dayjs(priceReference.tanggal).format('DD/MM/YYYY') : '-'}</InfoRow>
                <InfoRow label="Harga referensi">{priceReference.harga_satuan ? `Rp${moneyFormatter.format(Number(priceReference.harga_satuan))}` : '-'}</InfoRow>
                <Text type="secondary">Harga referensi berasal dari nilai DPP layer FIFO transaksi pembelian/adjustment di Easy Accounting, tanpa PPN. Konversi ke KGM tidak mengubah nilai total rupiah.</Text>
              </Space>
            ),
          })}
        >
          {moneyFormatter.format(totalValue)}
        </Button>
      )
    },
  },
  { title: 'Tgl Stock Akhir', dataIndex: 'tgl_stock_akhir', key: 'tgl_stock_akhir', width: 145, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
]

const hasilExportColumns = [
  { title: 'No', dataIndex: 'no', key: 'no', width: 70, align: 'right' },
  { title: 'No SPK', dataIndex: 'no_perintah_kerja', key: 'no_perintah_kerja', width: 165, render: value => value || '-' },
  { title: 'No Hasil Produksi', dataIndex: 'no_hasil', key: 'no_hasil', width: 170, render: value => value || '-' },
  { title: 'Tgl Hasil Produksi', dataIndex: 'tgl_hasil', key: 'tgl_hasil', width: 155, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'No Barang Jadi', dataIndex: 'no_barang_hasil', key: 'no_barang_hasil', width: 180, render: value => value || '-' },
  { title: 'Deskripsi Barang Jadi', dataIndex: 'nama_barang_hasil', key: 'nama_barang_hasil', width: 300, render: value => value || '-' },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 130, render: value => value || '-' },
  { title: 'Produk Jadi', dataIndex: 'produk_jadi_export', key: 'produk_jadi_export', width: 190, render: value => value || '-' },
  { title: 'Kategori', dataIndex: 'kategori_export', key: 'kategori_export', width: 170, render: value => value || '-' },
  { title: 'Kuantitas Hasil Produksi', dataIndex: 'qty_hasil', key: 'qty_hasil', width: 190, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'Satuan Hasil Produksi', dataIndex: 'unit_hasil', key: 'unit_hasil', width: 175, render: value => value || '-' },
  { title: 'Akun Persediaan Barang', dataIndex: 'akun_persediaan_barang', key: 'akun_persediaan_barang', width: 240, render: value => value || '-' },
  { title: 'Tipe Persediaan Barang', dataIndex: 'tipe_persediaan_barang', key: 'tipe_persediaan_barang', width: 185, render: value => formatInventoryType(value) },
  { title: 'Bulan', dataIndex: 'bulan_hasil_produksi', key: 'bulan_hasil_produksi', width: 95, align: 'center', render: value => value || '-' },
  { title: 'Tahun', dataIndex: 'tahun_hasil_produksi', key: 'tahun_hasil_produksi', width: 95, align: 'center', render: value => value || '-' },
  { title: 'Kuantitas SPK', dataIndex: 'kuantitas_spk', key: 'kuantitas_spk', width: 145, align: 'right', render: value => numberFormatter.format(Number(value || 0)) },
  { title: 'No Bahan', dataIndex: 'no_bahan', key: 'no_bahan', width: 180, render: value => value || '-' },
  { title: 'Deskripsi Bahan', dataIndex: 'deskripsi_bahan', key: 'deskripsi_bahan', width: 300, render: value => value || '-' },
  { title: 'Kuantitas Bahan', dataIndex: 'kuantitas_bahan', key: 'kuantitas_bahan', width: 165, align: 'right', render: value => value === null || value === undefined ? '-' : numberFormatter.format(Number(value || 0)) },
  { title: 'Satuan Bahan', dataIndex: 'satuan_bahan', key: 'satuan_bahan', width: 145, render: value => value || '-' },
  { title: 'Biaya Bahan', dataIndex: 'biaya_bahan', key: 'biaya_bahan', width: 160, align: 'right', render: value => value === null || value === undefined ? '-' : moneyFormatter.format(Number(value || 0)) },
  { title: 'HS Code Bahan', dataIndex: 'hs_code_bahan', key: 'hs_code_bahan', width: 165, render: value => value || '-' },
  { title: 'Akun Persediaan Bahan', dataIndex: 'akun_persediaan_bahan', key: 'akun_persediaan_bahan', width: 240, render: value => value || '-' },
  { title: 'Rasio 3', dataIndex: 'rasio_3_bahan', key: 'rasio_3_bahan', width: 130, align: 'right', render: value => Number(value || 0) ? ratioFormatter.format(Number(value)) : '-' },
  { title: 'Qty Bahan Asli', dataIndex: 'qty_bahan_asli', key: 'qty_bahan_asli', width: 155, align: 'right', render: value => value === null || value === undefined ? '-' : numberFormatter.format(Number(value || 0)) },
  { title: 'Qty Bahan KGM', dataIndex: 'qty_bahan_kgm', key: 'qty_bahan_kgm', width: 155, align: 'right', render: value => value === null || value === undefined ? '-' : numberFormatter.format(Number(value || 0)) },
  { title: 'Nilai KGM Rp', dataIndex: 'nilai_kgm_rp', key: 'nilai_kgm_rp', width: 165, align: 'right', render: value => value === null || value === undefined ? '-' : moneyFormatter.format(Number(value || 0)) },
  { title: 'Harga Bahan Asli', dataIndex: 'harga_bahan_asli', key: 'harga_bahan_asli', width: 175, align: 'right', render: value => value === null || value === undefined ? '-' : moneyFormatter.format(Number(value || 0)) },
  { title: 'Harga/kg', dataIndex: 'harga_per_kg', key: 'harga_per_kg', width: 155, align: 'right', render: value => value === null || value === undefined ? '-' : moneyFormatter.format(Number(value || 0)) },
]

const inventoryAccountOrder = [
  'persediaan bahan baku',
  'persediaan bahan pembantu',
  'persediaan gudang',
]

function formatInventoryType(value) {
  const normalized = String(value ?? '').trim()
  const labels = {
    0: 'Barang Jadi',
    1: 'Non-Persediaan',
    2: 'Barang Setengah Jadi',
    3: 'Bahan Baku Pembantu',
    4: 'Bahan Baku',
  }
  return labels[normalized] || normalized || '-'
}

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

function getGpMaterialRows(detail) {
  const rows = [
    ...(detail.material_non_kg || []),
    ...(detail.material_kg || []),
  ].map((material, index) => ({
    ...material,
    row_key: `${material.no_barang || 'material'}-${index}`,
    tgl_stock_akhir: material.tgl_stock_akhir
      || material.tanggal_stock_akhir
      || material.stock_date
      || material.stok_akhir_tanggal
      || detail.tgl_hasil
      || detail.tanggal_gp
      || '',
  }))

  return sortMaterialsByInventoryAccount(rows)
}

function GpMaterialTable({ columns = gpMaterialColumns, detail, emptyText, scrollX = 1240, onlyKgm = false }) {
  const allMaterials = getGpMaterialRows(detail)
  const materials = onlyKgm
    ? allMaterials.filter(material => getMaterialKgmQty(material) !== null)
    : allMaterials

  return (
    <Table
      rowKey={(row) => row.row_key}
      columns={columns}
      dataSource={materials}
      size="small"
      bordered
      pagination={false}
      scroll={{ x: scrollX, y: 'calc(100vh - 360px)' }}
      locale={{ emptyText }}
    />
  )
}

function HasilExportTable({ detail }) {
  const rows = detail ? buildHasilExportRows([detail]) : []

  return (
    <Table
      rowKey="row_key"
      columns={hasilExportColumns}
      dataSource={rows}
      size="small"
      bordered
      pagination={false}
      scroll={{ x: 4950, y: 'calc(100vh - 360px)' }}
      locale={{ emptyText: 'Tidak ada data hasil export' }}
    />
  )
}

function buildHasilExportRows(details) {
  let rowNumber = 0
  return (details || []).flatMap(detail => {
    const materials = getGpMaterialRows(detail)
    const sourceRows = materials.length ? materials : [null]
    const resultDate = detail?.tgl_hasil ? dayjs(detail.tgl_hasil) : null
    return sourceRows.map((material, index) => {
    const qtyBahanKgm = material ? getMaterialKgmQty(material) : null
    const qtyBahanAsli = Number(material?.qty || 0)
    const nilaiBahan = Number(material?.nilai || 0)
    return {
      ...detail,
      no: ++rowNumber,
      row_key: `hasil-export-${detail.no_hasil || 'gp'}-${material?.no_barang || index}`,
      akun_persediaan_barang: detail.akun_persediaan_barang || '',
      tipe_persediaan_barang: detail.tipe_persediaan_barang || '',
      bulan_hasil_produksi: resultDate?.isValid() ? indonesiaMonthNames[resultDate.month()] : '',
      tahun_hasil_produksi: resultDate?.isValid() ? resultDate.format('YYYY') : '',
      kuantitas_spk: detail.qty_perintah_kerja,
      no_bahan: material?.no_barang || '',
      deskripsi_bahan: material?.nama_barang || '',
      kuantitas_bahan: material ? material.qty : null,
      satuan_bahan: material?.unit || '',
      biaya_bahan: material ? material.nilai : null,
      hs_code_bahan: material?.hs_code || '',
      akun_persediaan_bahan: material?.akun_persediaan || '',
      rasio_3_bahan: material?.rasio_3_validasi || 0,
      qty_bahan_asli: material ? material.qty : null,
      qty_bahan_kgm: qtyBahanKgm,
      nilai_kgm_rp: qtyBahanKgm === null ? null : nilaiBahan,
      harga_bahan_asli: qtyBahanAsli ? nilaiBahan / qtyBahanAsli : null,
      harga_per_kg: qtyBahanKgm ? nilaiBahan / qtyBahanKgm : null,
    }
    })
  })
}

function buildMaterialSiinasRows(details, inventoryAccountName, inventoryTypes = []) {
  const normalizedAccountName = String(inventoryAccountName || '').trim().toLowerCase()
  const normalizedInventoryTypes = new Set(
    inventoryTypes.map(value => String(value ?? '').trim().toLowerCase())
  )
  return (details || []).flatMap(detail => (
    getGpMaterialRows(detail)
      .filter(material => (
        (
          String(material.akun_persediaan || '').toLowerCase().includes(normalizedAccountName)
          || normalizedInventoryTypes.has(String(material.tipe_persediaan_barang ?? '').trim().toLowerCase())
        )
        && getMaterialKgmQty(material) !== null
      ))
      .map(material => {
        const quantity = Number(material.qty || 0)
        const materialValue = Number(material.nilai || 0)
        const unitPrice = quantity ? materialValue / quantity : 0
        const quantityId = Number(material.kuantitas_masuk_id || 0)
        const quantityLn = Number(material.kuantitas_masuk_ln || 0)
        const finalStock = Number(material.stok_akhir || 0)
        return {
          no_material: material.no_barang || '',
          deskripsi: material.nama_barang || '',
          hs_code: material.hs_code || '',
          satuan_asli_id: quantityId,
          nilai_rp_id: quantityId * unitPrice,
          satuan_asli_ln: quantityLn,
          nilai_rp_ln: quantityLn * unitPrice,
          kode_negara: material.kode_negara || '',
          kbli: material.kbli || detail.kbli || '',
          produk_jadi: material.produk_jadi || detail.produk_jadi_export || detail.produk_barang_jadi || '',
          kts_stok_akhir: finalStock,
          nilai_stok: finalStock * unitPrice,
        }
      })
  ))
}

function GpMaterialTabs({ detail }) {
  const tabs = [
    { key: 'stok-bahan', label: 'Stok Bahan', columns: stokBahanMaterialColumns, scrollX: 1625 },
    { key: 'bahan', label: 'Bahan', columns: bahanMaterialColumns, scrollX: 2030 },
    { key: 'value', label: 'Value', columns: gpMaterialColumns, scrollX: 1850 },
    { key: 'hasil-export', label: 'Hasil Export' },
  ]

  return (
    <Tabs
      className="siinas-gp-tabs"
      items={tabs.map(tab => ({
        ...tab,
        children: tab.key === 'hasil-export' ? (
          <HasilExportTable detail={detail} />
        ) : (
          <GpMaterialTable
            columns={tab.columns}
            detail={detail}
            emptyText={`Tidak ada data ${tab.label.toLowerCase()}`}
            scrollX={tab.scrollX}
            onlyKgm={tab.key === 'bahan'}
          />
        ),
      }))}
    />
  )
}

function DateDetailTable({ dateRow, kodeKategori, detailColumns, filterDateFrom, filterDateTo }) {
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    const fetchDetails = async () => {
      setLoading(true)
      try {
        const res = await api.get('/api/siinas/monitoring-report/details', {
          signal: controller.signal,
          params: {
            kode_kategori: kodeKategori,
            tanggal_gp: dateRow.tanggal_gp,
            date_from: filterDateFrom,
            date_to: filterDateTo,
          },
        })
        if (!controller.signal.aborted) setDetails(res.data.data || [])
      } catch (error) {
        if (!controller.signal.aborted) {
          message.error(getApiErrorMessage(error, 'Gagal memuat detail hasil produksi'))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetchDetails()
    return () => controller.abort()
  }, [dateRow.tanggal_gp, filterDateFrom, filterDateTo, kodeKategori])

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
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState([])
  const [exporting, setExporting] = useState(false)
  const [materialDetail, setMaterialDetail] = useState(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const monitoringRequestRef = useRef(null)
  const detailColumns = buildDetailColumns(setMaterialDetail)

  const fetchMonitoring = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchValue = '', range = null) => {
    monitoringRequestRef.current?.abort()
    const controller = new AbortController()
    monitoringRequestRef.current = controller
    setLoading(true)
    try {
      const res = await api.get('/api/siinas/monitoring-report', {
        signal: controller.signal,
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: searchValue,
          date_from: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
          date_to: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
        },
      })
      if (controller.signal.aborted || monitoringRequestRef.current !== controller) return
      setRows(res.data.data || [])
      setExpandedCategoryKeys([])
      setPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
    } catch (error) {
      if (!controller.signal.aborted) {
        message.error(getApiErrorMessage(error, 'Gagal memuat SIINAS Monitoring Report'))
      }
    } finally {
      if (monitoringRequestRef.current === controller) {
        monitoringRequestRef.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchMonitoring(1, DEFAULT_PAGE_SIZE, '')
    return () => monitoringRequestRef.current?.abort()
  }, [fetchMonitoring])

  const exportMonitoring = async () => {
    if (!selectedCategoryKeys.length) {
      message.warning('Pilih minimal satu Code Product sebelum export')
      return
    }
    setExporting(true)
    try {
      const res = await api.post('/api/siinas/monitoring-report/export', {
        kode_kategori: selectedCategoryKeys.map(key => key === '__EMPTY__' ? '' : key),
        date_from: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : '',
        date_to: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : '',
      })
      const exportDetails = res.data.data || []
      const exportRows = buildHasilExportRows(exportDetails)
      if (!exportRows.length) {
        message.warning('Tidak ada data untuk diekspor')
        return
      }
      const exportColumns = hasilExportColumns.map(column => ({
          key: column.dataIndex,
          label: column.title,
          type: column.dataIndex === 'no'
            ? 'general'
            : ['biaya_bahan', 'nilai_kgm_rp', 'harga_bahan_asli', 'harga_per_kg'].includes(column.dataIndex)
              ? 'general'
              : [
                  'qty_hasil', 'kuantitas_spk', 'kuantitas_bahan', 'rasio_3_bahan',
                  'qty_bahan_asli', 'qty_bahan_kgm',
                ].includes(column.dataIndex)
                ? 'number'
                : (column.dataIndex === 'tgl_hasil' ? 'date' : 'text'),
        }))
      const rasioUnit3Rows = exportRows
        .filter(row => Number(row.rasio_3_bahan || 0) > 0)
        .map((row, index) => ({ ...row, no: index + 1 }))
      const missingHsCodeRows = exportRows
        .filter(row => {
          const hsCode = String(row.hs_code_bahan ?? '').trim()
          return !hsCode || /^0+(?:\.0+)?$/.test(hsCode)
        })
        .map((row, index) => ({ ...row, no: index + 1 }))
      const bpSiinasRows = buildMaterialSiinasRows(
        exportDetails,
        'bahan pembantu',
        ['2', 'barang setengah jadi'],
      )
      const bbSiinasRows = buildMaterialSiinasRows(exportDetails, 'bahan baku')
      const materialSiinasColumns = [
        { key: 'no_material', label: 'No Material', type: 'text' },
        { key: 'deskripsi', label: 'Deskripsi', type: 'text' },
        { key: 'hs_code', label: 'HS Code', type: 'text' },
        { key: 'satuan_asli_id', label: 'Satuan Asli (ID)', type: 'general' },
        { key: 'nilai_rp_id', label: 'Nilai Rp. (ID)', type: 'general' },
        { key: 'satuan_asli_ln', label: 'Satuan Asli (LN)', type: 'general' },
        { key: 'nilai_rp_ln', label: 'Nilai Rp. (LN)', type: 'general' },
        { key: 'kode_negara', label: 'Kode Negara', type: 'text' },
        { key: 'kbli', label: 'KBLI', type: 'text' },
        { key: 'produk_jadi', label: 'Produk Jadi', type: 'text' },
        { key: 'kts_stok_akhir', label: 'Kts Stok Akhir', type: 'general' },
        { key: 'nilai_stok', label: 'Nilai Stok', type: 'general' },
      ]
      downloadWorkbookXLS([
        {
          name: dayjs().format('DDMMYY'),
          rows: exportRows,
          columns: exportColumns,
        },
        {
          name: 'RasioUnit3',
          rows: rasioUnit3Rows,
          columns: exportColumns,
        },
        {
          name: 'Log HSCodeBahan',
          rows: missingHsCodeRows,
          columns: exportColumns,
        },
        {
          name: 'bp_siinas',
          rows: bpSiinasRows,
          columns: materialSiinasColumns,
        },
        {
          name: 'bb_siinas',
          rows: bbSiinasRows,
          columns: materialSiinasColumns,
        },
      ], 'siinas-monitoring-report')
      message.success(`${exportRows.length} baris berhasil diekspor`)
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal mengekspor Monitoring Report'))
    } finally {
      setExporting(false)
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
          fetchMonitoring(1, pagination.pageSize, value, dateRange)
        }}
      />
      <Button type="primary" loading={exporting} icon={!exporting && <FileExcelOutlined />} onClick={exportMonitoring}>
        Export XLS ({selectedCategoryKeys.length})
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
        pagination={makePagination(pagination, (page, pageSize) => fetchMonitoring(page, pageSize, search, dateRange))}
        rowSelection={{
          selectedRowKeys: selectedCategoryKeys,
          preserveSelectedRowKeys: true,
          onChange: keys => setSelectedCategoryKeys(keys),
        }}
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
                    filterDateFrom={dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : ''}
                    filterDateTo={dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : ''}
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
        title={`GP ${materialDetail?.no_hasil || ''}`}
        width={1120}
      >
        {materialDetail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>{materialDetail.no_barang_hasil || '-'}</Text>
              <Text type="secondary"> - {materialDetail.nama_barang_hasil || '-'}</Text>
            </div>
            <GpMaterialTabs detail={materialDetail} />
          </Space>
        )}
      </Modal>
    </Card>
  )
}
