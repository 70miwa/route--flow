const AREA_FIELDS = [
  'neighbourhood',
  'suburb',
  'quarter',
  'town',
  'city',
  'village',
  'municipality',
  'state_district',
]

function areaLabel(address = {}) {
  const values = []
  for (const field of AREA_FIELDS) {
    const value = address[field]?.trim()
    if (value && !values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      values.push(value)
    }
    if (values.length === 2) break
  }
  return values.join(', ')
}

export function normalizeSearchRows(rows = []) {
  return rows.flatMap((row) => {
    const lat = Number(row.lat)
    const lng = Number(row.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [{
      label: row.display_name || 'Unnamed place',
      lat,
      lng,
      road: row.address?.road || row.address?.pedestrian || row.address?.highway || '',
      area: areaLabel(row.address),
    }]
  })
}

export function normalizeReverseResult(row = {}) {
  const address = row.address || {}
  const road = address.road || address.pedestrian || address.highway || ''
  const fallback = [address.house_number, road, areaLabel(address), address.state]
    .filter(Boolean)
    .join(', ')
  return {
    label: row.display_name || fallback || 'Selected location',
    road,
    area: areaLabel(address),
  }
}
