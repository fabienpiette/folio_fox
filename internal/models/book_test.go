package models

import (
	"database/sql/driver"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStringList_Scan(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected StringList
		wantErr  bool
	}{
		{
			name:     "nil value",
			input:    nil,
			expected: StringList{},
			wantErr:  false,
		},
		{
			name:     "empty string",
			input:    "",
			expected: StringList{},
			wantErr:  false,
		},
		{
			name:     "empty byte slice",
			input:    []byte{},
			expected: StringList{},
			wantErr:  false,
		},
		{
			name:     "valid JSON string",
			input:    `["tag1", "tag2", "tag3"]`,
			expected: StringList{"tag1", "tag2", "tag3"},
			wantErr:  false,
		},
		{
			name:     "valid JSON byte slice",
			input:    []byte(`["fiction", "mystery"]`),
			expected: StringList{"fiction", "mystery"},
			wantErr:  false,
		},
		{
			name:     "single item JSON",
			input:    `["single"]`,
			expected: StringList{"single"},
			wantErr:  false,
		},
		{
			name:     "empty array JSON",
			input:    `[]`,
			expected: StringList{},
			wantErr:  false,
		},
		{
			name:    "invalid JSON string",
			input:   `["invalid json`,
			wantErr: true,
		},
		{
			name:    "invalid JSON byte slice",
			input:   []byte(`invalid`),
			wantErr: true,
		},
		{
			name:    "unsupported type",
			input:   123,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var sl StringList
			err := sl.Scan(tt.input)

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, sl)
			}
		})
	}
}

func TestStringList_Value(t *testing.T) {
	tests := []struct {
		name     string
		input    StringList
		expected string
		wantErr  bool
	}{
		{
			name:     "empty slice",
			input:    StringList{},
			expected: "[]",
			wantErr:  false,
		},
		{
			name:     "nil slice",
			input:    nil,
			expected: "[]",
			wantErr:  false,
		},
		{
			name:     "single item",
			input:    StringList{"tag1"},
			expected: `["tag1"]`,
			wantErr:  false,
		},
		{
			name:     "multiple items",
			input:    StringList{"fiction", "mystery", "thriller"},
			expected: `["fiction","mystery","thriller"]`,
			wantErr:  false,
		},
		{
			name:     "items with special characters",
			input:    StringList{"sci-fi", "non-fiction", "young adult"},
			expected: `["sci-fi","non-fiction","young adult"]`,
			wantErr:  false,
		},
		{
			name:     "items with quotes",
			input:    StringList{`quote"test`, "normal"},
			expected: `["quote\"test","normal"]`,
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := tt.input.Value()

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				
				// Convert to string for comparison
				valueStr, ok := value.(string)
				require.True(t, ok, "Value should return a string")
				
				// Parse both as JSON to compare (handles formatting differences)
				var expected, actual []string
				err1 := json.Unmarshal([]byte(tt.expected), &expected)
				err2 := json.Unmarshal([]byte(valueStr), &actual)
				
				require.NoError(t, err1)
				require.NoError(t, err2)
				assert.Equal(t, expected, actual)
			}
		})
	}
}

func TestStringList_ValueImplementsDriverValuer(t *testing.T) {
	var sl StringList
	var _ driver.Valuer = sl
}

func TestBook_JSONSerialization(t *testing.T) {
	// Create a test book with all fields
	subtitle := "Test Subtitle"
	description := "Test Description"
	isbn13 := "9781234567890"
	pageCount := 300
	rating := 4.5
	coverURL := "http://example.com/cover.jpg"
	
	now := time.Now().UTC().Truncate(time.Second) // Truncate for comparison
	
	book := &Book{
		ID:            1,
		Title:         "Test Book",
		Subtitle:      &subtitle,
		Description:   &description,
		ISBN13:        &isbn13,
		PageCount:     &pageCount,
		RatingAverage: &rating,
		RatingCount:   100,
		Tags:          StringList{"fiction", "test"},
		CoverURL:      &coverURL,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(book)
	require.NoError(t, err)

	// Test JSON unmarshaling
	var unmarshaledBook Book
	err = json.Unmarshal(jsonData, &unmarshaledBook)
	require.NoError(t, err)

	// Verify all fields are preserved
	assert.Equal(t, book.ID, unmarshaledBook.ID)
	assert.Equal(t, book.Title, unmarshaledBook.Title)
	assert.Equal(t, *book.Subtitle, *unmarshaledBook.Subtitle)
	assert.Equal(t, *book.Description, *unmarshaledBook.Description)
	assert.Equal(t, *book.ISBN13, *unmarshaledBook.ISBN13)
	assert.Equal(t, *book.PageCount, *unmarshaledBook.PageCount)
	assert.Equal(t, *book.RatingAverage, *unmarshaledBook.RatingAverage)
	assert.Equal(t, book.RatingCount, unmarshaledBook.RatingCount)
	assert.Equal(t, book.Tags, unmarshaledBook.Tags)
	assert.Equal(t, *book.CoverURL, *unmarshaledBook.CoverURL)
	assert.Equal(t, book.CreatedAt.Unix(), unmarshaledBook.CreatedAt.Unix())
	assert.Equal(t, book.UpdatedAt.Unix(), unmarshaledBook.UpdatedAt.Unix())
}

func TestBook_JSONSerializationWithNilFields(t *testing.T) {
	book := &Book{
		ID:          1,
		Title:       "Test Book",
		RatingCount: 0,
		Tags:        StringList{},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Test JSON marshaling with nil fields
	jsonData, err := json.Marshal(book)
	require.NoError(t, err)

	// Test JSON unmarshaling
	var unmarshaledBook Book
	err = json.Unmarshal(jsonData, &unmarshaledBook)
	require.NoError(t, err)

	// Verify fields are handled correctly
	assert.Equal(t, book.ID, unmarshaledBook.ID)
	assert.Equal(t, book.Title, unmarshaledBook.Title)
	assert.Nil(t, unmarshaledBook.Subtitle)
	assert.Nil(t, unmarshaledBook.Description)
	assert.Nil(t, unmarshaledBook.ISBN13)
	assert.Nil(t, unmarshaledBook.PageCount)
	assert.Nil(t, unmarshaledBook.RatingAverage)
	assert.Equal(t, book.RatingCount, unmarshaledBook.RatingCount)
	assert.Equal(t, book.Tags, unmarshaledBook.Tags)
}

func TestBookFile_JSONSerialization(t *testing.T) {
	filePath := "/path/to/book.epub"
	sizeBytes := int64(1048576)
	sourceURL := "http://example.com/book.torrent"
	downloadDate := time.Now().UTC().Truncate(time.Second)
	checksum := "abc123def456"
	
	bookFile := &BookFile{
		ID:           1,
		BookID:       1,
		FormatID:     1,
		FilePath:     &filePath,
		FileSizeBytes: &sizeBytes,
		QualityScore: 85,
		SourceURL:    &sourceURL,
		DownloadDate: &downloadDate,
		Checksum:     &checksum,
		IsPrimary:    true,
		CreatedAt:    downloadDate,
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(bookFile)
	require.NoError(t, err)

	// Test JSON unmarshaling
	var unmarshaledFile BookFile
	err = json.Unmarshal(jsonData, &unmarshaledFile)
	require.NoError(t, err)

	// Verify all fields are preserved
	assert.Equal(t, bookFile.ID, unmarshaledFile.ID)
	assert.Equal(t, bookFile.BookID, unmarshaledFile.BookID)
	assert.Equal(t, bookFile.FormatID, unmarshaledFile.FormatID)
	assert.Equal(t, *bookFile.FilePath, *unmarshaledFile.FilePath)
	assert.Equal(t, *bookFile.FileSizeBytes, *unmarshaledFile.FileSizeBytes)
	assert.Equal(t, bookFile.QualityScore, unmarshaledFile.QualityScore)
	assert.Equal(t, *bookFile.SourceURL, *unmarshaledFile.SourceURL)
	assert.Equal(t, bookFile.DownloadDate.Unix(), unmarshaledFile.DownloadDate.Unix())
	assert.Equal(t, *bookFile.Checksum, *unmarshaledFile.Checksum)
	assert.Equal(t, bookFile.IsPrimary, unmarshaledFile.IsPrimary)
}

func TestAuthor_JSONSerialization(t *testing.T) {
	sortName := "Doe, John"
	biography := "Test biography"
	birthDate := time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC)
	website := "http://johndoe.com"
	goodreadsID := "12345"
	role := "Author"
	
	author := &Author{
		ID:          1,
		Name:        "John Doe",
		SortName:    &sortName,
		Biography:   &biography,
		BirthDate:   &birthDate,
		Website:     &website,
		GoodreadsID: &goodreadsID,
		CreatedAt:   time.Now().UTC().Truncate(time.Second),
		UpdatedAt:   time.Now().UTC().Truncate(time.Second),
		Role:        &role,
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(author)
	require.NoError(t, err)

	// Test JSON unmarshaling
	var unmarshaledAuthor Author
	err = json.Unmarshal(jsonData, &unmarshaledAuthor)
	require.NoError(t, err)

	// Verify all fields are preserved
	assert.Equal(t, author.ID, unmarshaledAuthor.ID)
	assert.Equal(t, author.Name, unmarshaledAuthor.Name)
	assert.Equal(t, *author.SortName, *unmarshaledAuthor.SortName)
	assert.Equal(t, *author.Biography, *unmarshaledAuthor.Biography)
	assert.Equal(t, author.BirthDate.Unix(), unmarshaledAuthor.BirthDate.Unix())
	assert.Equal(t, *author.Website, *unmarshaledAuthor.Website)
	assert.Equal(t, *author.GoodreadsID, *unmarshaledAuthor.GoodreadsID)
	assert.Equal(t, *author.Role, *unmarshaledAuthor.Role)
}

func TestBookCreateRequest_Validation(t *testing.T) {
	tests := []struct {
		name    string
		request *BookCreateRequest
		wantErr bool
	}{
		{
			name: "valid request",
			request: &BookCreateRequest{
				Title: "Test Book",
			},
			wantErr: false,
		},
		{
			name: "empty title should fail validation (if implemented)",
			request: &BookCreateRequest{
				Title: "",
			},
			wantErr: false, // Currently no validation implemented
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// JSON serialization test
			jsonData, err := json.Marshal(tt.request)
			assert.NoError(t, err)

			var unmarshaled BookCreateRequest
			err = json.Unmarshal(jsonData, &unmarshaled)
			assert.NoError(t, err)

			assert.Equal(t, tt.request.Title, unmarshaled.Title)
		})
	}
}

func TestBookUpdateRequest_PartialUpdates(t *testing.T) {
	title := "Updated Title"
	pageCount := 400

	request := &BookUpdateRequest{
		Title:     &title,
		PageCount: &pageCount,
		// Other fields are nil for partial update
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled BookUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	// Check that specified fields are present
	require.NotNil(t, unmarshaled.Title)
	require.NotNil(t, unmarshaled.PageCount)
	assert.Equal(t, title, *unmarshaled.Title)
	assert.Equal(t, pageCount, *unmarshaled.PageCount)

	// Check that unspecified fields remain nil
	assert.Nil(t, unmarshaled.Subtitle)
	assert.Nil(t, unmarshaled.Description)
	assert.Nil(t, unmarshaled.ISBN13)
}

// Benchmark tests for StringList operations
func BenchmarkStringList_Scan(b *testing.B) {
	input := `["tag1", "tag2", "tag3", "tag4", "tag5"]`
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var sl StringList
		sl.Scan(input)
	}
}

func BenchmarkStringList_Value(b *testing.B) {
	sl := StringList{"tag1", "tag2", "tag3", "tag4", "tag5"}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		sl.Value()
	}
}

func BenchmarkBook_JSONMarshal(b *testing.B) {
	subtitle := "Test Subtitle"
	description := "Test Description"
	isbn13 := "9781234567890"
	pageCount := 300
	rating := 4.5
	
	book := &Book{
		ID:            1,
		Title:         "Test Book",
		Subtitle:      &subtitle,
		Description:   &description,
		ISBN13:        &isbn13,
		PageCount:     &pageCount,
		RatingAverage: &rating,
		RatingCount:   100,
		Tags:          StringList{"fiction", "test", "benchmark"},
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.Marshal(book)
	}
}

func BenchmarkBook_JSONUnmarshal(b *testing.B) {
	jsonData := []byte(`{
		"id": 1,
		"title": "Test Book",
		"subtitle": "Test Subtitle",
		"description": "Test Description",
		"isbn_13": "9781234567890",
		"page_count": 300,
		"rating_average": 4.5,
		"rating_count": 100,
		"tags": ["fiction", "test", "benchmark"],
		"created_at": "2023-01-01T00:00:00Z",
		"updated_at": "2023-01-01T00:00:00Z"
	}`)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var book Book
		json.Unmarshal(jsonData, &book)
	}
}

// Table-driven tests for StringList edge cases
func TestStringList_EdgeCases(t *testing.T) {
	tests := []struct {
		name        string
		scanValue   interface{}
		expectScan  StringList
		expectValue string
		roundTrip   bool
	}{
		{
			name:        "unicode characters",
			scanValue:   `["测试", "тест", "テスト"]`,
			expectScan:  StringList{"测试", "тест", "テスト"},
			expectValue: `["测试","тест","テスト"]`,
			roundTrip:   true,
		},
		{
			name:        "empty strings in array",
			scanValue:   `["", "test", ""]`,
			expectScan:  StringList{"", "test", ""},
			expectValue: `["","test",""]`,
			roundTrip:   true,
		},
		{
			name:        "escaped characters",
			scanValue:   `["line1\nline2", "tab\there", "quote\"test"]`,
			expectScan:  StringList{"line1\nline2", "tab\there", "quote\"test"},
			expectValue: `["line1\nline2","tab\there","quote\"test"]`,
			roundTrip:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test Scan
			var sl StringList
			err := sl.Scan(tt.scanValue)
			require.NoError(t, err)
			assert.Equal(t, tt.expectScan, sl)

			// Test Value
			value, err := sl.Value()
			require.NoError(t, err)
			valueStr, ok := value.(string)
			require.True(t, ok)

			// Parse both as JSON to compare (handles formatting differences)
			var expected, actual []string
			err1 := json.Unmarshal([]byte(tt.expectValue), &expected)
			err2 := json.Unmarshal([]byte(valueStr), &actual)
			require.NoError(t, err1)
			require.NoError(t, err2)
			assert.Equal(t, expected, actual)

			// Test round trip if specified
			if tt.roundTrip {
				var sl2 StringList
				err = sl2.Scan(valueStr)
				require.NoError(t, err)
				assert.Equal(t, sl, sl2)
			}
		})
	}
}