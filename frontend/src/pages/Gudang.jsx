import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import {
  FileExcelOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import api, { getApiErrorMessage } from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'
import { withTableSorters } from '../utils/tableSorters'
import { useAuth } from '../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../utils/columnPermissions'

const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 50
const WAREHOUSE_COLUMN_ORDER = [
  { field: 'qty_0', title: 'Centre' },
  { field: 'qty_12', title: 'Putat' },
  { field: 'qty_3', title: 'Produksi' },
  { field: 'qty_9', title: 'Surabaya' },
  { field: 'qty_10', title: 'Setengah Jadi' },
]

const ITEM_EXPORT_COLS = [
  { key: 'row_no', label: 'No.', type: 'number' },
  { key: 'itemno', label: 'No. Barang' },
  { key: 'description', label: 'Deskripsi 1' },
  { key: 'quantity', label: 'Jumlah', type: 'number' },
  { key: 'qty_0', label: 'Centre', type: 'number' },
  { key: 'qty_12', label: 'Putat', type: 'number' },
  { key: 'qty_3', label: 'Produksi', type: 'number' },
  { key: 'qty_9', label: 'Surabaya', type: 'number' },
  { key: 'qty_10', label: 'Setengah Jadi', type: 'number' },
  { key: 'unit', label: 'Satuan' },
  { key: 'item_type', label: 'Tipe' },
  { key: 'inventory_type', label: 'Tipe Persediaan' },
  { key: 'code_product', label: 'Code Product' },
]

function formatNumber(value, maximumFractionDigits = 4) {
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits })
}

export default function Gudang() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [hideZero, setHideZero] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [selectedItem, setSelectedItem] = useState(null)
  const [warehouseDetail, setWarehouseDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const searchRef = useRef('')
  const hideZeroRef = useRef(false)
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)
  const didMountRef = useRef(false)

  const fetchItems = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchVal = '',
    hideZeroVal = false,
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const res = await api.get('/api/gudang/items', {
        params: {
          offset,
          limit: pageSize,
          search: searchVal,
          hide_zero: hideZeroVal ? 1 : 0,
          include_total: 1,
        },
      })
      const rows = res.data.data || []
      setItems(rows)
      setPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
      setSelectedItem(current => {
        if (current && rows.some(row => row.itemno === current.itemno)) return current
        return rows[0] || null
      })
      pageRef.current = page
      pageSizeRef.current = pageSize
      searchRef.current = searchVal
      hideZeroRef.current = hideZeroVal
    } catch (error) {
      console.error(error)
      message.error({ content: getApiErrorMessage(error, 'Gagal memuat daftar barang gudang'), key: 'gudang-items-load' })
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const fetchWarehouseDetail = useCallback(async item => {
    if (!item?.itemno) return
    setDetailLoading(true)
    try {
      const res = await api.get(`/api/gudang/items/${encodeURIComponent(item.itemno)}/warehouses`)
      setWarehouseDetail(res.data)
    } catch (error) {
      console.error(error)
      message.error({ content: getApiErrorMessage(error, 'Gagal memuat kuantitas gudang'), key: 'gudang-detail-load' })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return undefined
    }
    const timer = setTimeout(() => {
      fetchItems(1, pageSizeRef.current, search, hideZero)
    }, 350)
    return () => clearTimeout(timer)
  }, [fetchItems, hideZero, search])

  const openWarehouseDetail = item => {
    setSelectedItem(item)
    setWarehouseDetail(null)
    fetchWarehouseDetail(item)
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get('/api/gudang/items', {
        params: {
          offset: 0,
          limit: 0,
          search: searchRef.current,
          hide_zero: hideZeroRef.current ? 1 : 0,
          include_total: 1,
        },
      })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('gudang', ITEM_EXPORT_COLS, user),
    filename: 'Daftar Barang Gudang',
    sheetName: 'Barang',
    message,
    setExporting,
    loadingText: 'Menyiapkan daftar barang...',
  })

  const columns = useMemo(() => [
    {
      title: 'No.',
      dataIndex: 'row_no',
      key: 'row_no',
      width: 58,
      align: 'center',
    },
    {
      title: 'No. Barang',
      dataIndex: 'itemno',
      key: 'itemno',
      width: 210,
      fixed: 'left',
      render: value => <Text strong>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi 1',
      dataIndex: 'description',
      key: 'description',
      width: 310,
      ellipsis: true,
      render: value => value || '-',
    },
    {
      title: 'Jumlah',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      align: 'right',
      render: value => <Text strong>{formatNumber(value)}</Text>,
    },
    ...WAREHOUSE_COLUMN_ORDER.map(warehouse => ({
      title: warehouse.title,
      dataIndex: warehouse.field,
      key: warehouse.field,
      width: 120,
      align: 'right',
      render: value => formatNumber(value),
    })),
    {
      title: 'Satuan',
      dataIndex: 'unit',
      key: 'unit',
      width: 90,
      render: value => value || '-',
    },
    {
      title: 'Tipe',
      dataIndex: 'item_type',
      key: 'item_type',
      width: 120,
      render: value => value || '-',
    },
    {
      title: 'Tipe Persediaan',
      dataIndex: 'inventory_type',
      key: 'inventory_type',
      width: 190,
      render: value => value || '-',
    },
    {
      title: 'Code Product',
      dataIndex: 'code_product',
      key: 'code_product',
      width: 140,
      render: value => value || '-',
    },
  ], [])

  const warehouseColumns = [
    {
      title: 'Nama Gudang',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
      render: value => <Text strong={value === 'CENTRE'}>{value || '-'}</Text>,
    },
    {
      title: 'Kuantitas',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
      align: 'right',
      render: value => <Text strong>{formatNumber(value)}</Text>,
    },
  ]

  const visibleColumns = filterColumnsByPermission('gudang', columns, user)

  return (
    <div style={{ minHeight: 'calc(100vh - 92px)' }}>
      <main style={{ minWidth: 0, background: '#fff', border: '1px solid #c8c8c8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 8, borderBottom: '1px solid #d9d9d9' }}>
          <Space wrap size={8}>
            <Search
              placeholder="Cari no barang atau deskripsi"
              allowClear
              size="small"
              prefix={<SearchOutlined />}
              value={search}
              style={{ width: 280 }}
              onChange={event => setSearch(event.target.value)}
              onSearch={value => fetchItems(1, pageSizeRef.current, value, hideZero)}
            />
            <Checkbox
              checked={hideZero}
              onChange={event => setHideZero(event.target.checked)}
            >
              Sembunyikan qty 0
            </Checkbox>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch('')
                setHideZero(false)
                fetchItems(1, DEFAULT_PAGE_SIZE, '', false)
              }}
            />
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              loading={exporting}
              onClick={handleExport}
            >
              Export
            </Button>
          </Space>
          <Text type="secondary">{formatNumber(pagination.total, 0)} barang</Text>
        </div>
        <Table
          className="easy-gudang-table"
          rowKey="itemno"
          columns={withTableSorters(visibleColumns)}
          dataSource={items}
          loading={loading}
          size="small"
          sticky
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['50', '100', '200'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total}`,
            onChange: (page, pageSize) => fetchItems(page, pageSize, searchRef.current, hideZeroRef.current),
          }}
          scroll={{ x: 1600, y: 'calc(100vh - 210px)' }}
          rowClassName={record => (record.itemno === selectedItem?.itemno ? 'easy-selected-row' : '')}
          onRow={record => ({
            onClick: () => setSelectedItem(record),
            onDoubleClick: () => openWarehouseDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      </main>

      <Modal
        title={
          <Space>
            <ShopOutlined />
            <span>Gudang</span>
            {warehouseDetail?.itemno && <Tag color="blue">{warehouseDetail.itemno}</Tag>}
          </Space>
        }
        open={Boolean(detailLoading || warehouseDetail)}
        onCancel={() => {
          setWarehouseDetail(null)
          setDetailLoading(false)
        }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input size="small" value={warehouseDetail?.description || selectedItem?.description || ''} readOnly />
          <Table
            rowKey="warehouse_id"
            columns={warehouseColumns}
            dataSource={warehouseDetail?.warehouses || []}
            loading={detailLoading}
            size="small"
            bordered
            pagination={false}
            scroll={{ y: 360 }}
          />
          {warehouseDetail && (
            <Text type="secondary">
              Total {formatNumber(warehouseDetail.total_quantity)} {warehouseDetail.unit || ''}
            </Text>
          )}
        </Space>
      </Modal>

      <style>{`
        .easy-gudang-table .ant-table,
        .easy-gudang-table .ant-table-container,
        .easy-gudang-table .ant-table-content,
        .easy-gudang-table .ant-table-thead > tr > th,
        .easy-gudang-table .ant-table-tbody > tr > td {
          border: 0 !important;
        }
        .easy-gudang-table .ant-table-thead > tr > th {
          background: #f8fafc !important;
        }
        .easy-gudang-table .ant-table-tbody > tr:nth-child(even) > td {
          background: #fbfdff;
        }
        .easy-gudang-table .ant-table-tbody > tr:hover > td {
          background: #eef6ff !important;
        }
        .easy-selected-row > td {
          background: #0b78d0 !important;
          color: #fff !important;
        }
        .easy-selected-row a,
        .easy-selected-row span {
          color: #fff !important;
        }
      `}</style>
    </div>
  )
}
