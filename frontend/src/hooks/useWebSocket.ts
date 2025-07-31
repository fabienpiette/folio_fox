import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth'
import { getWebSocketService, destroyWebSocketService } from '@/services/websocket'

export function useWebSocket(enabled: boolean = true) {
  const [connected, setConnected] = useState(false)
  const wsServiceRef = useRef(getWebSocketService())
  const { token } = useAuthStore()

  useEffect(() => {
    if (!enabled || !token) {
      destroyWebSocketService()
      setConnected(false)
      return
    }

    const wsService = wsServiceRef.current

    // Subscribe to connection events
    const unsubscribeConnected = wsService.subscribe('connected', () => {
      setConnected(true)
    })

    const unsubscribeDisconnected = wsService.subscribe('disconnected', () => {
      setConnected(false)
    })

    // Initial connection state
    setConnected(wsService.connected)

    return () => {
      unsubscribeConnected()
      unsubscribeDisconnected()
    }
  }, [enabled, token])

  const send = useCallback((eventName: string, data: unknown) => {
    wsServiceRef.current.send(eventName, data)
  }, [])

  const subscribe = useCallback((channel: string, callback: (data: unknown) => void) => {
    return wsServiceRef.current.subscribe(channel, callback)
  }, [])

  const disconnect = useCallback(() => {
    destroyWebSocketService()
    setConnected(false)
  }, [])

  return {
    connected,
    send,
    subscribe,
    disconnect,
    connectionId: wsServiceRef.current.connectionId,
  }
}