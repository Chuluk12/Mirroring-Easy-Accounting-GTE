export function filterColumnsByPermission(module, columns, user) {
  const allowed = user?.column_permissions?.[module]
  if (!allowed || allowed.length === 0) return columns

  const allowedSet = new Set(allowed)
  return columns.filter(column => {
    if (!column.dataIndex || typeof column.dataIndex !== 'string') return true
    if (
      module === 'gudang'
      && column.dataIndex.startsWith('qty_')
      && allowedSet.has('warehouse_quantities')
    ) return true
    return allowedSet.has(column.dataIndex)
  })
}

export function filterExportColumnsByPermission(module, columns, user) {
  const allowed = user?.column_permissions?.[module]
  if (!allowed || allowed.length === 0) return columns

  const allowedSet = new Set(allowed)
  return columns.filter(column => {
    if (
      module === 'gudang'
      && typeof column.key === 'string'
      && column.key.startsWith('qty_')
      && allowedSet.has('warehouse_quantities')
    ) return true
    return allowedSet.has(column.key)
  })
}
