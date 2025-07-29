package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// Book represents a book in the library
type Book struct {
	ID              int64      `json:"id" db:"id"`
	Title           string     `json:"title" db:"title"`
	Subtitle        *string    `json:"subtitle,omitempty" db:"subtitle"`
	Description     *string    `json:"description,omitempty" db:"description"`
	ISBN10          *string    `json:"isbn_10,omitempty" db:"isbn_10"`
	ISBN13          *string    `json:"isbn_13,omitempty" db:"isbn_13"`
	ASIN            *string    `json:"asin,omitempty" db:"asin"`
	GoodreadsID     *string    `json:"goodreads_id,omitempty" db:"goodreads_id"`
	GoogleBooksID   *string    `json:"google_books_id,omitempty" db:"google_books_id"`
	PublicationDate *time.Time `json:"publication_date,omitempty" db:"publication_date"`
	PageCount       *int       `json:"page_count,omitempty" db:"page_count"`
	LanguageID      *int64     `json:"language_id,omitempty" db:"language_id"`
	PublisherID     *int64     `json:"publisher_id,omitempty" db:"publisher_id"`
	SeriesID        *int64     `json:"series_id,omitempty" db:"series_id"`
	SeriesPosition  *float64   `json:"series_position,omitempty" db:"series_position"`
	RatingAverage   *float64   `json:"rating_average,omitempty" db:"rating_average"`
	RatingCount     int        `json:"rating_count" db:"rating_count"`
	Tags            StringList `json:"tags" db:"tags"`
	CoverURL        *string    `json:"cover_url,omitempty" db:"cover_url"`
	CoverLocalPath  *string    `json:"cover_local_path,omitempty" db:"cover_local_path"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`

	// Relationships (loaded separately)
	Language  *Language  `json:"language,omitempty"`
	Publisher *Publisher `json:"publisher,omitempty"`
	Series    *Series    `json:"series,omitempty"`
	Authors   []Author   `json:"authors,omitempty"`
	Genres    []Genre    `json:"genres,omitempty"`
	Files     []BookFile `json:"files,omitempty"`
}

// BookFile represents a file associated with a book
type BookFile struct {
	ID           int64     `json:"id" db:"id"`
	BookID       int64     `json:"book_id" db:"book_id"`
	FormatID     int64     `json:"format_id" db:"format_id"`
	FilePath     *string   `json:"file_path,omitempty" db:"file_path"`
	FileSizeBytes *int64   `json:"file_size_bytes,omitempty" db:"file_size_bytes"`
	QualityScore int       `json:"quality_score" db:"quality_score"`
	SourceURL    *string   `json:"source_url,omitempty" db:"source_url"`
	DownloadDate *time.Time `json:"download_date,omitempty" db:"download_date"`
	Checksum     *string   `json:"checksum,omitempty" db:"checksum"`
	IsPrimary    bool      `json:"is_primary" db:"is_primary"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`

	// Relationships
	Format *BookFormat `json:"format,omitempty"`
}

// BookFormat represents a book file format
type BookFormat struct {
	ID          int64   `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description,omitempty" db:"description"`
	MimeType    *string `json:"mime_type,omitempty" db:"mime_type"`
	IsSupported bool    `json:"is_supported" db:"is_supported"`
}

// Author represents a book author
type Author struct {
	ID          int64      `json:"id" db:"id"`
	Name        string     `json:"name" db:"name"`
	SortName    *string    `json:"sort_name,omitempty" db:"sort_name"`
	Biography   *string    `json:"biography,omitempty" db:"biography"`
	BirthDate   *time.Time `json:"birth_date,omitempty" db:"birth_date"`
	DeathDate   *time.Time `json:"death_date,omitempty" db:"death_date"`
	Website     *string    `json:"website,omitempty" db:"website"`
	GoodreadsID *string    `json:"goodreads_id,omitempty" db:"goodreads_id"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`

	// For book-author relationships
	Role *string `json:"role,omitempty"`
}

// Publisher represents a book publisher
type Publisher struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Website     *string   `json:"website,omitempty" db:"website"`
	Country     *string   `json:"country,omitempty" db:"country"`
	FoundedYear *int      `json:"founded_year,omitempty" db:"founded_year"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Series represents a book series
type Series struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description *string   `json:"description,omitempty" db:"description"`
	TotalBooks  *int      `json:"total_books,omitempty" db:"total_books"`
	IsCompleted bool      `json:"is_completed" db:"is_completed"`
	GoodreadsID *string   `json:"goodreads_id,omitempty" db:"goodreads_id"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Genre represents a book genre/category
type Genre struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	ParentID    *int64    `json:"parent_id,omitempty" db:"parent_id"`
	Description *string   `json:"description,omitempty" db:"description"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// Language represents a language
type Language struct {
	ID         int64  `json:"id" db:"id"`
	Code       string `json:"code" db:"code"`
	Name       string `json:"name" db:"name"`
	NativeName *string `json:"native_name,omitempty" db:"native_name"`
}

// StringList is a custom type for handling JSON arrays in SQLite
type StringList []string

// Scan implements the sql.Scanner interface
func (s *StringList) Scan(value interface{}) error {
	if value == nil {
		*s = StringList{}
		return nil
	}

	switch v := value.(type) {
	case string:
		if v == "" {
			*s = StringList{}
			return nil
		}
		return json.Unmarshal([]byte(v), s)
	case []byte:
		if len(v) == 0 {
			*s = StringList{}
			return nil
		}
		return json.Unmarshal(v, s)
	default:
		return fmt.Errorf("cannot scan %T into StringList", value)
	}
}

// Value implements the driver.Valuer interface
func (s StringList) Value() (driver.Value, error) {
	if len(s) == 0 {
		return "[]", nil
	}
	bytes, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	return string(bytes), nil
}

// BookCreateRequest represents the request to create a new book
type BookCreateRequest struct {
	Title           string     `json:"title" binding:"required"`
	Subtitle        *string    `json:"subtitle,omitempty"`
	Description     *string    `json:"description,omitempty"`
	ISBN10          *string    `json:"isbn_10,omitempty"`
	ISBN13          *string    `json:"isbn_13,omitempty"`
	ASIN            *string    `json:"asin,omitempty"`
	GoodreadsID     *string    `json:"goodreads_id,omitempty"`
	GoogleBooksID   *string    `json:"google_books_id,omitempty"`
	PublicationDate *time.Time `json:"publication_date,omitempty"`
	PageCount       *int       `json:"page_count,omitempty"`
	LanguageID      *int64     `json:"language_id,omitempty"`
	PublisherID     *int64     `json:"publisher_id,omitempty"`
	SeriesID        *int64     `json:"series_id,omitempty"`
	SeriesPosition  *float64   `json:"series_position,omitempty"`
	AuthorIDs       []int64    `json:"author_ids,omitempty"`
	GenreIDs        []int64    `json:"genre_ids,omitempty"`
	Tags            []string   `json:"tags,omitempty"`
	CoverURL        *string    `json:"cover_url,omitempty"`
}

// BookUpdateRequest represents the request to update a book
type BookUpdateRequest struct {
	Title           *string    `json:"title,omitempty"`
	Subtitle        *string    `json:"subtitle,omitempty"`
	Description     *string    `json:"description,omitempty"`
	ISBN10          *string    `json:"isbn_10,omitempty"`
	ISBN13          *string    `json:"isbn_13,omitempty"`
	ASIN            *string    `json:"asin,omitempty"`
	GoodreadsID     *string    `json:"goodreads_id,omitempty"`
	GoogleBooksID   *string    `json:"google_books_id,omitempty"`
	PublicationDate *time.Time `json:"publication_date,omitempty"`
	PageCount       *int       `json:"page_count,omitempty"`
	LanguageID      *int64     `json:"language_id,omitempty"`
	PublisherID     *int64     `json:"publisher_id,omitempty"`
	SeriesID        *int64     `json:"series_id,omitempty"`
	SeriesPosition  *float64   `json:"series_position,omitempty"`
	AuthorIDs       []int64    `json:"author_ids,omitempty"`
	GenreIDs        []int64    `json:"genre_ids,omitempty"`
	Tags            []string   `json:"tags,omitempty"`
	CoverURL        *string    `json:"cover_url,omitempty"`
	RatingAverage   *float64   `json:"rating_average,omitempty"`
	RatingCount     *int       `json:"rating_count,omitempty"`
}