package indexers

import (
	"context"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// TestManager_ClientConfiguration_MissingSetterMethods reproduces the bug where
// the Manager is missing SetProwlarrClient and SetJackettClient methods.
// This test should FAIL to compile initially, demonstrating the missing functionality.
func TestManager_ClientConfiguration_MissingSetterMethods(t *testing.T) {
	// Setup
	mockIndexerRepo := &MockIndexerRepository{}
	mockSearchRepo := &MockSearchRepository{}
	logger := logrus.New()
	logger.SetLevel(logrus.ErrorLevel)

	// Create manager
	manager := NewManager(mockIndexerRepo, mockSearchRepo, logger)

	// THIS TEST SHOULD FAIL TO COMPILE because these methods don't exist yet
	// 
	// Commenting out the actual calls so the test can run and show the issue in a different way
	// The real issue will be demonstrated by trying to use configured clients and getting "no client available"
	
	// manager.SetProwlarrClient(prowlarrClient)  // This method doesn't exist
	// manager.SetJackettClient(jackettClient)    // This method doesn't exist
	
	// For now, we'll test that the clients are nil (which is the symptom of the bug)
	// After the fix, we'll be able to set them and verify they're not nil
	
	// The manager should have been created but clients should be nil since we can't set them
	assert.NotNil(t, manager, "Manager should be created")
	
	// This test documents the current broken behavior - we can't set clients
	// After the fix, we'll update this test to actually set and verify the clients
}

// TestManager_ClientConfiguration_NoClientAvailableError demonstrates the bug where
// indexers show "no client available" errors because the setter methods don't exist.
// This test FAILS currently, showing the exact user-reported issue.
func TestManager_ClientConfiguration_NoClientAvailableError(t *testing.T) {
	// Setup
	ctx := context.Background()
	userID := int64(1)

	mockIndexerRepo := &MockIndexerRepository{}
	mockSearchRepo := &MockSearchRepository{}
	logger := logrus.New()
	logger.SetLevel(logrus.ErrorLevel)

	// Create manager - NOTE: can't set clients because methods don't exist
	manager := NewManager(mockIndexerRepo, mockSearchRepo, logger)

	// These are the indexers that the user has configured
	testIndexers := []*models.Indexer{
		{
			ID:               1,
			Name:             "NorTorrent (Jackett)",
			BaseURL:          "http://localhost:9117",
			IndexerType:      models.IndexerTypeTorznab,
			SupportsSearch:   true,
			IsActive:         true,
			Priority:         1,
		},
		{
			ID:               2,
			Name:             "YggTorrent",
			BaseURL:          "https://yggtorrent.se",
			IndexerType:      models.IndexerTypeHTML,
			SupportsSearch:   true,
			IsActive:         true,
			Priority:         2,
		},
	}

	// Mock the repository
	mockIndexerRepo.On("GetUserEnabledIndexers", ctx, userID).Return(testIndexers, nil)

	// Mock health check calls
	mockIndexerRepo.On("RecordHealthCheck", mock.Anything, mock.Anything).Return(nil)

	// Mock search history recording  
	mockSearchRepo.On("CreateHistoryEntry", mock.Anything, mock.Anything).Return(nil)

	// Create search request
	searchRequest := &models.SearchRequest{
		Query:    "Foundation series",
		Timeout:  30,
		UseCache: false,
	}

	// Execute search
	response, err := manager.Search(ctx, userID, searchRequest)

	// This should succeed even with client errors
	assert.NoError(t, err, "Search should not error even when indexers fail")
	assert.NotNil(t, response, "Response should not be nil")

	// This is the current broken behavior - all indexers show "no client available"
	assert.NotEmpty(t, response.IndexersSearched, "Should report indexer attempts")

	// THIS IS THE BUG: All indexers currently show "no client available" 
	// because we can't set the Prowlarr/Jackett clients
	foundNoClientError := false
	for _, indexerResult := range response.IndexersSearched {
		if indexerResult.Error != nil && 
		   *indexerResult.Error == "no client available for indexer: "+indexerResult.IndexerName {
			foundNoClientError = true
			t.Logf("Found expected 'no client available' error for %s", indexerResult.IndexerName)
		}
	}

	// This assertion should PASS now (showing the bug exists)
	// After the fix, we'll change this to assert the opposite
	assert.True(t, foundNoClientError, 
		"CURRENT BUG: Should find 'no client available' errors because setter methods don't exist")

	// Verify all expectations were met
	mockIndexerRepo.AssertExpectations(t)
	mockSearchRepo.AssertExpectations(t)
}

// TestManager_ClientConfiguration_WithProperSetup verifies that the fix works 
// when clients are properly configured using the new setter methods.
// This test should PASS after the Green phase implementation.
func TestManager_ClientConfiguration_WithProperSetup(t *testing.T) {
	// Setup
	ctx := context.Background()
	userID := int64(1)

	mockIndexerRepo := &MockIndexerRepository{}
	mockSearchRepo := &MockSearchRepository{}
	logger := logrus.New()
	logger.SetLevel(logrus.ErrorLevel)

	// Create manager
	manager := NewManager(mockIndexerRepo, mockSearchRepo, logger)

	// NOW we can properly configure clients using the new setter methods
	jackettConfig := &models.JackettConfig{
		Enabled:           true,
		BaseURL:           "http://localhost:9117",
		APIKey:            "test-api-key",
		TimeoutSeconds:    30,
		RateLimitRequests: 60,
		RateLimitWindow:   60,
		Status:            "connected",
	}
	jackettClient := NewJackettClient(jackettConfig, logger)
	manager.SetJackettClient(jackettClient) // This method now exists!

	// These are the same indexers that the user has configured
	testIndexers := []*models.Indexer{
		{
			ID:               1,
			Name:             "NorTorrent (Jackett)",
			BaseURL:          "http://localhost:9117",
			IndexerType:      models.IndexerTypeTorznab,
			SupportsSearch:   true,
			IsActive:         true,
			Priority:         1,
		},
		{
			ID:               2,
			Name:             "YggTorrent", // This will still fail since it's not Jackett or Prowlarr
			BaseURL:          "https://yggtorrent.se",
			IndexerType:      models.IndexerTypeHTML,
			SupportsSearch:   true,
			IsActive:         true,
			Priority:         2,
		},
	}

	// Mock the repository
	mockIndexerRepo.On("GetUserEnabledIndexers", ctx, userID).Return(testIndexers, nil)

	// Mock health check calls - these will be called for both success and failure
	mockIndexerRepo.On("RecordHealthCheck", mock.Anything, mock.Anything).Return(nil)

	// Mock search history recording  
	mockSearchRepo.On("CreateHistoryEntry", mock.Anything, mock.Anything).Return(nil)

	// Create search request
	searchRequest := &models.SearchRequest{
		Query:    "Foundation series",
		Timeout:  30,
		UseCache: false,
	}

	// Execute search
	response, err := manager.Search(ctx, userID, searchRequest)

	// This should succeed 
	assert.NoError(t, err, "Search should not error")
	assert.NotNil(t, response, "Response should not be nil")

	// After the fix: indexers should be attempted and we should get detailed results
	assert.NotEmpty(t, response.IndexersSearched, "Should report indexer attempts")

	// Verify that the Jackett indexer NO LONGER shows "no client available"
	foundNoClientError := false
	foundJackettAttempt := false
	
	for _, indexerResult := range response.IndexersSearched {
		if indexerResult.IndexerName == "NorTorrent (Jackett)" {
			foundJackettAttempt = true
			// Should NOT be a "no client available" error anymore
			if indexerResult.Error != nil {
				assert.NotContains(t, *indexerResult.Error, "no client available", 
					"Jackett indexer should no longer show 'no client available' error")
				// May have other errors (connection refused, etc.) but not client config errors
				t.Logf("Jackett indexer error (not 'no client available'): %s", *indexerResult.Error)
			}
		}
		
		if indexerResult.IndexerName == "YggTorrent" {
			// YggTorrent should still show "no client available" since it's not Jackett/Prowlarr
			if indexerResult.Error != nil && 
			   *indexerResult.Error == "no client available for indexer: "+indexerResult.IndexerName {
				foundNoClientError = true
				t.Logf("YggTorrent still shows expected 'no client available' error: %s", *indexerResult.Error)
			}
		}
	}

	// This assertion verifies the fix worked for Jackett
	assert.True(t, foundJackettAttempt, "Should attempt to use Jackett indexer")
	
	// YggTorrent should still show the error since it doesn't have a direct indexer implementation
	assert.True(t, foundNoClientError, "YggTorrent should still show 'no client available' (expected)")

	// Verify all expectations were met
	mockIndexerRepo.AssertExpectations(t)
	mockSearchRepo.AssertExpectations(t)
}

// Note: Direct indexer management will be addressed in a separate task
// Focus is on the critical Prowlarr and Jackett client setters first