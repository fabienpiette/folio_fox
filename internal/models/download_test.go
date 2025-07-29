package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDownloadStatus_Constants(t *testing.T) {
	// Test that all constants are properly defined
	assert.Equal(t, DownloadStatus("pending"), DownloadStatusPending)
	assert.Equal(t, DownloadStatus("downloading"), DownloadStatusDownloading)
	assert.Equal(t, DownloadStatus("completed"), DownloadStatusCompleted)
	assert.Equal(t, DownloadStatus("failed"), DownloadStatusFailed)
	assert.Equal(t, DownloadStatus("cancelled"), DownloadStatusCancelled)
	assert.Equal(t, DownloadStatus("paused"), DownloadStatusPaused)
}

func TestDownloadQueueItem_JSONSerialization(t *testing.T) {
	authorName := "Test Author"
	fileSizeBytes := int64(1048576)
	bookID := int64(123)
	downloadPath := "/downloads/test.epub"
	qualityProfileID := int64(1)
	errorMessage := "Test error"
	now := time.Now().UTC().Truncate(time.Second)
	
	item := &DownloadQueueItem{
		ID:                  1,
		UserID:              100,
		BookID:              &bookID,
		IndexerID:           1,
		Title:               "Test Book",
		AuthorName:          &authorName,
		DownloadURL:         "http://example.com/test.torrent",
		FileFormat:          "epub",
		FileSizeBytes:       &fileSizeBytes,
		Priority:            1,
		Status:              DownloadStatusPending,
		ProgressPercentage:  0,
		DownloadPath:        &downloadPath,
		QualityProfileID:    &qualityProfileID,
		RetryCount:          0,
		MaxRetries:          3,
		ErrorMessage:        &errorMessage,
		EstimatedCompletion: &now,
		StartedAt:           &now,
		CompletedAt:         &now,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(item)
	require.NoError(t, err)

	// Test JSON unmarshaling
	var unmarshaledItem DownloadQueueItem
	err = json.Unmarshal(jsonData, &unmarshaledItem)
	require.NoError(t, err)

	// Verify all fields are preserved
	assert.Equal(t, item.ID, unmarshaledItem.ID)
	assert.Equal(t, item.UserID, unmarshaledItem.UserID)
	assert.Equal(t, *item.BookID, *unmarshaledItem.BookID)
	assert.Equal(t, item.IndexerID, unmarshaledItem.IndexerID)
	assert.Equal(t, item.Title, unmarshaledItem.Title)
	assert.Equal(t, *item.AuthorName, *unmarshaledItem.AuthorName)
	assert.Equal(t, item.DownloadURL, unmarshaledItem.DownloadURL)
	assert.Equal(t, item.FileFormat, unmarshaledItem.FileFormat)
	assert.Equal(t, *item.FileSizeBytes, *unmarshaledItem.FileSizeBytes)
	assert.Equal(t, item.Priority, unmarshaledItem.Priority)
	assert.Equal(t, item.Status, unmarshaledItem.Status)
	assert.Equal(t, item.ProgressPercentage, unmarshaledItem.ProgressPercentage)
	assert.Equal(t, *item.DownloadPath, *unmarshaledItem.DownloadPath)
	assert.Equal(t, *item.QualityProfileID, *unmarshaledItem.QualityProfileID)
	assert.Equal(t, item.RetryCount, unmarshaledItem.RetryCount)
	assert.Equal(t, item.MaxRetries, unmarshaledItem.MaxRetries)
	assert.Equal(t, *item.ErrorMessage, *unmarshaledItem.ErrorMessage)
	assert.Equal(t, item.EstimatedCompletion.Unix(), unmarshaledItem.EstimatedCompletion.Unix())
	assert.Equal(t, item.StartedAt.Unix(), unmarshaledItem.StartedAt.Unix())
	assert.Equal(t, item.CompletedAt.Unix(), unmarshaledItem.CompletedAt.Unix())
	assert.Equal(t, item.CreatedAt.Unix(), unmarshaledItem.CreatedAt.Unix())
	assert.Equal(t, item.UpdatedAt.Unix(), unmarshaledItem.UpdatedAt.Unix())
}

func TestDownloadQueueItem_JSONSerializationWithNilFields(t *testing.T) {
	item := &DownloadQueueItem{
		ID:                 1,
		UserID:             100,
		IndexerID:          1,
		Title:              "Test Book",
		DownloadURL:        "http://example.com/test.torrent",
		FileFormat:         "epub",
		Priority:           1,
		Status:             DownloadStatusPending,
		ProgressPercentage: 0,
		RetryCount:         0,
		MaxRetries:         3,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	jsonData, err := json.Marshal(item)
	require.NoError(t, err)

	var unmarshaledItem DownloadQueueItem
	err = json.Unmarshal(jsonData, &unmarshaledItem)
	require.NoError(t, err)

	assert.Equal(t, item.ID, unmarshaledItem.ID)
	assert.Equal(t, item.Title, unmarshaledItem.Title)
	assert.Nil(t, unmarshaledItem.BookID)
	assert.Nil(t, unmarshaledItem.AuthorName)
	assert.Nil(t, unmarshaledItem.FileSizeBytes)
	assert.Nil(t, unmarshaledItem.DownloadPath)
	assert.Nil(t, unmarshaledItem.QualityProfileID)
	assert.Nil(t, unmarshaledItem.ErrorMessage)
}

func TestDownloadHistoryItem_JSONSerialization(t *testing.T) {
	authorName := "Test Author"
	fileSizeBytes := int64(2097152)
	bookID := int64(123)
	downloadPath := "/downloads/completed.epub"
	errorMessage := "No error"
	downloadDuration := 300
	
	historyItem := &DownloadHistoryItem{
		ID:                      1,
		QueueID:                 100,
		UserID:                  200,
		BookID:                  &bookID,
		IndexerID:               1,
		Title:                   "Completed Book",
		AuthorName:              &authorName,
		FileFormat:              "epub",
		FileSizeBytes:           &fileSizeBytes,
		DownloadDurationSeconds: &downloadDuration,
		FinalStatus:             "completed",
		ErrorMessage:            &errorMessage,
		DownloadPath:            &downloadPath,
		CompletedAt:             time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(historyItem)
	require.NoError(t, err)

	var unmarshaledItem DownloadHistoryItem
	err = json.Unmarshal(jsonData, &unmarshaledItem)
	require.NoError(t, err)

	assert.Equal(t, historyItem.ID, unmarshaledItem.ID)
	assert.Equal(t, historyItem.QueueID, unmarshaledItem.QueueID)
	assert.Equal(t, historyItem.UserID, unmarshaledItem.UserID)
	assert.Equal(t, *historyItem.BookID, *unmarshaledItem.BookID)
	assert.Equal(t, historyItem.Title, unmarshaledItem.Title)
	assert.Equal(t, *historyItem.AuthorName, *unmarshaledItem.AuthorName)
	assert.Equal(t, historyItem.FileFormat, unmarshaledItem.FileFormat)
	assert.Equal(t, *historyItem.FileSizeBytes, *unmarshaledItem.FileSizeBytes)
	assert.Equal(t, *historyItem.DownloadDurationSeconds, *unmarshaledItem.DownloadDurationSeconds)
	assert.Equal(t, historyItem.FinalStatus, unmarshaledItem.FinalStatus)
	assert.Equal(t, historyItem.CompletedAt.Unix(), unmarshaledItem.CompletedAt.Unix())
}

func TestDownloadCreateRequest_Validation(t *testing.T) {
	tests := []struct {
		name    string
		request *DownloadCreateRequest
		wantErr bool
	}{
		{
			name: "valid request",
			request: &DownloadCreateRequest{
				Title:       "Test Book",
				DownloadURL: "http://example.com/test.torrent",
				FileFormat:  "epub",
				IndexerID:   1,
			},
			wantErr: false,
		},
		{
			name: "request with optional fields",
			request: &DownloadCreateRequest{
				Title:        "Test Book",
				DownloadURL:  "http://example.com/test.torrent",
				FileFormat:   "epub",
				IndexerID:    1,
				AuthorName:   stringPtr("Test Author"),
				FileSizeBytes: int64Ptr(1048576),
				Priority:     1,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData, err := json.Marshal(tt.request)
			assert.NoError(t, err)

			var unmarshaled DownloadCreateRequest
			err = json.Unmarshal(jsonData, &unmarshaled)
			assert.NoError(t, err)

			assert.Equal(t, tt.request.Title, unmarshaled.Title)
			assert.Equal(t, tt.request.DownloadURL, unmarshaled.DownloadURL)
			assert.Equal(t, tt.request.FileFormat, unmarshaled.FileFormat)
			assert.Equal(t, tt.request.IndexerID, unmarshaled.IndexerID)
		})
	}
}

func TestDownloadUpdateRequest_PartialUpdate(t *testing.T) {
	priority := 5
	downloadPath := "/new/path"
	qualityProfileID := int64(2)
	maxRetries := 5

	request := &DownloadUpdateRequest{
		Priority:         &priority,
		DownloadPath:     &downloadPath,
		QualityProfileID: &qualityProfileID,
		MaxRetries:       &maxRetries,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled DownloadUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	require.NotNil(t, unmarshaled.Priority)
	require.NotNil(t, unmarshaled.DownloadPath)
	require.NotNil(t, unmarshaled.QualityProfileID)
	require.NotNil(t, unmarshaled.MaxRetries)

	assert.Equal(t, priority, *unmarshaled.Priority)
	assert.Equal(t, downloadPath, *unmarshaled.DownloadPath)
	assert.Equal(t, qualityProfileID, *unmarshaled.QualityProfileID)
	assert.Equal(t, maxRetries, *unmarshaled.MaxRetries)
}

func TestDownloadProgress_JSONSerialization(t *testing.T) {
	downloadSpeed := 1024.5
	etaSeconds := 300
	errorMessage := "Connection timeout"
	totalBytes := int64(2097152)

	progress := &DownloadProgress{
		DownloadID:         1,
		Status:             DownloadStatusDownloading,
		ProgressPercentage: 75,
		BytesDownloaded:    1573888,
		TotalBytes:         &totalBytes,
		DownloadSpeedKBPS:  &downloadSpeed,
		ETASeconds:         &etaSeconds,
		ErrorMessage:       &errorMessage,
		UpdatedAt:          time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(progress)
	require.NoError(t, err)

	var unmarshaled DownloadProgress
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, progress.DownloadID, unmarshaled.DownloadID)
	assert.Equal(t, progress.Status, unmarshaled.Status)
	assert.Equal(t, progress.ProgressPercentage, unmarshaled.ProgressPercentage)
	assert.Equal(t, progress.BytesDownloaded, unmarshaled.BytesDownloaded)
	assert.Equal(t, *progress.TotalBytes, *unmarshaled.TotalBytes)
	assert.Equal(t, *progress.DownloadSpeedKBPS, *unmarshaled.DownloadSpeedKBPS)
	assert.Equal(t, *progress.ETASeconds, *unmarshaled.ETASeconds)
	assert.Equal(t, *progress.ErrorMessage, *unmarshaled.ErrorMessage)
}

func TestDownloadStats_JSONSerialization(t *testing.T) {
	stats := &DownloadStats{
		Period:                   "week",
		TotalDownloads:           100,
		SuccessfulDownloads:      85,
		FailedDownloads:          10,
		CancelledDownloads:       5,
		SuccessRate:              85.0,
		TotalBytesDownloaded:     104857600,
		TotalBytesHuman:          "100 MB",
		AverageDownloadSpeedKBPS: 512.5,
		AverageFileSizeMB:        1.0,
		MostDownloadedFormat:     "epub",
		TopIndexers: []IndexerDownloadStats{
			{
				IndexerName:   "Test Indexer",
				DownloadCount: 50,
				SuccessRate:   90.0,
			},
		},
		DownloadsByDay: []DailyDownloadStats{
			{
				Date:  "2023-01-01",
				Count: 10,
				Bytes: 10485760,
			},
		},
		DownloadsByFormat: []FormatDownloadStats{
			{
				Format:     "epub",
				Count:      60,
				Percentage: 60.0,
			},
		},
	}

	jsonData, err := json.Marshal(stats)
	require.NoError(t, err)

	var unmarshaled DownloadStats
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, stats.Period, unmarshaled.Period)
	assert.Equal(t, stats.TotalDownloads, unmarshaled.TotalDownloads)
	assert.Equal(t, stats.SuccessfulDownloads, unmarshaled.SuccessfulDownloads)
	assert.Equal(t, stats.FailedDownloads, unmarshaled.FailedDownloads)
	assert.Equal(t, stats.SuccessRate, unmarshaled.SuccessRate)
	assert.Equal(t, stats.TotalBytesDownloaded, unmarshaled.TotalBytesDownloaded)
	assert.Equal(t, stats.MostDownloadedFormat, unmarshaled.MostDownloadedFormat)
	
	require.Len(t, unmarshaled.TopIndexers, 1)
	assert.Equal(t, stats.TopIndexers[0].IndexerName, unmarshaled.TopIndexers[0].IndexerName)
	assert.Equal(t, stats.TopIndexers[0].DownloadCount, unmarshaled.TopIndexers[0].DownloadCount)
	
	require.Len(t, unmarshaled.DownloadsByDay, 1)
	assert.Equal(t, stats.DownloadsByDay[0].Date, unmarshaled.DownloadsByDay[0].Date)
	assert.Equal(t, stats.DownloadsByDay[0].Count, unmarshaled.DownloadsByDay[0].Count)
	
	require.Len(t, unmarshaled.DownloadsByFormat, 1)
	assert.Equal(t, stats.DownloadsByFormat[0].Format, unmarshaled.DownloadsByFormat[0].Format)
	assert.Equal(t, stats.DownloadsByFormat[0].Count, unmarshaled.DownloadsByFormat[0].Count)
}

func TestQualityProfile_JSONSerialization(t *testing.T) {
	maxFileSizeMB := 50
	
	profile := &QualityProfile{
		ID:                  1,
		UserID:              100,
		Name:                "High Quality",
		PreferredFormats:    StringList{"epub", "pdf"},
		MinQualityScore:     80,
		MaxFileSizeMB:       &maxFileSizeMB,
		LanguagePreferences: StringList{"en", "fr"},
		IsDefault:           true,
		CreatedAt:           time.Now().UTC().Truncate(time.Second),
		UpdatedAt:           time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(profile)
	require.NoError(t, err)

	var unmarshaled QualityProfile
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, profile.ID, unmarshaled.ID)
	assert.Equal(t, profile.UserID, unmarshaled.UserID)
	assert.Equal(t, profile.Name, unmarshaled.Name)
	assert.Equal(t, profile.PreferredFormats, unmarshaled.PreferredFormats)
	assert.Equal(t, profile.MinQualityScore, unmarshaled.MinQualityScore)
	assert.Equal(t, *profile.MaxFileSizeMB, *unmarshaled.MaxFileSizeMB)
	assert.Equal(t, profile.LanguagePreferences, unmarshaled.LanguagePreferences)
	assert.Equal(t, profile.IsDefault, unmarshaled.IsDefault)
}

// Helper functions for creating pointers in tests
func stringPtr(s string) *string {
	return &s
}

func int64Ptr(i int64) *int64 {
	return &i
}

func intPtr(i int) *int {
	return &i
}

// Benchmark tests
func BenchmarkDownloadQueueItem_JSONMarshal(b *testing.B) {
	authorName := "Test Author"
	fileSizeBytes := int64(1048576)
	bookID := int64(123)
	
	item := &DownloadQueueItem{
		ID:                 1,
		UserID:             100,
		BookID:             &bookID,
		IndexerID:          1,
		Title:              "Test Book for Benchmark",
		AuthorName:         &authorName,
		DownloadURL:        "http://example.com/benchmark.torrent",
		FileFormat:         "epub",
		FileSizeBytes:      &fileSizeBytes,
		Priority:           1,
		Status:             DownloadStatusPending,
		ProgressPercentage: 0,
		RetryCount:         0,
		MaxRetries:         3,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.Marshal(item)
	}
}

func BenchmarkDownloadStats_JSONMarshal(b *testing.B) {
	stats := &DownloadStats{
		Period:                   "week",
		TotalDownloads:           1000,
		SuccessfulDownloads:      850,
		FailedDownloads:          100,
		CancelledDownloads:       50,
		SuccessRate:              85.0,
		TotalBytesDownloaded:     1048576000,
		AverageDownloadSpeedKBPS: 1024.0,
		AverageFileSizeMB:        10.0,
		MostDownloadedFormat:     "epub",
		TopIndexers: make([]IndexerDownloadStats, 10),
		DownloadsByDay: make([]DailyDownloadStats, 7),
		DownloadsByFormat: make([]FormatDownloadStats, 5),
	}
	
	// Fill with sample data
	for i := 0; i < 10; i++ {
		stats.TopIndexers[i] = IndexerDownloadStats{
			IndexerName:   "Indexer " + string(rune(i+'A')),
			DownloadCount: 100 - i*5,
			SuccessRate:   float64(90 - i),
		}
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.Marshal(stats)
	}
}

func TestDownloadStatus_String(t *testing.T) {
	tests := []struct {
		status   DownloadStatus
		expected string
	}{
		{DownloadStatusPending, "pending"},
		{DownloadStatusDownloading, "downloading"},
		{DownloadStatusCompleted, "completed"},
		{DownloadStatusFailed, "failed"},
		{DownloadStatusCancelled, "cancelled"},
		{DownloadStatusPaused, "paused"},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			assert.Equal(t, tt.expected, string(tt.status))
		})
	}
}

func TestDownloadCreateRequest_WithMetadata(t *testing.T) {
	metadata := map[string]interface{}{
		"original_title": "Original Title",
		"year":          2023,
		"tags":          []string{"fiction", "drama"},
	}

	request := &DownloadCreateRequest{
		Title:       "Test Book",
		DownloadURL: "http://example.com/test.torrent",
		FileFormat:  "epub",
		IndexerID:   1,
		Metadata:    metadata,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled DownloadCreateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Title, unmarshaled.Title)
	
	// Test specific metadata values - JSON unmarshaling changes types
	assert.Equal(t, "Original Title", unmarshaled.Metadata["original_title"]) 
	assert.Equal(t, float64(2023), unmarshaled.Metadata["year"]) // JSON unmarshals numbers as float64
	
	// Check tags array - JSON unmarshals []string as []interface{}
	tags, ok := unmarshaled.Metadata["tags"].([]interface{})
	require.True(t, ok, "tags should be []interface{}")
	assert.Len(t, tags, 2)
	assert.Equal(t, "fiction", tags[0])
	assert.Equal(t, "drama", tags[1])
}

func TestQualityProfile_WithStringLists(t *testing.T) {
	profile := &QualityProfile{
		ID:                  1,
		UserID:              100,
		Name:                "Test Profile",
		PreferredFormats:    StringList{"epub", "pdf", "mobi"},
		MinQualityScore:     70,
		LanguagePreferences: StringList{"en", "es", "fr", "de"},
		IsDefault:           false,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	// Test that StringList fields work correctly
	assert.Len(t, profile.PreferredFormats, 3)
	assert.Contains(t, profile.PreferredFormats, "epub")
	assert.Contains(t, profile.PreferredFormats, "pdf")
	assert.Contains(t, profile.PreferredFormats, "mobi")

	assert.Len(t, profile.LanguagePreferences, 4)
	assert.Contains(t, profile.LanguagePreferences, "en")
	assert.Contains(t, profile.LanguagePreferences, "es")

	// Test JSON serialization with StringList
	jsonData, err := json.Marshal(profile)
	require.NoError(t, err)

	var unmarshaled QualityProfile
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, profile.PreferredFormats, unmarshaled.PreferredFormats)
	assert.Equal(t, profile.LanguagePreferences, unmarshaled.LanguagePreferences)
}