import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import SyncModal from './SyncModal'

export default function SyncButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Check for active sync on mount
  useEffect(() => {
    checkForActiveSync()
  }, [])

  const checkForActiveSync = async () => {
    // This would check the sync-state via an API endpoint
    // For now, we'll manage it locally through the modal
  }

  const handleSync = () => {
    setIsModalOpen(true)
  }

  const handleSyncStart = (syncId: string) => {
    setActiveSyncId(syncId)
    setIsRunning(true)
  }

  const handleSyncComplete = () => {
    setActiveSyncId(null)
    setIsRunning(false)
  }

  return (
    <>
      <button
        onClick={handleSync}
        className="sync-button"
        title={isRunning ? "View ongoing sync" : "Run job sync"}
      >
        <RefreshCw size={18} className={isRunning ? 'spinning' : ''} />
        <span>{isRunning ? 'Syncing...' : 'Sync Jobs'}</span>
      </button>

      <SyncModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        activeSyncId={activeSyncId}
        onSyncStart={handleSyncStart}
        onSyncComplete={handleSyncComplete}
      />

      <style>{`
        .sync-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #2c5530 0%, #3d7a42 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(44, 85, 48, 0.3);
        }

        .sync-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(44, 85, 48, 0.4);
          background: linear-gradient(135deg, #3d7a42 0%, #4a9250 100%);
        }

        .sync-button:active {
          transform: translateY(0);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
