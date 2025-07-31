package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// SQLiteBookRepository implements BookRepository using SQLite
type SQLiteBookRepository struct {
	db *sql.DB
}

// NewBookRepository creates a new SQLite-based book repository
func NewBookRepository(db *sql.DB) BookRepository {
	return &SQLiteBookRepository{
		db: db,
	}
}

// Create creates a new book
func (r *SQLiteBookRepository) Create(ctx context.Context, book *models.Book) error {
	query := `
		INSERT INTO books (
			title, subtitle, description, isbn_10, isbn_13, asin, goodreads_id, google_books_id,
			publication_date, page_count, language_id, publisher_id, series_id, series_position,
			rating_average, rating_count, tags, cover_url, cover_local_path,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`

	result, err := r.db.ExecContext(ctx, query,
		book.Title, book.Subtitle, book.Description, book.ISBN10, book.ISBN13,
		book.ASIN, book.GoodreadsID, book.GoogleBooksID, book.PublicationDate,
		book.PageCount, book.LanguageID, book.PublisherID, book.SeriesID,
		book.SeriesPosition, book.RatingAverage, book.RatingCount, book.Tags,
		book.CoverURL, book.CoverLocalPath)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	book.ID = id
	return nil
}

// GetByID retrieves a book by ID
func (r *SQLiteBookRepository) GetByID(ctx context.Context, id int64) (*models.Book, error) {
	query := `
		SELECT id, title, subtitle, description, isbn_10, isbn_13, asin, goodreads_id, google_books_id,
			   publication_date, page_count, language_id, publisher_id, series_id, series_position,
			   rating_average, rating_count, tags, cover_url, cover_local_path, created_at, updated_at
		FROM books WHERE id = ?
	`

	book := &models.Book{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&book.ID, &book.Title, &book.Subtitle, &book.Description,
		&book.ISBN10, &book.ISBN13, &book.ASIN, &book.GoodreadsID, &book.GoogleBooksID,
		&book.PublicationDate, &book.PageCount, &book.LanguageID, &book.PublisherID,
		&book.SeriesID, &book.SeriesPosition, &book.RatingAverage, &book.RatingCount,
		&book.Tags, &book.CoverURL, &book.CoverLocalPath, &book.CreatedAt, &book.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return book, nil
}

// GetByISBN retrieves a book by ISBN (10 or 13)
func (r *SQLiteBookRepository) GetByISBN(ctx context.Context, isbn string) (*models.Book, error) {
	query := `
		SELECT id, title, subtitle, description, isbn_10, isbn_13, asin, goodreads_id, google_books_id,
			   publication_date, page_count, language_id, publisher_id, series_id, series_position,
			   rating_average, rating_count, tags, cover_url, cover_local_path, created_at, updated_at
		FROM books WHERE isbn_10 = ? OR isbn_13 = ?
	`

	book := &models.Book{}
	err := r.db.QueryRowContext(ctx, query, isbn, isbn).Scan(
		&book.ID, &book.Title, &book.Subtitle, &book.Description,
		&book.ISBN10, &book.ISBN13, &book.ASIN, &book.GoodreadsID, &book.GoogleBooksID,
		&book.PublicationDate, &book.PageCount, &book.LanguageID, &book.PublisherID,
		&book.SeriesID, &book.SeriesPosition, &book.RatingAverage, &book.RatingCount,
		&book.Tags, &book.CoverURL, &book.CoverLocalPath, &book.CreatedAt, &book.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return book, nil
}

// Update updates an existing book
func (r *SQLiteBookRepository) Update(ctx context.Context, book *models.Book) error {
	query := `
		UPDATE books SET
			title = ?, subtitle = ?, description = ?, isbn_10 = ?, isbn_13 = ?,
			asin = ?, goodreads_id = ?, google_books_id = ?, publication_date = ?,
			page_count = ?, language_id = ?, publisher_id = ?, series_id = ?,
			series_position = ?, rating_average = ?, rating_count = ?, tags = ?,
			cover_url = ?, cover_local_path = ?, updated_at = datetime('now')
		WHERE id = ?
	`

	_, err := r.db.ExecContext(ctx, query,
		book.Title, book.Subtitle, book.Description, book.ISBN10, book.ISBN13,
		book.ASIN, book.GoodreadsID, book.GoogleBooksID, book.PublicationDate,
		book.PageCount, book.LanguageID, book.PublisherID, book.SeriesID,
		book.SeriesPosition, book.RatingAverage, book.RatingCount, book.Tags,
		book.CoverURL, book.CoverLocalPath, book.ID)
	return err
}

// Delete deletes a book by ID
func (r *SQLiteBookRepository) Delete(ctx context.Context, id int64) error {
	query := `DELETE FROM books WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// List retrieves a list of books with filtering and pagination
func (r *SQLiteBookRepository) List(ctx context.Context, filters *BookFilters) ([]*models.Book, int, error) {
	// Build the query with filters
	baseQuery := `
		SELECT DISTINCT b.id, b.title, b.subtitle, b.description, b.isbn_10, b.isbn_13, b.asin,
			   b.goodreads_id, b.google_books_id, b.publication_date, b.page_count,
			   b.language_id, b.publisher_id, b.series_id, b.series_position,
			   b.rating_average, b.rating_count, b.tags, b.cover_url, b.cover_local_path,
			   b.created_at, b.updated_at
		FROM books b
	`

	countQuery := `SELECT COUNT(DISTINCT b.id) FROM books b`

	var conditions []string
	var args []interface{}

	// Build WHERE conditions
	if filters.AuthorID != nil {
		baseQuery += ` LEFT JOIN book_authors ba ON b.id = ba.book_id`
		countQuery += ` LEFT JOIN book_authors ba ON b.id = ba.book_id`
		conditions = append(conditions, "ba.author_id = ?")
		args = append(args, *filters.AuthorID)
	}

	if filters.SeriesID != nil {
		conditions = append(conditions, "b.series_id = ?")
		args = append(args, *filters.SeriesID)
	}

	if filters.GenreID != nil {
		baseQuery += ` LEFT JOIN book_genres bg ON b.id = bg.book_id`
		countQuery += ` LEFT JOIN book_genres bg ON b.id = bg.book_id`
		conditions = append(conditions, "bg.genre_id = ?")
		args = append(args, *filters.GenreID)
	}

	if filters.LanguageID != nil {
		conditions = append(conditions, "b.language_id = ?")
		args = append(args, *filters.LanguageID)
	}

	if filters.PublisherID != nil {
		conditions = append(conditions, "b.publisher_id = ?")
		args = append(args, *filters.PublisherID)
	}

	if filters.RatingMin != nil {
		conditions = append(conditions, "b.rating_average >= ?")
		args = append(args, *filters.RatingMin)
	}

	if filters.RatingMax != nil {
		conditions = append(conditions, "b.rating_average <= ?")
		args = append(args, *filters.RatingMax)
	}

	if filters.PublicationYearMin != nil {
		conditions = append(conditions, "strftime('%Y', b.publication_date) >= ?")
		args = append(args, fmt.Sprintf("%04d", *filters.PublicationYearMin))
	}

	if filters.PublicationYearMax != nil {
		conditions = append(conditions, "strftime('%Y', b.publication_date) <= ?")
		args = append(args, fmt.Sprintf("%04d", *filters.PublicationYearMax))
	}

	// Add WHERE clause if conditions exist
	if len(conditions) > 0 {
		whereClause := " WHERE " + strings.Join(conditions, " AND ")
		baseQuery += whereClause
		countQuery += whereClause
	}

	// Get total count
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Add sorting
	sortBy := "b.created_at"
	sortOrder := "DESC"
	if filters.SortBy != "" {
		sortBy = "b." + filters.SortBy
	}
	if filters.SortOrder != "" {
		sortOrder = strings.ToUpper(filters.SortOrder)
	}

	baseQuery += fmt.Sprintf(" ORDER BY %s %s", sortBy, sortOrder)

	// Add pagination
	baseQuery += " LIMIT ? OFFSET ?"
	args = append(args, filters.Limit, filters.Offset)

	// Execute query
	rows, err := r.db.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var books []*models.Book
	for rows.Next() {
		book := &models.Book{}
		err := rows.Scan(
			&book.ID, &book.Title, &book.Subtitle, &book.Description,
			&book.ISBN10, &book.ISBN13, &book.ASIN, &book.GoodreadsID, &book.GoogleBooksID,
			&book.PublicationDate, &book.PageCount, &book.LanguageID, &book.PublisherID,
			&book.SeriesID, &book.SeriesPosition, &book.RatingAverage, &book.RatingCount,
			&book.Tags, &book.CoverURL, &book.CoverLocalPath, &book.CreatedAt, &book.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		books = append(books, book)
	}

	return books, total, rows.Err()
}

// Search searches books using full-text search
func (r *SQLiteBookRepository) Search(ctx context.Context, query string, filters *BookFilters) ([]*models.Book, int, error) {
	// Use FTS5 for full-text search
	baseQuery := `
		SELECT DISTINCT b.id, b.title, b.subtitle, b.description, b.isbn_10, b.isbn_13, b.asin,
			   b.goodreads_id, b.google_books_id, b.publication_date, b.page_count,
			   b.language_id, b.publisher_id, b.series_id, b.series_position,
			   b.rating_average, b.rating_count, b.tags, b.cover_url, b.cover_local_path,
			   b.created_at, b.updated_at
		FROM books b
		JOIN books_fts fts ON b.id = fts.rowid
		WHERE books_fts MATCH ?
	`

	countQuery := `
		SELECT COUNT(DISTINCT b.id)
		FROM books b
		JOIN books_fts fts ON b.id = fts.rowid
		WHERE books_fts MATCH ?
	`

	args := []interface{}{query}

	// Add additional filters (similar to List method)
	var conditions []string

	if filters.SeriesID != nil {
		conditions = append(conditions, "b.series_id = ?")
		args = append(args, *filters.SeriesID)
	}

	if filters.LanguageID != nil {
		conditions = append(conditions, "b.language_id = ?")
		args = append(args, *filters.LanguageID)
	}

	if filters.PublisherID != nil {
		conditions = append(conditions, "b.publisher_id = ?")
		args = append(args, *filters.PublisherID)
	}

	if len(conditions) > 0 {
		additionalWhere := " AND " + strings.Join(conditions, " AND ")
		baseQuery += additionalWhere
		countQuery += additionalWhere
	}

	// Get total count
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Add sorting and pagination
	baseQuery += " ORDER BY b.rating_average DESC, b.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, filters.Limit, filters.Offset)

	// Execute query
	rows, err := r.db.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var books []*models.Book
	for rows.Next() {
		book := &models.Book{}
		err := rows.Scan(
			&book.ID, &book.Title, &book.Subtitle, &book.Description,
			&book.ISBN10, &book.ISBN13, &book.ASIN, &book.GoodreadsID, &book.GoogleBooksID,
			&book.PublicationDate, &book.PageCount, &book.LanguageID, &book.PublisherID,
			&book.SeriesID, &book.SeriesPosition, &book.RatingAverage, &book.RatingCount,
			&book.Tags, &book.CoverURL, &book.CoverLocalPath, &book.CreatedAt, &book.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		books = append(books, book)
	}

	return books, total, rows.Err()
}

// GetAuthors retrieves authors for a book
func (r *SQLiteBookRepository) GetAuthors(ctx context.Context, bookID int64) ([]*models.Author, error) {
	query := `
		SELECT a.id, a.name, a.sort_name, a.biography, a.birth_date, a.death_date,
			   a.website, a.goodreads_id, a.created_at, a.updated_at, ba.role
		FROM authors a
		JOIN book_authors ba ON a.id = ba.author_id
		WHERE ba.book_id = ?
		ORDER BY ba.role, a.name
	`

	rows, err := r.db.QueryContext(ctx, query, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var authors []*models.Author
	for rows.Next() {
		author := &models.Author{}
		err := rows.Scan(
			&author.ID, &author.Name, &author.SortName, &author.Biography,
			&author.BirthDate, &author.DeathDate, &author.Website, &author.GoodreadsID,
			&author.CreatedAt, &author.UpdatedAt, &author.Role,
		)
		if err != nil {
			return nil, err
		}
		authors = append(authors, author)
	}

	return authors, rows.Err()
}

// GetGenres retrieves genres for a book
func (r *SQLiteBookRepository) GetGenres(ctx context.Context, bookID int64) ([]*models.Genre, error) {
	query := `
		SELECT g.id, g.name, g.parent_id, g.description, g.created_at
		FROM genres g
		JOIN book_genres bg ON g.id = bg.genre_id
		WHERE bg.book_id = ?
		ORDER BY g.name
	`

	rows, err := r.db.QueryContext(ctx, query, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var genres []*models.Genre
	for rows.Next() {
		genre := &models.Genre{}
		err := rows.Scan(
			&genre.ID, &genre.Name, &genre.ParentID, &genre.Description, &genre.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		genres = append(genres, genre)
	}

	return genres, rows.Err()
}

// GetFiles retrieves files for a book
func (r *SQLiteBookRepository) GetFiles(ctx context.Context, bookID int64) ([]*models.BookFile, error) {
	query := `
		SELECT bf.id, bf.book_id, bf.format_id, bf.file_path, bf.file_size_bytes,
			   bf.quality_score, bf.source_url, bf.download_date, bf.checksum,
			   bf.is_primary, bf.created_at
		FROM book_files bf
		WHERE bf.book_id = ?
		ORDER BY bf.is_primary DESC, bf.quality_score DESC
	`

	rows, err := r.db.QueryContext(ctx, query, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []*models.BookFile
	for rows.Next() {
		file := &models.BookFile{}
		err := rows.Scan(
			&file.ID, &file.BookID, &file.FormatID, &file.FilePath, &file.FileSizeBytes,
			&file.QualityScore, &file.SourceURL, &file.DownloadDate, &file.Checksum,
			&file.IsPrimary, &file.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		files = append(files, file)
	}

	return files, rows.Err()
}

// AddAuthor adds an author to a book
func (r *SQLiteBookRepository) AddAuthor(ctx context.Context, bookID, authorID int64, role string) error {
	query := `INSERT INTO book_authors (book_id, author_id, role) VALUES (?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, bookID, authorID, role)
	return err
}

// RemoveAuthor removes an author from a book
func (r *SQLiteBookRepository) RemoveAuthor(ctx context.Context, bookID, authorID int64) error {
	query := `DELETE FROM book_authors WHERE book_id = ? AND author_id = ?`
	_, err := r.db.ExecContext(ctx, query, bookID, authorID)
	return err
}

// AddGenre adds a genre to a book
func (r *SQLiteBookRepository) AddGenre(ctx context.Context, bookID, genreID int64) error {
	query := `INSERT INTO book_genres (book_id, genre_id) VALUES (?, ?)`
	_, err := r.db.ExecContext(ctx, query, bookID, genreID)
	return err
}

// RemoveGenre removes a genre from a book
func (r *SQLiteBookRepository) RemoveGenre(ctx context.Context, bookID, genreID int64) error {
	query := `DELETE FROM book_genres WHERE book_id = ? AND genre_id = ?`
	_, err := r.db.ExecContext(ctx, query, bookID, genreID)
	return err
}

// GetTotalCount returns the total number of books in the library
func (r *SQLiteBookRepository) GetTotalCount(ctx context.Context) (int, error) {
	query := `SELECT COUNT(*) FROM books`
	
	var count int
	err := r.db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return 0, err
	}
	
	return count, nil
}