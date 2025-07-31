package services

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/models"
)

// WebSocketHub manages WebSocket connections for real-time updates
type WebSocketHub struct {
	// Registered clients
	clients map[*Client]bool
	
	// Register requests from clients
	register chan *Client
	
	// Unregister requests from clients
	unregister chan *Client
	
	// Inbound messages from clients
	broadcast chan []byte
	
	// Stop channel
	stopChan chan struct{}
	
	logger *logrus.Logger
	mu     sync.RWMutex
}

// Client represents a WebSocket client connection
type Client struct {
	// The WebSocket connection
	conn *websocket.Conn
	
	// Buffered channel of outbound messages
	send chan []byte
	
	// Client metadata
	userID   int64
	clientID string
	
	// Hub reference
	hub *WebSocketHub
	
	// Last ping time
	lastPing time.Time
}

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
	UserID    *int64      `json:"user_id,omitempty"`
}

const (
	// WebSocket message types
	MessageTypeDownloadProgress = "download_progress"
	MessageTypeDownloadStatus   = "download_status"
	MessageTypeIndexerHealth    = "indexer_health"
	MessageTypeLibraryUpdate    = "library_update"
	MessageTypeSearchComplete   = "search_complete"
	MessageTypeSystemAlert      = "system_alert"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, implement proper origin checking
		return true
	},
}

// NewWebSocketHub creates a new WebSocket hub
func NewWebSocketHub(logger *logrus.Logger) *WebSocketHub {
	return &WebSocketHub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		stopChan:   make(chan struct{}),
		logger:     logger,
	}
}

// Start runs the WebSocket hub
func (h *WebSocketHub) Start() {
	h.logger.Info("Starting WebSocket hub")
	
	// Start cleanup routine
	go h.cleanupRoutine()
	
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)
			
		case client := <-h.unregister:
			h.unregisterClient(client)
			
		case message := <-h.broadcast:
			h.broadcastMessage(message)
			
		case <-h.stopChan:
			h.logger.Info("WebSocket hub stopping")
			return
		}
	}
}

// Stop stops the WebSocket hub
func (h *WebSocketHub) Stop() {
	close(h.stopChan)
	
	// Close all client connections
	h.mu.Lock()
	defer h.mu.Unlock()
	
	for client := range h.clients {
		close(client.send)
		client.conn.Close()
	}
}

// HandleWebSocket handles WebSocket connection requests
func (h *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request, userID int64, clientID string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Errorf("WebSocket upgrade failed: %v", err)
		return
	}
	
	client := &Client{
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   userID,
		clientID: clientID,
		hub:      h,
		lastPing: time.Now(),
	}
	
	// Register client
	client.hub.register <- client
	
	// Start client goroutines
	go client.writePump()
	go client.readPump()
}

// BroadcastDownloadProgress broadcasts download progress to relevant clients
func (h *WebSocketHub) BroadcastDownloadProgress(progress *models.DownloadProgress, userID int64) {
	message := &WebSocketMessage{
		Type:      MessageTypeDownloadProgress,
		Data:      progress,
		Timestamp: time.Now(),
		UserID:    &userID,
	}
	
	h.sendToUser(message, userID)
}

// BroadcastDownloadStatus broadcasts download status change to relevant clients
func (h *WebSocketHub) BroadcastDownloadStatus(downloadID int64, status models.DownloadStatus, userID int64) {
	data := map[string]interface{}{
		"download_id": downloadID,
		"status":      status,
	}
	
	message := &WebSocketMessage{
		Type:      MessageTypeDownloadStatus,
		Data:      data,
		Timestamp: time.Now(),
		UserID:    &userID,
	}
	
	h.sendToUser(message, userID)
}

// BroadcastIndexerHealth broadcasts indexer health updates
func (h *WebSocketHub) BroadcastIndexerHealth(indexerID int64, status models.IndexerStatus) {
	data := map[string]interface{}{
		"indexer_id": indexerID,
		"status":     status,
	}
	
	message := &WebSocketMessage{
		Type:      MessageTypeIndexerHealth,
		Data:      data,
		Timestamp: time.Now(),
	}
	
	h.broadcastToAll(message)
}

// BroadcastLibraryUpdate broadcasts library updates
func (h *WebSocketHub) BroadcastLibraryUpdate(bookID int64, action string, userID int64) {
	data := map[string]interface{}{
		"book_id": bookID,
		"action":  action, // "added", "updated", "deleted"
	}
	
	message := &WebSocketMessage{
		Type:      MessageTypeLibraryUpdate,
		Data:      data,
		Timestamp: time.Now(),
		UserID:    &userID,
	}
	
	h.sendToUser(message, userID)
}

// BroadcastSystemAlert broadcasts system-wide alerts
func (h *WebSocketHub) BroadcastSystemAlert(level string, message string) {
	data := map[string]interface{}{
		"level":   level,   // "info", "warning", "error"
		"message": message,
	}
	
	wsMessage := &WebSocketMessage{
		Type:      MessageTypeSystemAlert,
		Data:      data,
		Timestamp: time.Now(),
	}
	
	h.broadcastToAll(wsMessage)
}

// registerClient registers a new client
func (h *WebSocketHub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	h.clients[client] = true
	h.logger.Infof("WebSocket client connected: user=%d, client=%s", client.userID, client.clientID)
	
	// Send welcome message
	welcomeMsg := &WebSocketMessage{
		Type:      "connected",
		Data:      map[string]interface{}{"client_id": client.clientID},
		Timestamp: time.Now(),
	}
	
	if data, err := json.Marshal(welcomeMsg); err == nil {
		select {
		case client.send <- data:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

// unregisterClient unregisters a client
func (h *WebSocketHub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
		h.logger.Infof("WebSocket client disconnected: user=%d, client=%s", client.userID, client.clientID)
	}
}

// broadcastMessage broadcasts a message to all clients
func (h *WebSocketHub) broadcastMessage(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	
	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

// sendToUser sends a message to a specific user's clients
func (h *WebSocketHub) sendToUser(message *WebSocketMessage, userID int64) {
	data, err := json.Marshal(message)
	if err != nil {
		h.logger.Errorf("Failed to marshal WebSocket message: %v", err)
		return
	}
	
	h.mu.RLock()
	defer h.mu.RUnlock()
	
	for client := range h.clients {
		if client.userID == userID {
			select {
			case client.send <- data:
			default:
				close(client.send)
				delete(h.clients, client)
			}
		}
	}
}

// broadcastToAll broadcasts a message to all connected clients
func (h *WebSocketHub) broadcastToAll(message *WebSocketMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		h.logger.Errorf("Failed to marshal WebSocket message: %v", err)
		return
	}
	
	select {
	case h.broadcast <- data:
	default:
		h.logger.Warn("Broadcast channel full, dropping message")
	}
}

// cleanupRoutine periodically cleans up inactive connections
func (h *WebSocketHub) cleanupRoutine() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			h.cleanupInactiveClients()
		case <-h.stopChan:
			return
		}
	}
}

// cleanupInactiveClients removes clients that haven't pinged recently
func (h *WebSocketHub) cleanupInactiveClients() {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	cutoff := time.Now().Add(-5 * time.Minute)
	
	for client := range h.clients {
		if client.lastPing.Before(cutoff) {
			h.logger.Infof("Cleaning up inactive WebSocket client: user=%d, client=%s", client.userID, client.clientID)
			close(client.send)
			client.conn.Close()
			delete(h.clients, client)
		}
	}
}

// GetClientCount returns the number of connected clients
func (h *WebSocketHub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetUserClientCount returns the number of clients for a specific user
func (h *WebSocketHub) GetUserClientCount(userID int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	
	count := 0
	for client := range h.clients {
		if client.userID == userID {
			count++
		}
	}
	return count
}

// Client methods

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second
	
	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second
	
	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10
	
	// Maximum message size allowed from peer
	maxMessageSize = 512
)

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait)) // Ignore deadline errors
	c.conn.SetPongHandler(func(string) error {
		c.lastPing = time.Now()
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait)) // Ignore deadline errors
		return nil
	})
	
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.hub.logger.Errorf("WebSocket error: %v", err)
			}
			break
		}
		
		// Handle incoming messages (ping, subscription requests, etc.)
		c.handleMessage(message)
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	
	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait)) // Ignore deadline errors
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{}) // Ignore close message errors
				return
			}
			
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message) // Ignore write errors in websocket
			
			// Add queued messages to the current WebSocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'}) // Ignore write errors
				_, _ = w.Write(<-c.send) // Ignore write errors
			}
			
			if err := w.Close(); err != nil {
				return
			}
			
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait)) // Ignore deadline errors
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage handles incoming messages from the client
func (c *Client) handleMessage(message []byte) {
	// Parse message
	var msg map[string]interface{}
	if err := json.Unmarshal(message, &msg); err != nil {
		c.hub.logger.Warnf("Invalid WebSocket message from client %s: %v", c.clientID, err)
		return
	}
	
	msgType, ok := msg["type"].(string)
	if !ok {
		return
	}
	
	switch msgType {
	case "ping":
		c.lastPing = time.Now()
		
	case "subscribe":
		// Handle subscription requests
		if topics, ok := msg["topics"].([]interface{}); ok {
			c.hub.logger.Debugf("Client %s subscribing to topics: %v", c.clientID, topics)
			// In a more sophisticated implementation, track subscriptions per client
		}
		
	case "unsubscribe":
		// Handle unsubscription requests
		if topics, ok := msg["topics"].([]interface{}); ok {
			c.hub.logger.Debugf("Client %s unsubscribing from topics: %v", c.clientID, topics)
		}
	}
}