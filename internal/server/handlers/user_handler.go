package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/services"
)

// UserHandler handles user management endpoints
type UserHandler struct {
	container *services.Container
}

// NewUserHandler creates a new user handler
func NewUserHandler(container *services.Container) *UserHandler {
	return &UserHandler{
		container: container,
	}
}

// GetProfile returns the current user's profile
func (h *UserHandler) GetProfile(c *gin.Context) {
	// Implementation placeholder
	c.JSON(http.StatusOK, gin.H{
		"message": "GetProfile not yet implemented",
	})
}

// UpdateProfile updates the current user's profile
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	// Implementation placeholder
	c.JSON(http.StatusOK, gin.H{
		"message": "UpdateProfile not yet implemented",
	})
}

// GetPreferences returns the current user's preferences
func (h *UserHandler) GetPreferences(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	preferences, err := h.container.GetUserPreferencesRepository().GetByUserID(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve preferences"})
		return
	}
	
	c.JSON(http.StatusOK, preferences)
}

// UpdatePreferences updates the current user's preferences
func (h *UserHandler) UpdatePreferences(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	var req models.UserPreferencesUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get current preferences
	preferences, err := h.container.GetUserPreferencesRepository().GetByUserID(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve preferences"})
		return
	}
	
	// Apply updates
	if req.Theme != nil {
		preferences.Theme = *req.Theme
	}
	if req.Language != nil {
		preferences.Language = *req.Language
	}
	if req.Timezone != nil {
		preferences.Timezone = *req.Timezone
	}
	if req.NotificationsEnabled != nil {
		preferences.NotificationsEnabled = *req.NotificationsEnabled
	}
	if req.AutoDownload != nil {
		preferences.AutoDownload = *req.AutoDownload
	}
	if req.PreferredQualityProfileID != nil {
		preferences.PreferredQualityProfileID = req.PreferredQualityProfileID
	}
	if req.DefaultDownloadFolderID != nil {
		preferences.DefaultDownloadFolderID = req.DefaultDownloadFolderID
	}
	
	err = h.container.GetUserPreferencesRepository().CreateOrUpdate(c.Request.Context(), preferences)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences"})
		return
	}
	
	c.JSON(http.StatusOK, preferences)
}

// GetDownloadFolders returns the current user's download folders
func (h *UserHandler) GetDownloadFolders(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	folders, err := h.container.GetUserPreferencesRepository().GetDownloadFolders(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve download folders"})
		return
	}
	
	c.JSON(http.StatusOK, folders)
}

// CreateDownloadFolder creates a new download folder
func (h *UserHandler) CreateDownloadFolder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	var req models.DownloadFolderCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	folder := &models.DownloadFolder{
		UserID:        userID.(int64),
		Name:          req.Name,
		Path:          req.Path,
		IsDefault:     req.IsDefault,
		AutoOrganize:  req.AutoOrganize,
		FolderPattern: req.FolderPattern,
	}
	
	err := h.container.GetUserPreferencesRepository().CreateDownloadFolder(c.Request.Context(), folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create download folder"})
		return
	}
	
	c.JSON(http.StatusCreated, folder)
}

// UpdateDownloadFolder updates a download folder
func (h *UserHandler) UpdateDownloadFolder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	folderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}
	
	var req models.DownloadFolderUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get existing folder to verify ownership and get current values
	folders, err := h.container.GetUserPreferencesRepository().GetDownloadFolders(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve download folders"})
		return
	}
	
	var folder *models.DownloadFolder
	for _, f := range folders {
		if f.ID == folderID {
			folder = f
			break
		}
	}
	
	if folder == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Download folder not found"})
		return
	}
	
	// Apply updates
	if req.Name != nil {
		folder.Name = *req.Name
	}
	if req.Path != nil {
		folder.Path = *req.Path
	}
	if req.IsDefault != nil {
		folder.IsDefault = *req.IsDefault
	}
	if req.AutoOrganize != nil {
		folder.AutoOrganize = *req.AutoOrganize
	}
	if req.FolderPattern != nil {
		folder.FolderPattern = *req.FolderPattern
	}
	
	err = h.container.GetUserPreferencesRepository().UpdateDownloadFolder(c.Request.Context(), folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update download folder"})
		return
	}
	
	c.JSON(http.StatusOK, folder)
}

// DeleteDownloadFolder deletes a download folder
func (h *UserHandler) DeleteDownloadFolder(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	folderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}
	
	// Verify folder belongs to user before deletion
	folders, err := h.container.GetUserPreferencesRepository().GetDownloadFolders(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve download folders"})
		return
	}
	
	var folderExists bool
	for _, f := range folders {
		if f.ID == folderID {
			folderExists = true
			break
		}
	}
	
	if !folderExists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Download folder not found"})
		return
	}
	
	err = h.container.GetUserPreferencesRepository().DeleteDownloadFolder(c.Request.Context(), folderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete download folder"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Download folder deleted successfully"})
}

// GetQualityProfiles returns the current user's quality profiles
func (h *UserHandler) GetQualityProfiles(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	profiles, err := h.container.GetUserPreferencesRepository().GetQualityProfiles(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve quality profiles"})
		return
	}
	
	c.JSON(http.StatusOK, profiles)
}

// CreateQualityProfile creates a new quality profile
func (h *UserHandler) CreateQualityProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	var req models.QualityProfileCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	profile := &models.QualityProfile{
		UserID:              userID.(int64),
		Name:                req.Name,
		PreferredFormats:    models.StringList(req.PreferredFormats),
		MinQualityScore:     req.MinQualityScore,
		MaxFileSizeMB:       req.MaxFileSizeMB,
		LanguagePreferences: models.StringList(req.LanguagePreferences),
		IsDefault:           req.IsDefault,
	}
	
	err := h.container.GetUserPreferencesRepository().CreateQualityProfile(c.Request.Context(), profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create quality profile"})
		return
	}
	
	c.JSON(http.StatusCreated, profile)
}

// UpdateQualityProfile updates a quality profile
func (h *UserHandler) UpdateQualityProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	profileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid profile ID"})
		return
	}
	
	var req models.QualityProfileUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get existing profile to verify ownership and get current values
	profiles, err := h.container.GetUserPreferencesRepository().GetQualityProfiles(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve quality profiles"})
		return
	}
	
	var profile *models.QualityProfile
	for _, p := range profiles {
		if p.ID == profileID {
			profile = p
			break
		}
	}
	
	if profile == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quality profile not found"})
		return
	}
	
	// Apply updates
	if req.Name != nil {
		profile.Name = *req.Name
	}
	if req.PreferredFormats != nil {
		profile.PreferredFormats = models.StringList(req.PreferredFormats)
	}
	if req.MinQualityScore != nil {
		profile.MinQualityScore = *req.MinQualityScore
	}
	if req.MaxFileSizeMB != nil {
		profile.MaxFileSizeMB = req.MaxFileSizeMB
	}
	if req.LanguagePreferences != nil {
		profile.LanguagePreferences = models.StringList(req.LanguagePreferences)
	}
	if req.IsDefault != nil {
		profile.IsDefault = *req.IsDefault
	}
	
	err = h.container.GetUserPreferencesRepository().UpdateQualityProfile(c.Request.Context(), profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update quality profile"})
		return
	}
	
	c.JSON(http.StatusOK, profile)
}

// DeleteQualityProfile deletes a quality profile
func (h *UserHandler) DeleteQualityProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	profileID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid profile ID"})
		return
	}
	
	// Verify profile belongs to user before deletion
	profiles, err := h.container.GetUserPreferencesRepository().GetQualityProfiles(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve quality profiles"})
		return
	}
	
	var profileExists bool
	for _, p := range profiles {
		if p.ID == profileID {
			profileExists = true
			break
		}
	}
	
	if !profileExists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quality profile not found"})
		return
	}
	
	err = h.container.GetUserPreferencesRepository().DeleteQualityProfile(c.Request.Context(), profileID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete quality profile"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Quality profile deleted successfully"})
}