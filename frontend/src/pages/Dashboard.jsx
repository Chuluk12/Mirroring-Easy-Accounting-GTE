import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, DatePicker, Divider, Modal, Popover, Progress, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

const emptySummary = {
  period: { date_from: '', date_to: '' },
  stock: {
    total: 0, kosong: 0, ada: 0,
    total_items: 0, category_count: 0, categories: [],
    standardized_items: 0, below_minimum_items: 0,
  },
  purchasing: { po_period: 0, po_month: 0 },
  sales: {
    so_period: 0,
    so_month: 0,
    do_period: 0,
    do_month: 0,
    do_vs_so_pct: 0,
    sales_amount_period: 0,
    sales_amount_previous: 0,
    sales_amount_change_pct: 0,
    sales_amount_direction: 'up',
    top_products: [],
    top_products_by_amount: [],
    top_products_by_qty: [],
    top_customers: [],
    top_customers_by_amount: [],
    top_customers_by_count: [],
    outstanding_receivables: [],
    invoice_period: 0,
    invoice_month: 0,
    invoice_amount_period: 0,
    invoice_amount_month: 0,
  },
  production: {
    spk_total_month: 0,
    spk_finished_month: 0,
    spk_active_month: 0,
    spk_progress_percent: 0,
    spm_total_month: 0,
    spm_done_month: 0,
    spm_partial_month: 0,
    spm_open_month: 0,
    spm_progress_percent: 0,
    gp_total_month: 0,
    gp_done_month: 0,
    gp_partial_month: 0,
    gp_open_month: 0,
    gp_progress_percent: 0,
  },
  accounting: {
    hpp_total: 0,
    nilai_jual: 0,
    laba_rugi: 0,
    margin_pct: 0,
    profit_products: 0,
    loss_products: 0,
    asset_purchase_amount: 0,
    asset_purchase_count: 0,
  },
}

const red = '#d41452'
const purple = '#7c3cff'
const cyan = '#11b7d8'
const green = '#00a92f'
const orange = '#ff7a00'
const softBorder = '1px solid rgba(226,231,240,0.88)'

function defaultDateRange() {
  return [dayjs().startOf('month'), dayjs()]
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatCompactCurrency(value) {
  const abs = Math.abs(Number(value || 0))
  if (abs >= 1000000000) return `${(Number(value) / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`
  if (abs >= 1000000) return `${(Number(value) / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`
  if (abs >= 1000) return `${(Number(value) / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 })}rb`
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID')
}

function SummaryCard({ title, value, suffix, icon, color, loading, children }) {
  return (
    <Card
      style={{
        borderRadius: 8,
        border: softBorder,
        height: '100%',
        width: '100%',
        background: `
          radial-gradient(circle at 92% 18%, ${color}2b 0%, transparent 30%),
          linear-gradient(135deg, ${color}1f 0%, #ffffff 48%, ${color}10 100%)
        `,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 18,
          top: 18,
          width: 52,
          height: 52,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${color}24, transparent)`,
          clipPath: 'polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%)',
        }}
      />
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        prefix={icon}
        valueStyle={{ color }}
        loading={loading}
      />
      {children}
    </Card>
  )
}

function ModuleSection({ title, subtitle, color, icon, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          border: softBorder,
          background: `
            radial-gradient(circle at 96% 10%, ${color}22 0%, transparent 28%),
            linear-gradient(135deg, ${color}12 0%, rgba(255,255,255,0.82) 58%, ${color}08 100%)
          `,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            color,
            background: `${color}14`,
          }}
        >
          {icon}
        </div>
        <div>
          <Text strong style={{ display: 'block', color: '#20243a', fontSize: 15 }}>{title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>
        </div>
      </div>
      {children}
    </section>
  )
}

function TrendBadge({ percent, direction, label = 'periode lalu' }) {
  const up = direction !== 'down'
  const value = Math.abs(Number(percent || 0)).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginTop: 8,
        padding: '3px 8px',
        borderRadius: 8,
        color: up ? green : red,
        background: up ? 'rgba(0,169,47,0.09)' : 'rgba(212,20,82,0.09)',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {value}% vs {label}
    </div>
  )
}

function SoftBarChart({ title, icon, rows, getName, getMeta, getValue, getValueLabel, color, loading, onSelect }) {
  const valueFor = getValue || (row => row.amount)
  const labelFor = getValueLabel || (row => formatCompactCurrency(valueFor(row)))
  const max = Math.max(...(rows || []).map(row => Number(valueFor(row) || 0)), 1)
  const chartRows = (rows || []).slice(0, 3)
  const gradientId = `rankGradient${title.replace(/\s/g, '')}`
  return (
    <Card
      title={<span>{icon} {title}</span>}
      loading={loading}
      style={{ borderRadius: 8, border: softBorder, height: '100%' }}
    >
      <div style={{ minHeight: 230, display: 'grid', gridTemplateColumns: '82px 1fr', gap: 18 }}>
        <div style={{ borderRadius: 8, background: `linear-gradient(180deg, ${color}12, ${color}05)`, overflow: 'hidden' }}>
          <svg viewBox="0 0 82 230" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity="0.95" />
                <stop offset="100%" stopColor={color} stopOpacity="0.32" />
              </linearGradient>
            </defs>
            <path d="M8 48 C24 18, 42 72, 58 36 S76 48, 78 24" fill="none" stroke={color} strokeOpacity="0.34" strokeWidth="3" strokeLinecap="round" />
            {[0, 1, 2].map(index => {
              const row = chartRows[index] || {}
              const value = Number(valueFor(row) || 0)
              const h = Math.max((value / max) * 148, value ? 18 : 0)
              const x = 14 + index * 19
              const y = 190 - h
              return (
                <g key={index}>
                  <rect x={x} y={42} width={12} height={148} rx={6} fill="rgba(226,231,240,0.78)" />
                  <rect
                    x={x}
                    y={y}
                    width={12}
                    height={h}
                    rx={6}
                    fill={`url(#${gradientId})`}
                    style={{ cursor: row && onSelect ? 'pointer' : 'default' }}
                    onClick={() => row && onSelect?.(row, index)}
                  />
                  <circle
                    cx={x + 6}
                    cy={Math.max(y, 42)}
                    r={6}
                    fill="#fff"
                    stroke={color}
                    strokeWidth="2"
                    style={{ cursor: row && onSelect ? 'pointer' : 'default' }}
                    onClick={() => row && onSelect?.(row, index)}
                  />
                  <text x={x + 6} y="214" textAnchor="middle" fontSize="10" fill="#697087">{index + 1}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {chartRows.map((row, index) => {
            const pct = Math.max((Number(valueFor(row) || 0) / max) * 100, 5)
            return (
              <div
                key={`${getName(row)}-${index}`}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => onSelect?.(row, index)}
                onKeyDown={event => {
                  if (!onSelect) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(row, index)
                  }
                }}
                style={{
                  padding: '10px 11px',
                  borderRadius: 8,
                  cursor: onSelect ? 'pointer' : 'default',
                  background: `
                    radial-gradient(circle at 96% 18%, ${color}18 0%, transparent 28%),
                    linear-gradient(135deg, ${color}0e 0%, #ffffff 72%)
                  `,
                  boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.55)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
                onMouseEnter={event => {
                  if (!onSelect) return
                  event.currentTarget.style.transform = 'translateY(-1px)'
                  event.currentTarget.style.boxShadow = `inset 0 0 0 1px ${color}33, 0 10px 20px ${color}14`
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.transform = 'translateY(0)'
                  event.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(226,231,240,0.55)'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', color, background: '#fff', fontWeight: 800 }}>
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>{getName(row) || '-'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{getMeta(row)}</Text>
                  </div>
                  <Text strong style={{ color, whiteSpace: 'nowrap' }}>{labelFor(row)}</Text>
                </div>
                <div style={{ height: 9, marginTop: 9, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${color}, ${color}88, ${color}cc)`,
                      boxShadow: `0 0 14px ${color}33`,
                    }}
                  />
                </div>
              </div>
            )
          })}
          {chartRows.length === 0 && <Text type="secondary">Belum ada data pada periode ini.</Text>}
        </Space>
      </div>
    </Card>
  )
}

function DetailMetric({ label, value, color }) {
  return (
    <div
      style={{
        minWidth: 132,
        flex: '1 1 132px',
        padding: '10px 12px',
        borderRadius: 8,
        background: `${color}0f`,
        boxShadow: `inset 0 0 0 1px ${color}22`,
      }}
    >
      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{label}</Text>
      <Text strong style={{ display: 'block', color, marginTop: 2 }}>{value}</Text>
    </div>
  )
}

function SalesRankingDetailModal({ detail, onClose }) {
  const row = detail?.row || {}
  const records = detail?.records || []
  const columns = [
    {
      title: 'No SO',
      dataIndex: 'no_so',
      width: 142,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#1a73e8' }}>{value || '-'}</Text>,
    },
    {
      title: 'Tgl SO',
      dataIndex: 'tgl_so',
      width: 105,
      render: value => value ? <Tag color="green">{dayjs(value).format('DD/MM/YYYY')}</Tag> : '-',
    },
    {
      title: 'Customer',
      dataIndex: 'nama_pelanggan',
      width: 190,
      ellipsis: true,
      render: (value, record) => (
        <Tooltip title={`${record.no_pelanggan || '-'} - ${value || '-'}`}>
          <span>{value || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      width: 130,
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi',
      dataIndex: 'deskripsi_barang',
      width: 230,
      ellipsis: true,
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      width: 90,
      align: 'right',
      render: value => formatNumber(value),
    },
    {
      title: 'DPP',
      dataIndex: 'subtotal',
      width: 130,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'No PO',
      dataIndex: 'no_po_customer',
      width: 135,
      render: value => value || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 105,
      render: value => (
        <Tag color={value === 'Diterima' ? 'success' : value === 'Diproses' ? 'processing' : value === 'Ditutup' ? 'default' : 'warning'}>
          {value || '-'}
        </Tag>
      ),
    },
  ]

  return (
    <Modal
      open={Boolean(detail)}
      onCancel={onClose}
      footer={null}
      title={detail?.title || 'Daftar SO Terkait'}
      width={980}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div
          style={{
            padding: 14,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${detail?.color || cyan}12 0%, #ffffff 68%)`,
            boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.78)',
          }}
        >
          <Text type="secondary" style={{ display: 'block' }}>Peringkat #{detail?.rank || '-'}</Text>
          <Text strong style={{ display: 'block', fontSize: 17, marginTop: 2 }}>
            {detail?.name || '-'}
          </Text>
          <Text type="secondary">{detail?.meta || '-'}</Text>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {'amount' in row && (
            <DetailMetric label="Nilai Penjualan" value={formatCurrency(row.amount)} color={orange} />
          )}
          {'qty' in row && (
            <DetailMetric label="Qty" value={`${formatNumber(row.qty)} qty`} color={green} />
          )}
          <DetailMetric
            label="Jumlah SO"
            value={detail?.loading ? 'Memuat...' : `${formatNumber(row.so_count ?? detail?.totalSo ?? 0)} SO`}
            color={cyan}
          />
          {row.itemno && (
            <DetailMetric label="Kode Barang" value={row.itemno} color={purple} />
          )}
          {row.customerno && (
            <DetailMetric label="Kode Customer" value={row.customerno} color={purple} />
          )}
        </div>

        {detail?.error && (
          <Text type="danger">{detail.error}</Text>
        )}

        <Table
          size="small"
          rowKey={(record, index) => `${record.no_so}-${record.no_barang}-${index}`}
          columns={columns}
          dataSource={records}
          loading={detail?.loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1250, y: 360 }}
        />
      </Space>
    </Modal>
  )
}

function ReceivableList({ rows, loading }) {
  const statusColor = status => {
    if (status === 'overdue') return red
    if (status === 'today') return orange
    return green
  }

  return (
    <Card
      title={<span><FileTextOutlined style={{ color: red }} /> Piutang Belum Lunas</span>}
      loading={loading}
      style={{ borderRadius: 8, border: softBorder }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {(rows || []).slice(0, 5).map((row, index) => (
          <div
            key={`${row.no_pesanan}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.9fr 0.9fr 0.8fr 0.9fr',
              gap: 10,
              alignItems: 'center',
              padding: '9px 10px',
              borderRadius: 8,
              background: index % 2 === 0 ? 'rgba(212,20,82,0.045)' : 'rgba(17,183,216,0.045)',
            }}
          >
            <Text strong ellipsis>{row.customer || '-'}</Text>
            <Text type="secondary" ellipsis>{row.no_pesanan || '-'}</Text>
            <Text strong style={{ color: red }}>{formatCompactCurrency(row.amount)}</Text>
            <Text type="secondary">{row.due_date ? dayjs(row.due_date).format('DD/MM/YYYY') : '-'}</Text>
            <Text strong style={{ color: statusColor(row.status), fontSize: 12 }}>{row.status_label || '-'}</Text>
          </div>
        ))}
        {(!rows || rows.length === 0) && <Text type="secondary">Tidak ada piutang belum lunas.</Text>}
      </Space>
    </Card>
  )
}

function SalesModule({ sales, loading, dateRange }) {
  const [detail, setDetail] = useState(null)
  const openDetail = async (config, row, index) => {
    const baseDetail = {
      ...config,
      row,
      rank: index + 1,
      name: config.getName(row),
      meta: config.getMeta(row),
      loading: true,
      records: [],
      totalSo: 0,
      error: '',
    }
    setDetail(baseDetail)

    try {
      const [dateFrom, dateTo] = dateRange
      const res = await api.get('/api/dashboard-sales-transactions', {
        params: {
          type: config.type,
          code: config.getCode(row),
          date_from: dateFrom.format('YYYY-MM-DD'),
          date_to: dateTo.format('YYYY-MM-DD'),
        },
      })
      setDetail({
        ...baseDetail,
        loading: false,
        records: res.data.data || [],
        totalSo: res.data.total_so || 0,
      })
    } catch (error) {
      setDetail({
        ...baseDetail,
        loading: false,
        error: error.response?.data?.error || error.response?.data?.message || 'Gagal memuat detail transaksi.',
      })
    }
  }

  const amountDetail = {
    title: 'Detail Transaksi Produk Terbesar',
    color: orange,
    type: 'product',
    getCode: row => row.itemno,
    getName: row => row.description || row.itemno,
    getMeta: row => `${row.itemno || '-'} - ${formatNumber(row.qty)} qty`,
  }
  const qtyDetail = {
    title: 'Detail Transaksi Produk Terbanyak',
    color: green,
    type: 'product',
    getCode: row => row.itemno,
    getName: row => row.description || row.itemno,
    getMeta: row => `${row.itemno || '-'} - ${formatNumber(row.so_count)} SO, ${formatNumber(row.qty)} qty`,
  }
  const customerDetail = {
    title: 'Detail Transaksi Customer Terbanyak',
    color: cyan,
    type: 'customer',
    getCode: row => row.customerno,
    getName: row => row.name || row.customerno,
    getMeta: row => `${row.customerno || '-'} - ${formatCompactCurrency(row.amount)}`,
  }

  return (
    <>
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} sm={12} xl={8} style={{ display: 'flex' }}>
        <SummaryCard
          title="Resume Total SO"
          value={sales.so_period}
          icon={<ShoppingOutlined />}
          color={cyan}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={12} xl={8} style={{ display: 'flex' }}>
        <Card
          loading={loading}
          style={{
            borderRadius: 8,
            border: softBorder,
            height: '100%',
            width: '100%',
            background: `
              radial-gradient(circle at 92% 18%, ${purple}2b 0%, transparent 30%),
              linear-gradient(135deg, ${purple}16 0%, #ffffff 48%, ${cyan}0f 100%)
            `,
          }}
        >
          <Text type="secondary">Resume Total DO</Text>
          <div style={{ marginTop: 4, color: purple, fontSize: 24, fontWeight: 800 }}>
            <FileTextOutlined /> {sales.do_period || 0}
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {sales.do_period || 0} DO dari {sales.so_period || 0} SO ({sales.do_vs_so_pct || 0}%)
          </Text>
        </Card>
      </Col>
      <Col xs={24} xl={8} style={{ display: 'flex' }}>
        <Card
          loading={loading}
          style={{
            borderRadius: 8,
            border: softBorder,
            height: '100%',
            width: '100%',
            background: `
              radial-gradient(circle at 92% 18%, ${orange}2b 0%, transparent 30%),
              linear-gradient(135deg, ${red}12 0%, #ffffff 48%, ${orange}12 100%)
            `,
          }}
        >
          <Text type="secondary">Total DPP Penjualan</Text>
          <div style={{ marginTop: 4, color: orange, fontSize: 24, fontWeight: 800 }}>
            {formatCurrency(sales.sales_amount_period)}
          </div>
          <TrendBadge
            percent={sales.sales_amount_change_pct}
            direction={sales.sales_amount_direction}
          />
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <SoftBarChart
          title="Penjualan Produk Terbesar"
          icon={<TrophyOutlined style={{ color: orange }} />}
          rows={sales.top_products_by_amount || sales.top_products}
          getName={row => row.description || row.itemno}
          getMeta={row => `${row.itemno || '-'} - ${formatNumber(row.qty)} qty`}
          getValue={row => row.amount}
          getValueLabel={row => formatCompactCurrency(row.amount)}
          color={orange}
          loading={loading}
          onSelect={(row, index) => openDetail(amountDetail, row, index)}
        />
      </Col>
      <Col xs={24} xl={8}>
        <SoftBarChart
          title="Penjualan Produk Terbanyak"
          icon={<ShoppingOutlined style={{ color: green }} />}
          rows={sales.top_products_by_qty}
          getName={row => row.description || row.itemno}
          getMeta={row => `${row.itemno || '-'} - total ${formatNumber(row.qty)} qty`}
          getValue={row => row.so_count}
          getValueLabel={row => `${formatNumber(row.so_count)} SO`}
          color={green}
          loading={loading}
          onSelect={(row, index) => openDetail(qtyDetail, row, index)}
        />
      </Col>
      <Col xs={24} xl={8}>
        <SoftBarChart
          title="Customer Pembelian Terbanyak"
          icon={<UserOutlined style={{ color: cyan }} />}
          rows={sales.top_customers_by_count || sales.top_customers}
          getName={row => row.name || row.customerno}
          getMeta={row => `${row.customerno || '-'} - ${formatCompactCurrency(row.amount)}`}
          getValue={row => row.so_count}
          getValueLabel={row => `${formatNumber(row.so_count)} SO`}
          color={cyan}
          loading={loading}
          onSelect={(row, index) => openDetail(customerDetail, row, index)}
        />
      </Col>
      <Col xs={24}>
        <ReceivableList rows={sales.outstanding_receivables} loading={loading} />
      </Col>
    </Row>
    <SalesRankingDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>
  )
}

function InventoryModule({ stock, loading }) {
  const categoryItems = stock.categories || []
  const visibleCategoryItems = categoryItems.slice(0, 2)
  const hiddenCategoryCount = Math.max(categoryItems.length - visibleCategoryItems.length, 0)
  const categoryPopover = (
    <div style={{ width: 250, maxHeight: 260, overflowY: 'auto' }}>
      <Space size={6} direction="vertical" style={{ width: '100%' }}>
        {categoryItems.map(item => (
          <Tag key={item.category} color="purple" style={{ marginInlineEnd: 0, width: '100%' }}>
            {item.category}: {formatNumber(item.count)}
          </Tag>
        ))}
      </Space>
    </div>
  )

  return (
    <Row gutter={[12, 12]} align="stretch">
      <Col xs={24} sm={12} xl={5} style={{ display: 'flex' }}>
        <SummaryCard
          title="Total Barang"
          value={stock.total_items}
          icon={<ShoppingOutlined />}
          color={cyan}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={24} xl={9} style={{ display: 'flex' }}>
        <SummaryCard
          title="Kategori Barang"
          value={stock.category_count}
          icon={<AppstoreOutlined />}
          color={purple}
          loading={loading}
        >
          <Space size={[5, 5]} wrap style={{ marginTop: 10, maxWidth: 'calc(100% - 42px)' }}>
            {visibleCategoryItems.map(item => (
              <Tooltip key={item.category} title={`${item.category}: ${formatNumber(item.count)} barang`}>
                <Tag color="purple">{item.category}: {formatNumber(item.count)}</Tag>
              </Tooltip>
            ))}
            {hiddenCategoryCount > 0 && (
              <Popover content={categoryPopover} title="Semua Kategori" trigger="click" placement="bottom">
                <Button
                  size="small"
                  type="text"
                  style={{
                    height: 22,
                    paddingInline: 8,
                    borderRadius: 999,
                    color: 'rgba(124,60,255,0.78)',
                    background: 'rgba(124,60,255,0.055)',
                    border: '1px solid rgba(124,60,255,0.10)',
                    fontWeight: 500,
                  }}
                >
                  Lihat semua
                </Button>
              </Popover>
            )}
            {!categoryItems.length && <Text type="secondary">Belum ada kategori</Text>}
          </Space>
        </SummaryCard>
      </Col>
      <Col xs={24} sm={12} xl={5} style={{ display: 'flex' }}>
        <SummaryCard
          title="Sudah STB"
          value={stock.standardized_items}
          icon={<SafetyCertificateOutlined />}
          color={green}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={12} xl={5} style={{ display: 'flex' }}>
        <SummaryCard
          title="Lewat Minimum"
          value={stock.below_minimum_items}
          icon={<WarningOutlined />}
          color={orange}
          loading={loading}
        />
      </Col>
    </Row>
  )
}

function MiniBar({ label, value, max, color }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 8 : 0) : 0
  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
        <Text type="secondary">{label}</Text>
        <Text strong>{value}</Text>
      </Space>
      <div style={{ height: 9, background: '#f1f3f5', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 8,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  )
}

function DonutChart({ percent, color, label, value }) {
  const safePercent = Math.max(0, Math.min(percent || 0, 100))
  return (
    <div
      style={{
        width: 132,
        height: 132,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${safePercent * 3.6}deg, #eef1f4 0deg)`,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: '50%',
          background: '#fff',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          boxShadow: 'inset 0 0 0 1px #f0f0f0',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{safePercent}%</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
        </div>
      </div>
    </div>
  )
}

function StockChart({ stock, loading }) {
  const total = stock.total || 0
  const emptyPercent = total ? Math.round((stock.kosong / total) * 100) : 0

  return (
    <Card title="Kondisi Stok Saat Ini" loading={loading} style={{ borderRadius: 8, border: softBorder }}>
      <Space size={20} align="center" style={{ width: '100%' }}>
        <DonutChart
          percent={emptyPercent}
          color={red}
          label="Kosong"
          value={`${stock.kosong} item`}
        />
        <Space direction="vertical" size={12} style={{ flex: 1 }}>
          <MiniBar label="Stok Tersedia" value={stock.ada} max={total || 1} color={green} />
          <MiniBar label="Stok Kosong" value={stock.kosong} max={total || 1} color={red} />
          <Divider style={{ margin: '4px 0' }} />
          <Text type="secondary">Total master barang: {total}</Text>
        </Space>
      </Space>
    </Card>
  )
}

function ProductionProgress({ title, total, done, partial, open, percent, loading }) {
  return (
    <Card loading={loading} style={{ borderRadius: 8, border: softBorder, height: '100%', width: '100%' }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{title}</Text>
          <Text type="secondary">{total} item</Text>
        </Space>
        <Space size={18} align="center" style={{ width: '100%' }}>
          <DonutChart percent={percent} color={green} label="Selesai" value={`${done}/${total}`} />
          <Space direction="vertical" size={12} style={{ flex: 1 }}>
            <MiniBar label="Selesai" value={done} max={total || 1} color={green} />
            <MiniBar label="Sebagian" value={partial} max={total || 1} color={orange} />
            <MiniBar label="Belum" value={open} max={total || 1} color={red} />
          </Space>
        </Space>
      </Space>
    </Card>
  )
}

function ProfitLossMiniChart({ rows }) {
  const totalProfit = rows.reduce((sum, row) => sum + Math.max(Number(row.laba_rugi || 0), 0), 0)
  const totalLoss = rows.reduce((sum, row) => sum + Math.abs(Math.min(Number(row.laba_rugi || 0), 0)), 0)
  const net = totalProfit - totalLoss
  const statusColor = net >= 0 ? green : red

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <div>
        <Text strong>Profit vs Loss</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>Arah visual laba/rugi dari filter grafik ini.</Text>
      </div>
      <div
        style={{
          borderRadius: 8,
          border: 'none',
          background: '#ffffff',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 300 132" style={{ width: '100%', height: 118, display: 'block' }}>
          <defs>
            <linearGradient id="profitArrow3d" x1="0" x2="1" y1="1" y2="0">
              <stop offset="0%" stopColor="#75c827" />
              <stop offset="55%" stopColor="#4fb11f" />
              <stop offset="100%" stopColor="#a9df3f" />
            </linearGradient>
            <linearGradient id="lossArrow3d" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff4a4a" />
              <stop offset="58%" stopColor="#d41452" />
              <stop offset="100%" stopColor="#a91636" />
            </linearGradient>
            <filter id="profitLossSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="7" dy="9" stdDeviation="5" floodColor="#1f2937" floodOpacity="0.18" />
            </filter>
          </defs>
          <rect x="0" y="0" width="300" height="132" fill="#ffffff" />
          <path d="M 72 36 L 116 64 L 139 54 L 164 86 L 203 112" fill="none" stroke="#8e1730" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" filter="url(#profitLossSoftShadow)" />
          <path d="M 68 32 L 112 60 L 135 50 L 160 82 L 198 107" fill="none" stroke="url(#lossArrow3d)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="197,92 229,119 184,113" fill="url(#lossArrow3d)" filter="url(#profitLossSoftShadow)" />
          <polygon points="193,90 223,115 183,109" fill="#ff3b30" opacity="0.9" />
          <path d="M 55 101 L 88 74 L 112 86 L 144 50 L 168 70 L 221 25" fill="none" stroke="#326d24" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#profitLossSoftShadow)" />
          <path d="M 51 96 L 84 70 L 108 82 L 140 47 L 164 67 L 216 22" fill="none" stroke="url(#profitArrow3d)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="201,20 236,8 223,43" fill="#326d24" filter="url(#profitLossSoftShadow)" />
          <polygon points="198,18 230,8 219,40" fill="url(#profitArrow3d)" />
          <path d="M 55 92 L 83 70 L 107 81 L 139 47 L 162 66 L 212 23" fill="none" stroke="#d9ff84" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.62" />
        </svg>
        <div style={{ padding: '0 6px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: green, fontWeight: 700, fontSize: 11 }}>Profit {formatCompactCurrency(totalProfit)}</Text>
            <Text style={{ color: red, fontWeight: 700, fontSize: 11 }}>Loss {formatCompactCurrency(totalLoss)}</Text>
          </div>
          <div
            style={{
              marginTop: 7,
              borderRadius: 6,
              padding: '6px 8px',
              background: `${statusColor}12`,
              border: 'none',
            }}
          >
            <Text strong style={{ color: statusColor, fontSize: 12 }}>
              {net >= 0 ? 'Net Profit' : 'Net Loss'} {formatCurrency(Math.abs(net))}
            </Text>
          </div>
        </div>
      </div>
    </Space>
  )
}

function HppTrendChart({ rows, loading, dateRange, onDateChange, onResetDate }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const width = 900
  const height = 380
  const pad = { top: 34, right: 82, bottom: 54, left: 18 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom
  const safeRows = rows.length ? rows : [{
    date: '-',
    nilai_jual: 0,
    hpp_total: 0,
    laba_rugi: 0,
    cumulative_laba_rugi: 0,
    asset_purchase_amount: 0,
    building_maintenance_amount: 0,
    salary_expense_amount: 0,
    etoll_expense_amount: 0,
    transport_expense_amount: 0,
    utility_expense_amount: 0,
  }]
  const series = [
    { key: 'nilai_jual', label: 'Pendapatan', color: '#38bdf8', width: 1.8 },
    { key: 'hpp_total', label: 'HPP', color: '#f59e0b', width: 1.7 },
    { key: 'asset_purchase_amount', label: 'Aset', color: '#a78bfa', width: 1.6 },
    { key: 'building_maintenance_amount', label: 'Bangunan', color: '#fb7185', width: 1.6 },
    { key: 'salary_expense_amount', label: 'Gaji', color: '#f472b6', width: 1.6 },
    { key: 'etoll_expense_amount', label: 'E-TOLL', color: '#22d3ee', width: 1.6 },
    { key: 'transport_expense_amount', label: 'BBM/Parkir/Tol', color: '#fb923c', width: 1.6 },
    { key: 'utility_expense_amount', label: 'Listrik/Internet', color: '#60a5fa', width: 1.6 },
  ]
  const candleRows = safeRows.map((row, index) => {
    const close = Number(row.cumulative_laba_rugi || 0)
    const open = index === 0 ? 0 : Number(safeRows[index - 1].cumulative_laba_rugi || 0)
    const daily = Number(row.laba_rugi || 0)
    const spread = Math.max(Math.abs(daily) * 0.22, Math.max(Math.abs(open), Math.abs(close)) * 0.015, 1)
    return {
      ...row,
      open,
      close,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
    }
  })
  const maRows = candleRows.map((row, index) => {
    const start = Math.max(0, index - 4)
    const windowRows = candleRows.slice(start, index + 1)
    return windowRows.reduce((sum, item) => sum + item.close, 0) / windowRows.length
  })
  const allValues = [
    ...candleRows.flatMap(row => [row.open, row.close, row.high, row.low]),
    ...maRows,
    ...series.flatMap(item => safeRows.map(row => Number(row[item.key] || 0))),
  ]
  const minY = Math.min(0, ...allValues)
  const maxY = Math.max(1, ...allValues)
  const yRange = maxY - minY || 1
  const xFor = index => pad.left + (safeRows.length === 1 ? chartW / 2 : (index / (safeRows.length - 1)) * chartW)
  const yFor = value => pad.top + ((maxY - value) / yRange) * chartH
  const zeroY = yFor(0)
  const candleSlot = chartW / Math.max(safeRows.length, 1)
  const candleW = Math.min(12, Math.max(4, candleSlot * 0.42))
  const buildPath = key => {
    const points = safeRows.map((row, index) => ({ x: xFor(index), y: yFor(Number(row[key] || 0)) }))
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    return points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`
      const prev = points[index - 1]
      const midX = (prev.x + point.x) / 2
      return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`
    }, '')
  }
  const maPath = maRows.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(value)}`).join(' ')
  const hoverRow = hoverIndex !== null ? safeRows[hoverIndex] : null
  const hoverCandle = hoverIndex !== null ? candleRows[hoverIndex] : null
  const labelEvery = safeRows.length <= 31 ? 1 : Math.max(1, Math.ceil(safeRows.length / 8))
  const formatDateLabel = value => value && value !== '-'
    ? (safeRows.length <= 31 ? dayjs(value).format('D') : dayjs(value).format('DD MMM'))
    : '-'
  const tooltipX = hoverIndex !== null ? xFor(hoverIndex) : 0
  const tooltipLeft = Math.min(Math.max(tooltipX - 130, pad.left + 8), width - pad.right - 260)
  const tooltipTop = 46

  return (
    <Card
      title="Grafik HPP Laba & Beban"
      extra={
        <Space wrap>
          <RangePicker
            value={dateRange}
            format="DD/MM/YYYY"
            allowClear={false}
            onChange={value => onDateChange(value || defaultDateRange())}
            style={{ width: 225 }}
          />
          <Button onClick={onResetDate}>Bulan Ini</Button>
        </Space>
      }
      loading={loading}
      style={{ borderRadius: 8, border: softBorder, height: '100%' }}
    >
      <Row gutter={[18, 18]} align="middle">
        <Col xs={24} xl={17}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: 390, display: 'block', borderRadius: 8 }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="cryptoChartBg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="48%" stopColor="#fbfdff" />
                <stop offset="100%" stopColor="#f6fbff" />
              </linearGradient>
              <radialGradient id="easyLogoGlowA" cx="6%" cy="0%" r="68%">
                <stop offset="0%" stopColor="#d41452" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#d41452" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="easyLogoGlowB" cx="92%" cy="4%" r="72%">
                <stop offset="0%" stopColor="#11b7d8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#11b7d8" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="easyLogoGlowC" cx="62%" cy="100%" r="70%">
                <stop offset="0%" stopColor="#7c3cff" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#7c3cff" stopOpacity="0" />
              </radialGradient>
              <filter id="hppTooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#171c33" floodOpacity="0.16" />
              </filter>
            </defs>
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#cryptoChartBg)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowA)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowB)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowC)" />
            {[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(tick => {
              const y = pad.top + tick * chartH
              const value = maxY - tick * yRange
              return (
                <g key={tick}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(100,116,139,0.13)" />
                  <text x={width - pad.right + 8} y={y + 4} fontSize="10" fill="#697087">
                    {formatCompactCurrency(value)}
                  </text>
                </g>
              )
            })}
            {safeRows.map((row, index) => {
              const x = xFor(index)
              if (index % Math.max(1, Math.ceil(safeRows.length / 18)) !== 0) return null
              return <line key={`vgrid-${row.date}-${index}`} x1={x} x2={x} y1={pad.top} y2={pad.top + chartH} stroke="rgba(100,116,139,0.09)" />
            })}
            <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} stroke="rgba(100,116,139,0.32)" strokeDasharray="4 6" />
            {candleRows.map((row, index) => {
              const x = xFor(index)
              const up = row.close >= row.open
              const color = up ? '#2dd4bf' : '#fb7185'
              const bodyTop = yFor(Math.max(row.open, row.close))
              const bodyBottom = yFor(Math.min(row.open, row.close))
              const bodyH = Math.max(2, bodyBottom - bodyTop)
              return (
                <g key={`candle-${row.date}-${index}`} opacity={0.92}>
                  <line x1={x} x2={x} y1={yFor(row.high)} y2={yFor(row.low)} stroke={color} strokeWidth={1.2} />
                  <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} rx={2} fill={color} />
                </g>
              )
            })}
            <path d={maPath} fill="none" stroke="#eab308" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            {series.map(item => (
              <path
                key={item.key}
                d={buildPath(item.key)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.62}
              />
            ))}
            {safeRows.map((row, index) => (
              <g key={`hover-${row.date}-${index}`}>
                <rect
                  x={xFor(index) - Math.max(8, candleSlot / 2)}
                  y={pad.top}
                  width={Math.max(16, candleSlot)}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(index)}
                />
              </g>
            ))}
            {safeRows.map((row, index) => {
              const shouldLabel = index === 0 || index === safeRows.length - 1 || index % labelEvery === 0
              if (!shouldLabel) return null
              return (
                <text key={`label-${row.date}-${index}`} x={xFor(index)} y={height - 18} textAnchor="middle" fontSize="10" fill="#697087">
                  {formatDateLabel(row.date)}
                </text>
              )
            })}
            {safeRows.length <= 31 && (
              <text x={width - pad.right} y={height - 4} textAnchor="end" fontSize="10" fill="#697087">
                Tanggal per hari
              </text>
            )}
            <text x={pad.left + 8} y={22} fontSize="11" fill="#697087">
              Candle: akumulasi laba/rugi | Garis warna: pendapatan, HPP, aset, dan beban
            </text>
            {hoverRow && (
              <g>
                <line x1={tooltipX} x2={tooltipX} y1={pad.top} y2={pad.top + chartH} stroke="rgba(100,116,139,0.34)" strokeDasharray="4 4" />
                <rect
                  x={tooltipLeft}
                  y={tooltipTop}
                  width={260}
                  height={222}
                  rx={8}
                  fill="rgba(255,255,255,0.96)"
                  stroke="rgba(226,232,240,0.95)"
                  filter="url(#hppTooltipShadow)"
                />
                <text x={tooltipLeft + 12} y={tooltipTop + 20} fontSize="12" fontWeight="700" fill="#20243a">
                  {hoverRow.date && hoverRow.date !== '-' ? dayjs(hoverRow.date).format('DD MMMM YYYY') : '-'}
                </text>
                <text x={tooltipLeft + 12} y={tooltipTop + 40} fontSize="11" fill={hoverCandle?.close >= hoverCandle?.open ? '#2dd4bf' : '#fb7185'}>
                  Laba/Rugi: {formatCurrency(hoverRow.laba_rugi)} | Akumulasi: {formatCurrency(hoverRow.cumulative_laba_rugi)}
                </text>
                {series.map((item, index) => (
                  <g key={`tooltip-${item.key}`}>
                    <circle cx={tooltipLeft + 14} cy={tooltipTop + 62 + index * 18} r={3.5} fill={item.color} />
                    <text x={tooltipLeft + 24} y={tooltipTop + 66 + index * 18} fontSize="10.5" fill="#697087">
                      {item.label}: {formatCurrency(hoverRow[item.key])}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </Col>
        <Col xs={24} xl={7}>
          <ProfitLossMiniChart rows={rows} />
        </Col>
      </Row>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text type="secondary">
          Cara baca: candle hijau/merah menunjukkan perubahan akumulasi laba/rugi. Garis warna menampilkan pendapatan, HPP, aset, dan setiap akun beban secara terpisah.
        </Text>
        <Space wrap size={18}>
          <Text><span style={{ color: '#2dd4bf', fontWeight: 700 }}>Candle</span> Akumulasi Laba/Rugi</Text>
          <Text><span style={{ color: '#eab308', fontWeight: 700 }}>MA</span> Rata-rata 5 hari</Text>
          {series.map(item => (
            <Text key={item.key}>
              <span style={{ color: item.color, fontWeight: 700 }}>{item.label}</span>
            </Text>
          ))}
        </Space>
      </Space>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(emptySummary)
  const [hppTrend, setHppTrend] = useState([])
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [hppTrendRange, setHppTrendRange] = useState(defaultDateRange)
  const [loading, setLoading] = useState(true)
  const [hppTrendLoading, setHppTrendLoading] = useState(true)
  const inventoryDashboardOnly = user?.role === 'inventory'
  const marketingDashboardOnly = user?.role === 'marketing'
  const limitedDashboard = inventoryDashboardOnly || marketingDashboardOnly
  const showAccountingDashboard = false

  useEffect(() => {
    fetchSummary()
  }, [dateRange])

  useEffect(() => {
    if (limitedDashboard || !showAccountingDashboard) {
      setHppTrend([])
      setHppTrendLoading(false)
      return
    }
    fetchHppTrend()
  }, [hppTrendRange, limitedDashboard, showAccountingDashboard])

  const fetchSummary = async () => {
    try {
      setLoading(true)
      const [dateFrom, dateTo] = dateRange
      const params = {
        date_from: dateFrom.format('YYYY-MM-DD'),
        date_to: dateTo.format('YYYY-MM-DD'),
      }
      const res = await api.get('/api/dashboard-summary', {
        params,
      })
      setSummary({ ...emptySummary, ...res.data })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchHppTrend = async () => {
    try {
      setHppTrendLoading(true)
      const [dateFrom, dateTo] = hppTrendRange
      const params = {
        date_from: dateFrom.format('YYYY-MM-DD'),
        date_to: dateTo.format('YYYY-MM-DD'),
      }
      const trendRes = await api.get('/api/hpp/trend', { params })
      setHppTrend(trendRes.data.data || [])
    } catch (trendError) {
      setHppTrend([])
      console.error(trendError)
    } finally {
      setHppTrendLoading(false)
    }
  }

  const invoiceAmount = useMemo(
    () => formatCurrency(summary.sales.invoice_amount_period),
    [summary.sales.invoice_amount_period],
  )

  const periodLabel = useMemo(() => {
    const [dateFrom, dateTo] = dateRange
    return `${dateFrom.format('DD MMM YYYY')} - ${dateTo.format('DD MMM YYYY')}`
  }, [dateRange])

  const productionScore = Math.round((
    (summary.production.spk_progress_percent || 0)
    + (summary.production.spm_progress_percent || 0)
    + (summary.production.gp_progress_percent || 0)
  ) / 3)
  const profitAfterAsset = (summary.accounting.laba_rugi || 0) - (summary.accounting.asset_purchase_amount || 0)
  const assetReinvestmentPct = summary.accounting.laba_rugi > 0
    ? ((summary.accounting.asset_purchase_amount || 0) / summary.accounting.laba_rugi) * 100
    : 0
  const showInventoryDashboard = !marketingDashboardOnly
  const showSalesDashboard = !inventoryDashboardOnly

  return (
    <div className="easy-dashboard-page" style={{ maxWidth: 1440 }}>
      <div
        style={{
          marginBottom: 20,
          padding: '22px 24px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(212,20,82,0.12) 0%, rgba(224,24,168,0.09) 32%, rgba(17,183,216,0.11) 72%, rgba(0,169,47,0.10) 100%)',
          border: softBorder,
          boxShadow: '0 18px 42px rgba(23,28,51,0.08)',
        }}
      >
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col>
            <Title level={2} style={{ marginBottom: 4 }}>Dashboard</Title>
            <Text type="secondary">Ringkasan transaksi dan produksi periode {periodLabel}</Text>
          </Col>
          <Col>
            <Space wrap>
              <RangePicker
                value={dateRange}
                format="DD/MM/YYYY"
                allowClear={false}
                onChange={value => setDateRange(value || defaultDateRange())}
              />
              <Button onClick={() => setDateRange(defaultDateRange())}>
                Bulan Ini
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {showInventoryDashboard && (
        <ModuleSection
          title="Modul Persediaan"
          subtitle="Ringkasan barang, kategori, STB, dan minimum stok."
          color={cyan}
          icon={<InboxOutlined />}
        >
          <InventoryModule stock={summary.stock} loading={loading} />
        </ModuleSection>
      )}

      {marketingDashboardOnly && (
        <ModuleSection
          title="Modul Penjualan"
          subtitle="Resume SO, DO, nilai penjualan, produk, dan pelanggan terbesar."
          color={red}
          icon={<ShoppingOutlined />}
        >
          <SalesModule sales={summary.sales} loading={loading} dateRange={dateRange} />
        </ModuleSection>
      )}

      {!limitedDashboard && (
        <>
          {showSalesDashboard && (
            <ModuleSection
              title="Modul Penjualan"
              subtitle="Resume SO, DO, nilai penjualan, produk, dan pelanggan terbesar."
              color={red}
              icon={<ShoppingOutlined />}
            >
              <SalesModule sales={summary.sales} loading={loading} dateRange={dateRange} />
            </ModuleSection>
          )}

          <ModuleSection
            title="Modul Pembelian"
            subtitle="Ringkasan transaksi pembelian periode aktif."
            color={green}
            icon={<ShoppingCartOutlined />}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <SummaryCard title="PO Periode" value={summary.purchasing.po_period} icon={<ShoppingCartOutlined />} color={green} loading={loading} />
              </Col>
            </Row>
          </ModuleSection>

          <ModuleSection
            title="Modul Manufaktur"
            subtitle="Progress SPK, pengeluaran bahan, dan hasil produksi."
            color={orange}
            icon={<ToolOutlined />}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <SummaryCard title="SPK Aktif" value={summary.production.spk_active_month} icon={<ShoppingCartOutlined />} color={orange} loading={loading} />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <SummaryCard title="SPK Selesai" value={summary.production.spk_finished_month} icon={<CheckCircleOutlined />} color={green} loading={loading} />
              </Col>
            </Row>
          </ModuleSection>

          {showAccountingDashboard && (
            <>
              <ModuleSection
                title="Modul Akuntansi"
                subtitle="Nilai jual, HPP, laba rugi, dan aset periode aktif."
                color={purple}
                icon={<DollarOutlined />}
              >
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Sisa Setelah Aset" value={formatCurrency(profitAfterAsset)} icon={<DollarOutlined />} color={profitAfterAsset >= 0 ? cyan : red} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Rasio Reinvestasi Aset" value={assetReinvestmentPct.toFixed(2)} suffix="%" icon={<DollarOutlined />} color={assetReinvestmentPct <= 60 ? green : orange} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Produk Laba" value={summary.accounting.profit_products} icon={<DollarOutlined />} color={green} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Jumlah Aset Dibeli" value={summary.accounting.asset_purchase_count} icon={<DollarOutlined />} color={purple} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Nilai Jual Produk" value={formatCurrency(summary.accounting.nilai_jual)} icon={<DollarOutlined />} color={green} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="HPP Produk" value={formatCurrency(summary.accounting.hpp_total)} icon={<DollarOutlined />} color={orange} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Laba/Rugi Produk" value={formatCurrency(summary.accounting.laba_rugi)} icon={<DollarOutlined />} color={summary.accounting.laba_rugi >= 0 ? green : red} loading={loading} />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <SummaryCard title="Pembelian Aset" value={formatCurrency(summary.accounting.asset_purchase_amount)} icon={<DollarOutlined />} color={purple} loading={loading} />
                  </Col>
                </Row>
              </ModuleSection>

              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24}>
                  <HppTrendChart
                    rows={hppTrend}
                    loading={hppTrendLoading}
                    dateRange={hppTrendRange}
                    onDateChange={setHppTrendRange}
                    onResetDate={() => setHppTrendRange(defaultDateRange())}
                  />
                </Col>
              </Row>
            </>
          )}

          <Title level={4} style={{ marginTop: 28, marginBottom: 16 }}>
            Progress Produksi
          </Title>

          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={8} style={{ display: 'flex' }}>
              <Card loading={loading} style={{ borderRadius: 8, border: softBorder, height: '100%', width: '100%' }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text strong>SPK Periode</Text>
                    <Text type="secondary">{summary.production.spk_total_month} SPK</Text>
                  </Space>
                  <Space size={18} align="center" style={{ width: '100%' }}>
                    <DonutChart
                      percent={summary.production.spk_progress_percent}
                      color={green}
                      label="Selesai"
                      value={`${summary.production.spk_finished_month}/${summary.production.spk_total_month}`}
                    />
                    <Space direction="vertical" size={12} style={{ flex: 1 }}>
                      <MiniBar
                        label="Aktif"
                        value={summary.production.spk_active_month}
                        max={summary.production.spk_total_month || 1}
                        color={orange}
                      />
                      <MiniBar
                        label="Selesai"
                        value={summary.production.spk_finished_month}
                        max={summary.production.spk_total_month || 1}
                        color={green}
                      />
                      <Progress
                        percent={summary.production.spk_progress_percent || 0}
                        strokeColor={green}
                        size="small"
                      />
                    </Space>
                  </Space>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Text type="secondary">Aktif</Text>
                      <div style={{ color: orange, fontWeight: 600 }}>
                        <ClockCircleOutlined /> {summary.production.spk_active_month}
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">Selesai</Text>
                      <div style={{ color: green, fontWeight: 600 }}>
                        <CheckCircleOutlined /> {summary.production.spk_finished_month}
                      </div>
                    </Col>
                  </Row>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={8} style={{ display: 'flex' }}>
              <ProductionProgress
                title="SPM / Pengeluaran Bahan"
                total={summary.production.spm_total_month}
                done={summary.production.spm_done_month}
                partial={summary.production.spm_partial_month}
                open={summary.production.spm_open_month}
                percent={summary.production.spm_progress_percent}
                loading={loading}
              />
            </Col>
            <Col xs={24} lg={8} style={{ display: 'flex' }}>
              <ProductionProgress
                title="GP / Hasil Produksi"
                total={summary.production.gp_total_month}
                done={summary.production.gp_done_month}
                partial={summary.production.gp_partial_month}
                open={summary.production.gp_open_month}
                percent={summary.production.gp_progress_percent}
                loading={loading}
              />
            </Col>
          </Row>

          <Card style={{ marginTop: 16, borderRadius: 8, border: softBorder }}>
            <Space wrap size={18}>
              <Text>
                <ToolOutlined style={{ color: green }} /> SPK aktif: {summary.production.spk_active_month}
              </Text>
              <Text>
                <CheckCircleOutlined style={{ color: green }} /> Skor produksi: {productionScore}%
              </Text>
              {showSalesDashboard && (
                <Text>
                  <FileTextOutlined style={{ color: orange }} /> Invoice periode: {summary.sales.invoice_period}
                </Text>
              )}
              <Text>
                <WarningOutlined style={{ color: red }} /> Stok kosong: {summary.stock.kosong}
              </Text>
            </Space>
          </Card>
        </>
      )}
    </div>
  )
}

