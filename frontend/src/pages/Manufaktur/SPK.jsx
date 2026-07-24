import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip, Select,
  Statistic, Row, Col, Typography, Button, Badge, Progress, Modal, Checkbox, message
} from 'antd'
import {
  FileExcelOutlined, SearchOutlined, ReloadOutlined, ToolOutlined,
  CheckCircleOutlined, ClockCircleOutlined, PrinterOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const STATUS_MAP = {
  0: { label: 'Belum Mulai', color: 'default' },
  1: { label: 'Diproses',    color: 'processing' },
  2: { label: 'Selesai',     color: 'success' },
  3: { label: 'Ditunda',     color: 'warning' },
  4: { label: 'Dibatalkan',  color: 'error' },
}

const formatQty = (val) =>
  parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const formatOptionalQty = (val) =>
  val === null || val === undefined ? '-' : formatQty(val)
const formatQtyWithUnit = (val, unit) =>
  val === null || val === undefined ? '-' : `${formatQty(val)} ${unit || ''}`.trim()

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const statusColor = status => {
  if (status === 'Sesuai') return 'green'
  if (status === 'Aman') return 'green'
  if (status === 'Kurang') return 'red'
  if (status === 'Tidak Dicek') return 'default'
  if (status === 'Tidak Ada Material') return 'default'
  if (status?.includes('Bertambah') || status?.includes('Tambahan')) return 'blue'
  if (status?.includes('Berkurang') || status?.includes('Belum')) return 'orange'
  if (status?.includes('Tidak Ada')) return 'red'
  return 'volcano'
}

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

const getOrderReference = record => {
  const orderNo = String(record?.no_pesanan || '').trim()
  if (orderNo) return orderNo

  const jobDescription = String(record?.deskripsi || record?.job_desc || '')
  return /\b(?:stok|stock)\b/i.test(jobDescription) ? 'Stok' : 'Internal'
}

const SPK_EXPORT_COLS = [
  { key: 'no_spk', label: 'No Perintah Kerja' },
  { key: 'tanggal', label: 'Tanggal', type: 'date' },
  { key: 'estimasi', label: 'Estimasi Selesai', type: 'date' },
  { key: 'tgl_selesai', label: 'Tgl Selesai Produksi', type: 'date' },
  { key: 'deskripsi', label: 'Deskripsi Pekerjaan' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'total_mat_plan', label: 'Total Bahan Rencana', type: 'number' },
  { key: 'total_mat_keluar', label: 'Total Bahan Keluar', type: 'number' },
  { key: 'material_progress', label: 'Progress Bahan (%)', type: 'number' },
  { key: 'production_status', label: 'Status Barang' },
  { key: 'no_pesanan', label: 'No Pesanan' },
  { key: 'no_po', label: 'No PO' },
]

export default function SPK() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentMonthRange)
  const [status, setStatus]         = useState('')
  const [exporting, setExporting]   = useState(false)
  const [formulaDetails, setFormulaDetails] = useState({})
  const [formulaLoading, setFormulaLoading] = useState({})
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printOptions, setPrintOptions] = useState([])
  const [selectedPrintKeys, setSelectedPrintKeys] = useState([])
  const [printLoading, setPrintLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [summary, setSummary]       = useState({
    total_spk: 0,
    spk_selesai: 0,
    spk_berjalan: 0,
    item_selesai_gp: 0,
    total_item: 0,
  })

  const fetchData = useCallback(async (
    page = 1, pageSize = DEFAULT_PAGE_SIZE, searchVal = '', dates = getCurrentMonthRange(), statusVal = '', showLoading = true
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search    = searchVal
      if (dates[0])  params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1])  params.date_to   = dates[1].format('YYYY-MM-DD')
      if (statusVal) params.status    = statusVal

      const res  = await api.get('/api/spk', { params })
      const rows = res.data.data || []

      setData(rows)
      setSummary({
        total_spk:       res.data.total_spk || 0,
        spk_selesai:     res.data.spk_selesai || 0,
        spk_berjalan:    res.data.spk_berjalan || 0,
        item_selesai_gp: res.data.item_selesai_gp || 0,
        total_item:      res.data.total_item || 0,
      })
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: res.data.total || rows.length,
      }))
    } catch (e) {
      console.error('Gagal fetch SPK:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pagination.current, pagination.pageSize, search, dateRange, status, false)
  }, 30000)

  const fetchFormulaDetail = useCallback(async record => {
    const wodetId = record?.wodet_id
    if (!wodetId) return null
    if (Object.prototype.hasOwnProperty.call(formulaDetails, wodetId)) return formulaDetails[wodetId]

    setFormulaLoading(prev => ({ ...prev, [wodetId]: true }))
    try {
      const res = await api.get('/api/monitoring-formula', {
        params: {
          wodet_id: wodetId,
          offset: 0,
          limit: 1,
          skip_count: 1,
          qty_only: 1,
        },
        timeout: 90000,
      })
      const detail = (res.data.data || [])[0] || null
      setFormulaDetails(prev => ({ ...prev, [wodetId]: detail }))
      return detail
    } catch (e) {
      console.error('Gagal fetch detail formula SPK:', e)
      setFormulaDetails(prev => ({ ...prev, [wodetId]: null }))
      return null
    } finally {
      setFormulaLoading(prev => ({ ...prev, [wodetId]: false }))
    }
  }, [formulaDetails])

  const loadFormulaDetail = useCallback(record => {
    fetchFormulaDetail(record)
  }, [fetchFormulaDetail])

  const handleSearch     = (val) => { setSearch(val); fetchData(1, pagination.pageSize, val, dateRange, status) }
  const handleDateChange = (dates) => { setDateRange(dates || [null, null]); fetchData(1, pagination.pageSize, search, dates || [null, null], status) }
  const handleStatus     = (val) => { setStatus(val); fetchData(1, pagination.pageSize, search, dateRange, val) }
  const handleReset      = () => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setStatus('')
    setDateRange(currentMonth)
    fetchData(1, pagination.pageSize, '', currentMonth, '')
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (search) params.search = search
      if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      if (status) params.status = status
      const res = await api.get('/api/spk/export', { params })
      return (res.data.data || []).map(row => ({
        ...row,
        no_pesanan: getOrderReference(row),
      }))
    },
    columns: filterExportColumnsByPermission('spk', SPK_EXPORT_COLS, user),
    filename: 'DaftarSPK',
    sheetName: 'Daftar SPK',
    setExporting,
  })

  const getPrintKey = record => String(record?.wodet_id ?? `${record?.no_spk || ''}-${record?.no_barang || ''}`)

  const uniqueRecords = rows => {
    const seen = new Set()
    return rows.filter(row => {
      const key = getPrintKey(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const enrichPrintRecord = useCallback(async record => {
    const detail = await fetchFormulaDetail(record)
    return {
      ...record,
      ...(detail || {}),
      no_spk: record.no_spk || detail?.no_spk,
      tanggal: record.tanggal || detail?.tanggal,
      no_barang: record.no_barang || detail?.no_barang,
      nama_barang: record.nama_barang || detail?.nama_barang,
      qty_spk: detail?.qty_spk ?? record.qty,
      uom: record.uom || detail?.uom,
      no_pesanan: record.no_pesanan || detail?.no_pesanan,
      no_po: record.no_po || detail?.no_po,
    }
  }, [fetchFormulaDetail])

  const buildPrintSection = (record, index, total) => {
    const materials = record.materials || []
    const productions = record.production_details || []
    const materialRows = materials.map((item, materialIndex) => {
      return `
        <tr>
          <td class="number-cell">${materialIndex + 1}</td>
          <td>${escapeHtml(item.material_no)}</td>
          <td>${escapeHtml(item.material_name)}</td>
          <td class="right">${item.formula_qty_for_spk_qty === null || item.formula_qty_for_spk_qty === undefined ? '-' : escapeHtml(formatQty(item.formula_qty_for_spk_qty))}</td>
          <td class="right">${escapeHtml(formatQty(item.spk_qty))}</td>
          <td class="actual-cell"></td>
          <td class="actual-cell"></td>
          <td class="actual-cell"></td>
          <td class="actual-cell"></td>
          <td class="note-cell"></td>
        </tr>
      `
    }).join('')
    const productionRows = productions.map(item => `
      <tr>
        <td>${escapeHtml(item.cost_no)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td class="right">${item.formula_qty_for_spk_qty === null || item.formula_qty_for_spk_qty === undefined ? '-' : escapeHtml(formatQty(item.formula_qty_for_spk_qty))}</td>
        <td class="right">${escapeHtml(formatQty(item.spk_qty))}</td>
        <td class="actual-cell"></td>
        <td class="note-cell"></td>
      </tr>
    `).join('')
    const manualProductionRows = Array.from({ length: 3 }, () => `
      <tr class="manual-row">
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `).join('')

    return `
      <section>
        <div class="spk-meta">
          <div class="meta-column">
            <div class="meta-row"><span class="meta-label">SPK No</span><span class="meta-separator">:</span><span class="meta-value">${escapeHtml(record.no_spk || '-')}</span></div>
            <div class="meta-row"><span class="meta-label">Part No</span><span class="meta-separator">:</span><span class="meta-value">${escapeHtml(record.no_barang || '-')}</span></div>
            <div class="meta-row"><span class="meta-label">Nama Barang</span><span class="meta-separator">:</span><span class="meta-value">${escapeHtml(record.nama_barang || '-')}</span></div>
          </div>
          <div class="meta-column meta-column-right">
            <div class="meta-row"><span class="meta-label">Qty</span><span class="meta-separator">:</span><span class="meta-value">${escapeHtml(formatQty(record.qty_spk ?? record.qty))} ${escapeHtml(record.uom || '')}</span></div>
            <div class="meta-row"><span class="meta-label">Tgl SPK</span><span class="meta-separator">:</span><span class="meta-value">${escapeHtml(record.tanggal ? dayjs(record.tanggal).format('DD/MM/YYYY') : '-')}</span></div>
          </div>
        </div>
        <h2>Rincian Material Formula</h2>
        <table>
          <colgroup>
            <col class="number-col"><col><col><col><col><col><col><col><col><col class="note-col">
          </colgroup>
          <thead>
            <tr><th>No</th><th>No Barang</th><th>Nama Material</th><th>Formula</th><th>SPK</th><th>Diserahkan</th><th>Dikembalikan</th><th>Digunakan</th><th>Selisih SPK-Aktual</th><th>Note</th></tr>
          </thead>
          <tbody>${materialRows || '<tr><td colspan="10">Tidak ada data material</td></tr>'}</tbody>
        </table>
        <h2>Rincian Biaya Produksi</h2>
        <table>
          <colgroup>
            <col><col><col><col><col><col><col class="note-col">
          </colgroup>
          <thead>
            <tr><th>No Biaya</th><th>Deskripsi</th><th>Kategori</th><th>Formula (Menit)</th><th>SPK (Menit)</th><th>Aktual (Menit)</th><th>Note</th></tr>
          </thead>
          <tbody>${productionRows}${manualProductionRows}</tbody>
        </table>
        <div class="approval-section">
          <div class="approval-item">
            <div class="approval-title">PIC Produksi</div>
            <div class="approval-signature"></div>
            <div class="approval-name">( ........................................ )</div>
          </div>
          <div class="approval-item">
            <div class="approval-title">Inventory</div>
            <div class="approval-signature"></div>
            <div class="approval-name">( ........................................ )</div>
          </div>
          <div class="approval-item">
            <div class="approval-title">PPC</div>
            <div class="approval-signature"></div>
            <div class="approval-name">( ........................................ )</div>
          </div>
        </div>
      </section>
      ${index < total - 1 ? '<div class="page-break"></div>' : ''}
    `
  }

  const handlePrint = async records => {
    const rawRecords = Array.isArray(records) ? records : [records]
    if (!rawRecords.length) {
      message.warning('Pilih barang yang mau diprint')
      return
    }
    setPrintLoading(true)
    try {
      const printRecords = await Promise.all(rawRecords.map(enrichPrintRecord))
      const firstRecord = printRecords[0]
      const sections = printRecords.map((record, index) => buildPrintSection(record, index, printRecords.length)).join('')
      const printWindow = window.open('', '_blank', 'width=1200,height=800')
      if (!printWindow) {
        message.error('Popup print diblokir browser')
        return
      }
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>SPK ${escapeHtml(firstRecord.no_spk || '')}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
              h1 { font-size: 20px; margin: 0 0 4px; }
              h2 { font-size: 14px; margin: 20px 0 8px; }
              .muted { color: #6b7280; }
              .header { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 14px; }
              .brand { display: flex; align-items: center; gap: 14px; }
              .brand-logo { width: 160px; height: 46px; object-fit: contain; object-position: left center; }
              .document-title { position: absolute; left: 50%; transform: translateX(-50%); width: max-content; text-align: center; }
              .spk-meta { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); column-gap: 48px; margin: 4px 0 18px; }
              .meta-column { display: flex; flex-direction: column; gap: 8px; }
              .meta-row { display: grid; grid-template-columns: 92px 10px minmax(0, 1fr); align-items: start; line-height: 1.35; }
              .meta-column-right .meta-row { grid-template-columns: 58px 10px minmax(0, 1fr); }
              .meta-label, .meta-separator, .meta-value { font-weight: 700; }
              .meta-label { white-space: nowrap; }
              .meta-value { overflow-wrap: anywhere; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
              th, td { border: 1px solid #d1d5db; padding: 6px 7px; vertical-align: top; }
              th { background: #f3f4f6; text-align: left; font-size: 11px; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              .right { text-align: right; white-space: nowrap; }
              .danger { color: #b91c1c; font-weight: 700; }
              .number-col { width: 34px; }
              .number-cell { text-align: center; }
              .actual-cell { min-width: 76px; height: 30px; }
              .manual-row { height: 30px; }
              .note-col { width: 18%; }
              .note-cell { min-width: 130px; }
              .approval-section { display: grid; grid-template-columns: repeat(3, 210px); justify-content: end; column-gap: 40px; margin: 28px 16px 8px 0; break-inside: avoid; page-break-inside: avoid; }
              .approval-item { text-align: center; }
              .approval-title { font-weight: 700; }
              .approval-signature { height: 64px; }
              .approval-name { white-space: nowrap; }
              .print-timestamp { position: fixed; left: 50%; bottom: -9mm; transform: translateX(-50%); font-size: 8px; color: #111827; text-align: center; }
              .page-break { break-after: page; page-break-after: always; }
              @page {
                size: A4 landscape;
                margin: 12mm;
                @bottom-right {
                  content: "Halaman " counter(page);
                  font-family: Arial, sans-serif;
                  font-size: 8px;
                  font-weight: 400;
                  color: #6b7280;
                }
              }
              @media print { body { margin: 0; } .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="brand">
                <img class="brand-logo" src="/logo-gte-horizontal.jpg" alt="Grand Twins Engineering" />
              </div>
              <h1 class="document-title">Pengeluaran Aktual Material</h1>
              <button class="no-print" onclick="window.print()">Print</button>
            </div>
            ${sections}
            <div class="print-timestamp">${escapeHtml(dayjs().format('DD/MM/YYYY HH:mm'))}</div>
            <script>window.onload = () => window.print()</script>
          </body>
        </html>
      `)
      printWindow.document.close()
    } finally {
      setPrintLoading(false)
    }
  }

  const handleOpenPrintOptions = async record => {
    setPrintLoading(true)
    try {
      const params = { offset: 0, limit: 500, search: record.no_spk }
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/api/spk', { params })
      const fetchedRows = (res.data.data || []).filter(row => row.no_spk === record.no_spk)
      const loadedRows = data.filter(row => row.no_spk === record.no_spk)
      const rows = uniqueRecords([record, ...loadedRows, ...fetchedRows])
      const enrichedRows = await Promise.all(rows.map(enrichPrintRecord))
      setPrintOptions(enrichedRows)
      setSelectedPrintKeys(enrichedRows.map(getPrintKey))
      setPrintModalOpen(true)
    } catch (error) {
      console.error('Gagal memuat pilihan print SPK:', error)
      const rows = uniqueRecords([record, ...data.filter(row => row.no_spk === record.no_spk)])
      const enrichedRows = await Promise.all(rows.map(enrichPrintRecord))
      setPrintOptions(enrichedRows)
      setSelectedPrintKeys(enrichedRows.map(getPrintKey))
      setPrintModalOpen(true)
      message.warning('Gagal memuat semua barang SPK, pilihan memakai data yang sedang tampil')
    } finally {
      setPrintLoading(false)
    }
  }

  const handleConfirmPrintOptions = () => {
    const selectedRows = printOptions.filter(row => selectedPrintKeys.includes(getPrintKey(row)))
    if (!selectedRows.length) {
      message.warning('Pilih minimal 1 barang untuk diprint')
      return
    }
    setPrintModalOpen(false)
    handlePrint(selectedRows)
  }

  // Stripe warna per grup no_spk
  const getRowBg = (() => {
    let lastKey = null; let toggle = false
    return (rec) => {
      if (rec.no_spk !== lastKey) { lastKey = rec.no_spk; toggle = !toggle }
      return toggle ? '#fafafa' : '#ffffff'
    }
  })()

  const columns = [
    {
      title: 'No Perintah Kerja',
      dataIndex: 'no_spk',
      key: 'no_spk',
      width: 170,
      fixed: 'left',
      render: val => (
        <Text code style={{ fontSize: 12, color: '#1a73e8', fontWeight: 600 }}>
          {val || '-'}
        </Text>
      ),
    },
    {
      title: 'No Pesanan',
      dataIndex: 'no_pesanan',
      key: 'no_pesanan',
      width: 155,
      render: (val, record) => {
        const reference = getOrderReference(record)
        if (!val) {
          return (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {reference}
            </Text>
          )
        }
        return (
          <Tag color="geekblue" style={{ fontWeight: 600, fontSize: 11 }}>
            {reference}
          </Tag>
        )
      },
    },
    {
      title: 'No PO',
      dataIndex: 'no_po',
      key: 'no_po',
      width: 140,
      render: val => val
        ? <Tag color="purple" style={{ fontSize: 11 }}>{val}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
    {
      title: 'Tanggal',
      dataIndex: 'tanggal',
      key: 'tanggal',
      width: 105,
      render: val => val ? dayjs(val).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Estimasi Selesai',
      dataIndex: 'estimasi',
      key: 'estimasi',
      width: 130,
      render: (val, rec) => {
        if (!val) return '-'
        const tgl  = dayjs(val)
        const done = !!rec.tgl_selesai
        const late = !done && tgl.isBefore(dayjs(), 'day')
        return (
          <span>
            <span style={{ color: late ? '#ff4d4f' : 'inherit' }}>
              {tgl.format('DD/MM/YYYY')}
            </span>
            {late && (
              <Tag color="error" style={{ marginLeft: 4, fontSize: 10 }}>Terlambat</Tag>
            )}
          </span>
        )
      },
    },
    {
      title: 'Tgl Selesai Produksi',
      dataIndex: 'tgl_selesai',
      key: 'tgl_selesai',
      width: 155,
      render: val => {
        if (!val) return (
          <span style={{ color: '#aaa', fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Belum selesai
          </span>
        )
        return (
          <span style={{ color: '#52c41a', fontWeight: 600 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            {dayjs(val).format('DD/MM/YYYY')}
          </span>
        )
      },
    },
    {
      title: 'Deskripsi Pekerjaan',
      dataIndex: 'deskripsi',
      key: 'deskripsi',
      width: 220,
      ellipsis: { showTitle: false },
      render: val => (
        <Tooltip title={
          <pre style={{ maxWidth: 380, fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
            {val || '-'}
          </pre>
        }>
          <span style={{ display: 'block', maxWidth: 210 }}>
            {(val || '-').replace(/\r?\n/g, ' • ')}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 170,
      render: val => val
        ? <Text code style={{ fontSize: 11 }}>{val}</Text>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'nama_barang',
      key: 'nama_barang',
      width: 250,
      ellipsis: { showTitle: false },
      render: (val, rec) => (
        <Tooltip title={val || rec.job_desc}>
          <span>{val || rec.job_desc || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 80,
      align: 'right',
      render: val => <Text strong>{formatQty(val)}</Text>,
    },
    {
      title: 'UoM',
      dataIndex: 'uom',
      key: 'uom',
      width: 65,
      align: 'center',
      render: val => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: 'Progress Bahan',
      dataIndex: 'material_progress',
      key: 'material_progress',
      width: 180,
      render: (val, rec) => {
        const pct = Number(val || 0)
        const color = rec.tgl_selesai ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
        return (
          <Tooltip title={`Bahan keluar ${formatQty(rec.total_mat_keluar)} dari rencana ${formatQty(rec.total_mat_plan)}`}>
            <div style={{ minWidth: 145 }}>
              <Progress
                percent={pct}
                size="small"
                strokeColor={color}
                status={rec.tgl_selesai ? 'success' : pct > 0 ? 'active' : 'normal'}
              />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'Status Barang',
      dataIndex: 'production_status',
      key: 'production_status',
      width: 125,
      align: 'center',
      render: (val, rec) => {
        const status = val || STATUS_MAP[rec.status_barang]?.label || 'Belum Mulai'
        const s = PRODUCTION_STATUS_MAP[status] ?? { badge: 'default', color: '#8c8c8c' }
        return <Badge status={s.badge} text={<Text style={{ color: s.color }}>{status}</Text>} />
      },
    },
  ]

  const formulaMaterialColumns = [
    { title: 'No Barang Formula', dataIndex: 'material_no', width: 170, fixed: 'left', render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Material', dataIndex: 'material_name', width: 280, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 170, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty di SPK', dataIndex: 'spk_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty di SPM', dataIndex: 'spm_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    {
      title: 'Selisih SPM-SPK',
      key: 'spm_spk_qty_diff',
      width: 145,
      align: 'right',
      render: (_, rec) => {
        if (rec.spk_qty === null || rec.spk_qty === undefined || rec.spm_qty === null || rec.spm_qty === undefined) return '-'
        const diff = Number(rec.spm_qty || 0) - Number(rec.spk_qty || 0)
        return (
          <Text type={diff > 0 ? 'danger' : diff < 0 ? 'warning' : 'secondary'} strong={diff > 0}>
            {`${diff > 0 ? '+' : ''}${formatQty(diff)} ${rec.unit || ''}`.trim()}
          </Text>
        )
      },
    },
    { title: 'Stok', dataIndex: 'stock_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    {
      title: 'Kurang',
      dataIndex: 'shortage_qty',
      width: 120,
      align: 'right',
      render: (v, rec) => {
        const shortage = Number(v || 0)
        return <Text type={shortage > 0 ? 'danger' : 'secondary'}>{formatQtyWithUnit(v, rec.unit)}</Text>
      },
    },
    { title: 'Status Stok', dataIndex: 'stock_status', width: 120, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
    { title: 'Formula vs SPK', dataIndex: 'formula_spk_status', width: 150, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
    { title: 'SPK vs SPM', dataIndex: 'spk_spm_status', width: 150, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
  ]
  const formulaProductionColumns = [
    { title: 'No Biaya', dataIndex: 'cost_no', width: 190, fixed: 'left', render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'description', width: 280, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Kategori', dataIndex: 'category', width: 130, render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Jam Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: v => formatOptionalQty(v) },
    { title: 'Jam Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 175, align: 'right', render: v => formatOptionalQty(v) },
    { title: 'Jam SPK', dataIndex: 'spk_qty', width: 110, align: 'right', render: v => formatOptionalQty(v) },
  ]
  const visibleColumns = filterColumnsByPermission('spk', columns, user)

  const printOptionColumns = [
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      width: 170,
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'nama_barang',
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty SPK',
      dataIndex: 'qty_spk',
      width: 110,
      align: 'right',
      render: (value, record) => `${formatQty(value ?? record.qty)} ${record.uom || ''}`.trim(),
    },
    {
      title: 'No Formula',
      dataIndex: 'no_formula',
      width: 160,
      render: value => value ? <Tag color="purple">{value}</Tag> : '-',
    },
  ]

  const renderFormulaDetail = record => {
    const detail = formulaDetails[record.wodet_id]
    const loadingDetail = !!formulaLoading[record.wodet_id]
    return (
      <Space direction="vertical" size={12} className="spk-formula-detail">
        <Space className="spk-formula-detail-header" align="center">
          <Space direction="vertical" size={2}>
            <Text strong>{`Detail ${record.no_spk || '-'}`}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {detail?.no_formula ? `Formula ${detail.no_formula}` : 'Detail formula berdasarkan qty'}
            </Text>
          </Space>
          <Space wrap>
            <Button icon={<PrinterOutlined />} onClick={() => handlePrint(record)} loading={printLoading}>
              Print Barang Ini
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => handleOpenPrintOptions(record)} loading={printLoading}>
              Print Pilihan SPK
            </Button>
          </Space>
        </Space>

        <Text strong>Rincian Material Formula</Text>
        <div className="spk-formula-detail-scroll">
          <div className="spk-formula-material-content">
            <Table
              className="spk-formula-detail-table spk-formula-material-table"
              rowKey={(row, index) => `${row.material_no || 'material'}-${index}`}
              columns={formulaMaterialColumns}
              dataSource={detail?.materials || []}
              loading={loadingDetail}
              pagination={false}
              size="small"
              tableLayout="fixed"
              locale={{ emptyText: loadingDetail ? 'Memuat rincian material...' : 'Tidak ada rincian material formula' }}
            />
          </div>
        </div>

        <Text strong>Rincian Biaya Produksi</Text>
        <Table
          className="spk-formula-detail-table spk-formula-production-table"
          rowKey={(row, index) => `${row.cost_no || 'produksi'}-${index}`}
          columns={formulaProductionColumns}
          dataSource={detail?.production_details || []}
          loading={loadingDetail}
          pagination={false}
          size="small"
          tableLayout="fixed"
          locale={{ emptyText: loadingDetail ? 'Memuat rincian produksi...' : 'Tidak ada rincian biaya produksi' }}
        />
      </Space>
    )
  }

  return (
    <>
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Total SPK"
              value={summary.total_spk}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Sudah Selesai"
              value={summary.spk_selesai}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Masih Berjalan"
              value={summary.spk_berjalan}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Barang Selesai GP"
              value={summary.item_selesai_gp}
              valueStyle={{ color: '#13c2c2' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small">
            <Statistic
              title="Total Item"
              value={summary.total_item}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <span>
            <ToolOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
            Surat Perintah Kerja (SPK)
          </span>
        }
        extra={
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDateChange}
              placeholder={['Tgl Dari', 'Tgl Sampai']}
              style={{ width: 220 }}
            />
            <Select
              value={status}
              options={STATUS_FILTER_OPTIONS}
              onChange={handleStatus}
              style={{ width: 150 }}
            />
            <Search
              placeholder="Cari SPK, pesanan, no barang..."
              allowClear
              value={search}
              style={{ width: 250 }}
              onSearch={handleSearch}
              onChange={e => {
                setSearch(e.target.value)
                if (!e.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              onClick={handleExport}
              loading={exporting}
              disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(rec, idx) => `${rec.no_spk}-${rec.no_barang}-${idx}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1800, y: 'calc(100vh - 340px)' }}
          onRow={rec => ({
            style: { background: getRowBg(rec) },
          })}
          expandable={{
            expandedRowRender: renderFormulaDetail,
            onExpand: (expanded, record) => {
              if (expanded) loadFormulaDetail(record)
            },
            rowExpandable: record => !!record.wodet_id,
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} baris`,
            onChange: (page, pageSize) => fetchData(page, pageSize, search, dateRange, status),
          }}
        />
      </Card>
    </div>
    <Modal
      title="Pilih Barang untuk Print"
      open={printModalOpen}
      onOk={handleConfirmPrintOptions}
      onCancel={() => setPrintModalOpen(false)}
      okText="Print"
      cancelText="Batal"
      width={760}
      confirmLoading={printLoading}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Checkbox
          checked={printOptions.length > 0 && selectedPrintKeys.length === printOptions.length}
          indeterminate={selectedPrintKeys.length > 0 && selectedPrintKeys.length < printOptions.length}
          onChange={event => {
            setSelectedPrintKeys(event.target.checked ? printOptions.map(getPrintKey) : [])
          }}
        >
          Pilih semua barang dalam SPK
        </Checkbox>
        <Table
          rowKey={getPrintKey}
          columns={printOptionColumns}
          dataSource={printOptions}
          pagination={false}
          size="small"
          loading={printLoading}
          rowSelection={{
            selectedRowKeys: selectedPrintKeys,
            onChange: keys => setSelectedPrintKeys(keys),
          }}
          scroll={{ y: 360 }}
        />
      </Space>
    </Modal>
    </>
  )
}

const PRODUCTION_STATUS_MAP = {
  'Belum Mulai': { badge: 'default',    color: '#8c8c8c' },
  'In Progress': { badge: 'processing', color: '#1890ff' },
  'Selesai':     { badge: 'success',    color: '#52c41a' },
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Belum Mulai', label: 'Belum Mulai' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Selesai', label: 'Selesai' },
]
