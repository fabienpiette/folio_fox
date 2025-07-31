package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUser_JSONSerialization(t *testing.T) {
	email := "test@example.com"
	lastLogin := time.Now().UTC().Truncate(time.Second)
	
	user := &User{
		ID:           1,
		Username:     "testuser",
		Email:        &email,
		PasswordHash: "hashedpassword123",
		IsActive:     true,
		IsAdmin:      false,
		LastLogin:    &lastLogin,
		CreatedAt:    time.Now().UTC().Truncate(time.Second),
		UpdatedAt:    time.Now().UTC().Truncate(time.Second),
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(user)
	require.NoError(t, err)

	// Verify password hash is not included in JSON
	jsonStr := string(jsonData)
	assert.NotContains(t, jsonStr, "password_hash")
	assert.NotContains(t, jsonStr, "hashedpassword123")

	// Test JSON unmarshaling
	var unmarshaledUser User
	err = json.Unmarshal(jsonData, &unmarshaledUser)
	require.NoError(t, err)

	// Verify all fields except password hash are preserved
	assert.Equal(t, user.ID, unmarshaledUser.ID)
	assert.Equal(t, user.Username, unmarshaledUser.Username)
	assert.Equal(t, *user.Email, *unmarshaledUser.Email)
	assert.Equal(t, user.IsActive, unmarshaledUser.IsActive)
	assert.Equal(t, user.IsAdmin, unmarshaledUser.IsAdmin)
	assert.Equal(t, user.LastLogin.Unix(), unmarshaledUser.LastLogin.Unix())
	assert.Equal(t, user.CreatedAt.Unix(), unmarshaledUser.CreatedAt.Unix())
	assert.Equal(t, user.UpdatedAt.Unix(), unmarshaledUser.UpdatedAt.Unix())
	
	// Password hash should be empty after unmarshaling from JSON
	assert.Empty(t, unmarshaledUser.PasswordHash)
}

func TestUser_JSONSerializationWithNilFields(t *testing.T) {
	user := &User{
		ID:           1,
		Username:     "testuser",
		PasswordHash: "hashedpassword123",
		IsActive:     true,
		IsAdmin:      false,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	jsonData, err := json.Marshal(user)
	require.NoError(t, err)

	var unmarshaledUser User
	err = json.Unmarshal(jsonData, &unmarshaledUser)
	require.NoError(t, err)

	assert.Equal(t, user.ID, unmarshaledUser.ID)
	assert.Equal(t, user.Username, unmarshaledUser.Username)
	assert.Nil(t, unmarshaledUser.Email)
	assert.Nil(t, unmarshaledUser.LastLogin)
	assert.Equal(t, user.IsActive, unmarshaledUser.IsActive)
	assert.Equal(t, user.IsAdmin, unmarshaledUser.IsAdmin)
}

func TestUserPreferences_JSONSerialization(t *testing.T) {
	qualityProfileID := int64(1)
	downloadFolderID := int64(2)
	
	preferences := &UserPreferences{
		ID:                        1,
		UserID:                    100,
		Theme:                     "dark",
		Language:                  "en",
		Timezone:                  "America/New_York",
		NotificationsEnabled:      true,
		AutoDownload:              false,
		PreferredQualityProfileID: &qualityProfileID,
		DefaultDownloadFolderID:   &downloadFolderID,
		CreatedAt:                 time.Now().UTC().Truncate(time.Second),
		UpdatedAt:                 time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(preferences)
	require.NoError(t, err)

	var unmarshaled UserPreferences
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, preferences.ID, unmarshaled.ID)
	assert.Equal(t, preferences.UserID, unmarshaled.UserID)
	assert.Equal(t, preferences.Theme, unmarshaled.Theme)
	assert.Equal(t, preferences.Language, unmarshaled.Language)
	assert.Equal(t, preferences.Timezone, unmarshaled.Timezone)
	assert.Equal(t, preferences.NotificationsEnabled, unmarshaled.NotificationsEnabled)
	assert.Equal(t, preferences.AutoDownload, unmarshaled.AutoDownload)
	assert.Equal(t, *preferences.PreferredQualityProfileID, *unmarshaled.PreferredQualityProfileID)
	assert.Equal(t, *preferences.DefaultDownloadFolderID, *unmarshaled.DefaultDownloadFolderID)
}

func TestDownloadFolder_JSONSerialization(t *testing.T) {
	folder := &DownloadFolder{
		ID:            1,
		UserID:        100,
		Name:          "Books",
		Path:          "/home/user/books",
		IsDefault:     true,
		AutoOrganize:  true,
		FolderPattern: "{author}/{title}",
		CreatedAt:     time.Now().UTC().Truncate(time.Second),
		UpdatedAt:     time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(folder)
	require.NoError(t, err)

	var unmarshaled DownloadFolder
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, folder.ID, unmarshaled.ID)
	assert.Equal(t, folder.UserID, unmarshaled.UserID)
	assert.Equal(t, folder.Name, unmarshaled.Name)
	assert.Equal(t, folder.Path, unmarshaled.Path)
	assert.Equal(t, folder.IsDefault, unmarshaled.IsDefault)
	assert.Equal(t, folder.AutoOrganize, unmarshaled.AutoOrganize)
	assert.Equal(t, folder.FolderPattern, unmarshaled.FolderPattern)
}

func TestLoginRequest_JSONSerialization(t *testing.T) {
	request := &LoginRequest{
		Username: "testuser",
		Password: "testpassword",
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled LoginRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Username, unmarshaled.Username)
	assert.Equal(t, request.Password, unmarshaled.Password)
}

func TestLoginResponse_JSONSerialization(t *testing.T) {
	user := &User{
		ID:       1,
		Username: "testuser",
		IsActive: true,
		IsAdmin:  false,
	}

	response := &LoginResponse{
		AccessToken: "jwt-token-here",
		TokenType:   "Bearer",
		ExpiresIn:   3600,
		User:        user,
	}

	jsonData, err := json.Marshal(response)
	require.NoError(t, err)

	var unmarshaled LoginResponse
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, response.AccessToken, unmarshaled.AccessToken)
	assert.Equal(t, response.TokenType, unmarshaled.TokenType)
	assert.Equal(t, response.ExpiresIn, unmarshaled.ExpiresIn)
	assert.Equal(t, response.User.ID, unmarshaled.User.ID)
	assert.Equal(t, response.User.Username, unmarshaled.User.Username)
}

func TestUserCreateRequest_JSONSerialization(t *testing.T) {
	email := "newuser@example.com"
	
	request := &UserCreateRequest{
		Username: "newuser",
		Email:    &email,
		Password: "securepassword123",
		IsAdmin:  false,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled UserCreateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Username, unmarshaled.Username)
	assert.Equal(t, *request.Email, *unmarshaled.Email)
	assert.Equal(t, request.Password, unmarshaled.Password)
	assert.Equal(t, request.IsAdmin, unmarshaled.IsAdmin)
}

func TestUserUpdateRequest_PartialUpdate(t *testing.T) {
	email := "updated@example.com"
	currentPassword := "oldpassword"
	newPassword := "newpassword123"
	isActive := false
	isAdmin := true

	request := &UserUpdateRequest{
		Email:           &email,
		CurrentPassword: &currentPassword,
		NewPassword:     &newPassword,
		IsActive:        &isActive,
		IsAdmin:         &isAdmin,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled UserUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	require.NotNil(t, unmarshaled.Email)
	require.NotNil(t, unmarshaled.CurrentPassword)
	require.NotNil(t, unmarshaled.NewPassword)
	require.NotNil(t, unmarshaled.IsActive)
	require.NotNil(t, unmarshaled.IsAdmin)

	assert.Equal(t, email, *unmarshaled.Email)
	assert.Equal(t, currentPassword, *unmarshaled.CurrentPassword)
	assert.Equal(t, newPassword, *unmarshaled.NewPassword)
	assert.Equal(t, isActive, *unmarshaled.IsActive)
	assert.Equal(t, isAdmin, *unmarshaled.IsAdmin)
}

func TestUserPreferencesUpdateRequest_JSONSerialization(t *testing.T) {
	theme := "light"
	language := "es"
	timezone := "Europe/Madrid"
	notifications := true
	autoDownload := false
	qualityProfileID := int64(3)
	downloadFolderID := int64(4)

	request := &UserPreferencesUpdateRequest{
		Theme:                     &theme,
		Language:                  &language,
		Timezone:                  &timezone,
		NotificationsEnabled:      &notifications,
		AutoDownload:              &autoDownload,
		PreferredQualityProfileID: &qualityProfileID,
		DefaultDownloadFolderID:   &downloadFolderID,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled UserPreferencesUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, theme, *unmarshaled.Theme)
	assert.Equal(t, language, *unmarshaled.Language)
	assert.Equal(t, timezone, *unmarshaled.Timezone)
	assert.Equal(t, notifications, *unmarshaled.NotificationsEnabled)
	assert.Equal(t, autoDownload, *unmarshaled.AutoDownload)
	assert.Equal(t, qualityProfileID, *unmarshaled.PreferredQualityProfileID)
	assert.Equal(t, downloadFolderID, *unmarshaled.DefaultDownloadFolderID)
}

func TestDownloadFolderCreateRequest_JSONSerialization(t *testing.T) {
	request := &DownloadFolderCreateRequest{
		Name:          "Audiobooks",
		Path:          "/media/audiobooks",
		IsDefault:     false,
		AutoOrganize:  true,
		FolderPattern: "{genre}/{author}/{title}",
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled DownloadFolderCreateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Name, unmarshaled.Name)
	assert.Equal(t, request.Path, unmarshaled.Path)
	assert.Equal(t, request.IsDefault, unmarshaled.IsDefault)
	assert.Equal(t, request.AutoOrganize, unmarshaled.AutoOrganize)
	assert.Equal(t, request.FolderPattern, unmarshaled.FolderPattern)
}

func TestDownloadFolderUpdateRequest_PartialUpdate(t *testing.T) {
	name := "Updated Books"
	path := "/new/path/books"
	isDefault := true
	autoOrganize := false
	folderPattern := "{title} - {author}"

	request := &DownloadFolderUpdateRequest{
		Name:          &name,
		Path:          &path,
		IsDefault:     &isDefault,
		AutoOrganize:  &autoOrganize,
		FolderPattern: &folderPattern,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled DownloadFolderUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	require.NotNil(t, unmarshaled.Name)
	require.NotNil(t, unmarshaled.Path)
	require.NotNil(t, unmarshaled.IsDefault)
	require.NotNil(t, unmarshaled.AutoOrganize)
	require.NotNil(t, unmarshaled.FolderPattern)

	assert.Equal(t, name, *unmarshaled.Name)
	assert.Equal(t, path, *unmarshaled.Path)
	assert.Equal(t, isDefault, *unmarshaled.IsDefault)
	assert.Equal(t, autoOrganize, *unmarshaled.AutoOrganize)
	assert.Equal(t, folderPattern, *unmarshaled.FolderPattern)
}

func TestQualityProfileCreateRequest_JSONSerialization(t *testing.T) {
	maxFileSizeMB := 100

	request := &QualityProfileCreateRequest{
		Name:                "Ultra High Quality",
		PreferredFormats:    []string{"epub", "pdf"},
		MinQualityScore:     90,
		MaxFileSizeMB:       &maxFileSizeMB,
		LanguagePreferences: []string{"en", "fr"},
		IsDefault:           true,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled QualityProfileCreateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Name, unmarshaled.Name)
	assert.Equal(t, request.PreferredFormats, unmarshaled.PreferredFormats)
	assert.Equal(t, request.MinQualityScore, unmarshaled.MinQualityScore)
	assert.Equal(t, *request.MaxFileSizeMB, *unmarshaled.MaxFileSizeMB)
	assert.Equal(t, request.LanguagePreferences, unmarshaled.LanguagePreferences)
	assert.Equal(t, request.IsDefault, unmarshaled.IsDefault)
}

func TestQualityProfileUpdateRequest_PartialUpdate(t *testing.T) {
	name := "Updated Profile"
	preferredFormats := []string{"epub", "mobi", "azw3"}
	minQualityScore := 75
	maxFileSizeMB := 200
	languagePreferences := []string{"en", "es", "fr"}
	isDefault := false

	request := &QualityProfileUpdateRequest{
		Name:                &name,
		PreferredFormats:    preferredFormats,
		MinQualityScore:     &minQualityScore,
		MaxFileSizeMB:       &maxFileSizeMB,
		LanguagePreferences: languagePreferences,
		IsDefault:           &isDefault,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled QualityProfileUpdateRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	require.NotNil(t, unmarshaled.Name)
	require.NotNil(t, unmarshaled.MinQualityScore)
	require.NotNil(t, unmarshaled.MaxFileSizeMB)
	require.NotNil(t, unmarshaled.IsDefault)

	assert.Equal(t, name, *unmarshaled.Name)
	assert.Equal(t, preferredFormats, unmarshaled.PreferredFormats)
	assert.Equal(t, minQualityScore, *unmarshaled.MinQualityScore)
	assert.Equal(t, maxFileSizeMB, *unmarshaled.MaxFileSizeMB)
	assert.Equal(t, languagePreferences, unmarshaled.LanguagePreferences)
	assert.Equal(t, isDefault, *unmarshaled.IsDefault)
}

func TestUserSession_JSONSerialization(t *testing.T) {
	session := &UserSession{
		ID:        "session-uuid-123",
		UserID:    100,
		Token:     "jwt-session-token",
		ExpiresAt: time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second),
		CreatedAt: time.Now().UTC().Truncate(time.Second),
		IPAddress: "192.168.1.100",
		UserAgent: "Mozilla/5.0 (Test Browser)",
	}

	jsonData, err := json.Marshal(session)
	require.NoError(t, err)

	var unmarshaled UserSession
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, session.ID, unmarshaled.ID)
	assert.Equal(t, session.UserID, unmarshaled.UserID)
	assert.Equal(t, session.Token, unmarshaled.Token)
	assert.Equal(t, session.ExpiresAt.Unix(), unmarshaled.ExpiresAt.Unix())
	assert.Equal(t, session.CreatedAt.Unix(), unmarshaled.CreatedAt.Unix())
	assert.Equal(t, session.IPAddress, unmarshaled.IPAddress)
	assert.Equal(t, session.UserAgent, unmarshaled.UserAgent)
}

// Benchmark tests
func BenchmarkUser_JSONMarshal(b *testing.B) {
	email := "test@example.com"
	lastLogin := time.Now()
	
	user := &User{
		ID:           1,
		Username:     "benchmarkuser",
		Email:        &email,
		PasswordHash: "hashedpassword123",
		IsActive:     true,
		IsAdmin:      false,
		LastLogin:    &lastLogin,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(user) // Benchmark ignores return values
	}
}

func BenchmarkUser_JSONUnmarshal(b *testing.B) {
	jsonData := []byte(`{
		"id": 1,
		"username": "benchmarkuser",
		"email": "test@example.com",
		"is_active": true,
		"is_admin": false,
		"last_login": "2023-01-01T00:00:00Z",
		"created_at": "2023-01-01T00:00:00Z",
		"updated_at": "2023-01-01T00:00:00Z"
	}`)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var user User
		_ = json.Unmarshal(jsonData, &user)
	}
}

// Table-driven tests for user validation scenarios
func TestUserCreateRequest_Validation(t *testing.T) {
	tests := []struct {
		name    string
		request *UserCreateRequest
		wantErr bool
	}{
		{
			name: "valid request",
			request: &UserCreateRequest{
				Username: "validuser",
				Password: "validpassword123",
			},
			wantErr: false,
		},
		{
			name: "valid request with email",
			request: &UserCreateRequest{
				Username: "validuser",
				Email:    stringPtr("valid@example.com"),
				Password: "validpassword123",
				IsAdmin:  false,
			},
			wantErr: false,
		},
		{
			name: "admin user",
			request: &UserCreateRequest{
				Username: "adminuser",
				Password: "adminpassword123",
				IsAdmin:  true,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData, err := json.Marshal(tt.request)
			assert.NoError(t, err)

			var unmarshaled UserCreateRequest
			err = json.Unmarshal(jsonData, &unmarshaled)
			assert.NoError(t, err)

			assert.Equal(t, tt.request.Username, unmarshaled.Username)
			assert.Equal(t, tt.request.Password, unmarshaled.Password)
			assert.Equal(t, tt.request.IsAdmin, unmarshaled.IsAdmin)

			if tt.request.Email != nil {
				require.NotNil(t, unmarshaled.Email)
				assert.Equal(t, *tt.request.Email, *unmarshaled.Email)
			}
		})
	}
}

func TestRefreshTokenRequest_JSONSerialization(t *testing.T) {
	request := &RefreshTokenRequest{
		RefreshToken: "refresh-token-abc123",
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled RefreshTokenRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.RefreshToken, unmarshaled.RefreshToken)
}

// Test user preferences with different themes
func TestUserPreferences_ThemeValidation(t *testing.T) {
	themes := []string{"light", "dark", "auto"}

	for _, theme := range themes {
		t.Run("theme_"+theme, func(t *testing.T) {
			preferences := &UserPreferences{
				ID:       1,
				UserID:   100,
				Theme:    theme,
				Language: "en",
				Timezone: "UTC",
			}

			jsonData, err := json.Marshal(preferences)
			require.NoError(t, err)

			var unmarshaled UserPreferences
			err = json.Unmarshal(jsonData, &unmarshaled)
			require.NoError(t, err)

			assert.Equal(t, theme, unmarshaled.Theme)
		})
	}
}