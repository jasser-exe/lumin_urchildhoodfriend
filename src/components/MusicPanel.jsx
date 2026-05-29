function MusicPanel({ tracks, currentTrackId, onImportTracks, onPlayTrack, favorites, onToggleFavorite }) {
  const currentTrack = tracks.find((track) => track.id === currentTrackId) || null
  const favoriteTracks = tracks.filter((track) => favorites.includes(track.id))

  function handleFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    onImportTracks(files)
    e.target.value = ''
  }

  return (
    <div className="message-enter rounded-2xl border p-4" style={{ background: '#12122A', borderColor: '#2E2E5E' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg" style={{ color: '#E8E8FF' }}>
          🎵 My Music
        </h3>
        <label
          className="cursor-pointer rounded-[12px] border px-3 py-2 text-xs"
          style={{ borderColor: '#6BCB77', color: '#6BCB77', background: 'rgba(107,203,119,0.12)' }}
        >
          Add music
          <input type="file" accept="audio/*" multiple onChange={handleFiles} className="hidden" />
        </label>
      </div>

      <p className="mb-3 text-xs" style={{ color: '#9898CC' }}>
        You can choose music already downloaded on the device, then mark them as favorites ⭐
      </p>

      {tracks.length === 0 && (
        <div className="rounded-[12px] border p-3 text-sm" style={{ borderColor: '#2E2E5E', color: '#9898CC' }}>
          No music added yet.
        </div>
      )}

      {tracks.length > 0 && (
        <div className="space-y-2">
          {tracks.map((track) => {
            const active = currentTrackId === track.id
            const isFav = favorites.includes(track.id)

            return (
              <div
                key={track.id}
                className="flex items-center justify-between gap-2 rounded-[12px] border px-3 py-2"
                style={{
                  borderColor: active ? '#6BCB77' : '#2E2E5E',
                  background: active ? 'rgba(107,203,119,0.08)' : '#1E1E3F'
                }}
              >
                <button
                  type="button"
                  onClick={() => onPlayTrack(track.id)}
                  className="min-w-0 flex-1 text-left"
                  style={{ color: '#E8E8FF', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  {active ? '▶️ ' : '🎧 '} {track.name}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(track.id)}
                  className="rounded-full border px-2 py-1 text-xs"
                  style={{
                    borderColor: isFav ? '#FFD93D' : '#2E2E5E',
                    color: isFav ? '#FFD93D' : '#9898CC',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  {isFav ? '★ Favorite' : '☆ Favorite'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {currentTrack && (
        <div className="mt-4 rounded-[12px] border p-3" style={{ borderColor: '#2E2E5E', background: '#1E1E3F' }}>
            <div className="mb-2 text-sm" style={{ color: '#E8E8FF' }}>
            Now playing: {currentTrack.name}
          </div>
          <audio controls src={currentTrack.url} className="w-full" />
        </div>
      )}

      {favoriteTracks.length > 0 && (
        <div className="mt-4 rounded-[12px] border p-3" style={{ borderColor: '#2E2E5E', background: '#1E1E3F' }}>
          <div className="mb-2 text-sm" style={{ color: '#FFD93D' }}>
            ⭐ Favorites
          </div>
          <div className="flex flex-wrap gap-2">
            {favoriteTracks.map((track) => (
              <button
                type="button"
                key={`fav-${track.id}`}
                onClick={() => onPlayTrack(track.id)}
                className="rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: '#FFD93D', color: '#FFD93D', background: 'rgba(255,217,61,0.12)', cursor: 'pointer' }}
              >
                {track.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MusicPanel
