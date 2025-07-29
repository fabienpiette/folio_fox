# FolioFox API Integration Guide

## Overview

FolioFox provides a comprehensive set of REST APIs and WebSocket connections for managing an eBook library automation system. This guide covers all aspects of integrating with FolioFox APIs, including authentication, error handling, rate limiting, and best practices.

## Table of Contents

- [API Architecture](#api-architecture)
- [Authentication & Authorization](#authentication--authorization)
- [API Specifications](#api-specifications)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [WebSocket Integration](#websocket-integration)
- [External Integrations](#external-integrations)
- [Best Practices](#best-practices)
- [Code Examples](#code-examples)
- [Troubleshooting](#troubleshooting)

## API Architecture

FolioFox uses a modular API architecture with separate specifications for different functional areas:

### Core API Components

1. **Core API** (`foliofox-core-api.yaml`): Main application functionality
   - User management and authentication
   - Book library management
   - Search and discovery
   - Download management

2. **System API** (`foliofox-system-api.yaml`): Administrative operations
   - Health monitoring
   - Performance metrics
   - Configuration management
   - Maintenance operations

3. **Integrations API** (`foliofox-integrations-api.yaml`): External service integrations
   - Prowlarr integration
   - Jackett integration
   - Torrent client management
   - Metadata services

4. **WebSocket API** (`foliofox-websocket-spec.yaml`): Real-time updates
   - Download progress
   - Search results streaming
   - System notifications
   - Library updates

### Base URLs

- **Development**: `http://localhost:8080/api/v1`
- **Production**: `https://api.foliofox.local/v1`
- **WebSocket**: `ws://localhost:8080/ws` (dev) / `wss://api.foliofox.local/ws` (prod)

## Authentication & Authorization

### JWT Token Authentication

FolioFox uses JSON Web Tokens (JWT) for authentication. All API endpoints (except health checks) require authentication.

#### Login Process

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "username": "your_username",
    "is_admin": false
  }
}
```

#### Using the Token

Include the token in the Authorization header for all subsequent requests:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Token Refresh

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

### Permission Levels

- **User**: Standard user operations (library management, downloads)
- **Admin**: System administration, user management, configuration
- **System**: Internal service operations (health checks, metrics)

## API Specifications

### Core Library Operations

#### List Books

```http
GET /api/v1/books?page=1&limit=20&search=foundation&author=asimov
Authorization: Bearer <token>
```

**Query Parameters:**
- `page`: Page number (1-based)
- `limit`: Items per page (1-100)
- `search`: Full-text search query
- `author`: Filter by author name
- `series`: Filter by series name
- `genre`: Filter by genre
- `language`: Filter by language code
- `format`: Filter by available format
- `rating_min`, `rating_max`: Rating filters
- `sort`: Sort field (title, author, publication_date, rating, created_at)
- `order`: Sort order (asc, desc)

#### Add Book to Library

```http
POST /api/v1/books
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Foundation",
  "subtitle": "The Foundation Series, Book 1",
  "description": "The first novel in Isaac Asimov's classic Foundation series...",
  "isbn_13": "9780553293357",
  "publication_date": "1951-05-01",
  "author_ids": [1],
  "genre_ids": [3, 4],
  "tags": ["classic", "space-opera"]
}
```

#### Search Across Indexers

```http
GET /api/v1/search?query=Foundation Isaac Asimov&formats=epub,pdf&limit=50
Authorization: Bearer <token>
```

**Response includes:**
- Search results from multiple indexers
- Response times and success rates
- Cached vs live results
- Total result counts per indexer

#### Download Management

```http
POST /api/v1/downloads/queue
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Foundation",
  "author_name": "Isaac Asimov",
  "download_url": "https://example.com/foundation.epub",
  "file_format": "epub",
  "indexer_id": 1,
  "priority": 5
}
```

### System Administration

#### Health Check

```http
GET /api/v1/system/health
# No authentication required for basic health check
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-28T10:30:00Z",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "indexers": "degraded",
    "filesystem": "healthy"
  }
}
```

#### System Metrics

```http
GET /api/v1/system/metrics?period=1h&format=json
Authorization: Bearer <token>
```

#### Configuration Management

```http
PUT /api/v1/system/config
Content-Type: application/json
Authorization: Bearer <token>

{
  "settings": [
    {
      "key": "max_concurrent_downloads",
      "value": "5"
    }
  ]
}
```

### External Integrations

#### Prowlarr Configuration

```http
PUT /api/v1/integrations/prowlarr/config
Content-Type: application/json
Authorization: Bearer <token>

{
  "enabled": true,
  "base_url": "http://localhost:9696",
  "api_key": "your_prowlarr_api_key",
  "timeout_seconds": 30
}
```

#### Search Through Prowlarr

```http
POST /api/v1/integrations/prowlarr/search
Content-Type: application/json
Authorization: Bearer <token>

{
  "query": "Foundation Isaac Asimov",
  "categories": [8000, 8010],
  "limit": 100
}
```

#### Torrent Client Management

```http
POST /api/v1/integrations/torrent-clients
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "qBittorrent Local",
  "client_type": "qbittorrent",
  "host": "localhost",
  "port": 8080,
  "username": "admin",
  "password": "password",
  "download_path": "/downloads/ebooks"
}
```

## Error Handling

FolioFox follows RFC 7807 Problem Details for HTTP APIs for consistent error responses.

### Error Response Format

```json
{
  "type": "https://api.foliofox.local/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "The request body contains invalid data",
  "instance": "/api/v1/books",
  "errors": [
    {
      "field": "title",
      "code": "required",
      "message": "Title is required"
    }
  ],
  "timestamp": "2025-07-28T10:30:00Z",
  "request_id": "req_123456789"
}
```

### Common Error Codes

| Status | Error Type | Description |
|--------|------------|-------------|
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Resource conflict (duplicate, constraint violation) |
| 413 | Payload Too Large | File upload too large |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Error Handling Best Practices

1. **Check Status Codes**: Always check HTTP status codes before processing responses
2. **Parse Error Details**: Use the structured error response for user-friendly messages
3. **Implement Retry Logic**: For 429 (rate limited) and 503 (service unavailable)
4. **Log Request IDs**: Include request_id in error logs for debugging

## Rate Limiting

FolioFox implements rate limiting to ensure fair usage and system stability.

### Rate Limits by Endpoint Category

| Category | Limit | Window |
|----------|-------|--------|
| Standard endpoints | 1000 requests | 1 hour |
| Search endpoints | 500 requests | 1 hour |
| Download endpoints | 100 requests | 1 hour |
| Admin endpoints | 100 requests | 1 hour |
| Health endpoints | No limit | - |

### Rate Limit Headers

Rate limit information is included in response headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1658995200
Retry-After: 3600
```

### Handling Rate Limits

1. **Monitor Headers**: Check rate limit headers in responses
2. **Implement Backoff**: Use exponential backoff when rate limited
3. **Distribute Requests**: Spread requests over time to avoid bursts
4. **Cache Results**: Cache API responses to reduce request frequency

## WebSocket Integration

### Connection Flow

1. **Connect**: Establish WebSocket connection to `/ws`
2. **Authenticate**: Send authentication message with JWT token
3. **Subscribe**: Subscribe to specific channels for updates
4. **Receive Updates**: Handle real-time messages
5. **Heartbeat**: Send periodic heartbeats to maintain connection

### WebSocket Connection Example

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = function() {
    // Authenticate with JWT token
    ws.send(JSON.stringify({
        type: 'authenticate',
        token: 'your_jwt_token'
    }));
};

ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
        case 'authenticated':
            console.log('Authenticated as:', message.user.username);
            // Subscribe to download progress
            ws.send(JSON.stringify({
                type: 'subscribe',
                channel: 'download_progress'
            }));
            break;
            
        case 'download_progress_update':
            updateDownloadProgress(message.download_id, message.progress_percentage);
            break;
            
        case 'download_completed':
            showNotification(`Download completed: ${message.title}`);
            break;
    }
};

// Send heartbeat every 30 seconds
setInterval(() => {
    ws.send(JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
    }));
}, 30000);
```

### Available WebSocket Channels

- **downloads/progress**: Real-time download progress updates
- **downloads/queue**: Download queue changes
- **search/results/{searchId}**: Streaming search results
- **system/health**: System health updates
- **system/metrics**: Performance metrics
- **library/updates**: Library content changes
- **notifications**: User notifications
- **indexers/status**: Indexer status updates

## External Integrations

### Prowlarr Integration

Prowlarr acts as an indexer proxy, allowing FolioFox to search across multiple torrent and usenet indexers through a single API.

**Benefits:**
- Centralized indexer management
- Unified search across multiple sources
- Built-in rate limiting and health monitoring
- Automatic indexer discovery

**Setup Process:**
1. Configure Prowlarr with your indexers
2. Generate API key in Prowlarr
3. Configure FolioFox with Prowlarr endpoint and API key
4. Sync indexers from Prowlarr to FolioFox
5. Enable Prowlarr search in FolioFox

### Jackett Integration

Jackett provides an alternative indexer aggregation service focused on torrent trackers.

**Benefits:**
- Wide tracker support
- Simple configuration
- Good performance for public trackers

**Setup Process:**
1. Configure Jackett with desired trackers
2. Get API key from Jackett admin interface
3. Configure FolioFox with Jackett endpoint and API key
4. Test connection and enable search

### Direct Indexer Integration

FolioFox includes native support for popular eBook indexers:

- **Library Genesis**: Comprehensive academic and fiction books
- **Z-Library**: Large collection of books and articles
- **Anna's Archive**: Preservation-focused book archive
- **Mobilism**: Mobile-focused eBook community

### Torrent Client Integration

Supported torrent clients:

- **qBittorrent**: Full-featured open-source client
- **Transmission**: Lightweight cross-platform client
- **Deluge**: Plugin-based torrent client
- **rTorrent**: Command-line torrent client

### Metadata Services

Integrated metadata services for book enrichment:

- **Goodreads**: Community ratings and reviews
- **Google Books**: Comprehensive book database
- **Open Library**: Internet Archive book database
- **WorldCat**: Library catalog database
- **ISBN Database**: ISBN-based metadata lookup

## Best Practices

### API Usage

1. **Use Appropriate HTTP Methods**:
   - GET for retrieval
   - POST for creation
   - PUT for updates
   - DELETE for removal

2. **Include Request IDs**: Add custom request IDs for tracking

3. **Handle Pagination**: Use pagination for large result sets

4. **Validate Input**: Validate data before sending to API

5. **Use Compression**: Enable gzip compression for large responses

### Performance Optimization

1. **Batch Operations**: Use batch endpoints when available

2. **Caching**: Implement client-side caching for frequently accessed data

3. **Connection Pooling**: Reuse HTTP connections

4. **Parallel Requests**: Make parallel requests when appropriate

5. **Streaming**: Use WebSocket for real-time updates instead of polling

### Security

1. **Secure Token Storage**: Store JWT tokens securely

2. **HTTPS**: Always use HTTPS in production

3. **Input Validation**: Validate all input data

4. **Error Information**: Don't expose sensitive information in errors

5. **Rate Limiting**: Respect rate limits and implement backoff

### Error Recovery

1. **Retry Logic**: Implement exponential backoff for transient errors

2. **Circuit Breaker**: Use circuit breaker pattern for external services

3. **Graceful Degradation**: Handle service unavailability gracefully

4. **Logging**: Log errors with sufficient context for debugging

## Code Examples

### Python Client Example

```python
import requests
import websocket
import json
import time
from typing import Optional, Dict, Any

class FolioFoxClient:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.token: Optional[str] = None
        self.authenticate(username, password)
    
    def authenticate(self, username: str, password: str) -> Dict[str, Any]:
        """Authenticate and store JWT token"""
        response = self.session.post(
            f"{self.base_url}/auth/login",
            json={"username": username, "password": password}
        )
        response.raise_for_status()
        
        data = response.json()
        self.token = data["access_token"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}"
        })
        return data
    
    def search_books(self, query: str, **kwargs) -> Dict[str, Any]:
        """Search for books across indexers"""
        params = {"query": query, **kwargs}
        response = self.session.get(
            f"{self.base_url}/search",
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def add_download(self, title: str, download_url: str, 
                    file_format: str, indexer_id: int, **kwargs) -> Dict[str, Any]:
        """Add download to queue"""
        data = {
            "title": title,
            "download_url": download_url,
            "file_format": file_format,
            "indexer_id": indexer_id,
            **kwargs
        }
        response = self.session.post(
            f"{self.base_url}/downloads/queue",
            json=data
        )
        response.raise_for_status()
        return response.json()
    
    def get_download_queue(self, **kwargs) -> Dict[str, Any]:
        """Get current download queue"""
        response = self.session.get(
            f"{self.base_url}/downloads/queue",
            params=kwargs
        )
        response.raise_for_status()
        return response.json()
    
    def add_book(self, title: str, **kwargs) -> Dict[str, Any]:
        """Add book to library"""
        data = {"title": title, **kwargs}
        response = self.session.post(
            f"{self.base_url}/books",
            json=data
        )
        response.raise_for_status()
        return response.json()
    
    def get_books(self, **kwargs) -> Dict[str, Any]:
        """Get books from library"""
        response = self.session.get(
            f"{self.base_url}/books",
            params=kwargs
        )
        response.raise_for_status()
        return response.json()

# Usage example
client = FolioFoxClient("http://localhost:8080/api/v1", "admin", "password")

# Search for books
results = client.search_books("Foundation Isaac Asimov", formats="epub,pdf")
print(f"Found {results['total_results']} results")

# Add download
if results['results']:
    first_result = results['results'][0]
    download = client.add_download(
        title=first_result['title'],
        download_url=first_result['download_url'],
        file_format=first_result['format'],
        indexer_id=first_result['indexer_id'],
        priority=5
    )
    print(f"Added download: {download['id']}")

# Monitor download queue
queue = client.get_download_queue(status="downloading")
print(f"Active downloads: {len(queue['downloads'])}")
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');
const WebSocket = require('ws');

class FolioFoxClient {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000
        });
        
        this.authenticate(username, password);
    }
    
    async authenticate(username, password) {
        try {
            const response = await this.client.post('/auth/login', {
                username,
                password
            });
            
            this.token = response.data.access_token;
            this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
            
            return response.data;
        } catch (error) {
            throw new Error(`Authentication failed: ${error.response?.data?.detail || error.message}`);
        }
    }
    
    async searchBooks(query, options = {}) {
        try {
            const response = await this.client.get('/search', {
                params: { query, ...options }
            });
            return response.data;
        } catch (error) {
            throw new Error(`Search failed: ${error.response?.data?.detail || error.message}`);
        }
    }
    
    async addDownload(downloadData) {
        try {
            const response = await this.client.post('/downloads/queue', downloadData);
            return response.data;
        } catch (error) {
            throw new Error(`Add download failed: ${error.response?.data?.detail || error.message}`);
        }
    }
    
    connectWebSocket() {
        const wsUrl = this.baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1$/, '/ws');
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
            console.log('WebSocket connected');
            // Authenticate WebSocket connection
            this.ws.send(JSON.stringify({
                type: 'authenticate',
                token: this.token
            }));
        });
        
        this.ws.on('message', (data) => {
            const message = JSON.parse(data);
            this.handleWebSocketMessage(message);
        });
        
        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
        
        // Setup heartbeat
        setInterval(() => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'heartbeat',
                    timestamp: new Date().toISOString()
                }));
            }
        }, 30000);
    }
    
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'authenticated':
                console.log('WebSocket authenticated');
                // Subscribe to download progress
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    channel: 'download_progress'
                }));
                break;
                
            case 'download_progress_update':
                console.log(`Download ${message.download_id}: ${message.progress_percentage}%`);
                break;
                
            case 'download_completed':
                console.log(`Download completed: ${message.title}`);
                break;
                
            case 'error':
                console.error('WebSocket error:', message.error_message);
                break;
        }
    }
}

// Usage example
async function main() {
    try {
        const client = new FolioFoxClient('http://localhost:8080/api/v1', 'admin', 'password');
        
        // Connect WebSocket for real-time updates
        client.connectWebSocket();
        
        // Search for books
        const results = await client.searchBooks('Foundation Isaac Asimov', {
            formats: 'epub,pdf',
            limit: 20
        });
        
        console.log(`Found ${results.total_results} results`);
        
        // Add first result to download queue
        if (results.results.length > 0) {
            const firstResult = results.results[0];
            const download = await client.addDownload({
                title: firstResult.title,
                author_name: firstResult.author,
                download_url: firstResult.download_url,
                file_format: firstResult.format,
                indexer_id: firstResult.indexer_id,
                priority: 5
            });
            
            console.log(`Added download: ${download.id}`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
```

## Troubleshooting

### Common Issues

#### Authentication Problems

**Issue**: 401 Unauthorized errors
**Solutions**:
- Verify username and password
- Check token expiration
- Ensure Bearer token format in Authorization header
- Refresh token if expired

#### Rate Limiting

**Issue**: 429 Too Many Requests
**Solutions**:
- Check rate limit headers
- Implement exponential backoff
- Reduce request frequency
- Use WebSocket for real-time updates instead of polling

#### Search Issues

**Issue**: No search results or poor quality results
**Solutions**:
- Check indexer health status
- Verify indexer configuration
- Test individual indexers
- Check search query formatting
- Review indexer-specific limitations

#### Download Failures

**Issue**: Downloads failing or stuck
**Solutions**:
- Check download URL validity
- Verify torrent client configuration
- Monitor system resources
- Check network connectivity
- Review download logs

#### WebSocket Connection Problems

**Issue**: WebSocket disconnections or authentication failures
**Solutions**:
- Check WebSocket URL format
- Verify JWT token validity
- Implement reconnection logic
- Monitor network stability
- Check firewall/proxy settings

### Debug Logging

Enable debug logging by setting environment variables:

```bash
export FOLIOFOX_LOG_LEVEL=DEBUG
export FOLIOFOX_LOG_FORMAT=json
```

### Health Monitoring

Monitor system health using the health endpoints:

```bash
# Basic health check
curl http://localhost:8080/api/v1/system/health

# Detailed health information
curl -H "Authorization: Bearer <token>" \
     http://localhost:8080/api/v1/system/health/detailed

# Indexer health
curl -H "Authorization: Bearer <token>" \
     http://localhost:8080/api/v1/system/health/indexers
```

### Performance Monitoring

Monitor API performance using metrics endpoints:

```bash
# System metrics
curl -H "Authorization: Bearer <token>" \
     http://localhost:8080/api/v1/system/metrics

# Download metrics
curl -H "Authorization: Bearer <token>" \
     http://localhost:8080/api/v1/system/metrics/downloads

# Search metrics
curl -H "Authorization: Bearer <token>" \
     http://localhost:8080/api/v1/system/metrics/search
```

### Support and Community

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Comprehensive API documentation
- **Community Forum**: Ask questions and share experiences
- **Discord/Matrix**: Real-time community support

---

This integration guide provides comprehensive coverage of FolioFox APIs. For the most up-to-date information, always refer to the OpenAPI specifications and the official documentation.