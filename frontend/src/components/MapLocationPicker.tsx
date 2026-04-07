import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const DEFAULT_CENTER: [number, number] = [35.8617, 104.1954]

export interface SelectedLocation {
  displayName: string
  latitude: number
  longitude: number
}

interface MapSearchResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

interface MapLocationPickerProps {
  selectedLocation: SelectedLocation | null
  initialQuery?: string
  onConfirm: (location: SelectedLocation) => void
}

const markerIcon = L.divIcon({
  className: 'map-picker-marker',
  html: '<span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export default function MapLocationPicker({ selectedLocation, initialQuery = '', onConfirm }: MapLocationPickerProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<MapSearchResult[]>([])
  const [candidate, setCandidate] = useState<SelectedLocation | null>(selectedLocation)
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return

    const center: [number, number] = selectedLocation
      ? [selectedLocation.latitude, selectedLocation.longitude]
      : DEFAULT_CENTER
    const map = L.map(mapElementRef.current, {
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
    }).setView(center, selectedLocation ? 14 : 4)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map)

    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    window.setTimeout(() => mapRef.current?.invalidateSize(), 0)
  }, [])

  useEffect(() => {
    if (!candidate || !mapRef.current) return

    const point: [number, number] = [candidate.latitude, candidate.longitude]
    mapRef.current.flyTo(point, 15, { duration: 0.8 })
    markerRef.current?.remove()
    markerRef.current = L.marker(point, { icon: markerIcon })
      .addTo(mapRef.current)
      .bindTooltip('点击确认这个位置', {
        direction: 'top',
        offset: [0, -12],
        opacity: 0.92,
      })
      .on('click', () => {
        onConfirm(candidate)
        setShowResults(false)
      })
    markerRef.current.openTooltip()
  }, [candidate, onConfirm])

  async function searchLocation() {
    const trimmed = query.trim() || initialQuery.trim()
    if (!trimmed) {
      setError('请输入建筑名或地点')
      return
    }

    setSearching(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        q: trimmed,
        format: 'jsonv2',
        limit: '10',
        'accept-language': 'zh-CN',
      })
      const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`)
      if (!response.ok) throw new Error('地图搜索暂时不可用')
      const data = (await response.json()) as MapSearchResult[]
      setResults(data)
      setShowResults(data.length > 0)
      if (data.length === 0) setError('没有找到匹配的位置，可以换一个更具体的名称')
    } catch (err) {
      setResults([])
      setShowResults(false)
      setError(err instanceof Error ? err.message : '地图搜索失败，请稍后再试')
    } finally {
      setSearching(false)
    }
  }

  function previewResult(result: MapSearchResult) {
    const latitude = Number(result.lat)
    const longitude = Number(result.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    setCandidate({
      displayName: result.display_name,
      latitude,
      longitude,
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="space-y-3 border-b border-stone-800 bg-stone-950/95 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-serif text-xl text-stone-100">地图定位</p>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-400">先选搜索结果，再点击地图上的金色标记确认。</p>
          </div>
          <span className="rounded-full border border-stone-800 px-4 py-1.5 font-mono text-xs text-stone-500">MAP</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (results.length > 0) setShowResults(true)
            }}
            onFocus={() => {
              if (results.length > 0) setShowResults(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void searchLocation()
              }
            }}
            placeholder="搜索地点，例如：承德普宁寺"
            className="min-w-0 flex-1 rounded-xl border border-stone-700 bg-black px-5 py-3 font-serif text-base text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void searchLocation()}
            disabled={searching}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-3 text-base font-medium text-amber-200 transition-colors hover:bg-amber-500/15 disabled:border-stone-800 disabled:bg-stone-900 disabled:text-stone-600"
          >
            {searching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="relative overflow-hidden bg-black">
        <div ref={mapElementRef} className="h-[300px] w-full" />
        {showResults && results.length > 0 && (
          <div className="custom-scrollbar absolute left-4 right-4 top-4 z-[1000] max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-stone-700/70 bg-black/70 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-md">
            {results.map((result) => (
              <button
                key={result.place_id}
                type="button"
                onClick={() => {
                  previewResult(result)
                  setShowResults(false)
                }}
                className="block w-full rounded-xl border border-stone-700/70 bg-stone-950/60 px-4 py-3 text-left text-sm leading-relaxed text-stone-300 transition-colors hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-stone-100"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 border-t border-stone-800 bg-stone-950/95 p-3 sm:grid-cols-2">
          <div>
            <p className="text-xs tracking-[0.22em] text-stone-600">纬度</p>
            <p className="mt-1 font-mono text-base text-stone-200">
              {selectedLocation ? selectedLocation.latitude.toFixed(6) : '点击标记后填写'}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.22em] text-stone-600">经度</p>
            <p className="mt-1 font-mono text-base text-stone-200">
              {selectedLocation ? selectedLocation.longitude.toFixed(6) : '点击标记后填写'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
