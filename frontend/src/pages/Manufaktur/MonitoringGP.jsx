import { useCallback, useEffect, useState } from 'react'
import { Button, Card, DatePicker, Input, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { FileExcelOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { downloadWorkbookXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'

const { RangePicker } = DatePicker
const { Text } = Typography
const monthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const formatQty = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })
const formatMoney = value => Number(value || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 4 })
const optionalQty = value => value === null || value === undefined ? '-' : formatQty(value)
const optionalMoney = value => value === null || value === undefined ? '-' : formatMoney(value)
const withUnit = (value, row) => value === null || value === undefined ? '-' : `${formatQty(value)} ${row.unit || ''}`

const materialColumns = [
  { title: 'No Barang Formula', dataIndex: 'material_no', width: 170, render: value => <Text code>{value || '-'}</Text> },
  { title: 'Nama Material', dataIndex: 'material_name', width: 280, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
  { title: 'Qty Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: withUnit },
  { title: 'Qty Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 170, align: 'right', render: withUnit },
  { title: 'Qty di SPK', dataIndex: 'spk_qty', width: 120, align: 'right', render: withUnit },
  { title: 'Qty Sebelumnya', dataIndex: 'previous_spk_qty', width: 150, align: 'right', render: withUnit },
  { title: 'Qty di SPM', dataIndex: 'spm_qty', width: 120, align: 'right', render: withUnit },
  { title: 'Selisih SPM-SPK', width: 145, align: 'right', render: (_, row) => row.spm_qty == null || row.spk_qty == null ? '-' : `${formatQty(Number(row.spm_qty) - Number(row.spk_qty))} ${row.unit || ''}` },
  { title: 'Biaya Formula', dataIndex: 'formula_cost', width: 170, align: 'right', render: (value, row) => value == null ? '-' : <Space size={4}>{formatMoney(value)}{row.formula_cost_estimated && <Tag color="gold">Estimasi</Tag>}</Space> },
  { title: 'Biaya Formula x Qty SPK', dataIndex: 'formula_cost_for_spk_qty', width: 185, align: 'right', render: optionalMoney },
  { title: 'Biaya SPK', dataIndex: 'spk_cost', width: 130, align: 'right', render: optionalMoney },
  { title: 'Deskripsi Biaya', dataIndex: 'cost_description', width: 190, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
  { title: 'Selisih Biaya', dataIndex: 'material_cost_diff', width: 130, align: 'right', render: optionalMoney },
  { title: 'Stok', dataIndex: 'stock_qty', width: 120, align: 'right', render: withUnit },
  { title: 'Kurang', dataIndex: 'shortage_qty', width: 120, align: 'right', render: withUnit },
  { title: 'Status Stok', dataIndex: 'stock_status', width: 120, render: value => <Tag color={value === 'Aman' ? 'green' : value === 'Kurang' ? 'red' : 'default'}>{value || '-'}</Tag> },
  { title: 'Formula vs SPK', dataIndex: 'formula_spk_status', width: 150, render: value => <Tag color={value === 'Sesuai' ? 'green' : 'orange'}>{value || '-'}</Tag> },
  { title: 'SPK vs SPM', dataIndex: 'spk_spm_status', width: 150, render: value => <Tag color={value === 'Sesuai' ? 'green' : 'orange'}>{value || '-'}</Tag> },
]

const productionColumns = [
  { title: 'No Biaya', dataIndex: 'cost_no', width: 190, render: value => <Text code>{value || '-'}</Text> },
  { title: 'Deskripsi', dataIndex: 'description', width: 280, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
  { title: 'Kategori', dataIndex: 'category', width: 130, render: value => value ? <Tag color="geekblue">{value}</Tag> : '-' },
  { title: 'Jam Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: optionalQty },
  { title: 'Jam Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 175, align: 'right', render: optionalQty },
  { title: 'Jam SPK', dataIndex: 'spk_qty', width: 110, align: 'right', render: optionalQty },
  { title: 'Biaya/Jam Formula', dataIndex: 'formula_unit_cost', width: 155, align: 'right', render: optionalMoney },
  { title: 'Biaya/Jam SPK', dataIndex: 'spk_unit_cost', width: 145, align: 'right', render: optionalMoney },
  { title: 'Biaya Formula', dataIndex: 'formula_cost', width: 145, align: 'right', render: optionalMoney },
  { title: 'Biaya Formula x Qty SPK', dataIndex: 'formula_cost_for_spk_qty', width: 185, align: 'right', render: optionalMoney },
  { title: 'Biaya SPK', dataIndex: 'spk_cost', width: 130, align: 'right', render: optionalMoney },
  { title: 'Selisih Biaya', dataIndex: 'production_cost_diff', width: 130, align: 'right', render: optionalMoney },
]

const wipColumns = [
  { title: 'No Perintah Kerja', dataIndex: 'no_perintah_kerja', width: 150 },
  { title: 'Pengeluaran Bahan', dataIndex: 'pengeluaran_bahan', width: 155 },
  { title: 'Produksi Hasil', dataIndex: 'produksi_hasil', width: 145 },
  { title: 'Tanggal', dataIndex: 'tanggal', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'Tipe', dataIndex: 'tipe', width: 145, render: value => <Tag color={value === 'Hasil Produksi' ? 'green' : 'blue'}>{value || '-'}</Tag> },
  { title: 'Desk Pekerjaan', dataIndex: 'desk_pekerjaan', width: 240, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
  { title: 'Total WIP', dataIndex: 'total_wip', width: 140, align: 'right', render: optionalMoney },
  { title: 'Total WIP Inv', dataIndex: 'total_wip_inv', width: 145, align: 'right', render: optionalMoney },
  { title: 'Selisih', dataIndex: 'selisih', width: 135, align: 'right', render: optionalMoney },
  { title: 'Sumber', dataIndex: 'source', width: 210 },
]

const exportColumns = [
  { key: 'no_gp', label: 'No GP' },
  { key: 'tgl_gp', label: 'Tanggal GP', type: 'date' },
  { key: 'no_spk', label: 'No SPK' },
  { key: 'tgl_spk', label: 'Tanggal SPK', type: 'date' },
  { key: 'no_job', label: 'No JOB' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'nama_barang', label: 'Deskripsi Barang' },
  { key: 'qty_gp', label: 'Qty GP', type: 'number' },
  { key: 'qty_spk', label: 'Qty SPK', type: 'number' },
  { key: 'uom', label: 'UOM' },
  { key: 'biaya_gp', label: 'Biaya GP', type: 'accounting' },
  { key: 'deskripsi_gp', label: 'Deskripsi GP' },
  { key: 'formula_material_count', label: 'Material Formula', type: 'number' },
  { key: 'spk_material_count', label: 'Material SPK', type: 'number' },
  { key: 'spm_material_count', label: 'Material SPM', type: 'number' },
  { key: 'formula_material_cost', label: 'Biaya Material Formula', type: 'accounting' },
  { key: 'formula_production_cost', label: 'Biaya Produksi Formula', type: 'accounting' },
  { key: 'formula_total_cost', label: 'Total Formula', type: 'accounting' },
  { key: 'spk_material_cost', label: 'Biaya Material SPK', type: 'accounting' },
  { key: 'spk_production_cost', label: 'Biaya Produksi SPK', type: 'accounting' },
  { key: 'spk_total_cost', label: 'Total SPK', type: 'accounting' },
  { key: 'total_cost_diff', label: 'Selisih Biaya', type: 'accounting' },
]

const gpReferenceColumns = exportColumns.slice(0, 12)
const materialExportColumns = [
  ...gpReferenceColumns,
  { key: 'no_spm', label: 'No SPM' },
  { key: 'tgl_spm', label: 'Tanggal SPM' },
  { key: 'material_no', label: 'No Material' },
  { key: 'material_name', label: 'Nama Material' },
  { key: 'material_source', label: 'Sumber Material' },
  { key: 'comparison_status', label: 'Status Perbandingan' },
  { key: 'formula_qty_for_spk_qty', label: 'Qty Formula x Qty SPK', type: 'number' },
  { key: 'spk_qty_material', label: 'Qty Material SPK', type: 'number' },
  { key: 'spm_qty', label: 'Qty Material SPM', type: 'number' },
  { key: 'unit', label: 'UOM Material' },
  { key: 'formula_cost_for_spk_qty', label: 'Biaya Material Formula x Qty SPK', type: 'accounting' },
  { key: 'spk_cost', label: 'Biaya Material SPK', type: 'accounting' },
  { key: 'spm_cost', label: 'Biaya Material SPM', type: 'accounting' },
  { key: 'material_cost_diff', label: 'Selisih Biaya Material', type: 'accounting' },
  { key: 'cost_description', label: 'Deskripsi Biaya' },
]
const productionExportColumns = [
  ...gpReferenceColumns,
  { key: 'cost_no', label: 'No Biaya' },
  { key: 'description', label: 'Deskripsi Biaya' },
  { key: 'category', label: 'Kategori' },
  { key: 'cost_source', label: 'Sumber Biaya' },
  { key: 'comparison_status', label: 'Status Perbandingan' },
  { key: 'formula_qty_for_spk_qty', label: 'Jam Formula x Qty SPK', type: 'number' },
  { key: 'spk_qty_production', label: 'Jam SPK', type: 'number' },
  { key: 'formula_unit_cost', label: 'Biaya/Jam Formula', type: 'accounting' },
  { key: 'spk_unit_cost', label: 'Biaya/Jam SPK', type: 'accounting' },
  { key: 'formula_cost_for_spk_qty', label: 'Jumlah Biaya Formula', type: 'accounting' },
  { key: 'spk_cost', label: 'Jumlah Biaya SPK', type: 'accounting' },
  { key: 'production_cost_diff', label: 'Selisih Biaya Produksi', type: 'accounting' },
]
const wipExportColumns = [
  ...gpReferenceColumns,
  { key: 'no_perintah_kerja', label: 'No Perintah Kerja' },
  { key: 'pengeluaran_bahan', label: 'Pengeluaran Bahan' },
  { key: 'produksi_hasil', label: 'Produksi Hasil' },
  { key: 'tanggal_wip', label: 'Tanggal WIP', type: 'date' },
  { key: 'tipe', label: 'Tipe' },
  { key: 'desk_pekerjaan', label: 'Desk Pekerjaan' },
  { key: 'total_wip', label: 'Total WIP', type: 'accounting' },
  { key: 'total_wip_inv', label: 'Total WIP Inv', type: 'accounting' },
  { key: 'selisih', label: 'Selisih WIP', type: 'accounting' },
  { key: 'source', label: 'Sumber' },
]

async function addFormulaSummaries(gpRows) {
  const ids = [...new Set(gpRows.map(row => row.wodet_id).filter(Boolean))]
  if (!ids.length) return gpRows
  const response = await api.get('/api/monitoring-formula', {
    params: { wodet_ids: ids.join(','), offset: 0, limit: ids.length, skip_count: 1 },
    timeout: 90000,
  })
  const byId = new Map((response.data.data || []).map(row => [Number(row.wodet_id), row]))
  return gpRows.map(row => {
    const formula = byId.get(Number(row.wodet_id))
    if (!formula) return row
    const summary = Object.fromEntries(exportColumns
      .filter(column => column.key in formula)
      .map(column => [column.key, formula[column.key]]))
    return { ...row, ...summary }
  })
}

export default function MonitoringGP() {
  const [dates, setDates] = useState(monthRange)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ dates: monthRange(), search: '' })
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [details, setDetails] = useState({})
  const [detailLoading, setDetailLoading] = useState({})

  const paramsFor = useCallback((page, pageSize, activeFilters) => {
    const params = { offset: (page - 1) * pageSize, limit: pageSize }
    if (activeFilters.search) params.search = activeFilters.search
    if (activeFilters.dates?.[0]) params.date_from = activeFilters.dates[0].format('YYYY-MM-DD')
    if (activeFilters.dates?.[1]) params.date_to = activeFilters.dates[1].format('YYYY-MM-DD')
    return params
  }, [])

  const fetchRows = useCallback(async (page, pageSize, activeFilters) => {
    setLoading(true)
    try {
      const response = await api.get('/api/monitoring-gp', { params: paramsFor(page, pageSize, activeFilters), timeout: 90000 })
      const enriched = await addFormulaSummaries(response.data.data || [])
      setRows(enriched)
      setPagination({ current: page, pageSize, total: response.data.total || 0 })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat Monitoring GP'))
    } finally {
      setLoading(false)
    }
  }, [paramsFor])

  useEffect(() => { fetchRows(1, 20, filters) }, [fetchRows, filters])

  const loadDetail = async record => {
    const id = record.wodet_id
    if (!id || details[id] || detailLoading[id]) return
    setDetailLoading(previous => ({ ...previous, [id]: true }))
    try {
      const response = await api.get('/api/monitoring-formula', {
        params: { wodet_id: id, offset: 0, limit: 1, include_wip: 1 },
        timeout: 90000,
      })
      setDetails(previous => ({ ...previous, [id]: response.data.data?.[0] || {} }))
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat rincian SPK untuk GP'))
    } finally {
      setDetailLoading(previous => ({ ...previous, [id]: false }))
    }
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const allRows = []
      const materialRows = []
      const productionRows = []
      const wipRows = []
      const formulaById = new Map()
      const pageSize = 200
      let offset = 0
      let total = 0
      do {
        const response = await api.get('/api/monitoring-gp', {
          params: { ...paramsFor(1, pageSize, filters), offset }, timeout: 90000,
        })
        const page = response.data.data || []
        total = response.data.total || 0
        const missingIds = [...new Set(page.map(row => Number(row.wodet_id)).filter(id => id && !formulaById.has(id)))]
        for (let start = 0; start < missingIds.length; start += 50) {
          const chunk = missingIds.slice(start, start + 50)
          const detailResponse = await api.get('/api/monitoring-formula', {
            params: { wodet_ids: chunk.join(','), offset: 0, limit: chunk.length, skip_count: 1, include_wip: 1 },
            timeout: 90000,
          })
          for (const formula of detailResponse.data.data || []) {
            formulaById.set(Number(formula.wodet_id), formula)
          }
        }
        for (const gp of page) {
          const formula = formulaById.get(Number(gp.wodet_id))
          const summary = formula ? Object.fromEntries(exportColumns
            .filter(column => column.key in formula)
            .map(column => [column.key, formula[column.key]])) : {}
          const gpRow = { ...gp, ...summary }
          allRows.push(gpRow)
          if (!formula) continue
          const parent = Object.fromEntries(gpReferenceColumns.map(column => [column.key, gpRow[column.key]]))
          for (const material of formula.materials || []) {
            materialRows.push({ ...material, ...parent, spk_qty_material: material.spk_qty })
          }
          for (const production of formula.production_details || []) {
            productionRows.push({ ...production, ...parent, spk_qty_production: production.spk_qty })
          }
          for (const wip of formula.wip_reconciliation?.rows || []) {
            wipRows.push({ ...wip, ...parent, tanggal_wip: wip.tanggal })
          }
        }
        offset += page.length
        if (!page.length) break
      } while (offset < total)
      if (!allRows.length) return message.info('Tidak ada data GP untuk diekspor')
      downloadWorkbookXLS([
        { name: 'Monitoring GP', columns: exportColumns, rows: allRows },
        { name: 'Material per GP', columns: materialExportColumns, rows: materialRows },
        { name: 'Biaya Produksi per GP', columns: productionExportColumns, rows: productionRows },
        { name: 'WIP SPK Terkait', columns: wipExportColumns, rows: wipRows },
      ], 'Monitoring_GP')
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal mengekspor Monitoring GP'))
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { title: 'No GP', dataIndex: 'no_gp', width: 160, fixed: 'left' },
    { title: 'Tanggal GP', dataIndex: 'tgl_gp', width: 120, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No SPK', dataIndex: 'no_spk', width: 160 },
    { title: 'Tanggal SPK', dataIndex: 'tgl_spk', width: 120, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No JOB', dataIndex: 'no_job', width: 160, render: value => value ? <Text code>{value}</Text> : '-' },
    { title: 'No Barang', dataIndex: 'no_barang', width: 180 },
    { title: 'Deskripsi Barang', dataIndex: 'nama_barang', width: 280, ellipsis: true },
    { title: 'Qty GP', dataIndex: 'qty_gp', width: 120, align: 'right', render: formatQty },
    { title: 'Qty SPK', dataIndex: 'qty_spk', width: 120, align: 'right', render: formatQty },
    { title: 'UOM', dataIndex: 'uom', width: 90 },
    { title: 'Biaya GP', dataIndex: 'biaya_gp', width: 160, align: 'right', render: formatMoney },
    { title: 'Deskripsi GP', dataIndex: 'deskripsi_gp', width: 230, ellipsis: true },
    { title: 'Material Formula', dataIndex: 'formula_material_count', width: 125, align: 'right', render: value => value == null ? '-' : <Tag color="cyan">{value}</Tag> },
    { title: 'Material SPK', dataIndex: 'spk_material_count', width: 115, align: 'right', render: value => value == null ? '-' : <Tag color="geekblue">{value}</Tag> },
    { title: 'Material SPM', dataIndex: 'spm_material_count', width: 115, align: 'right', render: value => value == null ? '-' : <Tag color="blue">{value}</Tag> },
    { title: 'Biaya Material Formula', dataIndex: 'formula_material_cost', width: 175, align: 'right', render: optionalMoney },
    { title: 'Biaya Produksi Formula', dataIndex: 'formula_production_cost', width: 175, align: 'right', render: optionalMoney },
    { title: 'Total Formula', dataIndex: 'formula_total_cost', width: 155, align: 'right', render: optionalMoney },
    { title: 'Biaya Material SPK', dataIndex: 'spk_material_cost', width: 165, align: 'right', render: optionalMoney },
    { title: 'Biaya Produksi SPK', dataIndex: 'spk_production_cost', width: 165, align: 'right', render: optionalMoney },
    { title: 'Total SPK', dataIndex: 'spk_total_cost', width: 150, align: 'right', render: optionalMoney },
    { title: 'Selisih Biaya', dataIndex: 'total_cost_diff', width: 150, align: 'right', render: value => value == null ? '-' : <Text type={value > 0 ? 'danger' : value < 0 ? 'success' : 'secondary'}>{formatMoney(value)}</Text> },
  ]

  const expandedRowRender = record => {
    const detail = details[record.wodet_id]
    if (!record.wodet_id) return <Text type="secondary">GP ini tidak terhubung ke detail SPK.</Text>
    if (!detail) return <Text type="secondary">Memuat rincian SPK...</Text>
    const totals = detail.wip_reconciliation?.totals || {}
    return <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Text strong>Detail GP {record.no_gp} — {record.no_barang} ({formatQty(record.qty_gp)} {record.uom})</Text>
      <Text type="secondary">SPK {record.no_spk || '-'} · {record.tgl_spk ? dayjs(record.tgl_spk).format('DD/MM/YYYY') : '-'} · Formula {detail.no_formula || '-'}</Text>
      <table className="monitoring-gp-cost-summary"><tbody>
        <tr><th>Material Formula</th><td>{formatMoney(detail.formula_material_cost)}</td><th>Material SPK</th><td>{formatMoney(detail.spk_material_cost)}</td><th>Selisih Material</th><td><Text type={Number(detail.material_cost_diff || 0) > 0 ? 'danger' : 'secondary'}>{formatMoney(detail.material_cost_diff)}</Text></td></tr>
        <tr><th>Produksi Formula</th><td>{formatMoney(detail.formula_production_cost)}</td><th>Produksi SPK</th><td>{formatMoney(detail.spk_production_cost)}</td><th>Selisih Produksi</th><td><Text type={Number(detail.production_cost_diff || 0) > 0 ? 'danger' : 'secondary'}>{formatMoney(detail.production_cost_diff)}</Text></td></tr>
        <tr><th /><td /><th /><td /><th>Selisih Total</th><td><Text strong type={Number(detail.total_cost_diff || 0) > 0 ? 'danger' : Number(detail.total_cost_diff || 0) < 0 ? 'success' : 'secondary'}>{formatMoney(detail.total_cost_diff)}</Text></td></tr>
      </tbody></table>
      <div className="monitoring-gp-detail-scroll"><div className="monitoring-gp-detail-content">
        <Text strong>Rincian Material Formula</Text>
        <Table className="monitoring-gp-detail-table" rowKey="material_no" size="small" pagination={false} tableLayout="fixed" style={{ width: 2790 }} columns={materialColumns} dataSource={detail.materials || []} />
        <Text strong>Rincian Biaya Produksi</Text>
        <Table className="monitoring-gp-detail-table" rowKey="cost_no" size="small" pagination={false} tableLayout="fixed" style={{ width: 1895 }} columns={productionColumns} dataSource={detail.production_details || []} locale={{ emptyText: 'Tidak ada rincian biaya produksi' }} />
        <Text strong>Rekonsiliasi WIP</Text>
        <Table className="monitoring-gp-detail-table" rowKey={(item, index) => `${item.tipe}-${item.pengeluaran_bahan || item.produksi_hasil || 'akhir'}-${index}`} size="small" pagination={false} tableLayout="fixed" style={{ width: 1580 }} columns={wipColumns} dataSource={detail.wip_reconciliation?.rows || []} summary={() => <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={6}><Text strong>Total</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="right"><Text strong>{formatMoney(totals.total_wip)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={7} align="right"><Text strong>{formatMoney(totals.total_wip_inv)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={8} align="right"><Text strong>{formatMoney(totals.selisih)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={9} />
        </Table.Summary.Row>} />
      </div></div>
    </Space>
  }

  return <Card title="Monitoring GP" extra={<Space wrap>
    <RangePicker value={dates} format="DD/MM/YYYY" onChange={setDates} />
    <Input.Search placeholder="Cari GP, SPK, barang..." allowClear value={search} onChange={event => setSearch(event.target.value)} onSearch={value => setFilters({ dates, search: value })} style={{ width: 250 }} />
    <Button onClick={() => setFilters({ dates, search })}>Cari</Button>
    <Button icon={<ReloadOutlined />} onClick={() => { const current = monthRange(); setDates(current); setSearch(''); setFilters({ dates: current, search: '' }) }}>Reset</Button>
    <Button icon={<FileExcelOutlined />} loading={exporting} onClick={exportAll}>Export XLS</Button>
  </Space>}>
    <Text type="secondary">Filter tanggal berdasarkan tanggal hasil produksi (GP). Buka baris untuk melihat rincian SPK terkait.</Text>
    <Table style={{ marginTop: 12 }} rowKey="gp_detail_id" loading={loading} columns={withTableSorters(columns)} dataSource={rows} size="small" scroll={{ x: 3400 }} expandable={{ expandedRowRender, onExpand: (expanded, record) => { if (expanded) loadDetail(record) } }} pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: (page, size) => fetchRows(page, size, filters) }} />
    <style>{`
      .monitoring-gp-cost-summary { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #f0f0f0; border-radius: 6px; background: #fff; }
      .monitoring-gp-cost-summary th, .monitoring-gp-cost-summary td { padding: 8px 12px; border-right: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0; text-align: left; white-space: nowrap; }
      .monitoring-gp-cost-summary th { width: 14%; color: #64748b; font-weight: 500; background: #fafafa; }
      .monitoring-gp-cost-summary td { width: 19%; }
      .monitoring-gp-cost-summary tr:last-child th, .monitoring-gp-cost-summary tr:last-child td { border-bottom: 0; }
      .monitoring-gp-cost-summary th:last-child, .monitoring-gp-cost-summary td:last-child { border-right: 0; }
      .monitoring-gp-detail-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
      .monitoring-gp-detail-content { width: max-content; min-width: 100%; }
      .monitoring-gp-detail-table { margin-top: 8px; margin-bottom: 12px; }
      .monitoring-gp-detail-table .ant-table-container, .monitoring-gp-detail-table .ant-table-content { overflow: visible !important; }
    `}</style>
  </Card>
}
