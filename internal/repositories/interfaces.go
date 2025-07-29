package repositories

import (
	"context"
	"time"

	"github.com/foliofox/foliofox/internal/models"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	GetByID(ctx context.Context, id int64) (*models.User, error)
	GetByUsername(ctx context.Context, username string) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	Update(ctx context.Context, user *models.User) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, limit, offset int) ([]*models.User, error)
	UpdateLastLogin(ctx context.Context, id int64, loginTime time.Time) error
}

// BookRepository defines the interface for book data operations
type BookRepository interface {
	Create(ctx context.Context, book *models.Book) error
	GetByID(ctx context.Context, id int64) (*models.Book, error)
	GetByISBN(ctx context.Context, isbn string) (*models.Book, error)
	Update(ctx context.Context, book *models.Book) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, filters *BookFilters) ([]*models.Book, int, error)
	Search(ctx context.Context, query string, filters *BookFilters) ([]*models.Book, int, error)
	GetAuthors(ctx context.Context, bookID int64) ([]*models.Author, error)
	GetGenres(ctx context.Context, bookID int64) ([]*models.Genre, error)
	GetFiles(ctx context.Context, bookID int64) ([]*models.BookFile, error)
	AddAuthor(ctx context.Context, bookID, authorID int64, role string) error
	RemoveAuthor(ctx context.Context, bookID, authorID int64) error
	AddGenre(ctx context.Context, bookID, genreID int64) error
	RemoveGenre(ctx context.Context, bookID, genreID int64) error
}

// BookFilters represents filters for book queries
type BookFilters struct {
	AuthorID        *int64
	SeriesID        *int64
	GenreID         *int64
	LanguageID      *int64
	PublisherID     *int64
	Format          *string
	RatingMin       *float64
	RatingMax       *float64
	PublicationYearMin *int
	PublicationYearMax *int
	IncludeFiles    bool
	SortBy          string
	SortOrder       string
	Limit           int
	Offset          int
}

// AuthorRepository defines the interface for author data operations
type AuthorRepository interface {
	Create(ctx context.Context, author *models.Author) error
	GetByID(ctx context.Context, id int64) (*models.Author, error)
	GetByName(ctx context.Context, name string) (*models.Author, error)
	Update(ctx context.Context, author *models.Author) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, limit, offset int) ([]*models.Author, error)
	Search(ctx context.Context, query string, limit int) ([]*models.Author, error)
}

// PublisherRepository defines the interface for publisher data operations
type PublisherRepository interface {
	Create(ctx context.Context, publisher *models.Publisher) error
	GetByID(ctx context.Context, id int64) (*models.Publisher, error)
	GetByName(ctx context.Context, name string) (*models.Publisher, error)
	Update(ctx context.Context, publisher *models.Publisher) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, limit, offset int) ([]*models.Publisher, error)
	Search(ctx context.Context, query string, limit int) ([]*models.Publisher, error)
}

// SeriesRepository defines the interface for series data operations
type SeriesRepository interface {
	Create(ctx context.Context, series *models.Series) error
	GetByID(ctx context.Context, id int64) (*models.Series, error)
	GetByName(ctx context.Context, name string) (*models.Series, error)
	Update(ctx context.Context, series *models.Series) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, limit, offset int) ([]*models.Series, error)
	Search(ctx context.Context, query string, limit int) ([]*models.Series, error)
}

// GenreRepository defines the interface for genre data operations
type GenreRepository interface {
	Create(ctx context.Context, genre *models.Genre) error
	GetByID(ctx context.Context, id int64) (*models.Genre, error)
	GetByName(ctx context.Context, name string) (*models.Genre, error)
	Update(ctx context.Context, genre *models.Genre) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, limit, offset int) ([]*models.Genre, error)
	GetChildren(ctx context.Context, parentID int64) ([]*models.Genre, error)
}

// IndexerRepository defines the interface for indexer data operations
type IndexerRepository interface {
	Create(ctx context.Context, indexer *models.Indexer) error
	GetByID(ctx context.Context, id int64) (*models.Indexer, error)
	GetByName(ctx context.Context, name string) (*models.Indexer, error)
	Update(ctx context.Context, indexer *models.Indexer) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, activeOnly bool) ([]*models.Indexer, error)
	GetUserConfig(ctx context.Context, userID, indexerID int64) (*models.UserIndexerConfig, error)
	UpdateUserConfig(ctx context.Context, config *models.UserIndexerConfig) error
	GetUserEnabledIndexers(ctx context.Context, userID int64) ([]*models.Indexer, error)
	RecordHealthCheck(ctx context.Context, health *models.IndexerHealth) error
	GetLatestHealth(ctx context.Context, indexerID int64) (*models.IndexerHealth, error)
}

// DownloadRepository defines the interface for download queue operations
type DownloadRepository interface {
	CreateQueueItem(ctx context.Context, item *models.DownloadQueueItem) error
	GetQueueItemByID(ctx context.Context, id int64) (*models.DownloadQueueItem, error)
	UpdateQueueItem(ctx context.Context, item *models.DownloadQueueItem) error
	DeleteQueueItem(ctx context.Context, id int64) error
	ListQueueItems(ctx context.Context, filters *DownloadQueueFilters) ([]*models.DownloadQueueItem, int, error)
	GetNextPendingItem(ctx context.Context, userID int64) (*models.DownloadQueueItem, error)
	GetActiveDownloads(ctx context.Context, userID int64) ([]*models.DownloadQueueItem, error)
	UpdateProgress(ctx context.Context, id int64, progress int, bytesDownloaded int64) error
	SetStatus(ctx context.Context, id int64, status models.DownloadStatus, errorMessage *string) error
	CompleteDownload(ctx context.Context, id int64, finalPath string) error
	CreateHistoryItem(ctx context.Context, item *models.DownloadHistoryItem) error
	ListHistoryItems(ctx context.Context, filters *DownloadHistoryFilters) ([]*models.DownloadHistoryItem, int, error)
	GetDownloadStats(ctx context.Context, userID *int64, period string) (*models.DownloadStats, error)
}

// DownloadQueueFilters represents filters for download queue queries
type DownloadQueueFilters struct {
	UserID       *int64
	Status       *models.DownloadStatus
	IndexerID    *int64
	PriorityMin  *int
	PriorityMax  *int
	CreatedAfter *time.Time
	CreatedBefore *time.Time
	SortBy       string
	SortOrder    string
	Limit        int
	Offset       int
}

// DownloadHistoryFilters represents filters for download history queries
type DownloadHistoryFilters struct {
	UserID      *int64
	Status      *string
	IndexerID   *int64
	DateFrom    *time.Time
	DateTo      *time.Time
	SortBy      string
	SortOrder   string
	Limit       int
	Offset      int
}

// SearchRepository defines the interface for search-related operations
type SearchRepository interface {
	CreateHistoryEntry(ctx context.Context, entry *models.SearchHistoryEntry) error
	GetUserSearchHistory(ctx context.Context, userID int64, limit int, days int) ([]*models.SearchHistoryEntry, error)
	DeleteUserSearchHistory(ctx context.Context, userID int64, olderThanDays *int) error
	CacheSearchResults(ctx context.Context, queryHash string, results *models.SearchResponse, ttlMinutes int) error
	GetCachedSearchResults(ctx context.Context, queryHash string) (*models.SearchResponse, error)
	DeleteExpiredCache(ctx context.Context) error
}

// UserPreferencesRepository defines the interface for user preferences operations
type UserPreferencesRepository interface {
	GetByUserID(ctx context.Context, userID int64) (*models.UserPreferences, error)
	CreateOrUpdate(ctx context.Context, preferences *models.UserPreferences) error
	GetDownloadFolders(ctx context.Context, userID int64) ([]*models.DownloadFolder, error)
	CreateDownloadFolder(ctx context.Context, folder *models.DownloadFolder) error
	UpdateDownloadFolder(ctx context.Context, folder *models.DownloadFolder) error
	DeleteDownloadFolder(ctx context.Context, id int64) error
	GetQualityProfiles(ctx context.Context, userID int64) ([]*models.QualityProfile, error)
	CreateQualityProfile(ctx context.Context, profile *models.QualityProfile) error
	UpdateQualityProfile(ctx context.Context, profile *models.QualityProfile) error
	DeleteQualityProfile(ctx context.Context, id int64) error
}

// BookFileRepository defines the interface for book file operations
type BookFileRepository interface {
	Create(ctx context.Context, file *models.BookFile) error
	GetByID(ctx context.Context, id int64) (*models.BookFile, error)
	GetByBookID(ctx context.Context, bookID int64) ([]*models.BookFile, error)
	Update(ctx context.Context, file *models.BookFile) error
	Delete(ctx context.Context, id int64) error
	SetPrimary(ctx context.Context, fileID int64, bookID int64) error
}

// SystemRepository defines the interface for system-level operations
type SystemRepository interface {
	GetAppSettings(ctx context.Context) (map[string]string, error)
	SetAppSetting(ctx context.Context, key, value string) error
	RecordLog(ctx context.Context, level, component, message string, details map[string]interface{}, userID *int64) error
	GetLogs(ctx context.Context, filters *LogFilters) ([]*LogEntry, error)
	CleanupOldLogs(ctx context.Context, olderThanDays int) error
}

// LogFilters represents filters for log queries
type LogFilters struct {
	Level     *string
	Component *string
	UserID    *int64
	Since     *time.Time
	Until     *time.Time
	Limit     int
	Offset    int
}

// LogEntry represents a log entry
type LogEntry struct {
	ID        int64                  `json:"id"`
	Level     string                 `json:"level"`
	Component string                 `json:"component"`
	Message   string                 `json:"message"`
	Details   map[string]interface{} `json:"details,omitempty"`
	UserID    *int64                 `json:"user_id,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
}