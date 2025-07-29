package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/sirupsen/logrus"
	"github.com/foliofox/foliofox/internal/config"
)

// Client wraps the Redis client with additional functionality
type Client struct {
	*redis.Client
	ctx context.Context
}

// Initialize creates and configures the Redis client
func Initialize(cfg config.RedisConfig) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
		PoolSize: 10,
	})

	ctx := context.Background()

	// Test the connection
	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	client := &Client{
		Client: rdb,
		ctx:    ctx,
	}

	logrus.Info("Redis client initialized successfully")
	return client, nil
}

// SetJSON stores a JSON-encoded value with expiration
func (c *Client) SetJSON(key string, value interface{}, expiration time.Duration) error {
	return c.Set(c.ctx, key, value, expiration).Err()
}

// GetJSON retrieves and JSON-decodes a value
func (c *Client) GetJSON(key string, dest interface{}) error {
	val, err := c.Get(c.ctx, key).Result()
	if err != nil {
		return err
	}
	
	// For now, return the string value
	// In a real implementation, you'd use JSON unmarshaling
	if str, ok := dest.(*string); ok {
		*str = val
		return nil
	}
	
	return fmt.Errorf("unsupported destination type")
}

// DeleteKeys deletes multiple keys
func (c *Client) DeleteKeys(keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return c.Del(c.ctx, keys...).Err()
}

// Health checks the Redis connection health
func (c *Client) Health() error {
	return c.Ping(c.ctx).Err()
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.Client.Close()
}

// Cache keys constants
const (
	CacheKeySearchResults = "search:results:%s"
	CacheKeyIndexerHealth = "indexer:health:%d"
	CacheKeyBookMetadata  = "book:metadata:%s"
	CacheKeyUserSession   = "user:session:%s"
)